import asyncio
import queue
import threading

from flask import Blueprint, jsonify, request, Response

import hl_env
from models.trader import Trader
from services.trader_service import get_traders

dashboard_bp = Blueprint("dashboard", __name__)

_VALID_SORT = {"pnl", "win_rate", "perp_equity", "trade_count", "growth_rate", "upnl", "pnl_1d", "pnl_7d", "pnl_30d", "pnl_90d"}


@dashboard_bp.route("/traders", methods=["GET"])
def list_traders():
    sort_by = request.args.get("sort_by", "pnl")
    order = request.args.get("order", "desc")
    try:
        page = max(int(request.args.get("page", 1)), 1)
        per_page = min(int(request.args.get("per_page", 20)), 100)
    except (TypeError, ValueError):
        return jsonify({"error": "page and per_page must be integers"}), 400

    if sort_by not in _VALID_SORT:
        return jsonify({"error": f"sort_by must be one of {sorted(_VALID_SORT)}"}), 400

    filters = {}
    for key, cast in [
        ("min_pnl", float),
        ("max_pnl", float),
        ("min_win_rate", float),
        ("max_win_rate", float),
        ("min_trades", int),
        ("max_trades", int),
        ("min_equity", float),
        ("max_equity", float),
    ]:
        if request.args.get(key) is not None:
            try:
                filters[key] = cast(request.args[key])
            except ValueError:
                return jsonify({"error": f"Invalid value for {key}"}), 400

    search = request.args.get("search", "").strip() or None

    pagination = get_traders(
        sort_by=sort_by, order=order, page=page, per_page=per_page,
        filters=filters, search=search,
    )

    return jsonify({
        "traders": [t.to_dict() for t in pagination.items],
        "total": pagination.total,
        "page": pagination.page,
        "pages": pagination.pages,
        "per_page": pagination.per_page,
    })


@dashboard_bp.route("/stats", methods=["GET"])
def get_dashboard_stats():
    """Return wallet cohorts and trending wallets for the dashboard."""
    from extensions import db
    from sqlalchemy import func, case

    # Cohort definitions by perp_equity
    cohorts_config = [
        {"name": "Shrimp", "emoji": "\U0001F990", "min": 100, "max": 1_000},
        {"name": "Fish", "emoji": "\U0001F41F", "min": 1_000, "max": 10_000},
        {"name": "Dolphin", "emoji": "\U0001F42C", "min": 10_000, "max": 100_000},
        {"name": "Shark", "emoji": "\U0001F988", "min": 100_000, "max": 500_000},
        {"name": "Whale", "emoji": "\U0001F433", "min": 500_000, "max": 5_000_000},
        {"name": "Mega Whale", "emoji": "\U0001F30A", "min": 5_000_000, "max": None},
    ]

    cohorts = []
    for c in cohorts_config:
        q = Trader.query.filter(Trader.perp_equity >= c["min"])
        if c["max"]:
            q = q.filter(Trader.perp_equity < c["max"])
        count = q.count()
        stats = db.session.query(
            func.avg(Trader.upnl).label("avg_upnl"),
            func.sum(
                case(
                    (func.json_array_length(Trader.open_positions) > 0, 1),
                    else_=0,
                )
            ).label("in_pos_count"),
        ).filter(Trader.perp_equity >= c["min"])
        if c["max"]:
            stats = stats.filter(Trader.perp_equity < c["max"])
        stats = stats.one()

        avg_upnl = float(stats.avg_upnl or 0)
        in_pos = int(stats.in_pos_count or 0)
        in_pos_pct = round((in_pos / count * 100) if count > 0 else 0, 1)

        if avg_upnl > 1000:
            bias = "Very Bullish"
        elif avg_upnl > 100:
            bias = "Bullish"
        elif avg_upnl > -100:
            bias = "Neutral"
        elif avg_upnl > -1000:
            bias = "Bearish"
        else:
            bias = "Very Bearish"

        cohorts.append({
            "name": c["name"],
            "emoji": c["emoji"],
            "count": count,
            "bias": bias,
            "avg_upnl": round(avg_upnl, 2),
            "in_pos_pct": in_pos_pct,
        })

    # 24h trending — top 6 by absolute uPnL
    trending = (
        Trader.query
        .filter(Trader.upnl != None)
        .order_by(func.abs(Trader.upnl).desc())
        .limit(6)
        .all()
    )

    return jsonify({
        "cohorts": cohorts,
        "trending": [t.to_dict() for t in trending],
    })


