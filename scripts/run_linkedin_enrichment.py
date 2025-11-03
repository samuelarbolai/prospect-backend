#!/usr/bin/env python3
"""Convenience wrapper for invoking the LinkedIn enrichment lambda locally."""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path
from typing import List


def resolve_repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = value


def build_payload(run_id: str, prospect_ids: List[str]) -> dict:
    body = json.dumps({"runId": run_id, "prospectIds": prospect_ids})
    return {"Records": [{"body": body}]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--prospects",
        nargs="+",
        default=["mock_enrichment_01", "mock_enrichment_02", "mock_enrichment_03"],
        help="Prospect document IDs to process (default: mock_enrichment_01..03).",
    )
    parser.add_argument(
        "--run-id",
        default="local-linkedin-test",
        help="Run identifier stored in enrichment_runs (default: local-linkedin-test).",
    )
    parser.add_argument(
        "--env-file",
        default=".env",
        help="Optional .env file to load before running (default: backend/.env).",
    )
    parser.add_argument(
        "--credentials",
        default="../leadgen-475923-29d2eed038e0.json",
        help="Path to service account JSON for Firestore access (default matches repo root service account).",
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

    env_path = Path(args.env_file)
    if not env_path.is_absolute():
        env_path = (repo_root / args.env_file).resolve()
    load_env_file(env_path)

    sys.path.insert(0, str(services_root))

    credentials_path = Path(args.credentials)
    if not credentials_path.is_absolute():
        credentials_path = (repo_root / args.credentials).resolve()
    os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", str(credentials_path))

    if args.dry_run:
        os.environ["ENRICHMENT_DRY_RUN"] = "1"

    logging.basicConfig(level=getattr(logging, args.log_level.upper(), logging.INFO))

    try:
        from enrichment_linkedin_lambda.handler import handler  # type: ignore
    except ImportError as exc:  # pragma: no cover - import resolution issues
        logging.error("Failed to import LinkedIn enrichment handler from %s: %s", service_dir, exc)
        raise

    payload = build_payload(args.run_id, args.prospects)
    logging.info("Invoking LinkedIn enrichment with payload: %s", payload)
    handler(payload, None)
    logging.info("LinkedIn enrichment invocation complete.")


if __name__ == "__main__":
    main()
