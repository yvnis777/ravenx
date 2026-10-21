"""The intended share records what HL actually filled, never what was asked for."""
from unittest.mock import MagicMock, patch

import pytest

from tests.services.test_copy_service_multi import _fill, _mk_state, echo_fills

PARENT = "0x" + "a" * 40
TARGET = "0x" + "d" * 40
PKEY = "0x" + "1" * 64
NOT_MATCHED = {"status": "ok", "response": {"type": "order", "data": {"statuses": [
    {"error": "Order could not immediately match against any resting orders."}]}}}


@pytest.fixture
def env(app):
    from services import copy_service
    info = MagicMock()
    info.open_orders.return_value = []
    copy_service._info = info
    exchange = MagicMock()
    echo_fills(exchange)
    with patch("services.copy_service.get_exchange", MagicMock(return_value=exchange)):
        yield app, info, exchange


def _sub(held_at_start=None, positions=()):
    from extensions import db
    from models.position import TrackedPosition
    from models.subscription import Subscription
    from models.user import ParentWallet
    db.session.add(ParentWallet(address=PARENT))
    sub = Subscription(parent_address=PARENT, agent_address="0x" + "b" * 40,
                       target_address=TARGET,
                       scaling_pct=100, is_active=True, held_at_start=held_at_start)
    db.session.add(sub)
    db.session.commit()
    for coin, szi, entry in positions:
        db.session.add(TrackedPosition(subscription_id=sub.id, coin=coin, szi=szi, entry_px=entry))
    db.session.commit()
    return sub


def _run(sub, risk_params=None):
    from services.copy_service import execute_copy
    execute_copy(sub.id, PARENT, PKEY, TARGET, 100.0, risk_params or {})


def test_entry_limit_is_ioc_and_records_only_the_partial_fill(env):
    app, info, exchange = env
    # Target long 2 BTC at 100, BTC trading at 100: favorable, wants 2 BTC.
    exchange.order.side_effect = lambda *a, **k: _fill(0.5, 99.0)
    from services.copy_service import _intended_position
    with app.app_context():
        sub = _sub()
        info.user_state.side_effect = [_mk_state({"BTC": {"szi": 2.0, "entry": 100.0}}, 200),
                                       _mk_state({}, 200)]
        _run(sub)
        assert _intended_position(sub.id, "BTC") == pytest.approx((0.5, 99.0))

        # Next fill: only the unfilled remainder is ordered again.
        exchange.order.side_effect = lambda coin, is_buy, sz, *a, **k: _fill(sz, 100.0)
        info.user_state.side_effect = [_mk_state({"BTC": {"szi": 2.0, "entry": 100.0}}, 200),
                                       _mk_state({"BTC": {"szi": 0.5, "entry": 99.0}}, 200)]
        _run(sub)
        assert _intended_position(sub.id, "BTC") == pytest.approx((2.0, 99.75))

    first, second = exchange.order.call_args_list
    assert first.args[2] == pytest.approx(2.0) and first.args[4] == {"limit": {"tif": "Ioc"}}
    assert second.args[2] == pytest.approx(1.5)


def test_unmatched_ioc_records_nothing(env):
    app, info, exchange = env
    exchange.order.side_effect = lambda *a, **k: NOT_MATCHED
    from services.copy_service import _intended_position
    with app.app_context():
        sub = _sub()
        info.user_state.side_effect = [_mk_state({"BTC": {"szi": 2.0, "entry": 100.0}}, 200),
                                       _mk_state({}, 200)]
        _run(sub)
        assert _intended_position(sub.id, "BTC") == (0.0, 0.0)


def test_partial_market_open_records_fill_price(env):
    app, info, exchange = env
    exchange.market_open.side_effect = lambda *a, **k: _fill(1.2, 101.0)
    from services.copy_service import _intended_position
    with app.app_context():
        sub = _sub()
        info.user_state.side_effect = [_mk_state({"BTC": {"szi": -2.0, "entry": 100.0}}, 200),
                                       _mk_state({}, 200)]
        _run(sub, {"price_tolerance_pct": -1})
        assert _intended_position(sub.id, "BTC") == pytest.approx((-1.2, 101.0))


