"""
Trader enrichment scanner — high-throughput version.

Two-phase pipeline:
  Phase 1 (fast, every 5 min): Concurrent user_state calls → immediately
      upserts traders with equity + positions + uPnL. No fills needed.
      This gets wallets onto the leaderboard fast.

  Phase 2 (slow, runs continuously in background): Picks traders that
      have never had fills computed and fetches user_fills_by_time.
      Updates PnL, win rate, etc. one by one with rate-limit backoff.
"""
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta

import requests as _requests
from flask import Flask

import hl_env

logger = logging.getLogger(__name__)

BATCH_SIZE = 5000              # wallets screened per fast-scan cycle
ENRICH_INTERVAL_HOURS = 4     # re-screen a wallet at most once per 4 hours
MIN_EQUITY_USD = 10.0          # capture more traders
LOOKBACK_DAYS = 30
CONCURRENT_WORKERS = 4         # parallel API calls for phase 1 (reduced from 8 to avoid 429 storm)
FILLS_BATCH_SIZE = 200         # wallets to deep-enrich per cycle
_RATE_LIMIT_BACKOFF = 8.0      # seconds to wait after rate limiting
_CHUNK_DELAY = 1.0             # seconds between chunks to spread API load
_FILLS_DELAY = 0.35            # delay between fills requests (heavy endpoint)

# Live refresh config
LIVE_REFRESH_INTERVAL_MINUTES = 5
LIVE_REFRESH_BATCH = 50

HL_INFO_URL = hl_env.INFO_URL


def _compute_upnl(state: dict) -> float:
    """Sum unrealizedPnl from all open positions."""
    return sum(
        float(p.get("position", {}).get("unrealizedPnl", 0))
        for p in state.get("assetPositions", [])
    )


def _extract_positions(state: dict) -> list[dict]:
    """Extract open positions for live uPnL computation."""
    return [
        {
            "coin": p.get("position", {}).get("coin", ""),
            "szi": float(p.get("position", {}).get("szi", 0)),
            "entry_px": float(p.get("position", {}).get("entryPx", 0)),
            "upnl": float(p.get("position", {}).get("unrealizedPnl", 0)),
        }
        for p in state.get("assetPositions", [])
        if float(p.get("position", {}).get("szi", 0)) != 0
    ]


def _fetch_user_state(address: str) -> dict | None:
    """Fetch user state via REST (thread-safe)."""
    try:
        r = _requests.post(
            HL_INFO_URL,
            json={"type": "clearinghouseState", "user": address},
            timeout=10,
        )
        if r.status_code == 429:
            return {"_rate_limited": True}
        r.raise_for_status()
        return r.json()
    except Exception as e:
        return {"_error": str(e)}


def _fetch_user_fills(address: str, lookback_ms: int) -> list | None:
    """Fetch user fills via REST."""
    try:
        r = _requests.post(
            HL_INFO_URL,
            json={
                "type": "userFillsByTime",
                "user": address,
                "startTime": lookback_ms,
            },
            timeout=15,
        )
        if r.status_code == 429:
            return None
        r.raise_for_status()
        return r.json()
    except Exception:
        try:
            r = _requests.post(
                HL_INFO_URL,
                json={"type": "userFills", "user": address},
                timeout=15,
            )
            if r.status_code == 429:
                return None
            r.raise_for_status()
            return [f for f in r.json() if f.get("time", 0) >= lookback_ms]
        except Exception:
            return None


