"""Build the Rural Credit Analysis API.

Run locally, from the repository root:
    uvicorn api.app.main:create_app --factory --port 8000

create_app is a factory, so settings are read when the app is built (not when this
module is imported) and tests can pass their own settings, database and assistant.

Middlewares, from the outside in:
    CORS            closed unless ALLOWED_ORIGINS lists origins; GET, and POST for the assistant
    RequestContext  request id, X-Request-ID header, one access log line
    RateLimit       429 above RATE_LIMIT_PER_MINUTE requests per client to /api/v1/
    BodyLimit       413 for bodies above MAX_REQUEST_BODY_BYTES
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Final

import httpx2
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from api.app.assistant.agent import Assistant
from api.app.assistant.providers import build_providers
from api.app.assistant.quota import AssistantQuota
from api.app.config import Settings, get_settings
from api.app.database import Database, QueryRunner
from api.app.errors import register_exception_handlers
from api.app.middleware.rate_limit import RateLimitMiddleware
from api.app.middleware.request_context import REQUEST_ID_HEADER, RequestContextMiddleware
from api.app.middleware.request_limits import RequestBodyLimitMiddleware
from api.app.routes import assistant, breakdowns, credit, health, metadata, overview, regions, states

API_VERSION: Final = "1.3.0"
_LOG_FORMAT: Final = "%(asctime)s %(levelname)s %(name)s %(message)s"


def _description(settings: Settings) -> str:
    return f"""
Dados públicos do crédito rural concedido no Brasil, da Matriz de Dados do Crédito Rural
(MDCR) do Banco Central, de 2013 a 2025. Cada rota responde a uma pergunta do plano de
análise e devolve `{{"data", "meta"}}`: `meta` traz a fonte, o índice de preços e os filtros usados.

**Valores:** `amount_nominal` está nos preços de cada mês; `amount_real` está em preços de
dezembro de 2025, corrigido pelo IPCA (IBGE). Participações dentro de um ano usam valores
nominais; totais de vários anos usam valores reais. Os rankings seguem a mesma regra: posição e
participação pelo valor nominal quando o período é um ano só, pelo valor real quando são vários.

**Período padrão:** 2017 a 2025 (série principal). Os valores aceitos em cada filtro estão
em `GET /api/v1/metadata`.

**Dados linha a linha:** `GET /api/v1/credit` devolve as linhas da base em páginas (o
cursor da próxima página vem em `page.next_cursor`) e `GET /api/v1/credit.csv` devolve as
mesmas linhas em CSV para planilhas em português (`;`, vírgula decimal, UTF-8 com BOM).

**Assistente:** `POST /api/v1/assistant/ask` responde perguntas em português usando as
mesmas consultas das rotas, sem escrever SQL. O campo opcional `context` informa a página e
os filtros em tela, e `previous_question` a pergunta anterior, para perguntas de continuação
("e o Ceará?"); a pergunta prevalece sobre os dois. Antes de sair, cada número da resposta é
conferido com os dados consultados; se um não confere, a resposta é refeita uma vez e, se ainda
não conferir, é retida. Até {settings.assistant_per_minute} perguntas por minuto e
{settings.assistant_per_day} por dia por visitante.

**Limites:** até {settings.rate_limit_per_minute} pedidos por minuto às rotas `/api/v1/`
(0 = sem limite). Não há login.

**Erros** têm sempre o formato `{{"error": {{"code", "message", "request_id", "details"}}}}`:
400 JSON inválido · 404 rota inexistente · 405 método errado · 413 corpo grande demais ·
422 parâmetro inválido ou CSV grande demais · 429 limite de pedidos ou de perguntas · 500 erro interno ·
503 banco ou assistente indisponível. Toda resposta traz o cabeçalho `X-Request-ID`.
"""


def configure_logging(level: str) -> None:
    project_logger = logging.getLogger("rural_credit_api")
    project_logger.setLevel(level)
    if not project_logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(_LOG_FORMAT))
        project_logger.addHandler(handler)


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield
    # Close the pooled connections when the server stops.
    if isinstance(app.state.database, Database):
        app.state.database.dispose()
    if app.state.http_client is not None:
        app.state.http_client.close()


def create_app(
    settings: Settings | None = None,
    database: QueryRunner | None = None,
    assistant_service: Assistant | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="Rural Credit Analysis API",
        version=API_VERSION,
        description=_description(settings),
        lifespan=_lifespan,
    )
    app.state.settings = settings
    app.state.database = database or Database.from_settings(settings)
    app.state.http_client = None
    if assistant_service is None:
        # One client for every provider call: connections are reused and every call has a time limit.
        app.state.http_client = httpx2.Client(
            timeout=httpx2.Timeout(settings.assistant_timeout_seconds, connect=5.0)
        )
        assistant_service = Assistant(build_providers(settings, app.state.http_client))
    app.state.assistant = assistant_service
    app.state.assistant_quota = AssistantQuota(
        settings.assistant_per_minute, settings.assistant_per_day, settings.assistant_global_per_day
    )

    register_exception_handlers(app)
    for router in (
        metadata.router,
        overview.router,
        states.router,
        regions.router,
        breakdowns.router,
        credit.router,
        assistant.router,
        health.router,
    ):
        app.include_router(router)

    # Whoever opens the bare address lands on the documentation instead of a 404.
    @app.get("/", include_in_schema=False)
    def root() -> RedirectResponse:
        return RedirectResponse("/docs")

    # add_middleware puts each new middleware outside the previous ones.
    app.add_middleware(RequestBodyLimitMiddleware, max_body_bytes=settings.max_request_body_bytes)
    app.add_middleware(RateLimitMiddleware, requests_per_minute=settings.rate_limit_per_minute)
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
        expose_headers=[REQUEST_ID_HEADER, "Retry-After"],
        allow_credentials=False,
    )
    return app
