"""
Builder fee (RavenX revenue) — the fee must ride on every order the copy
engine places, and must be absent entirely when no builder is configured.
"""
from unittest.mock import MagicMock, patch

import pytest

from services import agent_service
from tests.services.test_copy_service_multi import echo_fills


def _mk_state(positions: dict, account_value: float):
    asset_positions = []
    for coin, info in positions.items():
        szi = info if isinstance(info, (int, float)) else info["szi"]
        entry = info["entry"] if isinstance(info, dict) and "entry" in info else 100.0
        asset_positions.append({
            "position": {
                "coin": coin,
                "szi": str(szi),
                "entryPx": str(entry),
                "positionValue": str(abs(szi) * entry),
            }
        })
    return {
        "marginSummary": {"accountValue": str(account_value)},
        "assetPositions": asset_positions,
    }


@pytest.fixture
def mock_info():
    from services import copy_service
    info = MagicMock()
    copy_service._info = info
    yield info


@pytest.fixture
def mock_exchange_factory():
    from services import copy_service  # noqa: F401
    exchange = MagicMock()
    echo_fills(exchange)
    factory = MagicMock(return_value=exchange)
    with patch("services.copy_service.get_exchange", factory):
        yield factory, exchange


def _run_market_open(app, mock_info, exchange, builder_address):
    """Drive one increase through execute_copy and return market_open's kwargs."""
    from services.copy_service import execute_copy
    from extensions import db
    from models.user import ParentWallet
    from models.subscription import Subscription

    parent = "0x" + "a" * 40
    target = "0x" + "d" * 40

    with app.app_context():
        app.config["BUILDER_ADDRESS"] = builder_address
        app.config["BUILDER_FEE_TENTHS_BPS"] = 30

        db.session.add(ParentWallet(address=parent))
        sub = Subscription(
            parent_address=parent, agent_address="0x" + "b" * 40,
            agent_private_key="0x" + "1" * 64,
            target_address=target, scaling_pct=100, is_active=True,
        )
        db.session.add(sub)
        db.session.commit()

        mock_info.user_state.side_effect = [
            _mk_state({"BTC": {"szi": 2.0, "entry": 100.0}}, 200),  # target
            _mk_state({}, 200),                                     # parent flat
        ]
        execute_copy(sub.id, parent, "0x" + "1" * 64, target, 100.0,
                     {"price_tolerance_pct": -1})  # market order path

    exchange.market_open.assert_called_once()
    _, kwargs = exchange.market_open.call_args
    return kwargs


def test_builder_fee_rides_on_orders(app, mock_info, mock_exchange_factory):
    _, exchange = mock_exchange_factory
    builder = "0x" + "f" * 40
    kwargs = _run_market_open(app, mock_info, exchange, builder)
    assert kwargs.get("builder") == {"b": builder, "f": 30}


def test_no_builder_configured_means_no_fee(app, mock_info, mock_exchange_factory):
    _, exchange = mock_exchange_factory
    kwargs = _run_market_open(app, mock_info, exchange, None)
    assert kwargs.get("builder") is None


def test_verify_builder_fee_approved_accepts_equal_rate():
    with patch.object(agent_service, "_info_post", return_value=30):
        assert agent_service.verify_builder_fee_approved("0xparent", "0xbuilder", 30) is True


def test_verify_builder_fee_approved_rejects_lower_rate():
    with patch.object(agent_service, "_info_post", return_value=10):
        assert agent_service.verify_builder_fee_approved("0xparent", "0xbuilder", 30) is False


def test_unapproved_user_reads_as_zero():
    with patch.object(agent_service, "_info_post", return_value=0):
        assert agent_service.get_max_builder_fee("0xparent", "0xbuilder") == 0


def test_hl_error_is_treated_as_not_approved():
    with patch.object(agent_service, "_info_post", side_effect=RuntimeError("HL down")):
        assert agent_service.verify_builder_fee_approved("0xparent", "0xbuilder", 30) is False
