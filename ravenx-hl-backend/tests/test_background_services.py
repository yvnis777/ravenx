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


@pytest.fixture(autouse=True)
def lock_path(tmp_path, monkeypatch):
    """Each test gets its own engine lock, and no process-wide lock carries over."""
    import app as app_module
    monkeypatch.setattr(app_module, "_engine_lock_fd", None)
    return str(tmp_path / "engine.lock")


def _start(enable_leaderboard, lock_path):
    from app import _start_services_when_lock_free
    app = SimpleNamespace(config={"ENABLE_LEADERBOARD": enable_leaderboard,
                                  "COPY_ENGINE_LOCK_FILE": lock_path})
    _start_services_when_lock_free(app, poll_seconds=0.01, wait_in_background=False)


def test_leaderboard_off_starts_only_copy_monitoring(started, lock_path):
    _start(False, lock_path)
    assert started == ["copy_ws"]


def test_leaderboard_on_starts_discovery_pipeline(started, lock_path):
    _start(True, lock_path)
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


# ── One copy engine per host ─────────────────────────────────────────────────
# Two engines would copy every fill twice — double positions on users' real accounts.

def _hold(lock_path):
    """Take the lock the way a second backend process would."""
    import fcntl
    fd = open(lock_path, "w")
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    return fd


def test_engine_does_not_start_while_another_process_holds_the_lock(started, lock_path):
    from app import _try_engine_lock
    other = _hold(lock_path)
    try:
        assert _try_engine_lock(lock_path) is False
    finally:
        other.close()


def test_engine_starts_once_the_other_process_releases_the_lock(started, lock_path, monkeypatch):
    """Graceful reload: the new worker waits for the old one, then takes over."""
    import app as app_module
    other = _hold(lock_path)
    waits = []

    def old_worker_exits_while_we_wait(seconds):
        waits.append(seconds)
        other.close()

    monkeypatch.setattr(app_module.time, "sleep", old_worker_exits_while_we_wait)
    app = SimpleNamespace(config={"ENABLE_LEADERBOARD": False, "COPY_ENGINE_LOCK_FILE": lock_path})
    app_module._start_services_when_lock_free(app, poll_seconds=0.02, wait_in_background=False)
    assert waits == [0.02]  # nothing started until the lock came free
    assert started == ["copy_ws"]


def test_same_process_may_start_again(started, lock_path):
    """create_app() runs more than once per process in tests and CLI scripts."""
    from app import _try_engine_lock
    assert _try_engine_lock(lock_path) is True
    assert _try_engine_lock(lock_path) is True
