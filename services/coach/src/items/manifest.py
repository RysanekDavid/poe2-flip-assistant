"""Strict integrity boundary for the committed RePoE snapshot."""

import gzip
import hashlib
import json
import re
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

_CATALOG_SCHEMA = 1
_SHA256 = re.compile(r"^[0-9a-f]{64}$")


class ManifestSource(BaseModel):
    """Record-count metadata needed to cross-check the decoded payload."""

    model_config = ConfigDict(extra="allow")

    records: int = Field(ge=0)


class CatalogManifest(BaseModel):
    """Versioned pointer and integrity metadata for one catalog artifact."""

    model_config = ConfigDict(extra="allow")

    schema_version: int
    payload_schema_version: int
    repoe_version: str = Field(min_length=1)
    artifact: str = Field(min_length=1)
    artifact_bytes: int = Field(gt=0)
    artifact_sha256: str = Field(min_length=64, max_length=64)
    source_count: int = Field(gt=0)
    sources: dict[str, ManifestSource]


def load_snapshot(manifest_path: Path) -> tuple[CatalogManifest, dict[str, Any]]:
    """Read and fully validate a manifest/artifact pair before it reaches indexes."""
    resolved_manifest = manifest_path.resolve(strict=True)
    manifest_bytes = resolved_manifest.read_bytes()
    manifest = CatalogManifest.model_validate_json(manifest_bytes)
    _validate_manifest(manifest)
    artifact_path = _safe_artifact_path(resolved_manifest.parent, manifest)
    compressed = artifact_path.read_bytes()
    _validate_artifact_bytes(compressed, artifact_path, manifest)
    try:
        payload: object = json.loads(gzip.decompress(compressed))
    except (gzip.BadGzipFile, EOFError, json.JSONDecodeError, UnicodeDecodeError) as error:
        raise RuntimeError("Item catalog artifact is not valid gzip JSON") from error
    validated = _validate_payload(payload, manifest)
    return manifest, validated


# Full snapshot validation gunzips and parses the entire multi-megabyte catalog. The
# health endpoint calls snapshot_identity twice per probe and deploy polls it every
# second, which starved a small VPS during the 2026-09-15 release (health flapped,
# deploy rolled back). Re-validate fully only when either file's stat identity changes;
# an unchanged (mtime_ns, size) pair on both files cannot be a normal modification.
_IDENTITY_CACHE: dict[str, tuple[tuple[int, int, int, int], tuple[str, str]]] = {}


def snapshot_identity(manifest_path: Path) -> tuple[str, str]:
    """Validate files on readiness checks and return immutable cache keys."""
    resolved = manifest_path.resolve(strict=True)
    manifest_bytes = resolved.read_bytes()
    manifest = CatalogManifest.model_validate_json(manifest_bytes)
    _validate_manifest(manifest)
    artifact_path = _safe_artifact_path(resolved.parent, manifest)
    manifest_stat = resolved.stat()
    artifact_stat = artifact_path.stat()
    stamp = (
        manifest_stat.st_mtime_ns,
        manifest_stat.st_size,
        artifact_stat.st_mtime_ns,
        artifact_stat.st_size,
    )
    cached = _IDENTITY_CACHE.get(str(resolved))
    if cached is not None and cached[0] == stamp:
        return cached[1]
    validated, _ = load_snapshot(resolved)
    identity = (hashlib.sha256(manifest_bytes).hexdigest(), validated.artifact_sha256)
    _IDENTITY_CACHE[str(resolved)] = (stamp, identity)
    return identity


def _validate_manifest(manifest: CatalogManifest) -> None:
    if manifest.schema_version != _CATALOG_SCHEMA:
        raise RuntimeError(f"Unsupported item catalog manifest schema: {manifest.schema_version}")
    if manifest.payload_schema_version != _CATALOG_SCHEMA:
        raise RuntimeError(
            f"Unsupported item catalog payload schema: {manifest.payload_schema_version}"
        )
    if not _SHA256.fullmatch(manifest.artifact_sha256):
        raise RuntimeError("Item catalog manifest has an invalid SHA-256")
    expected_name = f"catalog-{manifest.artifact_sha256[:16]}.json.gz"
    if manifest.artifact != expected_name:
        raise RuntimeError("Item catalog artifact is not content-addressed")
    if manifest.source_count != len(manifest.sources):
        raise RuntimeError("Item catalog manifest source_count does not match sources")


def _safe_artifact_path(directory: Path, manifest: CatalogManifest) -> Path:
    relative = Path(manifest.artifact)
    if relative.is_absolute() or relative.name != manifest.artifact:
        raise RuntimeError("Item catalog artifact must be a direct child of its manifest")
    resolved = (directory / relative).resolve(strict=True)
    if resolved.parent != directory.resolve():
        raise RuntimeError("Item catalog artifact escapes its manifest directory")
    return resolved


def _validate_artifact_bytes(
    compressed: bytes, artifact_path: Path, manifest: CatalogManifest
) -> None:
    if len(compressed) != manifest.artifact_bytes:
        raise RuntimeError(f"Item catalog byte count mismatch: {artifact_path}")
    actual_hash = hashlib.sha256(compressed).hexdigest()
    if actual_hash != manifest.artifact_sha256:
        raise RuntimeError(f"Item catalog checksum mismatch: {artifact_path}")


def _validate_payload(
    payload: object, manifest: CatalogManifest
) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise RuntimeError("Item catalog payload must be an object")
    if payload.get("schema_version") != manifest.payload_schema_version:
        raise RuntimeError("Item catalog payload schema does not match its manifest")
    if payload.get("repoe_version") != manifest.repoe_version:
        raise RuntimeError("Item catalog RePoE version does not match its manifest")
    sources = payload.get("sources")
    if not isinstance(sources, dict):
        raise RuntimeError("Item catalog has no sources object")
    if set(sources) != set(manifest.sources) or len(sources) != manifest.source_count:
        raise RuntimeError("Item catalog payload sources do not match its manifest")
    for name, metadata in manifest.sources.items():
        source = sources[name]
        if not isinstance(source, (dict, list)) or len(source) != metadata.records:
            raise RuntimeError(f"Item catalog source count mismatch: {name}")
    return payload
