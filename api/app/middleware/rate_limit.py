"""Limit requests to the /api/v1/ routes: at most N per client per minute, then 429.

Counting uses fixed one-minute windows kept in this process's memory: every
counter is cleared when a new minute starts, so memory stays bounded. While a
minute lasts, at most `max_clients` addresses are tracked; requests from new
addresses beyond that are refused too, which protects the process from floods
of fake addresses.

What it protects and what it does not:
    * it caps the database work a client can ask for, which is what matters for
      a free database with a small connection limit;
    * it is per process: several replicas would each have their own counters;
    * the client is given by `client_key`: the address of the TCP connection by
      default, or the header the host's proxy writes (api/app/client_ip.py, D31).

/health, /docs and /openapi.json are not limited, so health checks keep working.
"""

from __future__ import annotations

import math
import time
from collections.abc import Callable
from typing import Final

from starlette.types import ASGIApp, Receive, Scope, Send

from api.app.client_ip import ClientResolver
from api.app.errors import error_response

LIMITED_PREFIX: Final = "/api/v1/"
WINDOW_SECONDS: Final = 60
DEFAULT_MAX_CLIENTS: Final = 10_000


class RateLimitMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        requests_per_minute: int,
        clock: Callable[[], float] = time.monotonic,
        max_clients: int = DEFAULT_MAX_CLIENTS,
        client_key: Callable[[Scope], str] | None = None,
    ) -> None:
        self.app = app
        self.requests_per_minute = requests_per_minute
        self.max_clients = max_clients
        self._clock = clock
        self._client_key = client_key or ClientResolver().key
        self._window = -1
        self._counts: dict[str, int] = {}

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        limited = (
            scope["type"] == "http"
            and self.requests_per_minute > 0
            and scope["path"].startswith(LIMITED_PREFIX)
            and scope["method"] != "OPTIONS"  # CORS preflight carries no work
        )
        if not limited:
            await self.app(scope, receive, send)
            return

        now = self._clock()
        window = int(now // WINDOW_SECONDS)
        if window != self._window:
            self._window = window
            self._counts.clear()

        key = self._client_key(scope)
        count = self._counts.get(key, 0) + 1
        if count > self.requests_per_minute or (
            key not in self._counts and len(self._counts) >= self.max_clients
        ):
            retry_after = max(1, math.ceil(WINDOW_SECONDS - now % WINDOW_SECONDS))
            response = error_response(
                429,
                "rate_limited",
                f"More than {self.requests_per_minute} requests per minute. Try again later.",
                scope.get("state", {}).get("request_id"),
                headers={"Retry-After": str(retry_after)},
            )
            await response(scope, receive, send)
            return
        self._counts[key] = count
        await self.app(scope, receive, send)
