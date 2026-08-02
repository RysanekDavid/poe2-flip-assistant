"""Stable citation identifiers shared by evidence-producing components."""

import hashlib
from typing import Literal

EvidencePrefix = Literal["M", "L", "K", "W", "D"]


def evidence_id(prefix: EvidencePrefix, identity: str) -> str:
    """Return a compact content-derived ID that remains stable across repeated calls."""
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:12]
    return f"{prefix}{digest}"
