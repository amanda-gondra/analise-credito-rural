"""API settings, read once from environment variables (or a local .env file).

Defaults are safe for production: CORS allows no origin, the request limit is on
and nothing secret has a default. Only the variables below are read; the other
values of .env (admin and loader passwords) are ignored, so the API never holds them.

Variables:
    DATABASE_URL_READER     connection URL of the read-only role (production, e.g. Neon)
    API_READER_PASSWORD     local alternative: password of api_reader in docker-compose.yml
    POSTGRES_HOST/PORT/DB   local database address (defaults match docker-compose.yml)
    DB_POOL_SIZE            connections kept open; api_reader accepts at most 10 (sql/roles.sql)
    ALLOWED_ORIGINS         comma-separated origins allowed by CORS (none by default)
    RATE_LIMIT_PER_MINUTE   requests per client per minute to /api/v1/ (0: no limit)
    CLIENT_IP_HEADER        header the host's proxy writes with the visitor's address, e.g.
                            CF-Connecting-IP on Render (empty: the connection address; D31)
    QUERIES_FILE            path of sql/queries.sql (default: the file of this repository)
    LOG_LEVEL               logging level

Assistant (decision D18). Only providers with credentials are used, in this order:
    ASSISTANT_PROVIDERS        order of the providers, e.g. "gemini,groq,cloudflare"
    GEMINI_API_KEY / GEMINI_MODEL
    GROQ_API_KEY / GROQ_MODEL
    CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN / CLOUDFLARE_MODEL
    ASSISTANT_PER_MINUTE       questions per visitor per minute
    ASSISTANT_PER_DAY          questions per visitor per day
    ASSISTANT_GLOBAL_PER_DAY   questions per day for everybody (protects the free quotas)
    ASSISTANT_TIMEOUT_SECONDS  time limit of each call to a provider
"""

from __future__ import annotations

import re
from functools import cache
from pathlib import Path
from typing import Annotated, Final, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from sqlalchemy.engine import URL, make_url

ProviderName = Literal["gemini", "groq", "cloudflare"]

DEFAULT_QUERIES_FILE: Final = Path(__file__).resolve().parents[2] / "sql" / "queries.sql"
# Hosts such as Neon give "postgresql://" URLs; SQLAlchemy needs the driver in the scheme.
_DRIVER_SCHEMES: Final = ("postgres://", "postgresql://")
_HEADER_NAME: Final = re.compile(r"[A-Za-z0-9-]+")
_FORGEABLE_HEADERS: Final = frozenset({"x-forwarded-for", "forwarded", "x-real-ip"})


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", frozen=True)

    database_url_reader: SecretStr | None = None
    api_reader_password: SecretStr | None = None
    # 127.0.0.1, not "localhost": on Windows "localhost" tries IPv6 first and the Docker
    # port is published on IPv4 only (same reason as in pipeline/load.py).
    postgres_host: str = "127.0.0.1"
    postgres_port: int = Field(default=5432, ge=1, le=65_535)
    postgres_db: str = "rural_credit"
    db_pool_size: int = Field(default=5, ge=1, le=10)
    allowed_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)
    rate_limit_per_minute: int = Field(default=60, ge=0)
    client_ip_header: str | None = None
    queries_file: Path = DEFAULT_QUERIES_FILE
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    # Assistant. Models are configurable because the free tiers change (checked 05/11/2026).
    assistant_providers: Annotated[list[ProviderName], NoDecode] = Field(
        default_factory=lambda: ["gemini", "groq", "cloudflare"]
    )
    gemini_api_key: SecretStr | None = None
    # Flash-Lite: picks the same tools as Flash in ~1 s instead of 10-30 s on the free tier (06/11/2026).
    gemini_model: str = "gemini-3.5-flash-lite"
    groq_api_key: SecretStr | None = None
    groq_model: str = "llama-3.3-70b-versatile"
    cloudflare_account_id: str | None = None
    cloudflare_api_token: SecretStr | None = None
    cloudflare_model: str = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
    assistant_per_minute: int = Field(default=5, ge=1)
    assistant_per_day: int = Field(default=30, ge=1)
    assistant_global_per_day: int = Field(default=300, ge=1)
    assistant_timeout_seconds: float = Field(default=20.0, gt=0, le=60)
    # Questions are short; 4 KB covers 500 characters of any alphabet plus the JSON around them.
    max_request_body_bytes: int = Field(default=4_096, ge=1_024)

    @field_validator(
        "database_url_reader",
        "api_reader_password",
        "gemini_api_key",
        "groq_api_key",
        "cloudflare_account_id",
        "cloudflare_api_token",
        mode="before",
    )
    @classmethod
    def _empty_is_none(cls, value: object) -> object:
        # An empty variable in .env or on the host means "not set", not an empty password.
        return None if value == "" else value

    @field_validator("client_ip_header", mode="before")
    @classmethod
    def _check_client_ip_header(cls, value: object) -> object:
        if value is None or (isinstance(value, str) and value.strip() == ""):
            return None
        if not isinstance(value, str) or not _HEADER_NAME.fullmatch(value.strip()):
            raise ValueError("CLIENT_IP_HEADER must be a header name, e.g. CF-Connecting-IP")
        name = value.strip().lower()
        if name in _FORGEABLE_HEADERS:
            # The visitor writes the start of these headers (see api/app/client_ip.py).
            raise ValueError(f"CLIENT_IP_HEADER cannot be {value.strip()}: the visitor can forge it")
        return name

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            value = [origin.strip() for origin in value.split(",") if origin.strip()]
        if isinstance(value, list) and "*" in value:
            raise ValueError("ALLOWED_ORIGINS must list origins explicitly; '*' is not allowed")
        return value

    @field_validator("assistant_providers", mode="before")
    @classmethod
    def _split_providers(cls, value: object) -> object:
        if isinstance(value, str):
            value = [name.strip().lower() for name in value.split(",") if name.strip()]
        return value

    @model_validator(mode="after")
    def _has_credentials(self) -> Settings:
        if self.database_url_reader is None and self.api_reader_password is None:
            raise ValueError("set DATABASE_URL_READER or API_READER_PASSWORD (see .env.example)")
        return self

    def database_url(self) -> URL:
        """URL of the read-only role. The password stays inside the URL object, never in logs."""
        if self.database_url_reader is not None:
            raw = self.database_url_reader.get_secret_value()
            for scheme in _DRIVER_SCHEMES:
                if raw.startswith(scheme):
                    raw = "postgresql+psycopg://" + raw[len(scheme):]
                    break
            return make_url(raw)
        assert self.api_reader_password is not None  # noqa: S101 - guaranteed by _has_credentials
        return URL.create(
            "postgresql+psycopg",
            username="api_reader",
            password=self.api_reader_password.get_secret_value(),
            host=self.postgres_host,
            port=self.postgres_port,
            database=self.postgres_db,
        )


@cache
def get_settings() -> Settings:
    return Settings()
