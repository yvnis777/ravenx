import logging
from unittest.mock import MagicMock, patch

import pytest

from services.copy_service import _order_error
from tests.services.test_copy_service_multi import _mk_state

REJECTED = {"status": "ok", "response": {"type": "order",
            "data": {"statuses": [{"error": "Order has invalid size."}]}}}
RESTING = {"status": "ok", "response": {"type": "order",
           "data": {"statuses": [{"resting": {"oid": 1}}]}}}
FILLED = {"status": "ok", "response": {"type": "order",
          "data": {"statuses": [{"filled": {"totalSz": "1", "avgPx": "100", "oid": 2}}]}}}


@pytest.mark.parametrize("result,expected", [
    (RESTING, None),
    (FILLED, None),
    (REJECTED, "Order has invalid size."),
    ({"status": "err", "response": "User or API Wallet 0x… does not exist."},
     "User or API Wallet 0x… does not exist."),
    (None, "no response from Hyperliquid"),
])
def test_order_error(result, expected):
    assert _order_error(result) == expected


@pytest.fixture
def env(app):
    from services import copy_service
    info = MagicMock()
    copy_service._info = info
    exchange = MagicMock()
    with patch("services.copy_service.get_exchange", MagicMock(return_value=exchange)):
        yield app, info, exchange


def _sub(app):
    from extensions import db
    from models.user import ParentWallet
    from models.subscription import Subscription
    parent = "0x" + "a" * 40
    db.session.add(ParentWallet(address=parent))
    sub = Subscription(parent_address=parent, agent_address="0x" + "b" * 40,
                       agent_private_key="0x" + "1" * 64, target_address="0x" + "d" * 40,
                       scaling_pct=100, is_active=True)
    db.session.add(sub)
    db.session.commit()
    return sub


def test_rejected_order_does_not_record_a_position(env, caplog):
    app, info, exchange = env
    exchange.market_open.return_value = REJECTED
    from services.copy_service import execute_copy, _intended_position
    with app.app_context():
        sub = _sub(app)
        info.user_state.side_effect = [_mk_state({"BTC": {"szi": 2.0, "entry": 100.0}}, 200),
                                       _mk_state({}, 200)]
        with caplog.at_level(logging.INFO, logger="services.copy_service"):
            execute_copy(sub.id, sub.parent_address, sub.agent_private_key,
                         sub.target_address, 100.0, {"price_tolerance_pct": -1})
        assert _intended_position(sub.id, "BTC") == (0.0, 0.0)
    assert "rejected" in caplog.text and "Order has invalid size." in caplog.text


def test_unfavorable_skip_is_logged_with_reason(env, caplog):
    app, info, exchange = env
    from services.copy_service import execute_copy
    # Target long 2 BTC entered at 90 while BTC trades at 100 (positionValue
    # 200 / 2): the entry-invariant limit sits below market, so no order.
    target_state = {
        "marginSummary": {"accountValue": "200"},
        "assetPositions": [{"position": {"coin": "BTC", "szi": "2.0",
                                         "entryPx": "90", "positionValue": "200"}}],
    }
    with app.app_context():
        sub = _sub(app)
        info.user_state.side_effect = [target_state, _mk_state({}, 200)]
        with caplog.at_level(logging.INFO, logger="services.copy_service"):
            execute_copy(sub.id, sub.parent_address, sub.agent_private_key,
                         sub.target_address, 100.0, {})
    exchange.order.assert_not_called()
    assert "decision=skip_unfavorable" in caplog.text


def test_rejected_drawdown_close_keeps_the_position(env, caplog):
    app, info, exchange = env
    exchange.market_close.return_value = REJECTED
    from extensions import db
    from models.position import TrackedPosition
    from services.copy_service import execute_copy, _intended_position
    with app.app_context():
        sub = _sub(app)
        sub.peak_equity = 1000.0  # equity now 200 → 80% drawdown
        db.session.add(TrackedPosition(subscription_id=sub.id, coin="BTC", szi=1.0, entry_px=100.0))
        db.session.commit()
        info.user_state.side_effect = [_mk_state({"BTC": {"szi": 2.0, "entry": 100.0}}, 200),
                                       _mk_state({"BTC": {"szi": 1.0, "entry": 100.0}}, 200)]
        with caplog.at_level(logging.INFO, logger="services.copy_service"):
            execute_copy(sub.id, sub.parent_address, sub.agent_private_key,
                         sub.target_address, 100.0, {"max_drawdown_pct": 10})
        assert _intended_position(sub.id, "BTC") == (1.0, 100.0)
    assert "decision=drawdown_close rejected" in caplog.text
