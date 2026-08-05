"""Runtime configuration with explicit secret boundaries."""

import os
from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
APP_ROOT = BACKEND_DIR.parents[1]
_PRODUCTION = os.environ.get("NODE_ENV", "").casefold() == "production"
_LOCAL_ENV_VALUE = os.environ.get("COACH_ENV_FILE", "").strip()
if _PRODUCTION and _LOCAL_ENV_VALUE:
    raise RuntimeError("COACH_ENV_FILE is local-development only in production")
_LOCAL_ENV_FILE = Path(_LOCAL_ENV_VALUE).resolve() if _LOCAL_ENV_VALUE else None
os.environ["LANGGRAPH_STRICT_MSGPACK"] = "true"


class Settings(BaseSettings):
    """Settings from process environment, with explicit local-only file opt-in."""

    model_config = SettingsConfigDict(
        env_file=_LOCAL_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
    )

    openai_api_key: SecretStr | None = None
    tavily_api_key: SecretStr | None = None
    langsmith_api_key: SecretStr | None = None
    langsmith_tracing: bool = False
    langsmith_project: str = "poe2-flip-coach"

    chat_model: str = "gpt-5.4"
    embedding_model: str = "text-embedding-3-small"
    league_name: str = "Runes of Aldur"

    configured_db_path: Path = Field(
        default=Path("data/poe2flip.db"),
        validation_alias=AliasChoices("POE_DB_PATH", "DB_PATH"),
    )
    configured_checkpoint_path: Path = Field(
        default=Path("data/coach-checkpoints.db"),
        validation_alias="COACH_CHECKPOINT_DB_PATH",
    )
    configured_item_catalog_path: Path = Field(
        default=Path("src/data/poe2/repoe/manifest.json"),
        validation_alias="POE2_DATA_MANIFEST",
    )
    corpus_dir: Path = APP_ROOT
    qdrant_collection: str = "poe2_knowledge"

    request_timeout_seconds: float = Field(
        default=45.0, ge=5.0, le=45.0, validation_alias="COACH_MODEL_TIMEOUT_SECONDS"
    )
    total_request_timeout_seconds: float = Field(
        default=140.0, ge=30.0, le=150.0, validation_alias="COACH_TOTAL_TIMEOUT_SECONDS"
    )
    max_tool_iterations: int = Field(
        default=2, ge=1, le=2, validation_alias="COACH_MAX_TOOL_ROUNDS"
    )
    chat_requests_per_minute: int = Field(
        default=20,
        ge=1,
        le=120,
        validation_alias="COACH_REQUESTS_PER_MINUTE",
    )

    @field_validator("openai_api_key", "tavily_api_key", "langsmith_api_key", mode="before")
    @classmethod
    def empty_secret_is_missing(cls, value: object) -> object:
        """Treat blank optional secret entries like absent environment variables."""
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @model_validator(mode="after")
    def timeout_budget_covers_model_calls(self) -> "Settings":
        """Budget every possible model call plus deterministic cleanup headroom."""
        minimum_budget = self.request_timeout_seconds * (self.max_tool_iterations + 1) + 5
        if self.total_request_timeout_seconds < minimum_budget:
            raise ValueError(
                "total_request_timeout_seconds must cover every model call plus 5 seconds"
            )
        return self

    @property
    def poe_db_path(self) -> Path:
        """Resolve the shared application database from the repository root."""
        return _app_path(self.configured_db_path)

    @property
    def checkpoint_db_path(self) -> Path:
        """Resolve the internal LangGraph checkpoint database."""
        return _app_path(self.configured_checkpoint_path)

    @property
    def item_catalog_path(self) -> Path:
        """Resolve the committed RePoE catalog manifest from the repository root."""
        return _app_path(self.configured_item_catalog_path)

    def require_openai_key(self) -> str:
        """Return the OpenAI key or fail with an actionable configuration error."""
        if self.openai_api_key is None:
            raise RuntimeError("OPENAI_API_KEY is required for chat and dense retrieval")
        return self.openai_api_key.get_secret_value()

    def require_tavily_key(self) -> str:
        """Return the Tavily key or fail with an actionable configuration error."""
        if self.tavily_api_key is None:
            raise RuntimeError("TAVILY_API_KEY is required for current web search")
        return self.tavily_api_key.get_secret_value()

    @property
    def has_tavily_key(self) -> bool:
        """Return whether recent public-web search can be registered."""
        return self.tavily_api_key is not None


def _app_path(path: Path) -> Path:
    return path if path.is_absolute() else (APP_ROOT / path).resolve()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide immutable settings instance."""
    return Settings()
