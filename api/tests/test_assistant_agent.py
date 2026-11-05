"""The assistant's loop with scripted providers: tools, refusals, retries and fallback."""

from __future__ import annotations

import pytest

from api.app.assistant.agent import MAX_CALLS_PER_ROUND, MAX_ROUNDS, Assistant, AssistantUnavailableError
from api.app.assistant.conversation import ProviderError, ToolOutput
from api.app.assistant.scope import MESSAGES
from api.tests.conftest import FakeDatabase, ScriptedProvider, call_reply, text_reply


def test_the_model_reads_tool_results_and_writes_the_answer():
    provider = ScriptedProvider("gemini", [
        call_reply(("yearly_totals", {"state": "PI", "start_year": 2025})),
        text_reply("Em 2025 o Piauí recebeu R$ 4,6 bilhões. Fonte: Banco Central do Brasil (MDCR)."),
    ])
    database = FakeDatabase()

    answer = Assistant([provider]).ask("Quanto o Piauí recebeu em 2025?", database)

    assert answer.answer.startswith("Em 2025")
    assert answer.provider == "gemini"
    assert not answer.out_of_scope
    assert [result.tool for result in answer.results] == ["yearly_totals"]
    tool_output = provider.requests[1]["turns"][-1]
    assert isinstance(tool_output, ToolOutput)
    assert tool_output.content["filters"]["state"] == "PI"


def test_out_of_scope_ends_with_the_fixed_text_and_no_second_call():
    provider = ScriptedProvider("gemini", [call_reply(("explain_out_of_scope", {"topic": "municipality"}))])
    database = FakeDatabase()

    answer = Assistant([provider]).ask("Quanto Teresina recebeu?", database)

    assert answer.out_of_scope
    assert answer.answer == MESSAGES["municipality"]
    assert answer.results == ()
    assert len(provider.requests) == 1
    assert database.calls == []


def test_invalid_arguments_go_back_to_the_model_which_can_fix_them():
    provider = ScriptedProvider("groq", [
        call_reply(("yearly_totals", {"state": "Piauí"})),
        call_reply(("yearly_totals", {"state": "PI"})),
        text_reply("Resposta."),
    ])

    answer = Assistant([provider]).ask("Piauí?", FakeDatabase())

    first_output = provider.requests[1]["turns"][-1]
    assert "error" in first_output.content and "state" in first_output.content["error"]
    assert [result.filters["state"] for result in answer.results] == ["PI"]


def test_a_failing_provider_hands_the_whole_question_to_the_next():
    failing = ScriptedProvider("gemini", [call_reply(("state_ranking", {})), ProviderError("gemini: HTTP 429")])
    backup = ScriptedProvider("groq", [call_reply(("state_ranking", {})), text_reply("MG lidera.")])

    answer = Assistant([failing, backup]).ask("Quem lidera?", FakeDatabase())

    assert answer.provider == "groq"
    assert len(backup.requests[0]["turns"]) == 1  # the backup starts from the question alone
    assert [result.tool for result in answer.results] == ["state_ranking"]


def test_an_empty_answer_counts_as_a_failure():
    empty = ScriptedProvider("gemini", [text_reply("   ")])
    backup = ScriptedProvider("groq", [text_reply("Resposta.")])

    assert Assistant([empty, backup]).ask("Pergunta?", FakeDatabase()).provider == "groq"


def test_without_providers_or_when_all_fail_the_assistant_is_unavailable():
    assert not Assistant([]).available
    with pytest.raises(AssistantUnavailableError):
        Assistant([]).ask("Pergunta?", FakeDatabase())
    with pytest.raises(AssistantUnavailableError):
        Assistant([ScriptedProvider("gemini", [ProviderError("timeout")])]).ask("Pergunta?", FakeDatabase())


def test_after_the_last_round_the_model_must_answer_without_tools():
    replies = [call_reply(("state_ranking", {})) for _ in range(MAX_ROUNDS)] + [text_reply("Final.")]
    provider = ScriptedProvider("gemini", replies)

    answer = Assistant([provider]).ask("Pergunta?", FakeDatabase())

    assert answer.answer == "Final."
    assert [request["allow_tools"] for request in provider.requests] == [True] * MAX_ROUNDS + [False]


def test_extra_calls_in_one_turn_get_an_error_and_do_not_run():
    calls = [("state_ranking", {}) for _ in range(MAX_CALLS_PER_ROUND + 2)]
    provider = ScriptedProvider("gemini", [call_reply(*calls), text_reply("Ok.")])
    database = FakeDatabase()

    Assistant([provider]).ask("Pergunta?", database)

    outputs = [turn for turn in provider.requests[1]["turns"] if isinstance(turn, ToolOutput)]
    assert len(outputs) == MAX_CALLS_PER_ROUND + 2  # every call gets an answer
    assert len(database.calls) == MAX_CALLS_PER_ROUND
    assert all("error" in output.content for output in outputs[MAX_CALLS_PER_ROUND:])
