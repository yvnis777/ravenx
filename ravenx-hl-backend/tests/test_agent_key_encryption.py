"""Agent private keys are encrypted at rest; the ORM still hands out plaintext."""
import pytest
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import text
from sqlalchemy.exc import StatementError

from extensions import db
from models.subscription import Subscription
from models.user import ParentWallet

PKEY = "0x" + "ab" * 32
PARENT = "0x" + "a" * 40


def _store(app):
    with app.app_context():
        db.session.add(ParentWallet(address=PARENT))
        db.session.add(Subscription(parent_address=PARENT, agent_address="0x" + "b" * 40,
                                    agent_private_key=PKEY, target_address="0x" + "c" * 40))
        db.session.commit()


def _raw(app):
    with app.app_context():
        return db.session.execute(text("SELECT agent_private_key FROM subscriptions")).scalar_one()


def _read(app):
    with app.app_context():
        db.session.expire_all()
        return db.session.execute(db.select(Subscription)).scalar_one().agent_private_key


def test_key_is_not_stored_in_plaintext(app):
    _store(app)
    stored = _raw(app)
    assert PKEY not in stored and PKEY[2:] not in stored


def test_orm_returns_the_plaintext_key(app):
    _store(app)
    assert _read(app) == PKEY


def test_null_key_stays_null(app):
    with app.app_context():
        db.session.add(ParentWallet(address=PARENT))
        db.session.add(Subscription(parent_address=PARENT, agent_address="0x" + "b" * 40,
                                    agent_private_key=None, target_address="0x" + "c" * 40))
        db.session.commit()
    assert _raw(app) is None
    assert _read(app) is None


def test_a_different_master_key_cannot_decrypt(app):
    _store(app)
    app.config["AGENT_KEY_ENCRYPTION_KEY"] = Fernet.generate_key().decode()
    with pytest.raises(InvalidToken):
        _read(app)


def test_rotation_new_key_first_still_reads_old_rows(app):
    _store(app)
    old = app.config["AGENT_KEY_ENCRYPTION_KEY"]
    app.config["AGENT_KEY_ENCRYPTION_KEY"] = f"{Fernet.generate_key().decode()},{old}"
    assert _read(app) == PKEY


def test_missing_master_key_refuses_to_store(app):
    app.config["AGENT_KEY_ENCRYPTION_KEY"] = ""
    # SQLAlchemy wraps the RuntimeError raised while binding the value
    with pytest.raises(StatementError, match="AGENT_KEY_ENCRYPTION_KEY is not set"):
        _store(app)
