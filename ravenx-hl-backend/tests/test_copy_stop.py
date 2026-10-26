"""/copy/stop, with and without closing the copy's positions."""
from unittest.mock import MagicMock, patch

import pytest
from flask_jwt_extended import create_access_token

from extensions import db
from models.agent_wallet import AgentWallet
from models.position import TrackedPosition
from models.subscription import Subscription
from models.user import ParentWallet
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
    with patch("services.copy_service.get_exchange", MagicMock(return_value=exchange)), \
         patch("routes.copy.WebSocketManager"), \
         patch("threading.Thread"):
        yield app, info, exchange


def _sub(shares: dict) -> int:
    db.session.add(ParentWallet(address=PARENT))
    db.session.add(AgentWallet(parent_address=PARENT, agent_address="0x" + "b" * 40,
                               agent_private_key=PKEY))
    sub = Subscription(parent_address=PARENT, target_address=TARGET, is_active=True,
                       scaling_pct=100)
    db.session.add(sub)
    db.session.commit()
    for coin, szi in shares.items():
        db.session.add(TrackedPosition(subscription_id=sub.id, coin=coin, szi=szi, entry_px=100.0))
    db.session.commit()
    return sub.id


def _stop(app, sub_id, **body):
    with app.app_context():
        token = create_access_token(identity=PARENT)
    return app.test_client().post("/copy/stop", json={"subscription_id": sub_id, **body},
                                  headers={"Authorization": f"Bearer {token}"})


def _shares(sub_id):
    return {p.coin: p.szi for p in TrackedPosition.query.filter_by(subscription_id=sub_id)}


def test_stop_and_close_closes_this_copys_share(env):
    app, info, exchange = env
    with app.app_context():
        sub_id = _sub({"ETH": 0.5})
    # The account holds 2 ETH: this copy's 0.5 and someone else's 1.5
    info.user_state.return_value = _mk_state({"ETH": 2.0}, 1_000)

    res = _stop(app, sub_id, close_positions=True)

    assert res.status_code == 200
    assert res.json["closing"] == {"closed": ["ETH"], "failed": []}
    assert exchange.market_close.call_args.kwargs["sz"] == pytest.approx(0.5)
    assert exchange.market_close.call_args.kwargs["cloid"].to_raw()[2:10] == f"{sub_id:08x}"
    with app.app_context():
        assert _shares(sub_id) == {}
        assert db.session.get(Subscription, sub_id).is_active is False


def test_stop_keeps_positions_by_default(env):
    app, info, exchange = env
    with app.app_context():
        sub_id = _sub({"ETH": 0.5})

    res = _stop(app, sub_id)

    assert res.status_code == 200
    assert "closing" not in res.json
    exchange.market_close.assert_not_called()
    with app.app_context():
        assert _shares(sub_id) == {"ETH": 0.5}


def test_a_share_hl_no_longer_holds_is_forgotten(env):
    """Closed by hand on HL: nothing to close, and the SDK can't close it anyway."""
    app, info, exchange = env
    with app.app_context():
        sub_id = _sub({"ETH": 0.5})
    info.user_state.return_value = _mk_state({}, 1_000)

    res = _stop(app, sub_id, close_positions=True)

    assert res.json["closing"] == {"closed": [], "failed": []}
    exchange.market_close.assert_not_called()
    with app.app_context():
        assert _shares(sub_id) == {}


def test_never_closes_a_position_on_the_other_side(env):
    """market_close trades against the account's side: on a net short it would
    buy, cutting someone else's short instead of closing this long."""
    app, info, exchange = env
    with app.app_context():
        sub_id = _sub({"ETH": 0.5})
    info.user_state.return_value = _mk_state({"ETH": -1.0}, 1_000)

    _stop(app, sub_id, close_positions=True)

    exchange.market_close.assert_not_called()


def test_a_close_hl_rejects_is_reported(env):
    app, info, exchange = env
    with app.app_context():
        sub_id = _sub({"ETH": 0.5, "BTC": 0.01})
    info.user_state.return_value = _mk_state({"ETH": 0.5, "BTC": 0.01}, 1_000)
    rejected = {"status": "ok", "response": {"type": "order", "data": {"statuses": [
        {"error": "Insufficient margin"}]}}}
    exchange.market_close.side_effect = lambda coin, sz=None, **k: (
        rejected if coin == "BTC" else
        {"status": "ok", "response": {"type": "order", "data": {"statuses": [
            {"filled": {"totalSz": str(sz), "avgPx": "100", "oid": 1}}]}}})

    res = _stop(app, sub_id, close_positions=True)

    assert res.json["closing"] == {"closed": ["ETH"], "failed": ["BTC"]}
    with app.app_context():
        assert _shares(sub_id) == {"BTC": 0.01}
        from models.notification import Notification
        stopped = Notification.query.filter_by(type="copy_stopped").one()
        assert "Couldn't close BTC" in stopped.message


def test_engine_does_nothing_for_a_stopped_copy(env):
    """A fill read before the stop must not reopen what the stop closed."""
    app, info, exchange = env
    from services.copy_service import execute_copy
    with app.app_context():
        sub_id = _sub({})
        db.session.get(Subscription, sub_id).is_active = False
        db.session.commit()
        info.user_state.side_effect = [_mk_state({"ETH": 10.0}, 1_000), _mk_state({}, 1_000)]
        execute_copy(sub_id, PARENT, PKEY, TARGET, 100.0, {"price_tolerance_pct": -1})
    exchange.market_open.assert_not_called()
    exchange.order.assert_not_called()
