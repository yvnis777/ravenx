"""
Core copy-trading algorithm — V2 (delta-based multi-copy reconciliation).

Each subscription owns an "intended share" of each coin on the parent's
HL account. The HL account's actual position is the sum of all subs'
intended shares (plus any positions the parent holds outside any sub,
which we don't touch). Orders are sized to this sub's deltas only —
they never close more than this sub's share.

Entry-price invariant (the RavenX edge), per sub:
  - Opening / adding to a LONG: only execute if market price <= target's entry
  - Opening / adding to a SHORT: only execute if market price >= target's entry
  This preserves the guarantee at the per-sub level.

Closing / reducing / reversing:
  Always executed immediately as market orders, sized to this sub's share.

Every order is immediate-or-cancel, and the intended share records what HL
reports as filled — never what was asked for. Whatever didn't fill is retried
on the target's next fill.
"""
import logging
import math
import secrets
import threading
import time

from extensions import db
from services import agent_service
from services.agent_service import get_exchange

logger = logging.getLogger(__name__)
from hyperliquid.info import Info
from hyperliquid.utils.types import Cloid

# Built lazily: the Info constructor hits the HL API, so creating it at import
# time makes this module unimportable whenever HL is down or rate-limiting us.
_info = None


def _get_info() -> Info:
    global _info
    if _info is None:
        _info = agent_service.make_info()
    return _info

from services.notification_service import (
    notify_copy_executed, notify_order_skipped,
    notify_stop_loss, notify_max_drawdown,
)

# Per-subscription locks: prevents double-execution when rapid fills arrive
_sub_locks: dict[int, threading.Lock] = {}
_sub_locks_mutex = threading.Lock()


def _builder() -> dict | None:
    """RavenX's builder fee for this order, or None when fees are disabled.

    HL rejects the order if the user hasn't approved at least this rate, so
    routes/copy.py verifies the approval before a subscription is created.
    """
    from flask import current_app
    addr = current_app.config.get("BUILDER_ADDRESS")
    if not addr:
        return None
    return {"b": addr, "f": int(current_app.config.get("BUILDER_FEE_TENTHS_BPS", 0))}


def _order_error(result) -> str | None:
    """HL's error text for an order/close response, or None if it was accepted."""
    if not isinstance(result, dict):
        return "no response from Hyperliquid"
    if result.get("status") != "ok":
        return str(result.get("response") or result)
    statuses = (((result.get("response") or {}).get("data") or {}).get("statuses")) or []
    for s in statuses:
        if isinstance(s, dict) and "error" in s:
            return str(s["error"])
    return None


def _filled(result) -> tuple[float, float]:
    """(size filled, average fill price) from an accepted order response.

    An IOC order that only partly matched reports the partial size; the rest
    was cancelled by HL.
    """
    statuses = (((result.get("response") or {}).get("data") or {}).get("statuses")) or []
    sz = notional = 0.0
    for s in statuses:
        f = s.get("filled") if isinstance(s, dict) else None
        if f:
            fsz = float(f["totalSz"])
            sz += fsz
            notional += fsz * float(f["avgPx"])
    return sz, (notional / sz if sz else 0.0)


def _place(sub_id: int, parent_address: str, coin: str, decision: str, call, *args, **kwargs):
    """Send one order and log the outcome.

    Returns (filled_size, avg_price) when HL accepted the order — the size can
    be less than requested — or None when HL rejected it.
    """
    result = call(*args, **kwargs)
    err = _order_error(result)
    if err:
        logger.error("sub=%d coin=%s decision=%s rejected: %s", sub_id, coin, decision, err)
        try:
            notify_order_skipped(parent_address, coin, f"Hyperliquid rejected the order: {err}")
        except Exception:
            pass
        return None
    sz, avg_px = _filled(result)
    logger.info("sub=%d coin=%s decision=%s accepted: filled=%s avg_px=%s",
                sub_id, coin, decision, sz, avg_px)
    return sz, avg_px


def _after_close(coin: str, my_szi: float, closed_sz: float) -> float:
    """This sub's share left after a reduce-only close filled `closed_sz`."""
    left = _round_sz(coin, abs(my_szi) - min(closed_sz, abs(my_szi)))
    return left if my_szi > 0 else -left


def _after_add(my_szi: float, my_entry: float, is_long: bool,
               sz: float, px: float) -> tuple[float, float]:
    """(share, average entry) after adding a fill of `sz` at `px` on the same side."""
    total = abs(my_szi) + sz
    entry = (abs(my_szi) * my_entry + sz * px) / total
    return (total if is_long else -total), entry


