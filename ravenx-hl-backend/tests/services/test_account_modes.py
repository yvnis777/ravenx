"""Equity in HL's unified mode lives in the spot state, not the perps state."""
from unittest.mock import MagicMock, patch

import pytest

from services import copy_service
from tests.services.test_copy_service_multi import _mk_state, echo_fills

# Captured before conftest's autouse fixture swaps it for "disabled".
REAL_ABSTRACTION = copy_service._abstraction

PARENT = "0x" + "a" * 40
TARGET = "0x" + "d" * 40


def _spot(usdc, **others):
    balances = [{"coin": "USDC", "token": 0, "total": str(usdc), "hold": "0"}]
    balances += [{"coin": c, "token": 9, "total": str(v), "hold": "0"} for c, v in others.items()]
    return {"balances": balances}


@pytest.fixture
def info():
    i = MagicMock()
    copy_service._info = i
    copy_service._modes.clear()
    return i


def test_unified_equity_is_the_spot_usdc_total(info, monkeypatch):
    # Target 2 on 2026-10-21: perps state said $47.6k, the account held $83.2k.
    monkeypatch.setattr(copy_service, "_abstraction", lambda a: "unifiedAccount")
    perps = _mk_state({"BTC": {"szi": 1.0, "entry": 100.0}}, 47641.31)
    info.user_state.return_value = perps
    info.spot_user_state.return_value = _spot(83235.03, HFUN=10999)   # non-USDC ignored
    _, equity = copy_service._get_state(TARGET)
    assert equity == pytest.approx(83235.03)


def test_standard_equity_is_the_perps_account_value(info):
    info.user_state.return_value = _mk_state({}, 1234.5)
    _, equity = copy_service._get_state(PARENT)
    assert equity == 1234.5
    info.spot_user_state.assert_not_called()


def test_mode_is_asked_once_then_cached(info, monkeypatch):
    monkeypatch.setattr(copy_service, "_abstraction", REAL_ABSTRACTION)
    info.post.return_value = "unifiedAccount"
    assert copy_service._abstraction(PARENT) == "unifiedAccount"
    assert copy_service._abstraction(PARENT) == "unifiedAccount"
    info.post.assert_called_once_with("/info", {"type": "userAbstraction", "user": PARENT})


def test_unexpected_mode_answer_raises_rather_than_guessing(info, monkeypatch):
    monkeypatch.setattr(copy_service, "_abstraction", REAL_ABSTRACTION)
    info.post.return_value = {"error": "rate limited"}
    with pytest.raises(ValueError):
        copy_service._abstraction(PARENT)


def test_unified_follower_with_spot_usdc_copies(app, info, monkeypatch):
    """Before the fix a unified follower read as $0 equity and nothing copied."""
    from extensions import db
    from models.subscription import Subscription
    from models.user import ParentWallet
    from services.copy_service import _intended_position, execute_copy

    monkeypatch.setattr(copy_service, "_abstraction",
                        lambda a: "unifiedAccount" if a == PARENT else "disabled")
    exchange = MagicMock()
    echo_fills(exchange)
    with app.app_context(), patch("services.copy_service.get_exchange", return_value=exchange):
        db.session.add(ParentWallet(address=PARENT))
        sub = Subscription(parent_address=PARENT, target_address=TARGET,
                           scaling_pct=100, is_active=True)
        db.session.add(sub)
        db.session.commit()
        info.user_state.side_effect = [
            _mk_state({"BTC": {"szi": 2.0, "entry": 100.0}}, 200),   # target: 2 BTC on $200
            _mk_state({}, 0),                                          # you: perps state empty
        ]
        info.spot_user_state.return_value = _spot(100)                # you: $100 USDC, unified
        execute_copy(sub.id, PARENT, "0x" + "1" * 64, TARGET, 100.0, {"price_tolerance_pct": -1})
        assert _intended_position(sub.id, "BTC") == pytest.approx((1.0, 100.0))
