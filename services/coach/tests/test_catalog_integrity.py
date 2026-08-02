"""Adversarial integrity tests for the committed game-data boundary."""

import gzip
import hashlib
import json
from pathlib import Path

import pytest

from src.items import catalog_ready, get_item_catalog


def test_manifest_rejects_hash_bytes_path_version_and_count(
    item_catalog_manifest: Path, tmp_path: Path
) -> None:
    cases: list[tuple[str, object]] = [
        ("artifact_sha256", "0" * 64),
        ("artifact_bytes", 1),
        ("artifact", "../catalog-0000000000000000.json.gz"),
        ("schema_version", 2),
        ("payload_schema_version", 2),
        ("source_count", 999),
    ]
    original = _manifest(item_catalog_manifest)
    for index, (field, value) in enumerate(cases):
        candidate = tmp_path / f"manifest-{index}.json"
        candidate.write_text(json.dumps({**original, field: value}), encoding="utf-8")
        assert catalog_ready(candidate) is False


def test_payload_version_and_source_set_must_match_manifest(
    item_catalog_manifest: Path, tmp_path: Path
) -> None:
    manifest = _manifest(item_catalog_manifest)
    artifact = item_catalog_manifest.parent / str(manifest["artifact"])
    payload = json.loads(gzip.decompress(artifact.read_bytes()))
    payload["repoe_version"] = "future-version"
    rewritten = _write_snapshot(tmp_path / "version", payload, manifest)
    assert catalog_ready(rewritten) is False

    payload["repoe_version"] = manifest["repoe_version"]
    payload["sources"].pop("item_classes")
    rewritten = _write_snapshot(tmp_path / "sources", payload, manifest)
    assert catalog_ready(rewritten) is False


def test_readiness_detects_corruption_after_catalog_was_cached(
    item_catalog_manifest: Path,
) -> None:
    get_item_catalog(item_catalog_manifest)
    manifest = _manifest(item_catalog_manifest)
    artifact = item_catalog_manifest.parent / str(manifest["artifact"])
    content = bytearray(artifact.read_bytes())
    content[-1] ^= 1
    artifact.write_bytes(content)

    assert catalog_ready(item_catalog_manifest) is False
    with pytest.raises(RuntimeError, match="checksum mismatch"):
        get_item_catalog(item_catalog_manifest)


def _manifest(path: Path) -> dict[str, object]:
    value = json.loads(path.read_text(encoding="utf-8"))
    assert isinstance(value, dict)
    return value


def _write_snapshot(
    directory: Path, payload: object, source_manifest: dict[str, object]
) -> Path:
    directory.mkdir()
    compressed = gzip.compress(json.dumps(payload).encode())
    digest = hashlib.sha256(compressed).hexdigest()
    artifact = directory / f"catalog-{digest[:16]}.json.gz"
    artifact.write_bytes(compressed)
    manifest = {
        **source_manifest,
        "artifact": artifact.name,
        "artifact_bytes": len(compressed),
        "artifact_sha256": digest,
    }
    path = directory / "manifest.json"
    path.write_text(json.dumps(manifest), encoding="utf-8")
    return path
