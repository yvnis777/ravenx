"""
Wallet harvester: discovers active Hyperliquid wallets by polling
recentTrades for every perpetual market using concurrent requests.

Each coin returns the last 10 trades, each trade contains both user
addresses. Across 229+ markets this yields thousands of unique addresses
per sweep.

Designed to run every 2 minutes with 8 concurrent threads.
"""
import logging
from concurrent.futures import ThreadPoolExecutor

import requests
from flask import Flask

import hl_env

logger = logging.getLogger(__name__)

HL_INFO_URL = hl_env.INFO_URL
_TIMEOUT = 10
_WORKERS = 3  # reduced from 8 to avoid flooding HL rate limit


def _fetch_coin_list() -> list[str]:
    try:
        r = requests.post(HL_INFO_URL, json={"type": "meta"}, timeout=_TIMEOUT)
        r.raise_for_status()
        return [m["name"] for m in r.json().get("universe", [])]
    except Exception as e:
        logger.warning("Could not fetch coin list: %s", e)
        return []


def _fetch_recent_traders(coin: str) -> list[str]:
    """Returns user addresses from the last 10 trades for this coin."""
    try:
        r = requests.post(
            HL_INFO_URL,
            json={"type": "recentTrades", "coin": coin},
            timeout=_TIMEOUT,
        )
        if r.status_code == 429:
            return []
        r.raise_for_status()
        addresses = []
        for trade in r.json():
            addresses.extend(trade.get("users", []))
        return [a.lower() for a in addresses if a]
    except Exception:
        return []


def harvest_wallets(app: Flask):
    """
    One full sweep: query recentTrades for every coin concurrently,
    collect addresses, upsert into discovered_wallets.
    """
    with app.app_context():
        from extensions import db
        from models.discovered_wallet import DiscoveredWallet

        coins = _fetch_coin_list()
        if not coins:
            logger.info("No coins — skipping sweep")
            return

        # Fetch all coins concurrently
        all_addresses: set[str] = set()
        with ThreadPoolExecutor(max_workers=_WORKERS) as pool:
            results = pool.map(_fetch_recent_traders, coins)
            for addrs in results:
                all_addresses.update(addrs)

        if not all_addresses:
            logger.info("No addresses found this sweep")
            return

        # Bulk check which addresses already exist
        existing = set(
            row[0] for row in
            db.session.query(DiscoveredWallet.address)
            .filter(DiscoveredWallet.address.in_(all_addresses))
            .all()
        )

        # Touch existing, insert new
        new_count = 0
        for addr in all_addresses:
            if addr in existing:
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
            logger.error("DB commit failed: %s", e)
            return

        total = db.session.query(DiscoveredWallet).count()
        logger.info("Sweep complete — %d seen, %d new, %d total in DB", len(all_addresses), new_count, total)
