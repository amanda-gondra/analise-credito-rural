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
    QUERIES_FILE            path of sql/queries.sql (default: the file of this repository)
    LOG_LEVEL               logging level
"""

from __future__ import annotations

from functools import cache
from pathlib import Path
from typing import Annotated, Final, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from sqlalchemy.engine import URL, make_url

DEFAULT_QUERIES_FILE: Final = Path(__file__).resolve().parents[2] / "sql" / "queries.sql"
# Hosts such as Neon give "postgresql://" URLs; SQLAlchemy needs the driver in the scheme.
_DRIVER_SCHEMES: Final = ("postgres://", "postgresql://")


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
    queries_file: Path = DEFAULT_QUERIES_FILE
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    @field_validator("database_url_reader", "api_reader_password", mode="before")
    @classmethod
    def _empty_is_none(cls, value: object) -> object:
        # An empty variable in .env or on the host means "not set", not an empty password.
        return None if value == "" else value

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            value = [origin.strip() for origin in value.split(",") if origin.strip()]
        if isinstance(value, list) and "*" in value:
            raise ValueError("ALLOWED_ORIGINS must list origins explicitly; '*' is not allowed")
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
