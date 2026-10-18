"""
Tests focused on the V2 multi-copy reconciliation rules. The HL Exchange and
Info objects are mocked — these tests verify decision-tree branches and
delta arithmetic, not the actual SDK calls.
"""
from unittest.mock import MagicMock, patch

import pytest


# ── helpers ──────────────────────────────────────────────────────────────


def _mk_state(positions: dict, account_value: float):
    """Build a fake user_state response from {coin: {szi, entry}} dict."""
    asset_positions = []
    for coin, info in positions.items():
        szi = info if isinstance(info, (int, float)) else info["szi"]
        entry = info["entry"] if isinstance(info, dict) and "entry" in info else 100.0
        position_value = abs(szi) * entry
        asset_positions.append({
            "position": {
                "coin": coin,
                "szi": str(szi),
                "entryPx": str(entry),
                "positionValue": str(position_value),
            }
        })
    return {
        "marginSummary": {"accountValue": str(account_value)},
        "assetPositions": asset_positions,
    }


def _fill(sz, px=100.0):
    """An HL order response reporting `sz` filled at `px`."""
    return {"status": "ok", "response": {"type": "order", "data": {"statuses": [
        {"filled": {"totalSz": str(sz), "avgPx": str(px), "oid": 1}}]}}}


def echo_fills(exchange, px=100.0):
    """Make every order fill in full at `px`, like a liquid market would."""
    exchange.market_open.side_effect = lambda coin, is_buy, sz, *a, **k: _fill(sz, px)
    exchange.market_close.side_effect = lambda coin, sz=None, *a, **k: _fill(sz, px)
    exchange.order.side_effect = lambda coin, is_buy, sz, *a, **k: _fill(sz, px)


@pytest.fixture
def mock_info():
    """Patches Info inside copy_service to return scripted user_states."""
    from services import copy_service
    info = MagicMock()
    copy_service._info = info
    yield info


@pytest.fixture
def mock_exchange_factory():
    """Returns (factory, exchange_mock). Factory replaces agent_service.get_exchange."""
    exchange = MagicMock()
    echo_fills(exchange)
    exchange.bulk_cancel.return_value = {"status": "ok"}
    factory = MagicMock(return_value=exchange)
    with patch("services.copy_service.get_exchange", factory):
        yield factory, exchange


# ── multi-copy invariants ────────────────────────────────────────────────


def test_increase_uses_only_this_subs_intended_share(app, mock_info, mock_exchange_factory):
    """
    Two subs both copy the same target. Sub A already at 1 BTC (its share);
    a fill on the target should size sub A's order based on its *intended*
    share, not the HL account's actual 1.5 BTC (which includes sub B's 0.5).
    """
    from services.copy_service import execute_copy
    from extensions import db
    from models.user import ParentWallet
    from models.subscription import Subscription
    from models.position import TrackedPosition

    factory, exchange = mock_exchange_factory
    parent = "0x" + "a" * 40
    agent_a = "0x" + "b" * 40
    agent_b = "0x" + "c" * 40
    target = "0x" + "d" * 40

    with app.app_context():
        db.session.add(ParentWallet(address=parent))
        sub_a = Subscription(
            parent_address=parent, agent_address=agent_a,
            agent_private_key="0x" + "1" * 64,
            target_address=target, scaling_pct=100, is_active=True,
        )
        sub_b = Subscription(
            parent_address=parent, agent_address=agent_b,
            agent_private_key="0x" + "2" * 64,
            target_address=target, scaling_pct=50, is_active=True,
        )
        db.session.add_all([sub_a, sub_b])
        db.session.commit()
        db.session.add_all([
            TrackedPosition(subscription_id=sub_a.id, coin="BTC", szi=1.0, entry_px=100.0),
            TrackedPosition(subscription_id=sub_b.id, coin="BTC", szi=0.5, entry_px=100.0),
        ])
        db.session.commit()

        # Target at 2 BTC, target_equity 200. Parent HL: 1.5 BTC, equity 200.
        # For sub_a at 100% scaling: ideal = 200 * (2/200) * 1.0 = 2 BTC.
        # delta vs sub_a's *intended* (1 BTC) = +1 BTC, NOT vs HL actual (1.5).
        mock_info.user_state.side_effect = [
            _mk_state({"BTC": {"szi": 2.0, "entry": 100.0}}, 200),  # target
            _mk_state({"BTC": {"szi": 1.5, "entry": 100.0}}, 200),  # parent HL
        ]

        execute_copy(sub_a.id, parent, "0x" + "1" * 64, target, 100.0,
                     {"price_tolerance_pct": -1})  # market

        from services.copy_service import _intended_position
        assert _intended_position(sub_a.id, "BTC") == pytest.approx((2.0, 100.0))
        assert _intended_position(sub_b.id, "BTC") == pytest.approx((0.5, 100.0))

    exchange.market_open.assert_called_once()
    args, kwargs = exchange.market_open.call_args
    assert args[0] == "BTC"
    assert args[1] is True  # is_long
    assert args[2] == pytest.approx(1.0, rel=1e-3)


