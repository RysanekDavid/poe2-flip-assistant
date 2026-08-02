"""Model transport configuration regressions."""

from pydantic import SecretStr

from src.agent import build_chat_model
from src.config import Settings


def test_agent_uses_chat_completions_for_tool_round_trips() -> None:
    settings = Settings(_env_file=None, openai_api_key=SecretStr("test-key"))

    model = build_chat_model(settings)

    assert model.use_responses_api is False
    assert model.output_version != "responses/v1"
