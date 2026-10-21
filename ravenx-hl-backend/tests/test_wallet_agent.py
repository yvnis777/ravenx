"""One agent per wallet, shared by all of its copies."""
from unittest.mock import MagicMock, patch

import pytest
from flask_jwt_extended import create_access_token
from sqlalchemy import inspect, text

from extensions import db
from models.agent_wallet import AgentWallet
from models.subscription import Subscription
from services import agent_service
from tests.services.test_copy_service_multi import _mk_state

PARENT = "0x" + "a" * 40
TARGET_1 = "0x" + "d" * 40
TARGET_2 = "0x" + "e" * 40


@pytest.fixture
def client(app):
    from services import copy_service
    info = MagicMock()
    info.user_state.return_value = _mk_state({}, 500)
    copy_service._info = info
    agent_service._pending.clear()
    with app.app_context():
        token = create_access_token(identity=PARENT)
    approved: set[str] = set()   # agents HL lists as approved for PARENT
    with patch("routes.agent.verify_agent_approved", lambda p, a: a.lower() in approved), \
         patch("routes.copy.verify_agent_approved", lambda p, a: a.lower() in approved), \
         patch("routes.copy.WebSocketManager"), \
         patch("hyperliquid.info.Info"), \
         patch("threading.Thread"):
        c = app.test_client()
        c.headers = {"Authorization": f"Bearer {token}"}
        yield c, approved, info


def _generate(c):
    return c.post("/agent/generate", headers=c.headers)


def _start(c, agent, target=TARGET_1):
    return c.post("/copy/start", headers=c.headers,
                  json={"target_address": target, "agent_address": agent})


def _saved(app):
    with app.app_context():
        db.session.expire_all()
        return db.session.get(AgentWallet, PARENT)


def test_first_copy_approves_an_agent_and_saves_it_to_the_wallet(app, client):
    c, approved, _ = client
    resp = _generate(c)
    assert resp.status_code == 201 and resp.json["needs_approval"] is True
    agent = resp.json["agent_address"].lower()

    approved.add(agent)                     # the user signs ApproveAgent
    assert _start(c, agent).status_code == 201
    assert _saved(app).agent_address == agent


def test_second_copy_reuses_the_agent_without_a_signature(app, client):
    c, approved, _ = client
    agent = _generate(c).json["agent_address"].lower()
    approved.add(agent)
    assert _start(c, agent).status_code == 201

    resp = _generate(c)
    assert resp.status_code == 200
    assert resp.json == {"agent_address": agent, "needs_approval": False}
    assert _start(c, agent, TARGET_2).status_code == 201

    with app.app_context():
        subs = db.session.execute(db.select(Subscription)).scalars().all()
        assert [s.agent_address for s in subs] == [agent, agent]


def test_agent_gone_from_hl_asks_for_a_new_one_which_replaces_it(app, client):
    c, approved, _ = client
    old = _generate(c).json["agent_address"].lower()
    approved.add(old)
    assert _start(c, old).status_code == 201

    approved.discard(old)                   # expired, or revoked on HL
    resp = _generate(c)
    assert resp.status_code == 201 and resp.json["needs_approval"] is True
    new = resp.json["agent_address"].lower()
    assert new != old

    approved.add(new)
    assert _start(c, new, TARGET_2).status_code == 201
    assert _saved(app).agent_address == new


def test_key_is_saved_even_if_the_copy_then_fails(app, client):
    c, approved, info = client
    agent = _generate(c).json["agent_address"].lower()
    approved.add(agent)
    info.user_state.side_effect = RuntimeError("429")   # target unreadable → 502
    assert _start(c, agent).status_code == 502
    assert _saved(app).agent_address == agent

    # The retry needs no new approval: the saved agent is reused.
    info.user_state.side_effect = None
    assert _generate(c).json == {"agent_address": agent, "needs_approval": False}
    assert _start(c, agent).status_code == 201


def test_unapproved_agent_is_refused_and_not_saved(app, client):
    c, _, _ = client
    agent = _generate(c).json["agent_address"].lower()
    assert _start(c, agent).status_code == 400
    assert _saved(app) is None


def test_copy_engine_signs_every_copy_with_the_wallets_current_agent(app):
    from models.user import ParentWallet
    from monitoring.copy_engine import handle_fill
    with app.app_context():
        db.session.add(ParentWallet(address=PARENT))
        db.session.add_all([
            Subscription(parent_address=PARENT, target_address=TARGET_1, is_active=True),
            Subscription(parent_address=PARENT, target_address=TARGET_1, is_active=True),
        ])
        db.session.commit()
        agent_service.save_wallet_agent(PARENT, "0x" + "b" * 40, "0x" + "1" * 64)
        agent_service.save_wallet_agent(PARENT, "0x" + "c" * 40, "0x" + "2" * 64)  # replaced

    with patch("services.copy_service.execute_copy") as execute:
        handle_fill(TARGET_1, {}, app)
    assert [call.kwargs["agent_pkey"] for call in execute.call_args_list] == ["0x" + "2" * 64] * 2


def test_copy_engine_skips_a_wallet_without_an_agent(app):
    from models.user import ParentWallet
    from monitoring.copy_engine import handle_fill
    with app.app_context():
        db.session.add(ParentWallet(address=PARENT))
        db.session.add(Subscription(parent_address=PARENT, target_address=TARGET_1, is_active=True))
        db.session.commit()
    with patch("services.copy_service.execute_copy") as execute:
        handle_fill(TARGET_1, {}, app)
    execute.assert_not_called()


# ── Boot migration: subscriptions.agent_address was NOT NULL + UNIQUE ─────

OLD_SUBSCRIPTIONS = """CREATE TABLE subscriptions (
    id INTEGER NOT NULL, parent_address VARCHAR(42) NOT NULL,
    agent_address VARCHAR(42) NOT NULL, agent_private_key TEXT,
    target_address VARCHAR(42) NOT NULL, target_name VARCHAR(100), scaling_pct FLOAT,
    is_active BOOLEAN, risk_params JSON, peak_equity FLOAT, held_at_start JSON,
    created_at DATETIME, stopped_at DATETIME, last_polled_at DATETIME,
    last_error VARCHAR(500), PRIMARY KEY (id), UNIQUE (agent_address))"""


def _old_table(rows=0):
    db.session.execute(text("DROP TABLE subscriptions"))
    db.session.execute(text(OLD_SUBSCRIPTIONS))
    for i in range(rows):
        db.session.execute(text(
            "INSERT INTO subscriptions (id, parent_address, agent_address, target_address) "
            f"VALUES ({i + 1}, '{PARENT}', '0x{i}', '{TARGET_1}')"))
    db.session.commit()


def test_empty_old_table_is_rebuilt_without_the_constraint(app):
    from app import _relax_subscription_agent_address
    with app.app_context():
        _old_table()
        _relax_subscription_agent_address()
        insp = inspect(db.engine)
        col = next(c for c in insp.get_columns("subscriptions") if c["name"] == "agent_address")
        assert col["nullable"]
        assert not insp.get_unique_constraints("subscriptions")
        _relax_subscription_agent_address()    # idempotent


def test_old_table_with_rows_refuses_to_rebuild(app):
    from app import _relax_subscription_agent_address
    with app.app_context():
        _old_table(rows=1)
        with pytest.raises(RuntimeError, match="delete it and restart"):
            _relax_subscription_agent_address()
