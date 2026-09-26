"""Patch-stamped knowledge-corpus manifest shared with `npm run kb:check`."""

import json
from datetime import date
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

MANIFEST_PATH = Path("docs/kb/manifest.json")

RelativeMarkdown = Annotated[
    str, StringConstraints(pattern=r"^docs/(?:kb|research)/[A-Za-z0-9][A-Za-z0-9._-]*\.md$")
]


class CorpusEntry(BaseModel):
    """One ingested file and the patch/league its facts were verified against."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    path: RelativeMarkdown
    patch: str = Field(min_length=1, max_length=20)
    league: str = Field(min_length=1, max_length=60)
    stamped_at: date
    # LF-normalized content hash at stamping time; kb:check flags edits made after the stamp.
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class ExcludedEntry(BaseModel):
    """A docs/kb file deliberately kept out of retrieval, with the reason."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    path: RelativeMarkdown
    reason: str = Field(min_length=1)


class CorpusManifest(BaseModel):
    """The complete retrieval corpus; nothing outside `corpus` is ever ingested."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: Literal[1]
    corpus: list[CorpusEntry] = Field(min_length=1)
    excluded: list[ExcludedEntry] = Field(default_factory=list)

    @model_validator(mode="after")
    def paths_are_unique(self) -> "CorpusManifest":
        """Reject a file listed twice or both ingested and excluded."""
        paths = [entry.path for entry in self.corpus] + [entry.path for entry in self.excluded]
        if len(paths) != len(set(paths)):
            raise ValueError("manifest lists a path more than once")
        return self


def load_manifest(corpus_dir: Path) -> CorpusManifest:
    """Read and validate the manifest from the repository root."""
    path = corpus_dir / MANIFEST_PATH
    if not path.is_file():
        raise FileNotFoundError(f"Knowledge manifest is missing: {MANIFEST_PATH.as_posix()}")
    return CorpusManifest.model_validate(json.loads(path.read_text(encoding="utf-8")))