def _sz_decimals(coin: str) -> int:
    meta, _ = agent_service._get_metas()
    for asset in meta["universe"]:
        if asset["name"] == coin:
            return int(asset["szDecimals"])
    raise KeyError(f"unknown coin {coin!r}")


def _round_sz(coin: str, sz: float) -> float:
    """Round toward zero to the coin's lot size — never order more than intended."""
    factor = 10 ** _sz_decimals(coin)
    return math.trunc(sz * factor + 1e-9 * (1 if sz >= 0 else -1)) / factor


def _round_px(coin: str, px: float, is_long: bool) -> float:
    """Round to HL's tick: <= 5 significant figures and <= 6 - szDecimals decimals.

    Longs round down and shorts round up, so rounding can only improve the
    follower's entry relative to the target's — the RavenX invariant.
    Integer prices are always valid regardless of significant figures.
    """
    if px <= 0:
        return px
    sig_decimals = 5 - 1 - math.floor(math.log10(px))
    decimals = max(0, min(6 - _sz_decimals(coin), sig_decimals))
    factor = 10 ** decimals
    scaled = px * factor
    rounded = math.floor(scaled + 1e-9) if is_long else math.ceil(scaled - 1e-9)
    return rounded / factor if decimals else float(rounded)


def _get_sub_lock(sub_id: int) -> threading.Lock:
    with _sub_locks_mutex:
        if sub_id not in _sub_locks:
            _sub_locks[sub_id] = threading.Lock()
        return _sub_locks[sub_id]


def release_sub_lock(sub_id: int):
    with _sub_locks_mutex:
        _sub_locks.pop(sub_id, None)


def _cloid_for_sub(sub_id: int) -> Cloid:
    """Build a per-sub Cloid: first 4 bytes = sub_id, last 12 bytes = random.

    The cloid is a 32-byte hex (0x + 64 hex chars). Tagging the sub_id in the
    leading 4 bytes lets us cancel only this sub's open orders without touching
    other subs' GTC orders on the same coin/parent.
    """
    prefix = f"{sub_id:08x}"  # 8 hex chars = 4 bytes
    suffix = secrets.token_hex(12)  # 24 hex chars = 12 bytes
    return Cloid.from_str("0x" + prefix + suffix)


def _cloid_belongs_to_sub(cloid_hex, sub_id: int) -> bool:
    """Check if a hex cloid (with or without 0x prefix) was issued for this sub."""
    if cloid_hex is None:
        return False
    s = str(cloid_hex).lower()
    if s.startswith("0x"):
        s = s[2:]
    expected_prefix = f"{sub_id:08x}"
    return s.startswith(expected_prefix)


def _cancel_open_orders(exchange, account_address: str, coin: str, sub_id: int):
    """Cancel only THIS sub's open limit orders for `coin` on the parent HL account.

    Filters by cloid prefix so other subs' GTC orders on the same parent/coin
    are left untouched.
    """
    try:
        open_orders = _get_info().open_orders(account_address)
        to_cancel = [
            o for o in open_orders
            if o.get("coin") == coin
            and _cloid_belongs_to_sub(o.get("cloid"), sub_id)
        ]
        if not to_cancel:
            return
        from hyperliquid.utils.signing import CancelRequest
        reqs = [CancelRequest(coin=o["coin"], oid=o["oid"]) for o in to_cancel]
        exchange.bulk_cancel(reqs)
        logger.info("Cancelled %d open order(s) for sub=%d on %s coin=%s",
                    len(reqs), sub_id, account_address, coin)
    except Exception as e:
        logger.warning("Failed to cancel open orders for sub=%d %s %s: %s",
                       sub_id, account_address, coin, e)


# HL account modes where spot and perps share one USDC balance. For these the
# perps state's accountValue is only the collateral held for open positions
# (a target with $607k read as $200k on 2026-10-21, tripling copy sizes), and
# the real equity is the USDC total in the spot state, uPnL included.
SHARED_COLLATERAL_MODES = {"unifiedAccount", "portfolioMargin"}
_MODE_TTL_SECONDS = 600
_modes: dict[str, tuple[str, float]] = {}


def _abstraction(address: str) -> str:
    """The account's balance mode (userAbstraction), cached for a few minutes."""
    hit = _modes.get(address)
    if hit and time.time() - hit[1] < _MODE_TTL_SECONDS:
        return hit[0]
    mode = _get_info().post("/info", {"type": "userAbstraction", "user": address})
    if not isinstance(mode, str):
        raise ValueError(f"unexpected userAbstraction response {mode!r}")
    _modes[address] = (mode, time.time())
    return mode


