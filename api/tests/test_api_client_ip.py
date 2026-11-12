"""Who is the visitor: the header the host's proxy writes, never X-Forwarded-For (D31)."""

from __future__ import annotations

import logging

import pytest
from pydantic import ValidationError

from api.app.client_ip import UNKNOWN, ClientResolver, normalize
from api.tests.conftest import ScriptedProvider, make_settings, text_reply

HEADER = "cf-connecting-ip"


def scope(*headers: tuple[str, str], client: tuple[str, int] | None = ("10.0.0.1", 443)) -> dict:
    return {
        "type": "http",
        "headers": [(name.lower().encode(), value.encode()) for name, value in headers],
        "client": client,
    }


# --- the rule ---------------------------------------------------------------------------------

def test_without_a_header_the_visitor_is_the_connection_and_headers_are_ignored():
    resolver = ClientResolver()

    assert resolver.key(scope((HEADER, "203.0.113.7"), ("X-Forwarded-For", "198.51.100.1"))) == "10.0.0.1"
    assert resolver.key(scope(client=None)) == UNKNOWN


def test_with_a_header_the_visitor_is_the_address_the_proxy_wrote():
    resolver = ClientResolver("CF-Connecting-IP")

    assert resolver.key(scope(("CF-Connecting-IP", " 203.0.113.7 "))) == "203.0.113.7"


def test_a_forged_x_forwarded_for_never_changes_the_visitor():
    resolver = ClientResolver(HEADER)

    keys = {
        resolver.key(scope((HEADER, "203.0.113.7"), ("X-Forwarded-For", f"198.51.100.{n}, 203.0.113.7")))
        for n in range(5)
    }

    assert keys == {"203.0.113.7"}


def test_a_missing_invalid_or_repeated_header_falls_back_to_the_connection_and_warns_once(caplog):
    resolver = ClientResolver(HEADER)

    with caplog.at_level(logging.WARNING, logger="rural_credit_api.client_ip"):
        assert resolver.key(scope()) == "10.0.0.1"
        assert resolver.key(scope((HEADER, "not-an-address"))) == "10.0.0.1"
        assert resolver.key(scope((HEADER, "203.0.113.7"), (HEADER, "198.51.100.1"))) == "10.0.0.1"

    warnings = [record for record in caplog.records if record.name == "rural_credit_api.client_ip"]
    assert len(warnings) == 1
    assert HEADER in warnings[0].getMessage()


def test_ipv6_visitors_are_grouped_by_their_64_network():
    same_network = {normalize("2001:db8:1:2::1"), normalize("2001:db8:1:2:ffff::9")}

    assert same_network == {"2001:db8:1:2::/64"}
    assert normalize("2001:db8:1:3::1") == "2001:db8:1:3::/64"
    assert normalize("::ffff:203.0.113.7") == "203.0.113.7"
    assert normalize("203.0.113.7") == "203.0.113.7"
    assert normalize("testclient") is None


# --- the setting ------------------------------------------------------------------------------

def test_the_setting_accepts_a_header_name_in_any_case_and_empty_means_none():
    assert make_settings(client_ip_header="CF-Connecting-IP").client_ip_header == HEADER
    assert make_settings(client_ip_header="").client_ip_header is None


@pytest.mark.parametrize("value", ["X-Forwarded-For", "forwarded", "X-Real-IP", "cf connecting ip", "a:b"])
def test_the_setting_refuses_forgeable_headers_and_invalid_names(value):
    with pytest.raises(ValidationError):
        make_settings(client_ip_header=value)


# --- the request limit and the assistant quota use the same rule --------------------------------

def test_each_address_written_by_the_proxy_has_its_own_request_limit(make_client):
    client = make_client(rate_limit_per_minute=1, client_ip_header=HEADER)

    def get(address: str, forged: str = "198.51.100.1") -> int:
        headers = {HEADER: address, "X-Forwarded-For": forged}
        return client.get("/api/v1/programs/ranking", headers=headers).status_code

    assert get("203.0.113.7") == 200
    assert get("203.0.113.8") == 200  # another visitor behind the same proxy
    assert get("203.0.113.7", forged="198.51.100.99") == 429  # a new forged entry gives no new limit


def test_the_assistant_quota_counts_the_same_visitor(make_client):
    provider = ScriptedProvider("gemini", [text_reply("Resposta.") for _ in range(3)])
    client = make_client(providers=[provider], assistant_per_minute=1, client_ip_header=HEADER)

    def ask(address: str) -> int:
        return client.post(
            "/api/v1/assistant/ask", json={"question": "Qual o total de 2025?"}, headers={HEADER: address}
        ).status_code

    assert ask("203.0.113.7") == 200
    assert ask("203.0.113.8") == 200
    assert ask("203.0.113.7") == 429
