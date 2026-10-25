"""
Skipped orders are logged, not notified: every fill re-checks every coin, so a
notification per skip repeats on each fill. Also checks that every order a copy
sends carries its cloid, so each fill on HL traces back to its copy.
"""
from unittest.mock import MagicMock, patch

import pytest

from tests.services.test_copy_service_multi import _mk_state, echo_fills

PARENT = "0x" + "a" * 40
TARGET = "0x" + "d" * 40
PKEY = "0x" + "1" * 64


@pytest.fixture
def env(app):
    from services import copy_service
    info = MagicMock()
    copy_service._info = info
    exchange = MagicMock()
    echo_fills(exchange)
    with patch("services.copy_service.get_exchange", MagicMock(return_value=exchange)):
        yield app, info, exchange


def _sub(szi=None, entry=100.0):
    from extensions import db
    from models.user import ParentWallet
    from models.subscription import Subscription
    from models.position import TrackedPosition
    db.session.add(ParentWallet(address=PARENT))
    sub = Subscription(parent_address=PARENT, agent_address="0x" + "b" * 40,
                       target_address=TARGET, scaling_pct=100, is_active=True)
    db.session.add(sub)
    db.session.commit()
    if szi:
        db.session.add(TrackedPosition(subscription_id=sub.id, coin="ETH", szi=szi, entry_px=entry))
        db.session.commit()
    return sub


def _run(info, sub, target_eth, risk_params, parent_equity=50, parent_eth=0.0):
    """Target holds `target_eth` ETH of a $10,000 account; the follower has $50.
    Once the target is flat, the price comes from the follower's own position."""
    from services.copy_service import execute_copy
    target = {"ETH": target_eth} if target_eth else {}
    parent = {"ETH": parent_eth} if parent_eth else {}
    info.user_state.side_effect = [_mk_state(target, 10_000), _mk_state(parent, parent_equity)]
    execute_copy(sub.id, PARENT, PKEY, TARGET, 100.0, risk_params)


def _notifications():
    from models.notification import Notification
    return Notification.query.all()


def _cloid_prefix(call):
    return call.kwargs["cloid"].to_raw()[2:10]


# ── skips are logged, not notified ───────────────────────────────────────


def test_order_below_minimum_sends_no_notification(env):
    app, info, exchange = env
    with app.app_context():
        sub = _sub()
        _run(info, sub, 1.0, {"price_tolerance_pct": -1})  # ideal $0.50
        assert _notifications() == []
    exchange.market_open.assert_not_called()


def test_unfavorable_price_sends_no_notification(env):
    app, info, exchange = env
    with app.app_context():
        sub = _sub()
        # The target bought ETH at $80; it trades at $100 now
        from services.copy_service import execute_copy
        info.user_state.side_effect = [
            {"marginSummary": {"accountValue": "10000"}, "assetPositions": [{"position": {
                "coin": "ETH", "szi": "1000", "entryPx": "80", "positionValue": "100000"}}]},
            _mk_state({}, 1000),
        ]
        execute_copy(sub.id, PARENT, PKEY, TARGET, 100.0, {})
        assert _notifications() == []
    exchange.order.assert_not_called()


# ── every order carries the copy's cloid ─────────────────────────────────


def test_market_open_and_close_carry_the_subs_cloid(env):
    app, info, exchange = env
    with app.app_context():
        sub = _sub()
        _run(info, sub, 1.0, {"price_tolerance_pct": -1}, parent_equity=10_000)  # buys 1 ETH
        _run(info, sub, 0.0, {"price_tolerance_pct": -1}, parent_equity=10_000,
             parent_eth=1.0)  # closes it
        sub_id = sub.id
    assert _cloid_prefix(exchange.market_open.call_args) == f"{sub_id:08x}"
    assert _cloid_prefix(exchange.market_close.call_args) == f"{sub_id:08x}"