def _equity(address: str, perps_state: dict) -> float:
    """What backs this account's perps: shared USDC, or the perps balance."""
    if _abstraction(address) in SHARED_COLLATERAL_MODES:
        spot = _get_info().spot_user_state(address)
        return sum(float(b["total"]) for b in spot.get("balances", []) if b["coin"] == "USDC")
    return float(perps_state["marginSummary"]["accountValue"])


def _get_state(address: str) -> tuple[dict, float]:
    state = _get_info().user_state(address)
    account_value = _equity(address, state)
    positions = {}
    for p in state["assetPositions"]:
        pos = p["position"]
        szi = float(pos["szi"])
        if szi == 0:
            continue
        coin = pos["coin"]
        entry_px = float(pos["entryPx"]) if pos.get("entryPx") else 0.0
        coin_price = float(pos["positionValue"]) / abs(szi)
        positions[coin] = {"szi": szi, "entry_px": entry_px, "coin_price": coin_price}
    return positions, account_value


def _intended_position(sub_id: int, coin: str) -> tuple[float, float]:
    """Return (intended_szi, entry_px) for this sub on this coin (0,0 if none)."""
    from models.position import TrackedPosition
    p = TrackedPosition.query.filter_by(subscription_id=sub_id, coin=coin).first()
    if not p:
        return 0.0, 0.0
    return float(p.szi or 0.0), float(p.entry_px or 0.0)


def _upsert_position(sub_id: int, coin: str, szi: float, entry_px: float):
    from models.position import TrackedPosition
    pos = TrackedPosition.query.filter_by(subscription_id=sub_id, coin=coin).first()
    if szi == 0.0:
        if pos:
            db.session.delete(pos)
    else:
        if not pos:
            pos = TrackedPosition(subscription_id=sub_id, coin=coin)
            db.session.add(pos)
        pos.szi = szi
        pos.entry_px = entry_px
    db.session.commit()


def execute_copy(
    sub_id: int,
    parent_address: str,
    agent_pkey: str,
    target_address: str,
    scaling_pct: float,
    risk_params: dict,
):
    lock = _get_sub_lock(sub_id)
    if not lock.acquire(blocking=False):
        return
    try:
        _execute_copy_locked(sub_id, parent_address, agent_pkey,
                             target_address, scaling_pct, risk_params)
    finally:
        lock.release()


