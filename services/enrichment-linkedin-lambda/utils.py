from __future__ import annotations

import datetime as _dt
from typing import Dict, Optional

from google.cloud import firestore


def get_firestore_client() -> firestore.Client:
    try:
        return firestore.Client()
    except Exception:  # pragma: no cover - handled by upstream logging
        raise


def current_timestamp() -> _dt.datetime:
    return _dt.datetime.utcnow().replace(tzinfo=_dt.timezone.utc)


def build_keywords_from_prospect(data: Dict[str, object]) -> Optional[str]:
    enrichment = data.get("enrichment")
    if isinstance(enrichment, dict):
        raw = enrichment.get("keywords")
        if isinstance(raw, str) and raw.strip():
            return raw.strip()

    pieces = []
    name = data.get("name")
    if isinstance(name, str) and name.strip():
        pieces.append(name.strip())
    organization = data.get("organization")
    if isinstance(organization, str) and organization.strip():
        pieces.append(organization.strip())
    title = data.get("role_title")
    if isinstance(title, str) and title.strip():
        pieces.append(title.strip())

    if not pieces:
        return None

    query_parts = ["site:linkedin.com/in"] + [f'"{value}"' for value in pieces]
    return " ".join(query_parts)


def merge_nested(original: Dict[str, object], updates: Dict[str, object]) -> Dict[str, object]:
    for key, value in updates.items():
        if (
            key in original
            and isinstance(original[key], dict)
            and isinstance(value, dict)
        ):
            original[key] = merge_nested(dict(original[key]), value)
        else:
            original[key] = value
    return original
