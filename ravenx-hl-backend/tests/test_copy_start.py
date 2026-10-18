"""/copy/start snapshots the target's positions for "New only" copies."""
from unittest.mock import MagicMock, patch

import pytest
from flask_jwt_extended import create_access_token
from sqlalchemy import inspect, text

from extensions import db
from models.subscription import Subscription
from tests.services.test_copy_service_multi import _mk_state

PARENT = "0x" + "a" * 40
TARGET = "0x" + "d" * 40
AGENT = "0x" + "b" * 40


@pytest.fixture
def start(app):
    from services import copy_service
    info = MagicMock()
    copy_service._info = info
    with app.app_context():
        token = create_access_token(identity=PARENT)
    with patch("routes.copy.verify_agent_approved", return_value=True), \
         patch("routes.copy.pop_pending_pkey", return_value="0x" + "1" * 64), \
         patch("routes.copy.WebSocketManager"), \
         patch("hyperliquid.info.Info"), \
         patch("threading.Thread"):
        def call(risk_params=None):
            return app.test_client().post(
                "/copy/start",
                json={"target_address": TARGET, "agent_address": AGENT,
                      "risk_params": risk_params or {}},
                headers={"Authorization": f"Bearer {token}"},
            )
        yield call, info


def _held(app):
    with app.app_context():
        return db.session.execute(db.select(Subscription)).scalar_one().held_at_start


def test_new_only_records_target_positions(app, start):
    call, info = start
    info.user_state.return_value = _mk_state({"BTC": 2.0, "ETH": -3.0}, 500)
    assert call().status_code == 201
    assert _held(app) == {"BTC": 1, "ETH": -1}


def test_new_only_refuses_when_hl_is_unreachable(app, start):
    call, info = start
    info.user_state.side_effect = RuntimeError("429")
    resp = call()
    assert resp.status_code == 502
    with app.app_context():
        assert db.session.execute(db.select(Subscription)).first() is None


def test_copy_existing_modes_record_nothing(app, start):
    call, info = start
    info.user_state.return_value = _mk_state({"BTC": 2.0}, 500)
    assert call({"copy_existing_mode": "favorable"}).status_code == 201
    assert _held(app) is None


def test_missing_column_is_added_on_boot(app):
    from app import _add_missing_columns
    with app.app_context():
        db.session.execute(text("ALTER TABLE subscriptions DROP COLUMN held_at_start"))
        db.session.commit()
        _add_missing_columns()
        cols = {c["name"] for c in inspect(db.engine).get_columns("subscriptions")}
    assert "held_at_start" in cols