def test_close_only_closes_this_subs_share(app, mock_info, mock_exchange_factory):
    """Sub A holds 1 BTC of intended share. Target closes BTC → sub A closes only 1 BTC."""
    from services.copy_service import execute_copy
    from extensions import db
    from models.user import ParentWallet
    from models.subscription import Subscription
    from models.position import TrackedPosition

    factory, exchange = mock_exchange_factory
    parent = "0x" + "a" * 40
    agent_a = "0x" + "b" * 40
    target = "0x" + "d" * 40

    with app.app_context():
        db.session.add(ParentWallet(address=parent))
        sub_a = Subscription(
            parent_address=parent, agent_address=agent_a,
            agent_private_key="0x" + "1" * 64,
            target_address=target, scaling_pct=100, is_active=True,
        )
        db.session.add(sub_a)
        db.session.commit()
        db.session.add(TrackedPosition(
            subscription_id=sub_a.id, coin="BTC", szi=1.0, entry_px=100.0
        ))
        db.session.commit()

        mock_info.user_state.side_effect = [
            _mk_state({}, 200),  # target empty
            _mk_state({"BTC": {"szi": 1.5, "entry": 100.0}}, 200),  # HL still has 1.5 (incl other sub)
        ]
        execute_copy(sub_a.id, parent, "0x" + "1" * 64, target, 100.0, {})

        from services.copy_service import _intended_position
        assert _intended_position(sub_a.id, "BTC") == (0.0, 0.0)

    exchange.market_close.assert_called_once()
    args, kwargs = exchange.market_close.call_args
    assert args[0] == "BTC"
    assert kwargs.get("sz") == pytest.approx(1.0, rel=1e-3)


def test_cancel_only_targets_this_subs_cloids(app, mock_info, mock_exchange_factory):
    """Open orders include cloids for sub A and sub B on BTC. _cancel_open_orders
    invoked for sub A should only cancel sub A's orders."""
    from services.copy_service import _cancel_open_orders, _cloid_for_sub

    factory, exchange = mock_exchange_factory

    cloid_a = _cloid_for_sub(1).to_raw() if hasattr(_cloid_for_sub(1), "to_raw") else str(_cloid_for_sub(1))
    cloid_b = _cloid_for_sub(2).to_raw() if hasattr(_cloid_for_sub(2), "to_raw") else str(_cloid_for_sub(2))

    mock_info.open_orders.return_value = [
        {"coin": "BTC", "oid": 111, "cloid": cloid_a},
        {"coin": "BTC", "oid": 222, "cloid": cloid_b},
        {"coin": "BTC", "oid": 333, "cloid": None},
    ]

    with app.app_context():
        _cancel_open_orders(exchange, "0xparent", "BTC", sub_id=1)

    exchange.bulk_cancel.assert_called_once()
    args, _ = exchange.bulk_cancel.call_args
    cancelled_oids = {req["oid"] if isinstance(req, dict) else req.oid for req in args[0]}
    assert cancelled_oids == {111}


def test_zero_target_equity_is_skipped(app, mock_info, mock_exchange_factory):
    from services.copy_service import execute_copy
    from extensions import db
    from models.user import ParentWallet
    from models.subscription import Subscription

    factory, exchange = mock_exchange_factory
    parent = "0x" + "a" * 40
    agent = "0x" + "b" * 40
    target = "0x" + "d" * 40

    with app.app_context():
        db.session.add(ParentWallet(address=parent))
        sub = Subscription(
            parent_address=parent, agent_address=agent,
            agent_private_key="0x" + "1" * 64,
            target_address=target, scaling_pct=100, is_active=True,
        )
        db.session.add(sub)
        db.session.commit()
        mock_info.user_state.side_effect = [_mk_state({}, 0), _mk_state({}, 100)]
        execute_copy(sub.id, parent, "0x" + "1" * 64, target, 100.0, {})

    exchange.market_open.assert_not_called()
    exchange.market_close.assert_not_called()


def test_size_that_rounds_to_zero_is_not_sent(app, mock_info, mock_exchange_factory):
    from services.copy_service import execute_copy
    from extensions import db
    from models.user import ParentWallet
    from models.subscription import Subscription

    _, exchange = mock_exchange_factory
    parent, target = "0x" + "a" * 40, "0x" + "d" * 40
    with app.app_context():
        db.session.add(ParentWallet(address=parent))
        sub = Subscription(parent_address=parent, agent_address="0x" + "b" * 40,
                           agent_private_key="0x" + "1" * 64, target_address=target,
                           scaling_pct=100, is_active=True)
        db.session.add(sub)
        db.session.commit()
        # ideal = 200 * (0.4 / 200) = 0.4 DOGE → lot 1 → 0 ; price 100 so $40 > min_usd
        mock_info.user_state.side_effect = [
            _mk_state({"DOGE": {"szi": 0.4, "entry": 100.0}}, 200),
            _mk_state({}, 200),
        ]
        execute_copy(sub.id, parent, "0x" + "1" * 64, target, 100.0, {"price_tolerance_pct": -1})
    exchange.market_open.assert_not_called()
    exchange.order.assert_not_called()
