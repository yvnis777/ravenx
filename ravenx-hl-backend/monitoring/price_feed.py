"""
Live price feed via Hyperliquid allMids WebSocket.

Maintains a single WS connection that receives all mid-market prices.
Recomputes uPnL for every trader with stored positions on each price tick.
Publishes updates to SSE subscribers.
"""
import asyncio
import json
import logging
import threading
import time
from datetime import datetime

import websockets

import hl_env

logger = logging.getLogger(__name__)

HL_WS_URL = hl_env.WS_URL
RECONNECT_BASE = 2
RECONNECT_MAX = 30

# How often to push updates to SSE clients (seconds)
BROADCAST_INTERVAL = 2.0

# How often to refresh positions from the DB (seconds)
POSITION_REFRESH_INTERVAL = 60.0


class PriceFeed:
    """Singleton that holds live mid prices and trader positions."""

    _instance: "PriceFeed | None" = None
    _lock = threading.Lock()

    def __init__(self):
        self._prices: dict[str, float] = {}           # coin -> mid price
        self._positions: dict[str, list[dict]] = {}    # trader_address -> [positions]
        self._trader_equity: dict[str, float] = {}     # trader_address -> perp_equity
        self._upnl_cache: dict[str, float] = {}        # trader_address -> computed uPnL
        self._sse_queues: list[asyncio.Queue] = []
        self._loop: asyncio.AbstractEventLoop | None = None
        self._app = None

    @classmethod
    def get_instance(cls) -> "PriceFeed":
        with cls._lock:
            if not cls._instance:
                cls._instance = PriceFeed()
            return cls._instance

    def start_in_background(self, app):
        self._app = app
        t = threading.Thread(target=self._run, daemon=True, name="price-feed")
        t.start()
        logger.info("Started")

    def get_prices(self) -> dict[str, float]:
        return dict(self._prices)

    def get_upnl(self, address: str) -> float | None:
        return self._upnl_cache.get(address.lower())

    def get_all_upnl(self) -> dict[str, float]:
        return dict(self._upnl_cache)

    def get_equity(self, address: str) -> float | None:
        return self._trader_equity.get(address.lower())

    def register_sse_queue(self) -> asyncio.Queue:
        """Create a new SSE subscriber queue."""
        q: asyncio.Queue = asyncio.Queue(maxsize=50)
        self._sse_queues.append(q)
        return q

    def unregister_sse_queue(self, q: asyncio.Queue):
        try:
            self._sse_queues.remove(q)
        except ValueError:
            pass

    def update_trader_positions(self, address: str, positions: list[dict], equity: float):
        """Called during enrichment to store a trader's open positions."""
        addr = address.lower()
        self._positions[addr] = positions
        self._trader_equity[addr] = equity

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _run(self):
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        self._loop.run_until_complete(self._main())

    async def _main(self):
        # Start the broadcaster and position refresher
        asyncio.create_task(self._broadcaster())
        asyncio.create_task(self._position_refresher())
        # Connect to price feed
        await self._connect_loop()

    async def _connect_loop(self):
        backoff = RECONNECT_BASE
        while True:
            try:
                async with websockets.connect(
                    HL_WS_URL, ping_interval=20, ping_timeout=10
                ) as ws:
                    backoff = RECONNECT_BASE
                    logger.info("Connected to Hyperliquid allMids")

                    await ws.send(json.dumps({
                        "method": "subscribe",
                        "subscription": {"type": "allMids"},
                    }))

                    async for raw in ws:
                        try:
                            msg = json.loads(raw)
                            if msg.get("channel") == "allMids":
                                mids = msg.get("data", {}).get("mids", {})
                                for coin, price_str in mids.items():
                                    try:
                                        self._prices[coin] = float(price_str)
                                    except (ValueError, TypeError):
                                        pass
                                self._recompute_all_upnl()
                        except json.JSONDecodeError:
                            pass

            except (websockets.ConnectionClosed, ConnectionError, OSError) as e:
                logger.warning("Disconnected: %s", e)
            except Exception as e:
                logger.error("Unexpected error: %s", e)

            wait = min(backoff, RECONNECT_MAX)
            logger.info("Reconnecting in %.0fs...", wait)
            await asyncio.sleep(wait)
            backoff = min(backoff * 2, RECONNECT_MAX)

    def _recompute_all_upnl(self):
        """Recompute uPnL for all traders from live prices."""
        for addr, positions in list(self._positions.items()):
            total_upnl = 0.0
            for pos in positions:
                coin = pos.get("coin", "")
                szi = pos.get("szi", 0.0)
                entry_px = pos.get("entry_px", 0.0)
                mid = self._prices.get(coin)
                if mid and szi != 0.0 and entry_px != 0.0:
                    total_upnl += (mid - entry_px) * szi
            self._upnl_cache[addr] = round(total_upnl, 2)

    async def _broadcaster(self):
        """Periodically push updates to all SSE subscribers."""
        while True:
            await asyncio.sleep(BROADCAST_INTERVAL)
            if not self._sse_queues or not self._upnl_cache:
                continue

            # Build a compact update: only traders with non-zero data
            updates = {}
            for addr, upnl in list(self._upnl_cache.items()):
                equity = self._trader_equity.get(addr)
                updates[addr] = {"upnl": upnl}
                if equity is not None:
                    updates[addr]["perp_equity"] = equity

            if not updates:
                continue

            payload = json.dumps({"type": "upnl_update", "data": updates, "ts": time.time()})

            dead = []
            for q in self._sse_queues:
                try:
                    q.put_nowait(payload)
                except asyncio.QueueFull:
                    # Drop old messages for slow consumers
                    try:
                        q.get_nowait()
                        q.put_nowait(payload)
                    except (asyncio.QueueEmpty, asyncio.QueueFull):
                        dead.append(q)

            for q in dead:
                self._sse_queues.remove(q)

    async def _position_refresher(self):
        """Periodically reload all trader positions from the DB."""
        # Wait for initial data
        await asyncio.sleep(5)
        while True:
            try:
                await asyncio.to_thread(self._load_positions_from_db)
            except Exception as e:
                logger.error("Position refresh error: %s", e)
            await asyncio.sleep(POSITION_REFRESH_INTERVAL)

    def _load_positions_from_db(self):
        """Load positions from DB — called in a thread."""
        if not self._app:
            return
        with self._app.app_context():
            from models.trader import Trader
            traders = (
                Trader.query
                .filter(Trader.open_positions.isnot(None))
                .with_entities(Trader.address, Trader.open_positions, Trader.perp_equity)
                .all()
            )
            loaded = 0
            for t in traders:
                if t.open_positions:
                    self._positions[t.address] = t.open_positions
                    self._trader_equity[t.address] = t.perp_equity or 0.0
                    loaded += 1
            logger.info("Loaded positions for %d/%d traders, %d prices available", loaded, len(traders), len(self._prices))
