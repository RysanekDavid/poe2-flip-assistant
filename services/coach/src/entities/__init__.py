"""Generated entity catalog: lookup and deterministic answer annotation."""

from src.entities.annotator import EntityMatcher, annotate_answer, get_entity_matcher
from src.entities.catalog import EntityCatalog, get_entity_catalog, load_entity_catalog
from src.entities.models import CoachEntity, EntityRow
from src.entities.turn import ToolOutput, TurnEvidence, collect_turn_evidence

__all__ = [
    "CoachEntity",
    "EntityCatalog",
    "EntityMatcher",
    "EntityRow",
    "ToolOutput",
    "TurnEvidence",
    "annotate_answer",
    "collect_turn_evidence",
    "get_entity_catalog",
    "get_entity_matcher",
    "load_entity_catalog",
]
