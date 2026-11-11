"""POST /api/v1/assistant/ask: a question in Portuguese, answered with the project's numbers.

Order of the checks, cheapest first: body size (middleware), JSON and question length
(Pydantic), assistant configured, visitor and site quotas; only then the language model.
The answer comes with the rows it was written from and the page of the panel to check it.
"""

from __future__ import annotations

from fastapi import APIRouter

from api.app.assistant.agent import AssistantUnavailableError
from api.app.dependencies import AssistantDep, ClientKeyDep, DatabaseDep, QuotaDep
from api.app.errors import ErrorResponse
from api.app.schemas import AskRequest, AskResponse, AssistantMeta, AssistantSource

router = APIRouter(prefix="/api/v1/assistant", tags=["assistant"])


@router.post(
    "/ask",
    response_model=AskResponse,
    summary="Ask the assistant (closed tools over the routes of this API)",
    responses={
        429: {"model": ErrorResponse, "description": "Question limit of the visitor or of the site"},
        503: {"model": ErrorResponse, "description": "No language model available"},
    },
)
def ask(
    body: AskRequest,
    database: DatabaseDep,
    assistant: AssistantDep,
    quota: QuotaDep,
    visitor: ClientKeyDep,
) -> AskResponse:
    if not assistant.available:
        raise AssistantUnavailableError
    quota.consume(visitor)
    answer = assistant.ask(body.question, database, body.context, body.previous_question)
    collected = [row["collected_at"] for row in database.fetch("loaded_years")]
    return AskResponse(
        meta=AssistantMeta(collected_at=max(collected, default=None)),
        answer=answer.answer,
        out_of_scope=answer.out_of_scope,
        provider=answer.provider,
        sources=[
            AssistantSource(tool=r.tool, filters=r.filters, panel_path=r.panel_path, data=r.data)
            for r in answer.results
        ],
    )
