"""Which background services start, depending on ENABLE_LEADERBOARD."""
from types import SimpleNamespace

import pytest


@pytest.fixture
def started(monkeypatch):
    """Replace every background service with a recorder; return what was started."""
    import apscheduler.schedulers.background as aps_bg
    import monitoring.price_feed as price_feed
    import monitoring.websocket_manager as ws_manager
    import threading
    import workers.trade_stream_harvester as trade_stream

    calls = []

    def instance(name):
        return SimpleNamespace(start_in_background=lambda app: calls.append(name))

    monkeypatch.setattr(ws_manager.WebSocketManager, "get_instance", staticmethod(lambda: instance("copy_ws")))
    monkeypatch.setattr(price_feed.PriceFeed, "get_instance", staticmethod(lambda: instance("price_feed")))
    monkeypatch.setattr(trade_stream, "start_trade_stream", lambda app: calls.append("trade_stream"))

    class FakeScheduler:
        def __init__(self, *a, **kw):
            pass

        def add_job(self, id, **kw):
            calls.append(f"job:{id}")

        def start(self):
            calls.append("scheduler")

    class FakeThread:
        def __init__(self, target, **kw):
            pass

        def start(self):
            calls.append("staggered_start")

    monkeypatch.setattr(aps_bg, "BackgroundScheduler", FakeScheduler)
    monkeypatch.setattr(threading, "Thread", FakeThread)
    return calls


def _start(enable_leaderboard):
    from app import _start_background_services
    app = SimpleNamespace(config={"ENABLE_LEADERBOARD": enable_leaderboard})
    _start_background_services(app)


def test_leaderboard_off_starts_only_copy_monitoring(started):
    _start(False)
    assert started == ["copy_ws"]


def test_leaderboard_on_starts_discovery_pipeline(started):
    _start(True)
    assert started[0] == "copy_ws"
    for name in ("price_feed", "trade_stream", "job:wallet_harvester", "job:trader_scanner",
                 "job:deep_enricher", "job:live_refresh", "scheduler", "staggered_start"):
        assert name in started


@pytest.mark.parametrize("raw, expected", [("", False), ("0", False), ("false", False),
                                          ("1", True), ("true", True)])
def test_enable_leaderboard_parsing(monkeypatch, raw, expected):
    import importlib
    import config
    monkeypatch.setenv("ENABLE_LEADERBOARD", raw)
    assert importlib.reload(config).Config.ENABLE_LEADERBOARD is expected
