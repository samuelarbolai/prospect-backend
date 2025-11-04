"""LinkedIn enrichment processor for SQS-triggered Lambda."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from google.cloud import firestore

from linkedin_enrichment import (
    DEFAULT_OPENAI_MODEL,
    build_google_auth,
    enrich_rows,
    load_prompt,
)

from .utils import build_keywords_from_prospect, current_timestamp, get_firestore_client

logger = logging.getLogger(__name__)

KEYWORD_COLUMN = "Keywords"
LINK_COLUMN = "LinkedInProfile"
STATUS_COLUMN = "LinkedInStatus"
RESULTS_COLUMN = "LinkedInResults"
OPENAI_COLUMN = "LinkedInEvaluation"

DRY_RUN_ENV = "ENRICHMENT_DRY_RUN"


def _load_configuration() -> Dict[str, Optional[str]]:
    return {
        "google_api_key": os.getenv("GOOGLE_API_KEY"),
        "google_service_account": os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE"),
        "google_service_account_scopes": os.getenv("GOOGLE_SERVICE_ACCOUNT_SCOPES"),
        "google_cse_id": os.getenv("GOOGLE_CSE_ID"),
        "openai_api_key": os.getenv("OPENAI_API_KEY"),
        "openai_model": os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL),
        "prompt_path": os.getenv("LINKEDIN_PROMPT_PATH"),
    }


def _parse_scopes(raw: Optional[str]) -> Optional[List[str]]:
    if not raw:
        return None
    scopes = [scope.strip() for scope in raw.split(",") if scope.strip()]
    return scopes or None


def _load_prompt_text(custom_path: Optional[str]) -> str:
    if custom_path:
        path = Path(custom_path)
    else:
        path = Path(__file__).with_name("prompt.txt")
    return load_prompt(str(path))


def _build_rows(
    client: firestore.Client,
    prospect_ids: List[str],
) -> tuple[List[Dict[str, Any]], Dict[str, firestore.DocumentReference]]:
    rows: List[Dict[str, Any]] = []
    refs: Dict[str, firestore.DocumentReference] = {}

    for prospect_id in prospect_ids:
        doc_ref = client.collection("prospects").document(prospect_id)
        snapshot = doc_ref.get()
        if not snapshot.exists:
            logger.warning("Prospect '%s' does not exist; skipping.", prospect_id)
            continue
        data = snapshot.to_dict() or {}
        keywords = build_keywords_from_prospect(data)
        linkedin_info = {}
        social = data.get("social")
        if isinstance(social, dict):
            linkedin_info = social.get("linkedin") or {}

        row = {
            "ProspectId": prospect_id,
            KEYWORD_COLUMN: keywords or "",
            LINK_COLUMN: linkedin_info.get("primary", ""),
            STATUS_COLUMN: linkedin_info.get("status", ""),
            RESULTS_COLUMN: "",
            OPENAI_COLUMN: "",
        }
        rows.append(row)
        refs[prospect_id] = doc_ref

    return rows, refs


def _apply_updates(
    doc_ref: firestore.DocumentReference,
    row: Dict[str, Any],
    run_id: Optional[str],
) -> None:
    link_value = row.get(LINK_COLUMN) or None
    status_value = row.get(STATUS_COLUMN) or None
    openai_blob = row.get(OPENAI_COLUMN) or None
    results_blob = row.get(RESULTS_COLUMN) or None

    enrichment_status = "completed"
    notes_value = status_value

    update_payload: Dict[str, Any] = {
        "enrichment": {
            "status": enrichment_status,
            "last_run_at": current_timestamp(),
            "updated_at": current_timestamp(),
        },
        "social": {
            "linkedin": {
                "primary": link_value,
                "status": status_value,
            }
        },
    }

    if run_id:
        update_payload.setdefault("enrichment", {})["queue_run_id"] = run_id

    if notes_value:
        update_payload["enrichment"]["notes"] = notes_value
    if openai_blob:
        update_payload["enrichment"]["linkedin_evaluation"] = openai_blob
    if results_blob:
        update_payload["enrichment"]["linkedin_results"] = results_blob

    doc_ref.set(update_payload, merge=True)


def _dry_run_fill(rows: List[Dict[str, Any]]) -> None:
    for row in rows:
        prospect_id = row.get("ProspectId", "unknown")
        row[LINK_COLUMN] = f"https://linkedin.com/in/{prospect_id}"
        row[STATUS_COLUMN] = "DRY_RUN"
        row[RESULTS_COLUMN] = json.dumps({"mode": "dry_run"})
        row[OPENAI_COLUMN] = "Dry run mode"


def process_message(payload: Dict[str, Any]) -> None:
    client = get_firestore_client()
    run_id = payload.get("runId")
    list_id = payload.get("listId")
    prospect_ids = payload.get("prospectIds") or []

    if not isinstance(prospect_ids, list) or not prospect_ids:
        logger.warning("Prospect list missing or empty in payload: %s", payload)
        return

    config = _load_configuration()
    google_scopes = _parse_scopes(config.get("google_service_account_scopes"))

    prompt_text = _load_prompt_text(config.get("prompt_path"))
    rows, doc_refs = _build_rows(client, prospect_ids)
    if not rows:
        logger.warning("No valid prospects to process for run %s", run_id)
        return

    dry_run = os.getenv(DRY_RUN_ENV) == "1"

    success_count = 0
    failure_notes: List[Dict[str, Any]] = []

    if dry_run:
        logger.info("Running LinkedIn enrichment in dry-run mode.")
        _dry_run_fill(rows)
    else:
        google_api_key, google_headers = build_google_auth(
            api_key=config.get("google_api_key"),
            service_account_path=config.get("google_service_account"),
            service_account_scopes=google_scopes,
        )

        required = [config.get("google_cse_id"), config.get("openai_api_key")]
        if not all(required) and not google_headers:
            missing = []
            if not config.get("google_cse_id"):
                missing.append("GOOGLE_CSE_ID")
            if not config.get("openai_api_key"):
                missing.append("OPENAI_API_KEY")
            logger.error("Missing required configuration: %s", ", ".join(missing))
            raise RuntimeError("LinkedIn enrichment configuration incomplete.")

        enrich_rows(
            rows=rows,
            keyword_column=KEYWORD_COLUMN,
            linkedin_column=LINK_COLUMN,
            status_column=STATUS_COLUMN,
            results_column=RESULTS_COLUMN,
            openai_response_column=OPENAI_COLUMN,
            api_key=google_api_key,
            cse_id=config.get("google_cse_id") or "",
            prompt_text=prompt_text,
            openai_key=config.get("openai_api_key") or "",
            openai_model=config.get("openai_model") or DEFAULT_OPENAI_MODEL,
            max_results=3,
            timeout=15.0,
            temperature=0.0,
            fallback_first_link=True,
            sleep_seconds=0.0,
            headers=google_headers,
        )

    for row in rows:
        prospect_id = row.get("ProspectId")
        if not prospect_id:
            continue
        doc_ref = doc_refs.get(prospect_id)
        if doc_ref is None:
            continue
        try:
            _apply_updates(doc_ref, row, run_id)
            link_value = row.get(LINK_COLUMN)
            if link_value:
                success_count += 1
            else:
                failure_notes.append(
                    {
                        "prospectId": prospect_id,
                        "status": row.get(STATUS_COLUMN),
                    }
                )
        except Exception as exc:  # pragma: no cover - Firestore failure handling
            logger.exception("Failed to update prospect %s", prospect_id)
            failure_notes.append({"prospectId": prospect_id, "error": str(exc)})

    if run_id:
        run_ref = client.collection("enrichment_runs").document(run_id)
        summary_status = "completed"
        if failure_notes and success_count == 0:
            summary_status = "failed"
        elif failure_notes:
            summary_status = "partial"
        run_update = {
            "status": summary_status,
            "completed_at": current_timestamp(),
            "success_count": success_count,
            "failure_count": len(rows) - success_count,
            "list_id": list_id,
            "stage": "linkedin_completed",
            "linkedin_completed": True,
        }
        if failure_notes:
            run_update["failures"] = failure_notes
        run_ref.set(run_update, merge=True)

    logger.info(
        "LinkedIn enrichment finished. success=%d total=%d dry_run=%s",
        success_count,
        len(rows),
        dry_run,
    )