@dashboard_bp.route("/cohorts/<cohort_name>", methods=["GET"])
def get_cohort_detail(cohort_name: str):
    """Return detailed data for a wallet cohort."""
    from extensions import db
    from sqlalchemy import func

    cohorts_config = {
        "shrimp":     {"emoji": "\U0001F990", "min": 100, "max": 1_000, "label": "$100 – $1K"},
        "fish":       {"emoji": "\U0001F41F", "min": 1_000, "max": 10_000, "label": "$1K – $10K"},
        "dolphin":    {"emoji": "\U0001F42C", "min": 10_000, "max": 100_000, "label": "$10K – $100K"},
        "shark":      {"emoji": "\U0001F988", "min": 100_000, "max": 500_000, "label": "$100K – $500K"},
        "whale":      {"emoji": "\U0001F433", "min": 500_000, "max": 5_000_000, "label": "$500K – $5M"},
        "mega-whale": {"emoji": "\U0001F30A", "min": 5_000_000, "max": None, "label": "$5M+"},
    }

    cfg = cohorts_config.get(cohort_name.lower())
    if not cfg:
        return jsonify({"error": f"Unknown cohort: {cohort_name}"}), 404

    sort_by = request.args.get("sort_by", "perp_equity")
    order = request.args.get("order", "desc")
    try:
        page = max(int(request.args.get("page", 1)), 1)
        per_page = min(int(request.args.get("per_page", 20)), 100)
    except (TypeError, ValueError):
        return jsonify({"error": "page and per_page must be integers"}), 400

    col = getattr(Trader, sort_by, Trader.perp_equity)
    q = Trader.query.filter(Trader.perp_equity >= cfg["min"])
    if cfg["max"]:
        q = q.filter(Trader.perp_equity < cfg["max"])

    # Aggregate stats
    agg = db.session.query(
        func.count(Trader.address).label("count"),
        func.avg(Trader.upnl).label("avg_upnl"),
        func.sum(Trader.upnl).label("total_upnl"),
        func.avg(Trader.perp_equity).label("avg_equity"),
        func.sum(Trader.perp_equity).label("total_equity"),
        func.avg(Trader.pnl).label("avg_pnl"),
        func.avg(Trader.win_rate).label("avg_win_rate"),
    ).filter(Trader.perp_equity >= cfg["min"])
    if cfg["max"]:
        agg = agg.filter(Trader.perp_equity < cfg["max"])
    agg = agg.one()

    avg_upnl = float(agg.avg_upnl or 0)
    if avg_upnl > 1000:
        bias = "Very Bullish"
    elif avg_upnl > 100:
        bias = "Bullish"
    elif avg_upnl > -100:
        bias = "Neutral"
    elif avg_upnl > -1000:
        bias = "Bearish"
    else:
        bias = "Very Bearish"

    # Top coins by position count
    all_traders = q.all()
    coin_counts: dict[str, int] = {}
    for t in all_traders:
        for pos in (t.open_positions or []):
            coin = pos.get("coin", "")
            if coin:
                coin_counts[coin] = coin_counts.get(coin, 0) + 1
    top_coins = sorted(coin_counts.items(), key=lambda x: x[1], reverse=True)[:10]

    # Paginated wallets
    col = getattr(Trader, sort_by, Trader.perp_equity)
    if order == "desc":
        q2 = q.order_by(col.desc().nulls_last())
    else:
        q2 = q.order_by(col.asc().nulls_last())
    pagination = q2.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        "name": cohort_name,
        "emoji": cfg["emoji"],
        "label": cfg["label"],
        "stats": {
            "count": int(agg.count or 0),
            "bias": bias,
            "avg_upnl": round(avg_upnl, 2),
            "total_upnl": round(float(agg.total_upnl or 0), 2),
            "avg_equity": round(float(agg.avg_equity or 0), 2),
            "total_equity": round(float(agg.total_equity or 0), 2),
            "avg_pnl": round(float(agg.avg_pnl or 0), 2),
            "avg_win_rate": round(float(agg.avg_win_rate or 0), 4),
        },
        "top_coins": [{"coin": c, "count": n} for c, n in top_coins],
        "traders": [t.to_dict() for t in pagination.items],
        "total": pagination.total,
        "page": pagination.page,
        "pages": pagination.pages,
        "per_page": pagination.per_page,
    })


@dashboard_bp.route("/traders/<address>", methods=["GET"])
def get_trader(address: str):
    from extensions import db
    trader = db.session.get(Trader, address.lower())
    if not trader:
        return jsonify({"error": "Trader not found"}), 404
    return jsonify(trader.to_dict())


