"""
Notification service — creates in-app notifications for copy trading events.
V2: takes parent_address directly. No child_wallet lookup, no platform field.
"""
import logging
from extensions import db
from models.notification import Notification

logger = logging.getLogger(__name__)


def notify_copy_executed(parent_address: str, coin: str, side: str, size: float, price: float):
    notional = abs(size) * price
    n = Notification(
        parent_address=parent_address,
        type="copy_executed",
        title=f"{side.upper()} {coin}",
        message=f"Executed {side.lower()} {abs(size):.4f} {coin} at ${price:,.2f} (${notional:,.2f})",
    )
    db.session.add(n)
    db.session.commit()


def notify_limit_placed(parent_address: str, coin: str, side: str, size: float, limit_price: float):
    n = Notification(
        parent_address=parent_address,
        type="limit_placed",
        title=f"Limit {side.upper()} {coin}",
        message=f"GTC limit order placed: {side.lower()} {abs(size):.4f} {coin} at ${limit_price:,.2f}. Waiting for price to reach target.",
    )
    db.session.add(n)
    db.session.commit()


def notify_order_skipped(parent_address: str, coin: str, reason: str):
    n = Notification(
        parent_address=parent_address,
        type="order_skipped",
        title=f"Skipped {coin}",
        message=reason,
    )
    db.session.add(n)
    db.session.commit()


def notify_stop_loss(parent_address: str, coin: str, loss_pct: float):
    n = Notification(
        parent_address=parent_address,
        type="stop_loss",
        title=f"Stop Loss {coin}",
        message=f"Position closed — loss of {abs(loss_pct):.1f}% exceeded stop-loss threshold.",
    )
    db.session.add(n)
    db.session.commit()


def notify_max_drawdown(parent_address: str, drawdown_pct: float):
    n = Notification(
        parent_address=parent_address,
        type="max_drawdown",
        title="Max Drawdown Hit",
        message=f"All positions closed and copy-trading stopped — account drawdown of {drawdown_pct:.1f}% exceeded threshold.",
    )
    db.session.add(n)
    db.session.commit()


def notify_copy_started(parent_address: str, target_address: str):
    short_target = f"{target_address[:6]}...{target_address[-4:]}"
    n = Notification(
        parent_address=parent_address,
        type="copy_started",
        title="Copy Trading Started",
        message=f"Now copying {short_target}.",
    )
    db.session.add(n)
    db.session.commit()


def notify_copy_stopped(parent_address: str, target_address: str):
    short_target = f"{target_address[:6]}...{target_address[-4:]}"
    n = Notification(
        parent_address=parent_address,
        type="copy_stopped",
        title="Copy Trading Stopped",
        message=f"Stopped copying {short_target}.",
    )
    db.session.add(n)
    db.session.commit()
