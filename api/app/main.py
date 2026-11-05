"""Build the Rural Credit Analysis API.

Run locally, from the repository root:
    uvicorn api.app.main:create_app --factory --port 8000

create_app is a factory, so settings are read when the app is built (not when this
module is imported) and tests can pass their own settings and database.

Middlewares, from the outside in:
    CORS            closed unless ALLOWED_ORIGINS lists origins; GET only
    RequestContext  request id, X-Request-ID header, one access log line
    RateLimit       429 above RATE_LIMIT_PER_MINUTE requests per client to /api/v1/
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Final

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.app.config import Settings, get_settings
from api.app.database import Database, QueryRunner
from api.app.errors import register_exception_handlers
from api.app.middleware.rate_limit import RateLimitMiddleware
from api.app.middleware.request_context import REQUEST_ID_HEADER, RequestContextMiddleware
from api.app.routes import breakdowns, health, metadata, overview, regions, states

API_VERSION: Final = "1.0.0"
_LOG_FORMAT: Final = "%(asctime)s %(levelname)s %(name)s %(message)s"


def _description(settings: Settings) -> str:
    return f"""
Dados públicos do crédito rural concedido no Brasil, da Matriz de Dados do Crédito Rural
(MDCR) do Banco Central, de 2013 a 2025. Cada rota responde a uma pergunta do plano de
análise e devolve `{{"data", "meta"}}`: `meta` traz a fonte, o índice de preços e os filtros usados.

**Valores:** `amount_nominal` está nos preços de cada mês; `amount_real` está em preços de
dezembro de 2025, corrigido pelo IPCA (IBGE). Participações dentro de um ano usam valores
nominais; totais de vários anos usam valores reais.

**Período padrão:** 2017 a 2025 (série principal). Os valores aceitos em cada filtro estão
em `GET /api/v1/metadata`.

**Limites:** até {settings.rate_limit_per_minute} pedidos por minuto às rotas `/api/v1/`
(0 = sem limite). Somente leitura; não há login.

**Erros** têm sempre o formato `{{"error": {{"code", "message", "request_id", "details"}}}}`:
404 rota inexistente · 405 método diferente de GET · 422 parâmetro inválido ·
429 limite de pedidos · 500 erro interno · 503 banco indisponível. Toda resposta traz o
cabeçalho `X-Request-ID`.
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
    database = app.state.database
    if isinstance(database, Database):
        database.dispose()


def create_app(settings: Settings | None = None, database: QueryRunner | None = None) -> FastAPI:
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

    register_exception_handlers(app)
    for router in (
        metadata.router,
        overview.router,
        states.router,
        regions.router,
        breakdowns.router,
        health.router,
    ):
        app.include_router(router)

    # add_middleware puts each new middleware outside the previous ones.
    app.add_middleware(RateLimitMiddleware, requests_per_minute=settings.rate_limit_per_minute)
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET"],
        allow_headers=[],
        expose_headers=[REQUEST_ID_HEADER, "Retry-After"],
        allow_credentials=False,
    )
    return app
