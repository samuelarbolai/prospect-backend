"""Stub processor for LinkedIn enrichment jobs.

Real enrichment logic will replace this stub. For now we simply log the payload so
queue plumbing can be exercised without hitting external APIs.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)


def process_message(payload: Dict[str, Any]) -> None:
    """Placeholder processing that logs the received payload."""
    run_id = payload.get("runId")
    prospect_ids = payload.get("prospectIds", [])
    logger.info(
        "LinkedIn enrichment stub received run",
        extra={"runId": run_id, "prospectCount": len(prospect_ids)},
    )
    logger.debug("Full payload: %s", json.dumps(payload))