@dashboard_bp.route("/traders/<address>/pnl-history", methods=["GET"])
def get_pnl_history(address: str):
    """Return cumulative PnL data points for charting.

    Query params:
        period: 1d | 7d | 30d | 90d | all (default: 30d)
    """
    import time as _time
    import requests as _requests
    from datetime import datetime, timedelta

    period = request.args.get("period", "30d")
    period_map = {
        "1d": timedelta(days=1),
        "7d": timedelta(days=7),
        "30d": timedelta(days=30),
        "90d": timedelta(days=90),
    }

    now = datetime.utcnow()
    if period in period_map:
        start_time = int((now - period_map[period]).timestamp() * 1000)
    else:
        start_time = 0  # "all" — from epoch

    addr = address.lower()
    hl_url = hl_env.INFO_URL

    try:
        r = _requests.post(
            hl_url,
            json={
                "type": "userFillsByTime",
                "user": addr,
                "startTime": start_time,
                "aggregateByTime": True,
            },
            timeout=15,
        )
        r.raise_for_status()
        fills = r.json()
    except Exception:
        # Fallback to userFills (last 2000)
        try:
            r = _requests.post(
                hl_url,
                json={"type": "userFills", "user": addr},
                timeout=15,
            )
            r.raise_for_status()
            fills = [f for f in r.json() if f.get("time", 0) >= start_time]
        except Exception as e:
            return jsonify({"error": f"Failed to fetch fills: {e}"}), 502

    # Sort by time ascending
    fills.sort(key=lambda f: f.get("time", 0))

    # Build cumulative PnL series
    cumulative = 0.0
    data_points = []
    for fill in fills:
        pnl = float(fill.get("closedPnl", 0))
        if pnl == 0:
            continue
        cumulative += pnl
        data_points.append({
            "time": fill["time"] // 1000,  # seconds for lightweight-charts
            "value": round(cumulative, 2),
        })

    # Deduplicate by time (keep last value per second)
    if data_points:
        deduped = {}
        for dp in data_points:
            deduped[dp["time"]] = dp["value"]
        data_points = [{"time": t, "value": v} for t, v in sorted(deduped.items())]

    return jsonify({
        "period": period,
        "data": data_points,
        "total_pnl": round(cumulative, 2),
        "fill_count": len(fills),
    })


@dashboard_bp.route("/traders/<address>/fills", methods=["GET"])
def get_fills(address: str):
    """Return recent fills for a trader.

    Query params:
        period: 1d | 7d | 30d | 90d | all (default: 7d)
    """
    import requests as _requests
    from datetime import datetime, timedelta

    period = request.args.get("period", "7d")
    period_map = {
        "1d": timedelta(days=1),
        "7d": timedelta(days=7),
        "30d": timedelta(days=30),
        "90d": timedelta(days=90),
    }

    now = datetime.utcnow()
    if period in period_map:
        start_time = int((now - period_map[period]).timestamp() * 1000)
    else:
        start_time = 0

    addr = address.lower()
    hl_url = hl_env.INFO_URL

    try:
        r = _requests.post(
            hl_url,
            json={
                "type": "userFillsByTime",
                "user": addr,
                "startTime": start_time,
                "aggregateByTime": True,
            },
            timeout=15,
        )
        r.raise_for_status()
        fills = r.json()
    except Exception:
        try:
            r = _requests.post(
                hl_url,
                json={"type": "userFills", "user": addr},
                timeout=15,
            )
            r.raise_for_status()
            fills = [f for f in r.json() if f.get("time", 0) >= start_time]
        except Exception as e:
            return jsonify({"error": f"Failed to fetch fills: {e}"}), 502

    # Sort newest first
    fills.sort(key=lambda f: f.get("time", 0), reverse=True)

    # Shape the response
    result = []
    for f in fills:
        result.append({
            "coin": f.get("coin"),
            "side": f.get("side"),
            "dir": f.get("dir", ""),
            "px": f.get("px"),
            "sz": f.get("sz"),
            "closedPnl": f.get("closedPnl", "0"),
            "time": f.get("time"),
            "fee": f.get("fee", "0"),
            "hash": f.get("hash"),
        })

    return jsonify({"fills": result, "count": len(result)})


@dashboard_bp.route("/traders/stream", methods=["GET"])
def traders_stream():
    """SSE endpoint — streams live uPnL updates to the frontend."""
    from monitoring.price_feed import PriceFeed
    feed = PriceFeed.get_instance()

    # Bridge between asyncio Queue and sync generator using a thread-safe queue
    sync_q: queue.Queue = queue.Queue(maxsize=50)
    async_q = feed.register_sse_queue()

    # Relay from async queue to sync queue in a background thread
    stop = threading.Event()

    def relay():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        async def _relay():
            while not stop.is_set():
                try:
                    payload = await asyncio.wait_for(async_q.get(), timeout=1.0)
                    try:
                        sync_q.put_nowait(payload)
                    except queue.Full:
                        # Drop oldest for slow consumer
                        try:
                            sync_q.get_nowait()
                        except queue.Empty:
                            pass
                        sync_q.put_nowait(payload)
                except asyncio.TimeoutError:
                    continue

        loop.run_until_complete(_relay())

    relay_thread = threading.Thread(target=relay, daemon=True)
    relay_thread.start()

    def generate():
        try:
            while True:
                try:
                    payload = sync_q.get(timeout=15)
                    yield f"data: {payload}\n\n"
                except queue.Empty:
                    # Send keepalive
                    yield ": keepalive\n\n"
        finally:
            stop.set()
            feed.unregister_sse_queue(async_q)

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
