"""
Trader service: metric computation and leaderboard queries.
"""
import time as _time
from datetime import datetime

from extensions import db
from models.trader import Trader


def compute_metrics(fills: list) -> dict:
    """Derives win rate, PnL breakdown, and period stats from a wallet's fill history."""
    total_pnl = long_pnl = short_pnl = 0.0
    wins = losses = 0

    now_ms = _time.time() * 1000
    cutoffs = {
        "1d": now_ms - 1 * 24 * 3600 * 1000,
        "7d": now_ms - 7 * 24 * 3600 * 1000,
        "30d": now_ms - 30 * 24 * 3600 * 1000,
        "90d": now_ms - 90 * 24 * 3600 * 1000,
    }
    period_pnl = {"1d": 0.0, "7d": 0.0, "30d": 0.0, "90d": 0.0}
    period_wins = {"1d": 0, "7d": 0, "30d": 0, "90d": 0}
    period_losses = {"1d": 0, "7d": 0, "30d": 0, "90d": 0}

    for fill in fills:
        pnl = float(fill.get("closedPnl", 0))
        total_pnl += pnl
        if pnl > 0:
            wins += 1
        elif pnl < 0:
            losses += 1
        dir_str = fill.get("dir", "")
        if "Long" in dir_str:
            long_pnl += pnl
        elif "Short" in dir_str:
            short_pnl += pnl
        else:
            if fill.get("side") == "A":
                long_pnl += pnl
            else:
                short_pnl += pnl

        fill_time = fill.get("time", 0)
        for period, cutoff in cutoffs.items():
            if fill_time >= cutoff:
                period_pnl[period] += pnl
                if pnl > 0:
                    period_wins[period] += 1
                elif pnl < 0:
                    period_losses[period] += 1

    total = wins + losses
    result = {
        "pnl": total_pnl,
        "win_rate": wins / total if total > 0 else 0.0,
        "long_pnl": long_pnl,
        "short_pnl": short_pnl,
        "trade_count": total,
        "win_count": wins,
        "loss_count": losses,
    }

    for period in ("1d", "7d", "30d", "90d"):
        w = period_wins[period]
        l = period_losses[period]
        t = w + l
        result[f"pnl_{period}"] = period_pnl[period]
        result[f"trades_{period}"] = t
        result[f"win_rate_{period}"] = w / t if t > 0 else 0.0

    return result


def upsert_trader(data: dict, skip_none: bool = False):
    address = data["address"].lower()
    trader = db.session.get(Trader, address)
    if not trader:
        trader = Trader(address=address)
        db.session.add(trader)

    for key, value in data.items():
        if key != "address" and hasattr(trader, key):
            if skip_none and value is None:
                continue
            setattr(trader, key, value)

    trader.last_updated = datetime.utcnow()
    db.session.commit()


def get_traders(
    sort_by: str = "pnl",
    order: str = "desc",
    page: int = 1,
    per_page: int = 20,
    filters: dict | None = None,
    search: str | None = None,
):
    query = Trader.query

    if search:
        query = query.filter(Trader.address.ilike(f"%{search}%"))

    if filters:
        if filters.get("min_pnl") is not None:
            query = query.filter(Trader.pnl >= filters["min_pnl"])
        if filters.get("max_pnl") is not None:
            query = query.filter(Trader.pnl <= filters["max_pnl"])
        if filters.get("min_win_rate") is not None:
            query = query.filter(Trader.win_rate >= filters["min_win_rate"])
        if filters.get("max_win_rate") is not None:
            query = query.filter(Trader.win_rate <= filters["max_win_rate"])
        if filters.get("min_trades") is not None:
            query = query.filter(Trader.trade_count >= filters["min_trades"])
        if filters.get("max_trades") is not None:
            query = query.filter(Trader.trade_count <= filters["max_trades"])
        if filters.get("min_equity") is not None:
            query = query.filter(Trader.perp_equity >= filters["min_equity"])
        if filters.get("max_equity") is not None:
            query = query.filter(Trader.perp_equity <= filters["max_equity"])

    col = getattr(Trader, sort_by, Trader.pnl)
    if order == "desc":
        query = query.order_by(col.desc().nulls_last())
    else:
        query = query.order_by(col.asc().nulls_last())

    return query.paginate(page=page, per_page=per_page, error_out=False)