def scan_and_rank_traders(app: Flask):
    """Phase 1: Fast scan — gets wallets onto the leaderboard using only user_state.

    Uses a chunked approach: submits small batches to avoid overwhelming HL rate limits.
    Commits to DB every chunk so progress is visible immediately.
    """
    with app.app_context():
        from extensions import db
        from models.discovered_wallet import DiscoveredWallet
        from models.trader import Trader
        from monitoring.price_feed import PriceFeed

        cutoff = datetime.utcnow() - timedelta(hours=ENRICH_INTERVAL_HOURS)

        # Never-enriched wallets first, then stale
        never_enriched = (
            db.session.query(DiscoveredWallet)
            .filter(DiscoveredWallet.enriched_at.is_(None))
            .order_by(DiscoveredWallet.sighting_count.desc())
            .limit(BATCH_SIZE)
            .all()
        )

        stale_budget = BATCH_SIZE - len(never_enriched)
        stale = []
        if stale_budget > 0:
            stale = (
                db.session.query(DiscoveredWallet)
                .filter(
                    DiscoveredWallet.enriched_at.isnot(None),
                    DiscoveredWallet.enriched_at < cutoff,
                )
                .order_by(DiscoveredWallet.sighting_count.desc())
                .limit(stale_budget)
                .all()
            )

        batch = never_enriched + stale
        if not batch:
            logger.info("Nothing to scan — run the harvester first")
            return

        logger.info("Fast scan: %d wallets to screen", len(batch))

        feed = PriceFeed.get_instance()
        total_added = total_updated = total_skipped = 0
        total_rate_limited = 0
        chunk_size = 50  # Process 50 wallets at a time

        for i in range(0, len(batch), chunk_size):
            chunk = batch[i:i + chunk_size]
            addr_to_dw = {dw.address: dw for dw in chunk}
            rate_limited = 0

            with ThreadPoolExecutor(max_workers=CONCURRENT_WORKERS) as pool:
                futures = {pool.submit(_fetch_user_state, dw.address): dw.address for dw in chunk}
                for future in as_completed(futures):
                    address = futures[future]
                    state = future.result()
                    if not state or state.get("_error"):
                        continue
                    if state.get("_rate_limited"):
                        rate_limited += 1
                        total_rate_limited += 1
                        continue

                    margin = state.get("marginSummary", {})
                    equity = float(margin.get("accountValue", 0))

                    if equity < MIN_EQUITY_USD:
                        total_skipped += 1
                        continue

                    upnl = _compute_upnl(state)
                    positions = _extract_positions(state)

                    dw = addr_to_dw[address]
                    trader = db.session.get(Trader, address.lower())
                    if not trader:
                        trader = Trader(address=address.lower())
                        db.session.add(trader)
                        total_added += 1
                    else:
                        total_updated += 1

                    trader.perp_equity = equity
                    trader.upnl = upnl
                    trader.open_positions = positions
                    trader.last_updated = datetime.utcnow()

                    feed.update_trader_positions(address, positions, equity)
                    dw.enriched_at = datetime.utcnow()

            # Commit each chunk so progress is immediately visible
            try:
                db.session.commit()
            except Exception as e:
                db.session.rollback()
                logger.error("Chunk commit failed: %s", e)

            # Back off proportionally to rate limiting in this chunk
            if rate_limited >= len(chunk) // 2:
                # More than half the chunk was rate-limited — heavy backoff
                logger.info("Chunk %d/%d: %d/%d rate-limited, backing off %ds",
                            i // chunk_size + 1, len(batch) // chunk_size, rate_limited, len(chunk), int(_RATE_LIMIT_BACKOFF * 2))
                time.sleep(_RATE_LIMIT_BACKOFF * 2)
            elif rate_limited > 0:
                time.sleep(_RATE_LIMIT_BACKOFF)
            else:
                time.sleep(_CHUNK_DELAY)

        total_traders = Trader.query.count()
        processed = total_added + total_updated + total_skipped
        logger.info("Fast scan done — %d new, %d updated, %d low equity, %d rate-limited (%d/%d processed). Total traders: %d",
                     total_added, total_updated, total_skipped, total_rate_limited, processed, len(batch), total_traders)


def deep_enrich_traders(app: Flask):
    """Phase 2: Fetch fills for traders that don't have PnL data yet."""
    with app.app_context():
        from extensions import db
        from models.trader import Trader
        from services.trader_service import compute_metrics

        lookback_ms = int((time.time() - LOOKBACK_DAYS * 24 * 3600) * 1000)

        # Traders with no trade_count (never had fills fetched)
        unenriched = (
            Trader.query
            .filter(Trader.trade_count.is_(None))
            .order_by(Trader.perp_equity.desc())
            .limit(FILLS_BATCH_SIZE)
            .all()
        )

        if not unenriched:
            logger.info("All traders have fills data")
            return

        logger.info("Fetching fills for %d traders...", len(unenriched))
        enriched = rate_limited = errors = 0

        for trader in unenriched:
            fills = _fetch_user_fills(trader.address, lookback_ms)

            if fills is None:
                # Rate limited
                rate_limited += 1
                time.sleep(_RATE_LIMIT_BACKOFF)
                if rate_limited > 5:
                    logger.warning("Too many 429s, stopping")
                    break
                continue

            if not fills:
                # No fills — mark with 0 so we don't retry immediately
                trader.trade_count = 0
                trader.pnl = 0.0
                trader.win_rate = 0.0
                trader.win_count = 0
                trader.loss_count = 0
                trader.long_pnl = 0.0
                trader.short_pnl = 0.0
                trader.tx_count = 0
                trader.growth_rate = 0.0
                enriched += 1
                time.sleep(_FILLS_DELAY)
                continue

            try:
                metrics = compute_metrics(fills)
                equity = trader.perp_equity or 1.0
                growth_rate = metrics["pnl"] / equity if equity > 0 else 0.0

                trader.pnl = metrics["pnl"]
                trader.win_rate = metrics["win_rate"]
                trader.long_pnl = metrics["long_pnl"]
                trader.short_pnl = metrics["short_pnl"]
                trader.trade_count = metrics["trade_count"]
                trader.win_count = metrics["win_count"]
                trader.loss_count = metrics["loss_count"]
                trader.tx_count = len(fills)
                trader.growth_rate = growth_rate
                for period in ("1d", "7d", "30d", "90d"):
                    setattr(trader, f"pnl_{period}", metrics.get(f"pnl_{period}", 0.0))
                    setattr(trader, f"trades_{period}", metrics.get(f"trades_{period}", 0))
                    setattr(trader, f"win_rate_{period}", metrics.get(f"win_rate_{period}", 0.0))
                enriched += 1
            except Exception as e:
                logger.error("Error %s: %s", trader.address, e)
                errors += 1

            time.sleep(_FILLS_DELAY)

        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            logger.error("DB commit failed: %s", e)
            return

        logger.info("Done — %d enriched, %d rate-limited, %d errors", enriched, rate_limited, errors)


def refresh_live_metrics(app: Flask):
    """Fast refresh of equity + uPnL for existing traders using concurrent calls."""
    with app.app_context():
        from extensions import db
        from models.trader import Trader
        from monitoring.price_feed import PriceFeed

        traders = (
            Trader.query
            .order_by(Trader.last_updated.asc())
            .limit(LIVE_REFRESH_BATCH)
            .all()
        )

        if not traders:
            return

        addr_to_trader = {t.address: t for t in traders}
        refreshed = errors = 0

        with ThreadPoolExecutor(max_workers=CONCURRENT_WORKERS) as pool:
            futures = {pool.submit(_fetch_user_state, t.address): t.address for t in traders}
            for future in as_completed(futures):
                address = futures[future]
                state = future.result()
                if not state or state.get("_rate_limited") or state.get("_error"):
                    if state and state.get("_rate_limited"):
                        break
                    errors += 1
                    continue

                trader = addr_to_trader[address]
                margin = state.get("marginSummary", {})
                trader.perp_equity = float(margin.get("accountValue", 0))
                trader.upnl = _compute_upnl(state)
                positions = _extract_positions(state)
                trader.open_positions = positions

                PriceFeed.get_instance().update_trader_positions(
                    trader.address, positions, trader.perp_equity
                )
                trader.last_updated = datetime.utcnow()
                refreshed += 1

        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            logger.error("DB commit failed: %s", e)
            return

        logger.info("Refreshed %d/%d traders, %d errors", refreshed, len(traders), errors)
