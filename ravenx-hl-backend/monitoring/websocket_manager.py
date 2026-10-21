"""
WebSocket daemon that maintains a persistent connection to Hyperliquid,
dynamically subscribes/unsubscribes to target wallets, and feeds fill
events to the copy engine.

Runs in a dedicated daemon thread with its own asyncio event loop.
The Flask main thread communicates with it via run_coroutine_threadsafe().
"""
import asyncio
import json
import logging
import random
import threading
import time

import websockets

import hl_env

logger = logging.getLogger(__name__)

URI = hl_env.WS_URL
RECONNECT_BASE = 2
RECONNECT_MAX = 30
# HL closes a connection that hasn't *sent* anything for 60s — protocol-level
# WS pings don't count — so we send its own {"method": "ping"} well inside that.
APP_PING_SECONDS = 50


class WebSocketManager:
    _instance: "WebSocketManager | None" = None
    _lock = threading.Lock()

    def __init__(self):
        self._subscribed: set[str] = set()
        self._ws = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._app = None
        self._queue: asyncio.Queue | None = None
        # Last processed fill timestamp (ms) per target wallet.
        # Used to filter reconnect snapshots: only process fills newer than this.
        self._last_fill_ts: dict[str, int] = {}
        # Startup time in ms — fills older than this are considered historical
        self._startup_ts_ms: int = int(time.time() * 1000)

    # ------------------------------------------------------------------
    # Public interface (called from Flask thread)
    # ------------------------------------------------------------------

    @classmethod
    def get_instance(cls) -> "WebSocketManager":
        with cls._lock:
            if not cls._instance:
                cls._instance = WebSocketManager()
            return cls._instance

    def start_in_background(self, app):
        self._app = app
        self._thread = threading.Thread(target=self._run, daemon=True, name="ws-manager")
        self._thread.start()

    def subscribe(self, wallet: str):
        """Thread-safe: subscribe to a target wallet's events."""
        wallet = wallet.lower()
        if self._loop and wallet not in self._subscribed:
            asyncio.run_coroutine_threadsafe(self._subscribe_one(wallet), self._loop)

    def unsubscribe(self, wallet: str):
        """Thread-safe: unsubscribe from a target wallet's events."""
        wallet = wallet.lower()
        if self._loop:
            asyncio.run_coroutine_threadsafe(self._unsubscribe_one(wallet), self._loop)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _run(self):
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        self._queue = asyncio.Queue()
        with self._app.app_context():
            self._loop.run_until_complete(self._main())

    async def _subscribe_one(self, wallet: str):
        if self._ws and not self._ws.closed and wallet not in self._subscribed:
            await self._ws.send(json.dumps({
                "method": "subscribe",
                "subscription": {"type": "userFills", "user": wallet},
            }))
            self._subscribed.add(wallet)
            logger.info("Subscribed to %s", wallet)

    async def _unsubscribe_one(self, wallet: str):
        if self._ws and not self._ws.closed and wallet in self._subscribed:
            await self._ws.send(json.dumps({
                "method": "unsubscribe",
                "subscription": {"type": "userFills", "user": wallet},
            }))
            self._subscribed.discard(wallet)
            logger.info("Unsubscribed from %s", wallet)

    async def _load_active_targets(self) -> list[str]:
        from extensions import db
        from models.subscription import Subscription
        try:
            db.session.rollback()
            subs = Subscription.query.filter_by(is_active=True).all()
            return list({s.target_address.lower() for s in subs})
        except Exception as e:
            logger.error("Failed to load active targets: %s", e)
            db.session.rollback()
            return []

    async def _reader(self, ws):
        async for raw in ws:
            await self._queue.put(raw)

    async def _keepalive(self, ws):
        while True:
            await asyncio.sleep(APP_PING_SECONDS)
            await ws.send(json.dumps({"method": "ping"}))

    async def _processor(self):
        from monitoring.copy_engine import handle_fill
        while True:
            raw = await self._queue.get()
            try:
                data = json.loads(raw)
                channel = data.get("channel")

                if channel == "subscriptionResponse":
                    logger.info("WS subscription confirmed: %s", data.get("data"))
                    continue

                if channel not in ("userFills", "user"):
                    continue

                event_data = data.get("data", {})

                if channel == "userFills":
                    # userFills: {"user": "0x...", "isSnapshot": bool, "fills": [...]}
                    if not isinstance(event_data, dict):
                        continue
                    user = event_data.get("user", "")
                    fills = event_data.get("fills", [])

                    if event_data.get("isSnapshot"):
                        # On reconnect, the snapshot contains recent fills — some may have
                        # happened while we were disconnected. Only process fills newer than
                        # the last one we already handled for this wallet.
                        cutoff = self._last_fill_ts.get(user, self._startup_ts_ms)
                        new_fills = [f for f in fills if int(f.get("time", 0)) > cutoff]
                        if not new_fills:
                            logger.info("Skipping snapshot for %s — no new fills (cutoff=%d)", user, cutoff)
                            continue
                        # Only trigger one execute_copy per reconnect snapshot (most recent fill).
                        # execute_copy does full position reconciliation, so one call is enough.
                        fills = [max(new_fills, key=lambda f: int(f.get("time", 0)))]
                        logger.info("Reconnect catch-up for %s: %d new fill(s) in snapshot, processing latest",
                                    user, len(new_fills))
                else:
                    # "user" channel (userEvents): no user field — skip
                    continue

                if not fills:
                    continue

                logger.info("Fill event for %s: %d fill(s)", user, len(fills))
                for fill in fills:
                    # Track the latest processed fill timestamp
                    fill_ts = int(fill.get("time", 0))
                    if fill_ts > self._last_fill_ts.get(user, 0):
                        self._last_fill_ts[user] = fill_ts
                    # Blocking SDK calls run in thread pool to avoid stalling the loop
                    await asyncio.to_thread(handle_fill, user, fill, self._app)

            except Exception as e:
                logger.error("Processor error: %s", e)
                try:
                    from extensions import db
                    db.session.rollback()
                except Exception:
                    pass
            finally:
                self._queue.task_done()

    async def _main(self):
        backoff = RECONNECT_BASE
        asyncio.create_task(self._processor())

        while True:
            # Don't maintain an idle WS connection — HL closes them after ~60s.
            # Sleep and re-check until there are active subscriptions to monitor.
            targets = await self._load_active_targets()
            if not targets:
                await asyncio.sleep(10)
                continue

            try:
                async with websockets.connect(
                    URI, ping_interval=30, ping_timeout=20, close_timeout=5
                ) as ws:
                    self._ws = ws
                    backoff = RECONNECT_BASE
                    logger.info("Connected to Hyperliquid (%d target(s))", len(targets))

                    for wallet in targets:
                        await self._subscribe_one(wallet)

                    keepalive = asyncio.create_task(self._keepalive(ws))
                    try:
                        await self._reader(ws)
                    finally:
                        keepalive.cancel()

            except (websockets.ConnectionClosed, ConnectionError) as e:
                logger.warning("Disconnected: %s", e)
            except Exception as e:
                logger.error("Unexpected error: %s", e)
            finally:
                self._subscribed.clear()
                self._ws = None

            wait = min(backoff, RECONNECT_MAX) + random.uniform(0, 1)
            logger.info("Reconnecting in %.1fs...", wait)
            await asyncio.sleep(wait)
            backoff = min(backoff * 2, RECONNECT_MAX)
