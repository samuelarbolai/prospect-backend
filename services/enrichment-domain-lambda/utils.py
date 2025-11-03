from __future__ import annotations

import datetime as _dt
from typing import Dict

from google.cloud import firestore


def get_firestore_client() -> firestore.Client:
    return firestore.Client()


def current_timestamp() -> _dt.datetime:
    return _dt.datetime.utcnow().replace(tzinfo=_dt.timezone.utc)
