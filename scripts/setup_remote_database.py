"""Prepare the published database (Neon) once: schema, roles and connection URLs (decision D32).

Input: NEON_OWNER_URL in .env.production, the owner's connection string copied from the Neon
console (the file is git-ignored). The script then:

    1. creates the schema with sql/schema.sql, if it is not there yet;
    2. creates or updates the roles loader and api_reader with sql/roles.sql;
    3. writes to .env.production the URLs of the two roles:
         DATABASE_URL         loader, used by the pipeline to load the data
         DATABASE_URL_READER  api_reader, pasted into Render (read only)

The passwords of the roles are generated here, kept when the script runs again, and never
printed. psql runs in the PostgreSQL image of docker-compose.yml, so nothing else needs to be
installed; the connection strings reach the container as environment variables, never as
command-line arguments.

Run from the repository root, with Docker running:
    python scripts/setup_remote_database.py
    python scripts/setup_remote_database.py --env-file other.env   # a rehearsal database
"""

from __future__ import annotations

import argparse
import os
import secrets
import subprocess
import sys
from pathlib import Path
from typing import Final
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from dotenv import dotenv_values

ROOT: Final = Path(__file__).resolve().parents[1]
PSQL_IMAGE: Final = "postgres:16-alpine"  # same image as docker-compose.yml
PASSWORD_BYTES: Final = 24  # 32 URL-safe characters; roles.sql requires at least 16


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Create the schema and roles of the published database.")
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env.production")
    env_file: Path = parser.parse_args(argv).env_file

    values = dotenv_values(env_file) if env_file.exists() else {}
    if not values.get("NEON_OWNER_URL"):
        print(f"Set NEON_OWNER_URL in {env_file.name} (see README, 'Publicação').", file=sys.stderr)
        return 1
    owner_url = direct_url(values["NEON_OWNER_URL"])
    host = urlsplit(owner_url).hostname

    loader_password = existing_password(values.get("DATABASE_URL")) or new_password()
    reader_password = existing_password(values.get("DATABASE_URL_READER")) or new_password()

    exists = psql(owner_url, ["-tAc", "SELECT to_regnamespace('rural_credit') IS NOT NULL"]).strip() == "t"
    if exists:
        print(f"{host}: schema rural_credit already there")
    else:
        psql(owner_url, ["-f", "/sql/schema.sql"])
        print(f"{host}: schema rural_credit created")

    psql(
        owner_url,
        ["-f", "/sql/roles.sql"],
        secret_variables={"loader_password": loader_password, "api_reader_password": reader_password},
    )
    print(f"{host}: roles loader and api_reader ready")

    write_env(env_file, {
        "DATABASE_URL": role_url(owner_url, "loader", loader_password),
        "DATABASE_URL_READER": role_url(owner_url, "api_reader", reader_password),
    })
    print(f"{env_file.name}: DATABASE_URL (loader) and DATABASE_URL_READER (api_reader) written")
    return 0


def direct_url(url: str) -> str:
    """The direct connection: Neon's pooler (PgBouncer) suits neither COPY nor psql scripts."""
    parts = urlsplit(url)
    if parts.scheme not in ("postgres", "postgresql"):
        raise SystemExit("NEON_OWNER_URL must start with postgresql://")
    netloc = parts.netloc.replace("-pooler.", ".", 1)
    query = dict(parse_qsl(parts.query))
    query.setdefault("sslmode", "require")
    return urlunsplit(("postgresql", netloc, parts.path, urlencode(query), ""))


def role_url(owner_url: str, role: str, password: str) -> str:
    parts = urlsplit(owner_url)
    host = parts.netloc.rsplit("@", 1)[1]
    # +psycopg: the driver of the pipeline and of the API (SQLAlchemy needs it in the scheme).
    return urlunsplit(("postgresql+psycopg", f"{role}:{password}@{host}", parts.path, parts.query, ""))


def existing_password(url: str | None) -> str | None:
    return urlsplit(url).password if url else None


def new_password() -> str:
    return secrets.token_urlsafe(PASSWORD_BYTES)


def psql(url: str, arguments: list[str], secret_variables: dict[str, str] | None = None) -> str:
    """Run psql in a throwaway container. Secrets travel in environment variables only:
    `docker run -e NAME` copies NAME from this process, and the shell in the container
    expands "$NAME", so no password appears in a command line or in the output."""
    secrets_env = {f"PSQL_VAR_{name.upper()}": value for name, value in (secret_variables or {}).items()}
    variables = " ".join(f'-v {name}="$PSQL_VAR_{name.upper()}"' for name in (secret_variables or {}))
    script = f'psql "$PSQL_URL" -X -q -v ON_ERROR_STOP=1 {variables} ' + " ".join(map(_quote, arguments))
    command = [
        "docker", "run", "--rm",
        "-v", f"{ROOT / 'sql'}:/sql:ro",
        *[flag for name in ("PSQL_URL", *secrets_env) for flag in ("-e", name)],
        PSQL_IMAGE,
        "sh", "-c", script,
    ]
    environment = {**os.environ, "PSQL_URL": url, **secrets_env}
    result = subprocess.run(command, env=environment, capture_output=True, text=True, encoding="utf-8")
    if result.returncode != 0:
        # psql reports the failing statement; the URL and the passwords are not part of it.
        raise SystemExit(f"psql failed ({result.returncode}): {result.stderr.strip()}")
    return result.stdout


def write_env(env_file: Path, updates: dict[str, str]) -> None:
    """Replace or append KEY=value lines, keeping every other line of the file."""
    lines = env_file.read_text(encoding="utf-8").splitlines() if env_file.exists() else []
    pending = dict(updates)
    kept = []
    for line in lines:
        key = line.split("=", 1)[0].strip()
        kept.append(f"{key}={pending.pop(key)}" if key in pending else line)
    kept.extend(f"{key}={value}" for key, value in pending.items())
    env_file.write_text("\n".join(kept) + "\n", encoding="utf-8")


def _quote(argument: str) -> str:
    """Single-quote an argument for sh."""
    return "'" + argument.replace("'", "'\"'\"'") + "'"


if __name__ == "__main__":
    raise SystemExit(main())
