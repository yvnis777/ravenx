import importlib

import pytest


def _reload(monkeypatch, value):
    # Set (never delete): hl_env calls load_dotenv(), which would re-inject a
    # deleted HL_ENV from the developer's .env. Empty string means "default".
    monkeypatch.setenv("HL_ENV", "" if value is None else value)
    import hl_env
    return importlib.reload(hl_env)


@pytest.fixture(autouse=True)
def _restore_hl_env():
    yield
    import hl_env
    importlib.reload(hl_env)


def test_defaults_to_mainnet(monkeypatch):
    m = _reload(monkeypatch, None)
    assert m.HL_ENV == "mainnet" and m.IS_MAINNET is True
    assert m.API_URL == "https://api.hyperliquid.xyz"
    assert m.INFO_URL == "https://api.hyperliquid.xyz/info"
    assert m.WS_URL == "wss://api.hyperliquid.xyz/ws"


def test_testnet_urls(monkeypatch):
    m = _reload(monkeypatch, "Testnet ")
    assert m.HL_ENV == "testnet" and m.IS_MAINNET is False
    assert m.API_URL == "https://api.hyperliquid-testnet.xyz"
    assert m.INFO_URL == "https://api.hyperliquid-testnet.xyz/info"
    assert m.WS_URL == "wss://api.hyperliquid-testnet.xyz/ws"


@pytest.mark.parametrize("bad", ["test", "prod", "main", "1"])
def test_unknown_value_fails_loudly(bad):
    import hl_env
    with pytest.raises(ValueError, match="HL_ENV"):
        hl_env.resolve(bad)


def test_empty_string_means_default():
    import hl_env
    assert hl_env.resolve("") == "mainnet"


def test_health_reports_network(app):
    import hl_env
    resp = app.test_client().get("/health")
    assert resp.get_json() == {"status": "ok", "hl_env": hl_env.HL_ENV}


def test_no_hardcoded_mainnet_urls_outside_hl_env():
    import pathlib
    root = pathlib.Path(__file__).resolve().parent.parent
    offenders = [
        str(p.relative_to(root))
        for p in root.rglob("*.py")
        if "venv" not in p.parts and p.name != "hl_env.py" and "tests" not in p.parts
        and ("api.hyperliquid.xyz" in p.read_text() or "MAINNET_API_URL" in p.read_text())
    ]
    assert offenders == []
