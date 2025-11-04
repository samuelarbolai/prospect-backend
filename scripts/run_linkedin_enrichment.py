#!/usr/bin/env python3
"""Convenience wrapper for invoking the LinkedIn enrichment lambda locally."""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import importlib.util
from pathlib import Path
from typing import List, Optional

from google.cloud import firestore


def resolve_repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    base_dir = path.parent
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key and key not in os.environ:
            if value and value.startswith((".", "..")):
                resolved = (base_dir / value).resolve()
                os.environ[key] = str(resolved)
            else:
                os.environ[key] = value


def build_payload(run_id: str, prospect_ids: List[str]) -> dict:
    body = json.dumps({"runId": run_id, "prospectIds": prospect_ids})
    return {"Records": [{"body": body}]}


def select_run_id(client: firestore.Client, explicit: Optional[str]) -> Optional[str]:
    if explicit:
        doc = client.collection("enrichment_runs").document(explicit).get()
        if not doc.exists:
            logging.error("Run %s not found", explicit)
            return None
        data = doc.to_dict() or {}
        stage = data.get("stage")
        if stage not in {"linkedin", "domain"}:
            logging.warning("Run %s is already stage '%s'", explicit, stage)
        return explicit

    query = client.collection("enrichment_runs").where("stage", "==", "linkedin")
    runs = list(query.stream())
    if not runs:
        logging.warning("No enrichment run with stage 'linkedin' found")
        return None
    # pick most recent by created_at if available
    runs.sort(key=lambda doc: doc.get("created_at"), reverse=True)
    run = runs[0]
    logging.info("Selected run %s for LinkedIn enrichment", run.id)
    return run.id


def fetch_prospect_ids(client: firestore.Client, run_id: str) -> List[str]:
    query = client.collection("prospects").where("enrichment.queue_run_id", "==", run_id)
    ids = [doc.id for doc in query.stream()]
    if not ids:
        logging.warning("No prospects found for run %s", run_id)
    return ids


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--run-id",
        default=None,
        help="Specific enrichment_runs document to process (default: newest stage=linkedin).",
    )
    parser.add_argument(
        "--env-file",
        default=None,
        help="Optional .env file to load before running (default: services/enrichment-linkedin-lambda/.env).",
    )
    parser.add_argument(
        "--credentials",
        default=None,
        help="Path to service account JSON for Firestore access (overrides env file).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Enable ENRICHMENT_DRY_RUN=1 so external APIs are skipped.",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level (default INFO).",
    )

    args = parser.parse_args()

    repo_root = resolve_repo_root()
    services_root = repo_root / "services"
    service_dir = services_root / "enrichment-linkedin-lambda"

    env_path = Path(args.env_file) if args.env_file else service_dir / ".env"
    if not env_path.is_absolute():
        env_path = env_path.resolve()
    load_env_file(env_path)

    sys.path.insert(0, str(services_root))
    sys.path.insert(0, str(service_dir))

    if args.credentials:
        credentials_path = Path(args.credentials)
        if not credentials_path.is_absolute():
            credentials_path = (repo_root / args.credentials).resolve()
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(credentials_path)

    if args.dry_run:
        os.environ["ENRICHMENT_DRY_RUN"] = "1"

    cred_value = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if cred_value:
        cred_path = Path(cred_value)
        if not cred_path.is_absolute():
            cred_path = (repo_root / cred_value).resolve()
        if cred_path.exists():
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(cred_path)
        else:
            logging.warning("Credential file %s not found; falling back to repo default", cred_value)
            cred_value = None

    if not cred_value:
        fallback_credentials = (repo_root / "../leadgen-475923-29d2eed038e0.json").resolve()
        if fallback_credentials.exists():
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(fallback_credentials)

    logging.basicConfig(level=getattr(logging, args.log_level.upper(), logging.INFO))

    package_name = "enrichment_linkedin_lambda"
    package_spec = importlib.util.spec_from_file_location(
        package_name,
        service_dir / "__init__.py",
        submodule_search_locations=[str(service_dir)],
    )
    if package_spec is None or package_spec.loader is None:
        raise ImportError("Unable to create module spec for enrichment package")
    package_module = importlib.util.module_from_spec(package_spec)
    package_spec.loader.exec_module(package_module)  # type: ignore[attr-defined]
    sys.modules[package_name] = package_module

    try:
        handler_spec = importlib.util.spec_from_file_location(
            f"{package_name}.handler", service_dir / "handler.py"
        )
        if handler_spec is None or handler_spec.loader is None:
            raise ImportError("Unable to create module spec for handler")
        module = importlib.util.module_from_spec(handler_spec)
        handler_spec.loader.exec_module(module)  # type: ignore[attr-defined]
        handler = module.handler  # type: ignore[attr-defined]
    except Exception as exc:  # pragma: no cover - import resolution issues
        logging.error("Failed to import LinkedIn enrichment handler from %s: %s", service_dir, exc, exc_info=True)
        raise

    client = firestore.Client()
    run_id = select_run_id(client, args.run_id)
    if not run_id:
        logging.error("No run selected; exiting")
        return

    prospect_ids = fetch_prospect_ids(client, run_id)
    if not prospect_ids:
        logging.error("No prospects associated with run %s", run_id)
        return

    logging.info("Processing run %s with %d prospects", run_id, len(prospect_ids))

    payload = build_payload(run_id, prospect_ids)
    logging.info("Invoking LinkedIn enrichment with payload: %s", payload)
    handler(payload, None)
    logging.info("LinkedIn enrichment invocation complete.")


if __name__ == "__main__":
    main()
