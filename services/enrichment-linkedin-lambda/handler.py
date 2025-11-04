"""AWS Lambda entrypoint for LinkedIn enrichment jobs.

This stub simply logs incoming SQS messages so the surrounding infrastructure
(SQS queue, permissions, retries) can be validated before the enrichment logic
is ported from the CLI script.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict

try:
    from .processor import process_message
except ImportError:  # pragma: no cover - fallback when package not namespaced
    from processor import process_message  # type: ignore[import]

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event: Dict[str, Any], _context: Any) -> None:
    records = event.get("Records", [])
    if not isinstance(records, list):
        logger.error("Invalid event structure: missing Records list")
        return

    for record in records:
        try:
            body = record["body"]
            payload = json.loads(body)
        except (KeyError, TypeError, json.JSONDecodeError) as exc:
            logger.error("Skipping malformed SQS record: %s", exc)
            continue
        try:
            process_message(payload)
        except Exception as exc:  # pylint: disable=broad-except
            logger.exception("LinkedIn enrichment processing failed: runId=%s", payload.get("runId"))
            raise
