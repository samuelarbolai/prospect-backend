"""Corporate domain enrichment processor."""

from __future__ import annotations

import csv
import io
import json
import logging
import os
from typing import Any, Dict, List, Optional

from google.cloud import firestore

from corporate_domain_enrichment import build_prompt, extract_tsv, send_prompt

from .utils import current_timestamp, get_firestore_client

logger = logging.getLogger(__name__)

DRY_RUN_ENV = "ENRICHMENT_DRY_RUN"


def _generate_org_list(prospect_docs: Dict[str, Dict[str, Any]]) -> List[str]:
    seen = set()
    ordered: List[str] = []
    for data in prospect_docs.values():
        org = data.get("organization")
        if isinstance(org, str):
            normalized = org.strip()
            if normalized and normalized.lower() not in seen:
                seen.add(normalized.lower())
                ordered.append(normalized)
    return ordered


def _build_people_table(prospect_docs: Dict[str, Dict[str, Any]]) -> Optional[str]:
    headers = ["Name", "Organization", "Job Title", "City", "Country"]
    rows: List[List[str]] = []
    for data in prospect_docs.values():
        name = data.get("name")
        organization = data.get("organization")
        title = data.get("role_title")
        city = data.get("city")
        country = data.get("country")
        if not name or not organization:
            continue
        rows.append(
            [
                str(name) if name is not None else "",
                str(organization) if organization is not None else "",
                str(title) if title is not None else "",
                str(city) if city is not None else "",
                str(country) if country is not None else "",
            ]
        )
    if not rows:
        return None
    csv_buffer = io.StringIO()
    writer = csv.writer(csv_buffer, delimiter="\t")
    writer.writerow(headers)
    writer.writerows(rows)
    return csv_buffer.getvalue()


def _parse_tsv(tsv_text: str) -> List[Dict[str, str]]:
    reader = csv.DictReader(io.StringIO(tsv_text), delimiter="\t")
    return [dict(row) for row in reader]


def process_message(payload: Dict[str, Any]) -> None:
    client = get_firestore_client()
    run_id = payload.get("runId")
    prospect_ids = payload.get("prospectIds") or []

    if not isinstance(prospect_ids, list) or not prospect_ids:
        logger.warning("No prospectIds supplied to domain enrichment payload: %s", payload)
        return

    docs: Dict[str, Dict[str, Any]] = {}
    doc_refs: Dict[str, firestore.DocumentReference] = {}

    for prospect_id in prospect_ids:
        doc_ref = client.collection("prospects").document(prospect_id)
        snapshot = doc_ref.get()
        if snapshot.exists:
            data = snapshot.to_dict() or {}
            docs[prospect_id] = data
            doc_refs[prospect_id] = doc_ref
        else:
            logger.warning("Prospect '%s' missing for domain enrichment", prospect_id)

    if not docs:
        logger.warning("No matching prospects found for domain run %s", run_id)
        return

    organizations = _generate_org_list(docs)
    if not organizations:
        logger.warning("No organizations found for domain enrichment run %s", run_id)
        return

    people_table = _build_people_table(docs)

    dry_run = os.getenv(DRY_RUN_ENV) == "1"
    results: Dict[str, Dict[str, str]] = {}

    if dry_run:
        logger.info("Corporate domain enrichment running in dry-run mode")
        for org in organizations:
            results[org] = {
                "Organization": org,
                "Vertical": "Dry Run Vertical",
                "Domain": f"{org.split()[0].lower()}.example.com",
                "Keywords": f'site:linkedin.com/in "{org}"',
            }
    else:
        api_key = os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY_WORKSPACE")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY environment variable is required")
        prompt = build_prompt(organizations, people_table)
        response_text = send_prompt(prompt, os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4.1"), float(os.getenv("ANTHROPIC_TEMPERATURE", "0.1")), api_key)
        tsv = extract_tsv(response_text)
        if not tsv:
            raise RuntimeError("Failed to extract TSV from Anthropic response")
        for row in _parse_tsv(tsv):
            org_name = row.get("Organization")
            if isinstance(org_name, str) and org_name.strip():
                results[org_name.strip()] = row

    success_count = 0
    failures: List[Dict[str, Any]] = []
    timestamp = current_timestamp()

    for prospect_id, data in docs.items():
        doc_ref = doc_refs[prospect_id]
        org_name = data.get("organization")
        if isinstance(org_name, str):
            lookup = results.get(org_name) or results.get(org_name.strip())
        else:
            lookup = None

        update_payload: Dict[str, Any] = {
            "enrichment": {
                "updated_at": timestamp,
                "last_run_at": timestamp,
            }
        }

        if lookup:
            domain_value = lookup.get("Domain")
            vertical_value = lookup.get("Vertical")
            keywords_value = lookup.get("Keywords")
            if domain_value:
                update_payload["org_domain"] = domain_value.strip()
            if vertical_value:
                update_payload["enrichment"]["vertical"] = vertical_value.strip()
            if keywords_value:
                update_payload["enrichment"]["keywords"] = keywords_value.strip()
            update_payload["enrichment"]["status"] = "completed"
            success_count += 1
        else:
            update_payload["enrichment"]["status"] = "partial"
            failures.append({"prospectId": prospect_id, "reason": "organization_not_found"})

        doc_ref.set(update_payload, merge=True)

    if run_id:
        summary_status = "completed"
        if failures and success_count == 0:
            summary_status = "failed"
        elif failures:
            summary_status = "partial"
        run_ref = client.collection("enrichment_runs").document(run_id)
        run_update = {
            "status": summary_status,
            "completed_at": timestamp,
            "success_count": success_count,
            "failure_count": len(docs) - success_count,
            "stage": "complete",
            "domain_completed": True,
        }
        if failures:
            run_update["failures"] = failures
        run_ref.set(run_update, merge=True)

    logger.info(
        "Corporate domain enrichment finished. success=%d total=%d dry_run=%s",
        success_count,
        len(docs),
        dry_run,
    )
