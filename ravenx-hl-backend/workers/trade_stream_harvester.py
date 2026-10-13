"""
Trade stream harvester — collects wallet addresses from the Hyperliquid
live trades WebSocket feed.

Subscribes to the `trades` channel for every perpetual market simultaneously.
Every trade contains both user addresses. Running continuously, this
accumulates tens of thousands of wallets within hours.

Architecture:
  - One persistent asyncio event loop in a daemon thread
  - All coin subscriptions share a single WebSocket connection (HL multiplexes)
  - Addresses are batched in memory and flushed to DB every FLUSH_INTERVAL seconds
  - On disconnect, reconnects with exponential backoff
"""
import asyncio
import json
import logging
import threading
import time
from datetime import datetime

import requests
import websockets

import hl_env

logger = logging.getLogger(__name__)

HL_WS_URL = hl_env.WS_URL
HL_INFO_URL = hl_env.INFO_URL
FLUSH_INTERVAL = 10      # flush address batch to DB every 10 seconds
RECONNECT_DELAY = 5      # initial reconnect wait (doubles on each failure)
MAX_RECONNECT_DELAY = 120


def _fetch_coins() -> list[str]:
    try:
        r = requests.post(HL_INFO_URL, json={"type": "meta"}, timeout=15)
        r.raise_for_status()
        return [m["name"] for m in r.json().get("universe", [])]
    except Exception as e:
        logger.warning(f"[stream] Could not fetch coin list: {e}")
        return []


def _flush_addresses(app, pending: set[str]) -> int:
    """Write pending addresses to DB, returns count of new inserts."""
    if not pending:
        return 0
    with app.app_context():
        from extensions import db
        from models.discovered_wallet import DiscoveredWallet

        new_count = 0
        for addr in pending:
            wallet = db.session.get(DiscoveredWallet, addr)
            if wallet:
                wallet.touch()
            else:
                db.session.add(DiscoveredWallet(address=addr))
                new_count += 1
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            logger.error(f"[stream] Flush failed: {e}")
            return 0
        return new_count


async def _stream(app):
    coins = _fetch_coins()
    if not coins:
        logger.warning("[stream] No coins — cannot start stream")
        return

    pending: set[str] = set()
    last_flush = time.time()
    total_seen = 0

    subscriptions = [
        {"method": "subscribe", "subscription": {"type": "trades", "coin": coin}}
        for coin in coins
    ]

    async with websockets.connect(
        HL_WS_URL,
        ping_interval=20,
        ping_timeout=30,
        max_size=2**20,
    ) as ws:
        logger.info(f"[stream] Connected — subscribing to {len(coins)} coins")

        # Send all subscriptions
        for sub in subscriptions:
            await ws.send(json.dumps(sub))

        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            # Trade messages: {"channel": "trades", "data": [...]}
            data = msg.get("data")
            if not isinstance(data, list):
                continue

            for trade in data:
                for addr in trade.get("users", []):
                    if addr:
                        pending.add(addr.lower())

            # Flush to DB on interval
            if time.time() - last_flush >= FLUSH_INTERVAL:
                new = _flush_addresses(app, pending)
                total_seen += len(pending)
                logger.info(
                    f"[stream] Flushed {len(pending)} addresses "
                    f"({new} new) — {total_seen} total seen this session"
                )
                pending.clear()
                last_flush = time.time()


async def _run_forever(app):
    delay = RECONNECT_DELAY
    while True:
        try:
            await _stream(app)
            # Clean exit (e.g. no coins) — backoff instead of rapid retry
            logger.info("[stream] Stream ended cleanly — retrying in %ds", delay)
            await asyncio.sleep(delay)
            delay = min(delay * 2, MAX_RECONNECT_DELAY)
        except Exception as e:
            logger.warning(f"[stream] Disconnected: {e} — reconnecting in {delay}s")
            await asyncio.sleep(delay)
            delay = min(delay * 2, MAX_RECONNECT_DELAY)


def start_trade_stream(app):
    """Start the trade stream in a persistent daemon thread."""
    def _run():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_run_forever(app))

    t = threading.Thread(target=_run, daemon=True, name="trade-stream-harvester")
    t.start()
    logger.info("[stream] Trade stream harvester started")
    return t
