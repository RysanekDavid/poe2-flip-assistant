"""Deterministic, heading-aware Markdown chunking."""

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

_HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
_EXCLUDED = re.compile(r"refuted|open questions?|unverified", re.I)
_CORPUS_FILES = (
    "docs/kb/README.md",
    "docs/kb/currency-core.md",
    "docs/kb/breach.md",
    "docs/kb/desecration-abyss.md",
    "docs/kb/delirium.md",
    "docs/kb/expedition-ritual.md",
    "docs/kb/atlas-juicing.md",
    "docs/kb/economy-meta.md",
    "docs/kb/league-mechanics-misc.md",
    "docs/kb/drop-sources.md",
    "docs/research/poe2-crafting-knowledge.md",
)


@dataclass(frozen=True)
class MarkdownSection:
    """One source section before size-based splitting."""

    source: str
    heading: str
    content: str


def load_corpus(corpus_dir: Path) -> list[Document]:
    """Load and split every curated Markdown file in deterministic path order."""
    if not corpus_dir.is_dir():
        raise FileNotFoundError(f"Knowledge corpus directory does not exist: {corpus_dir}")
    documents: list[Document] = []
    for relative in _CORPUS_FILES:
        path = corpus_dir / relative
        if not path.is_file():
            raise FileNotFoundError(f"Allowlisted knowledge file is missing: {relative}")
        documents.extend(_documents_for_file(path, corpus_dir))
    if not documents:
        raise RuntimeError(f"Knowledge corpus contains no usable Markdown chunks: {corpus_dir}")
    return documents


def _documents_for_file(path: Path, corpus_dir: Path) -> list[Document]:
    relative = path.relative_to(corpus_dir).as_posix()
    sections = parse_sections(path.read_text(encoding="utf-8"), relative)
    base_docs = [_section_document(section) for section in sections if not _excluded(section)]
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1_000,
        chunk_overlap=150,
        add_start_index=True,
        separators=["\n## ", "\n### ", "\n\n", "\n", ". ", " "],
    )
    chunks = splitter.split_documents(base_docs)
    return _assign_chunk_ids(chunks)


def parse_sections(markdown: str, source: str) -> list[MarkdownSection]:
    """Split Markdown at headings while preserving table and paragraph text."""
    sections: list[MarkdownSection] = []
    heading = "Document"
    buffer: list[str] = []
    for line in markdown.splitlines():
        match = _HEADING.match(line)
        if match and buffer:
            _append_section(sections, source, heading, buffer)
            buffer = []
        if match:
            heading = match.group(2).strip()
        buffer.append(line)
    _append_section(sections, source, heading, buffer)
    return sections


def _append_section(
    sections: list[MarkdownSection], source: str, heading: str, lines: list[str]
) -> None:
    content = "\n".join(lines).strip()
    if content:
        sections.append(MarkdownSection(source=source, heading=heading, content=content))


def _section_document(section: MarkdownSection) -> Document:
    evidence_id = f"{section.source}#{_slug(section.heading)}"
    return Document(
        page_content=section.content,
        metadata={
            "source": section.source,
            "heading": section.heading,
            "evidence_id": evidence_id,
            "content_hash": hashlib.sha256(section.content.encode()).hexdigest(),
        },
    )


def _assign_chunk_ids(chunks: list[Document]) -> list[Document]:
    counts: dict[str, int] = {}
    for chunk in chunks:
        evidence_id = str(chunk.metadata["evidence_id"])
        part = counts.get(evidence_id, 0) + 1
        counts[evidence_id] = part
        chunk.metadata["chunk_id"] = f"{evidence_id}#part-{part}"
    return chunks


def _excluded(section: MarkdownSection) -> bool:
    return bool(_EXCLUDED.search(section.heading) or "[REFUTED]" in section.content)


def _slug(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return normalized or "document"
