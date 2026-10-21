"""HL drops a WS connection that sends nothing for 60s; we ping it ourselves."""
import asyncio
import json

from monitoring import websocket_manager
from monitoring.websocket_manager import WebSocketManager


class FakeWS:
    def __init__(self):
        self.sent = []

    async def send(self, msg):
        self.sent.append(json.loads(msg))


def test_keepalive_sends_hl_pings(monkeypatch):
    monkeypatch.setattr(websocket_manager, "APP_PING_SECONDS", 0.01)
    ws = FakeWS()

    async def run():
        task = asyncio.create_task(WebSocketManager()._keepalive(ws))
        await asyncio.sleep(0.035)
        task.cancel()

    asyncio.run(run())
    assert len(ws.sent) >= 2
    assert all(m == {"method": "ping"} for m in ws.sent)


def test_ping_interval_is_inside_hls_60s_limit():
    assert websocket_manager.APP_PING_SECONDS < 60