def _execute_copy_locked(
    sub_id: int,
    parent_address: str,
    agent_pkey: str,
    target_address: str,
    scaling_pct: float,
    risk_params: dict,
):
    from flask import current_app
    from models.subscription import Subscription

    logger.info("execute_copy: sub=%d parent=%s target=%s",
                sub_id, parent_address, target_address)
    exchange = get_exchange(parent_address, agent_pkey)
    min_usd = risk_params.get("min_position_usd",
                              current_app.config["MIN_POSITION_SIZE_USD"])
    max_usd = risk_params.get("max_position_usd")
    stop_loss_pct = risk_params.get("stop_loss_pct")
    max_drawdown_pct = risk_params.get("max_drawdown_pct")
    price_tolerance_pct = risk_params.get("price_tolerance_pct", 0.5)

    target_pos, target_equity = _get_state(target_address)
    parent_pos, parent_equity = _get_state(parent_address)

    if target_equity <= 0:
        logger.warning("execute_copy: target_equity <= 0, skipping")
        return
    if parent_equity <= 0:
        logger.warning("execute_copy: parent has no equity")
        return

    # Per-sub max drawdown — closes only THIS sub's positions
    if max_drawdown_pct and parent_equity > 0:
        sub = db.session.execute(
            db.select(Subscription).where(Subscription.id == sub_id).with_for_update()
        ).scalar_one_or_none()
        if sub:
            if sub.peak_equity is None or parent_equity > sub.peak_equity:
                sub.peak_equity = parent_equity
                db.session.commit()
            elif sub.peak_equity > 0:
                drawdown = (sub.peak_equity - parent_equity) / sub.peak_equity * 100
                if drawdown >= abs(max_drawdown_pct):
                    _close_all_for_sub(sub_id, parent_address, exchange, parent_pos)
                    sub.is_active = False
                    db.session.commit()
                    try:
                        notify_max_drawdown(parent_address, drawdown)
                    except Exception:
                        pass
                    logger.info("Sub %d stopped: drawdown %.1f%%", sub_id, drawdown)
                    return

    # "New only" copies: positions the target already held when the copy
    # started are never opened. A coin leaves this list once the target closes
    # or flips it — what it opens after that is new.
    sub_row = db.session.get(Subscription, sub_id)
    held_at_start = dict((sub_row.held_at_start if sub_row else None) or {})

    # Iterate over target's coins ∪ this sub's tracked coins ∪ held coins (so
    # one the target has closed gets released)
    from models.position import TrackedPosition
    tracked_coins = {p.coin for p in TrackedPosition.query.filter_by(subscription_id=sub_id).all()}
    all_coins = set(target_pos) | tracked_coins | set(held_at_start)

    for coin in all_coins:
        try:
            _sz_decimals(coin)
        except KeyError:
            logger.warning("sub=%d coin=%s skip: not in HL perp universe", sub_id, coin)
            continue
        t = target_pos.get(coin, {"szi": 0.0, "entry_px": 0.0, "coin_price": 0.0})
        target_szi = t["szi"]
        target_entry = t["entry_px"]

        # Per-sub intended share — NOT the parent's actual HL position
        my_szi, my_entry = _intended_position(sub_id, coin)

        if coin in held_at_start:
            if target_szi * held_at_start[coin] > 0:
                if my_szi == 0:
                    logger.info("sub=%d coin=%s decision=skip_held_at_start", sub_id, coin)
                    continue
            else:
                held_at_start.pop(coin)
                sub_row.held_at_start = dict(held_at_start)
                db.session.commit()

        parent_coin_info = parent_pos.get(coin, {})
        price = parent_coin_info.get("coin_price") or t["coin_price"]
        if price <= 0:
            logger.info("sub=%d coin=%s decision=skip_no_price", sub_id, coin)
            continue

        # Per-sub stop-loss — closes only this sub's share
        if stop_loss_pct and my_szi != 0 and my_entry > 0:
            if my_szi > 0:
                pnl_pct = (price - my_entry) / my_entry
            else:
                pnl_pct = (my_entry - price) / my_entry
            if pnl_pct < -(abs(stop_loss_pct) / 100):
                _cancel_open_orders(exchange, parent_address, coin, sub_id)
                fill = _place(sub_id, parent_address, coin, "stop_loss",
                              exchange.market_close, coin, sz=abs(my_szi),
                              cloid=_cloid_for_sub(sub_id), builder=_builder())
                if fill:
                    left = _after_close(coin, my_szi, fill[0])
                    _upsert_position(sub_id, coin, left, my_entry if left else 0.0)
                    try:
                        notify_stop_loss(parent_address, coin, pnl_pct * 100)
                    except Exception:
                        pass
                continue

        # Ideal share for THIS sub
        ideal_szi = _round_sz(
            coin, parent_equity * (target_szi / target_equity) * (scaling_pct / 100)
        )

        if max_usd and abs(ideal_szi) * price > max_usd:
            ideal_szi = _round_sz(coin, (max_usd / price) * (1 if ideal_szi > 0 else -1))

        delta = _round_sz(coin, ideal_szi - my_szi)
        logger.info("sub=%d coin=%s target_szi=%s my_szi=%s ideal=%s delta=%s price=%s",
                    sub_id, coin, target_szi, my_szi, ideal_szi, delta, price)

        # Case 1: target closed — close this sub's share
        if ideal_szi == 0.0 and my_szi != 0.0:
            _cancel_open_orders(exchange, parent_address, coin, sub_id)
            fill = _place(sub_id, parent_address, coin, "close",
                          exchange.market_close, coin, sz=abs(my_szi),
                          cloid=_cloid_for_sub(sub_id), builder=_builder())
            if fill:
                left = _after_close(coin, my_szi, fill[0])
                _upsert_position(sub_id, coin, left, my_entry if left else 0.0)
                try:
                    notify_copy_executed(parent_address, coin, "close", fill[0], fill[1] or price)
                except Exception:
                    pass
            continue

        # Case 2: direction flip
        if ideal_szi != 0.0 and my_szi != 0.0 and (ideal_szi > 0) != (my_szi > 0):
            _cancel_open_orders(exchange, parent_address, coin, sub_id)
            fill = _place(sub_id, parent_address, coin, "flip_close",
                          exchange.market_close, coin, sz=abs(my_szi),
                          cloid=_cloid_for_sub(sub_id), builder=_builder())
            if not fill:
                continue
            left = _after_close(coin, my_szi, fill[0])
            if left:
                # Only part of the old side closed: keep it, finish next fill.
                _upsert_position(sub_id, coin, left, my_entry)
                continue
            new_is_long = ideal_szi > 0
            fill = _place(sub_id, parent_address, coin, "flip_open",
                          exchange.market_open, coin, new_is_long, abs(ideal_szi),
                          cloid=_cloid_for_sub(sub_id), builder=_builder())
            if not fill or not fill[0]:
                # The close went through; record the flat position it left.
                _upsert_position(sub_id, coin, 0.0, 0.0)
                continue
            new_szi, new_entry = _after_add(0.0, 0.0, new_is_long, fill[0], fill[1])
            _upsert_position(sub_id, coin, new_szi, new_entry)
            try:
                side = "long" if new_is_long else "short"
                notify_copy_executed(parent_address, coin, f"flip to {side}", fill[0], fill[1])
            except Exception:
                pass
            continue

        is_long = ideal_szi > 0

        # min_usd guard
        if abs(delta) * price < min_usd:
            # Logged only: every fill re-checks every coin, so a notification
            # here repeats on each fill (25,000 a day for one copy, 2026-10).
            logger.info("sub=%d coin=%s decision=skip_below_min value=%.2f min_usd=%.2f",
                        sub_id, coin, abs(delta) * price, min_usd)
            continue

        # Case 3: reducing this sub's share
        if abs(ideal_szi) < abs(my_szi):
            surplus = _round_sz(coin, abs(my_szi) - abs(ideal_szi))
            _cancel_open_orders(exchange, parent_address, coin, sub_id)
            fill = _place(sub_id, parent_address, coin, "reduce",
                          exchange.market_close, coin, sz=surplus,
                          cloid=_cloid_for_sub(sub_id), builder=_builder())
            if fill:
                left = _after_close(coin, my_szi, fill[0])
                _upsert_position(sub_id, coin, left, my_entry if left else 0.0)
                try:
                    notify_copy_executed(parent_address, coin, "reduce", fill[0], fill[1] or price)
                except Exception:
                    pass
            continue

        # Case 4: increasing — entry-price gating
        amount = _round_sz(coin, abs(delta))
        if amount == 0:
            logger.info("sub=%d coin=%s decision=skip_zero_lot", sub_id, coin)
            continue

        if price_tolerance_pct == -1 or target_entry <= 0:
            fill = _place(sub_id, parent_address, coin, "market_open",
                          exchange.market_open, coin, is_long, amount,
                          cloid=_cloid_for_sub(sub_id), builder=_builder())
        else:
            lmt_px = (target_entry * (abs(my_szi) + amount) - abs(my_szi) * my_entry) / amount

            if price_tolerance_pct > 0:
                tol = price_tolerance_pct / 100
                lmt_px = lmt_px * (1 + tol) if is_long else lmt_px * (1 - tol)

            lmt_px = _round_px(coin, lmt_px, is_long)

            favorable = (is_long and price <= lmt_px) or (not is_long and price >= lmt_px)
            if not favorable:
                logger.info("sub=%d coin=%s decision=skip_unfavorable price=%.6g limit=%.6g "
                            "target_entry=%.6g", sub_id, coin, price, lmt_px, target_entry)
                continue

            # IOC at the invariant price: fills only at lmt_px or better, and
            # whatever can't fill now is cancelled rather than left resting.
            _cancel_open_orders(exchange, parent_address, coin, sub_id)
            fill = _place(
                sub_id, parent_address, coin, "limit_ioc",
                exchange.order, coin, is_long, amount, lmt_px, {"limit": {"tif": "Ioc"}},
                cloid=_cloid_for_sub(sub_id), builder=_builder(),
            )

        if not fill or not fill[0]:
            continue
        new_szi, new_entry = _after_add(my_szi, my_entry, is_long, fill[0], fill[1])
        _upsert_position(sub_id, coin, new_szi, new_entry)
        try:
            side = "buy" if is_long else "sell"
            notify_copy_executed(parent_address, coin, side, fill[0], fill[1])
        except Exception:
            pass


def _close_all_for_sub(sub_id: int, parent_address: str, exchange, parent_pos: dict):
    """Close every coin tracked by this sub, sized to its share. Used for max-drawdown."""
    from models.position import TrackedPosition
    tracked = TrackedPosition.query.filter_by(subscription_id=sub_id).all()
    for tp in tracked:
        try:
            if tp.szi == 0:
                continue
            _cancel_open_orders(exchange, parent_address, tp.coin, sub_id)
            fill = _place(sub_id, parent_address, tp.coin, "drawdown_close",
                          exchange.market_close, tp.coin, sz=abs(tp.szi),
                          cloid=_cloid_for_sub(sub_id), builder=_builder())
            if fill:
                left = _after_close(tp.coin, tp.szi, fill[0])
                _upsert_position(sub_id, tp.coin, left, tp.entry_px if left else 0.0)
        except Exception as e:
            logger.error("max-drawdown close failed for sub=%d coin=%s: %s",
                         sub_id, tp.coin, e)
