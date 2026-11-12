"""Who is the visitor? The key of the request limit and of the assistant quota (decision D31).

Locally the visitor is the address of the TCP connection. On a host with a proxy in front
(Render, behind Cloudflare) that address is the proxy's, the same for everybody, so the host
names the header that carries the visitor's address in CLIENT_IP_HEADER.

X-Forwarded-For is never read: on Render the proxy keeps whatever the visitor sends at the
start of that header and only appends to it, so its first entry is chosen by the visitor and
a script could get a new limit on every request. The configured header must be one the proxy
writes on every request, overwriting any value the visitor sent (Cloudflare's CF-Connecting-IP).

When the header is configured but missing or not an address, the TCP address is used: the
limit then works as a ceiling for the whole API, as it did before, never as no limit at all.
A warning is logged once, so the logs of a new deploy show a wrong header name.

IPv6 addresses are grouped by their /64 network: a connection usually gets a whole /64, and
counting single addresses would let one visitor rotate through endless keys.
"""

from __future__ import annotations

import ipaddress
import logging
from typing import Final

from starlette.types import Scope

UNKNOWN: Final = "unknown"
_IPV6_PREFIX: Final = 64

logger = logging.getLogger("rural_credit_api.client_ip")


class ClientResolver:
    def __init__(self, header: str | None = None) -> None:
        # ASGI gives header names in lower case, as bytes.
        self._header = header.lower().encode("latin-1") if header else None
        self._warned = False

    def key(self, scope: Scope) -> str:
        """The visitor's address (an IPv6 /64 network), from the header or the connection."""
        if self._header is not None:
            key = self._from_header(scope)
            if key is not None:
                return key
            if not self._warned:
                self._warned = True
                logger.warning(
                    "client_ip header=%s missing or invalid; using the connection address",
                    self._header.decode("latin-1"),
                )
        client = scope.get("client")
        if not client:
            return UNKNOWN
        return normalize(client[0]) or client[0]

    def _from_header(self, scope: Scope) -> str | None:
        values = [value for name, value in scope.get("headers", ()) if name == self._header]
        # Two copies of the header mean someone besides the proxy wrote one: trust neither.
        if len(values) != 1:
            return None
        return normalize(values[0].decode("latin-1"))


def normalize(text: str) -> str | None:
    """'203.0.113.7' -> '203.0.113.7'; an IPv6 address -> its /64 network; not an address -> None."""
    try:
        address = ipaddress.ip_address(text.strip())
    except ValueError:
        return None
    if isinstance(address, ipaddress.IPv6Address):
        if address.ipv4_mapped is not None:
            return str(address.ipv4_mapped)
        return str(ipaddress.IPv6Network((address, _IPV6_PREFIX), strict=False))
    return str(address)
