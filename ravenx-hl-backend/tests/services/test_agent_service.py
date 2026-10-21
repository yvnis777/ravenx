import time
import pytest
from unittest.mock import patch

from eth_account import Account

from services import agent_service

# Captured before conftest's autouse fixture swaps it for a fake.
REAL_GET_METAS = agent_service._get_metas


def test_generate_returns_address_and_caches_pkey():
    addr = agent_service.generate_pending_agent("0xparent")
    assert addr.startswith("0x") and len(addr) == 42
    pkey = agent_service.pop_pending_pkey(addr, "0xparent")
    assert pkey.startswith("0x") and len(pkey) == 66


def test_pop_pending_pkey_rejects_wrong_parent():
    addr = agent_service.generate_pending_agent("0xparent_a")
    with pytest.raises(agent_service.PendingAgentNotFound):
        agent_service.pop_pending_pkey(addr, "0xparent_b")


def test_pop_pending_pkey_consumes_entry():
    addr = agent_service.generate_pending_agent("0xparent")
    agent_service.pop_pending_pkey(addr, "0xparent")
    with pytest.raises(agent_service.PendingAgentNotFound):
        agent_service.pop_pending_pkey(addr, "0xparent")


def test_pending_entries_expire(monkeypatch):
    monkeypatch.setattr(agent_service, "_PENDING_TTL_SECONDS", 0)
    addr = agent_service.generate_pending_agent("0xparent")
    time.sleep(0.01)
    with pytest.raises(agent_service.PendingAgentNotFound):
        agent_service.pop_pending_pkey(addr, "0xparent")


# HL's extraAgents returns a bare list (checked against mainnet, 2026-10-20).
def _agents(*addresses):
    return [{"name": f"ravenx-{i}", "address": a, "validUntil": 1800000000000}
            for i, a in enumerate(addresses)]


def test_verify_agent_approved_returns_true_when_in_extra_agents():
    with patch.object(agent_service, "_info_post", return_value=_agents("0xother", "0xAgent")):
        assert agent_service.verify_agent_approved("0xparent", "0xagent") is True


def test_verify_agent_approved_false_when_missing():
    with patch.object(agent_service, "_info_post", return_value=_agents("0xother")):
        assert agent_service.verify_agent_approved("0xparent", "0xagent") is False


def test_verify_agent_approved_false_when_no_agents():
    with patch.object(agent_service, "_info_post", return_value=[]):
        assert agent_service.verify_agent_approved("0xparent", "0xagent") is False


def test_unexpected_extra_agents_shape_reads_as_not_approved():
    with patch.object(agent_service, "_info_post", return_value="oops"):
        assert agent_service.verify_agent_approved("0xparent", "0xagent") is False


def test_get_exchange_signs_with_agent_pkey(monkeypatch):
    # Seed the metadata caches so the Exchange constructor makes no HL calls.
    monkeypatch.setattr(agent_service, "_meta_cache", {"universe": []})
    pkey = "0x" + "1" * 64
    parent = "0x" + "a" * 40
    exchange = agent_service.get_exchange(parent, pkey)
    assert exchange.account_address.lower() == parent.lower()
    assert exchange.wallet.address == Account.from_key(pkey).address


# ── Perps only: the SDK never sees HL's spot tokens ───────────────────────

# Shaped like mainnet's spotMeta on 2026-10-21: a pair whose token index is
# past the end of the token list. SDK 0.22.0 crashed on it with IndexError.
BROKEN_SPOT_META = {
    "universe": [{"name": "@1", "index": 1, "tokens": [1, 0]}],
    "tokens": [{"name": "USDC", "index": 0, "szDecimals": 8}],
}


def test_sdk_022_cannot_parse_mainnets_spot_list():
    """Why we pass NO_SPOT_META: given the real spot list, Info() crashes."""
    from hyperliquid.info import Info
    with pytest.raises(IndexError):
        Info("http://unused", skip_ws=True, meta={"universe": []}, spot_meta=BROKEN_SPOT_META)


def test_metas_never_fetch_spot_metadata(monkeypatch):
    monkeypatch.setattr(agent_service, "_meta_cache", None)
    calls = []
    monkeypatch.setattr(agent_service, "_info_post",
                        lambda payload: calls.append(payload["type"]) or {"universe": []})
    meta, spot = REAL_GET_METAS()
    assert calls == ["meta"]
    assert spot == {"universe": [], "tokens": []}


def test_make_info_builds_a_perps_client_without_calling_hl(monkeypatch):
    from hyperliquid.api import API
    def no_network(*a, **k):
        raise AssertionError("Info() must not call HL")
    monkeypatch.setattr(API, "post", no_network)
    monkeypatch.setattr(agent_service, "_get_metas", lambda: (
        {"universe": [{"name": "BTC", "szDecimals": 5}, {"name": "ETH", "szDecimals": 4}]},
        agent_service.NO_SPOT_META,
    ))
    info = agent_service.make_info()
    assert info.name_to_asset("ETH") == 1
