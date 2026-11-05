"""How many questions the assistant accepts (decision D18), before any call to a model.

Three counters, all in this process's memory:
    * per visitor per minute, so one person cannot use the quota in a burst;
    * per visitor per day (UTC);
    * for everybody per day, which keeps the site inside the providers' free quotas.

Windows are fixed (this minute, this day) and are cleared when the next one starts, so
memory stays bounded; at most `max_clients` visitors are tracked per day. The visitor is
the connection address, with the same proxy caveat as middleware/rate_limit.py.

Routes run in a thread pool, so the counters are protected by a lock.
"""

from __future__ import annotations

import math
import threading
import time
from collections.abc import Callable
from typing import Final

MINUTE: Final = 60
DAY: Final = 86_400


class QuotaExceededError(Exception):
    def __init__(self, retry_after: int, scope: str) -> None:
        super().__init__(scope)
        self.retry_after = retry_after
        self.scope = scope


class AssistantQuota:
    def __init__(
        self,
        per_minute: int,
        per_day: int,
        global_per_day: int,
        clock: Callable[[], float] = time.time,
        max_clients: int = 10_000,
    ) -> None:
        self.per_minute = per_minute
        self.per_day = per_day
        self.global_per_day = global_per_day
        self.max_clients = max_clients
        self._clock = clock
        self._lock = threading.Lock()
        self._minute = -1
        self._day = -1
        self._minute_counts: dict[str, int] = {}
        self._day_counts: dict[str, int] = {}
        self._global = 0

    def consume(self, client: str) -> None:
        """Count one question for the client, or raise QuotaExceededError without counting."""
        with self._lock:
            now = self._clock()
            minute, day = int(now // MINUTE), int(now // DAY)
            if minute != self._minute:
                self._minute, self._minute_counts = minute, {}
            if day != self._day:
                self._day, self._day_counts, self._global = day, {}, 0

            until_next_minute = max(1, math.ceil(MINUTE - now % MINUTE))
            until_next_day = max(1, math.ceil(DAY - now % DAY))
            if self._global >= self.global_per_day:
                raise QuotaExceededError(until_next_day, "site")
            if self._day_counts.get(client, 0) >= self.per_day:
                raise QuotaExceededError(until_next_day, "visitor_day")
            if self._minute_counts.get(client, 0) >= self.per_minute:
                raise QuotaExceededError(until_next_minute, "visitor_minute")
            if client not in self._day_counts and len(self._day_counts) >= self.max_clients:
                raise QuotaExceededError(until_next_minute, "site")

            self._minute_counts[client] = self._minute_counts.get(client, 0) + 1
            self._day_counts[client] = self._day_counts.get(client, 0) + 1
            self._global += 1
