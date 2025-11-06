from __future__ import annotations

import datetime as _dt
from typing import Dict, Optional

import base64
import os
import tempfile
from pathlib import Path

from google.cloud import firestore

_CREDENTIAL_PATH: Optional[str] = None


def _ensure_credentials_file() -> None:
    global _CREDENTIAL_PATH  # noqa: PLW0603 - cached across invocations
    if _CREDENTIAL_PATH:
        os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", _CREDENTIAL_PATH)
        return

    inline_json = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    if not inline_json:
        return

    tmp = tempfile.NamedTemporaryFile("w", delete=False, suffix=".json")
    tmp.write(inline_json)
    tmp.flush()
    tmp.close()
    _CREDENTIAL_PATH = tmp.name
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = _CREDENTIAL_PATH


def get_firestore_client() -> firestore.Client:
    _ensure_credentials_file()
    return firestore.Client()


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