def test_partial_close_keeps_the_unclosed_share(env):
    app, info, exchange = env
    exchange.market_close.side_effect = lambda *a, **k: _fill(0.75)
    from services.copy_service import _intended_position
    with app.app_context():
        sub = _sub(positions=[("BTC", 2.0, 100.0)])
        info.user_state.side_effect = [_mk_state({}, 200),
                                       _mk_state({"BTC": {"szi": 2.0, "entry": 100.0}}, 200)]
        _run(sub)
        assert _intended_position(sub.id, "BTC") == pytest.approx((1.25, 100.0))


def test_partial_flip_close_does_not_open_the_new_side(env):
    app, info, exchange = env
    exchange.market_close.side_effect = lambda *a, **k: _fill(1.0)
    from services.copy_service import _intended_position
    with app.app_context():
        sub = _sub(positions=[("BTC", 2.0, 100.0)])
        info.user_state.side_effect = [_mk_state({"BTC": {"szi": -2.0, "entry": 100.0}}, 200),
                                       _mk_state({"BTC": {"szi": 2.0, "entry": 100.0}}, 200)]
        _run(sub)
        assert _intended_position(sub.id, "BTC") == pytest.approx((1.0, 100.0))
    exchange.market_open.assert_not_called()


def test_full_flip_records_the_new_side(env):
    app, info, exchange = env
    from services.copy_service import _intended_position
    with app.app_context():
        sub = _sub(positions=[("BTC", 2.0, 100.0)])
        info.user_state.side_effect = [_mk_state({"BTC": {"szi": -2.0, "entry": 100.0}}, 200),
                                       _mk_state({"BTC": {"szi": 2.0, "entry": 100.0}}, 200)]
        _run(sub)
        assert _intended_position(sub.id, "BTC") == pytest.approx((-2.0, 100.0))


# ── "New only": positions the target held at start are never opened ──────


def test_held_at_start_coin_is_skipped_but_new_coin_is_copied(env):
    app, info, exchange = env
    from services.copy_service import _intended_position
    with app.app_context():
        sub = _sub(held_at_start={"BTC": 1})
        info.user_state.side_effect = [
            _mk_state({"BTC": {"szi": 2.0, "entry": 100.0}, "ETH": {"szi": 4.0, "entry": 50.0}}, 400),
            _mk_state({}, 400),
        ]
        _run(sub)
        assert _intended_position(sub.id, "BTC") == (0.0, 0.0)
        assert _intended_position(sub.id, "ETH") == pytest.approx((4.0, 100.0))
    assert [c.args[0] for c in exchange.order.call_args_list] == ["ETH"]


def test_held_coin_is_copied_once_target_closes_and_reopens_it(env):
    app, info, exchange = env
    from extensions import db
    from models.subscription import Subscription
    from services.copy_service import _intended_position
    with app.app_context():
        sub = _sub(held_at_start={"BTC": 1})
        # Target closed BTC: it drops off the held list.
        info.user_state.side_effect = [_mk_state({}, 200), _mk_state({}, 200)]
        _run(sub)
        db.session.expire_all()
        assert db.session.get(Subscription, sub.id).held_at_start == {}

        # Target opens BTC again: that's new, so it's copied.
        info.user_state.side_effect = [_mk_state({"BTC": {"szi": 2.0, "entry": 100.0}}, 200),
                                       _mk_state({}, 200)]
        _run(sub)
        assert _intended_position(sub.id, "BTC") == pytest.approx((2.0, 100.0))


def test_held_coin_is_copied_after_target_flips_it(env):
    app, info, exchange = env
    from services.copy_service import _intended_position
    with app.app_context():
        sub = _sub(held_at_start={"BTC": 1})
        info.user_state.side_effect = [_mk_state({"BTC": {"szi": -2.0, "entry": 100.0}}, 200),
                                       _mk_state({}, 200)]
        _run(sub)
        assert _intended_position(sub.id, "BTC") == pytest.approx((-2.0, 100.0))
