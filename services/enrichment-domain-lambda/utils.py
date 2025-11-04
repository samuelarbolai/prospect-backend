from __future__ import annotations

import datetime as _dt
from typing import Dict

import base64
import os
import tempfile
from pathlib import Path
from typing import Optional

from google.cloud import firestore

_CREDENTIAL_PATH: Optional[str] = None


def _ensure_credentials_file() -> None:
    global _CREDENTIAL_PATH  # noqa: PLW0603 - cached across invocations
    if _CREDENTIAL_PATH:
        os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", _CREDENTIAL_PATH)
        return

    inline_json = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    inline_b64 = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_B64")
    if not inline_json and inline_b64:
        inline_json = base64.b64decode(inline_b64).decode("utf-8")

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
