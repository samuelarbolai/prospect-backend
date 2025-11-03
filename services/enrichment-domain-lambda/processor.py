"""Stub processor for corporate domain enrichment jobs."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)


def process_message(payload: Dict[str, Any]) -> None:
    run_id = payload.get("runId")
    organizations = payload.get("organizations", [])
    logger.info(
        "Corporate domain enrichment stub received run",
        extra={"runId": run_id, "organizationCount": len(organizations)},
    )
    logger.debug("Full payload: %s", json.dumps(payload))
