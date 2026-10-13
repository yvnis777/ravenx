from datetime import datetime
from extensions import db
from models.encrypted import EncryptedText


class Subscription(db.Model):
    __tablename__ = "subscriptions"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    parent_address = db.Column(
        db.String(42), db.ForeignKey("parent_wallets.address"), nullable=False, index=True
    )
    agent_address = db.Column(db.String(42), unique=True, nullable=False)
    # Agent private key, encrypted at rest (models/encrypted.py). The agent can
    # trade but never withdraw. Reads and writes are plaintext through the ORM.
    agent_private_key = db.Column(EncryptedText, nullable=True)
    target_address = db.Column(db.String(42), nullable=False, index=True)
    target_name = db.Column(db.String(100), nullable=True)
    scaling_pct = db.Column(db.Float, default=100.0)
    is_active = db.Column(db.Boolean, default=False)
    risk_params = db.Column(db.JSON, default=lambda: {})
    # Per-sub high-watermark for max_drawdown_pct check; captured from
    # parent's HL account value at sub start. Not shared across subs.
    peak_equity = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    stopped_at = db.Column(db.DateTime, nullable=True)
    last_polled_at = db.Column(db.DateTime, nullable=True)
    last_error = db.Column(db.String(500), nullable=True)

    positions = db.relationship(
        "TrackedPosition",
        backref="subscription",
        lazy=True,
        cascade="all, delete-orphan",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "parent_address": self.parent_address,
            "agent_address": self.agent_address,
            "target_address": self.target_address,
            "target_name": self.target_name,
            "scaling_pct": self.scaling_pct,
            "is_active": self.is_active,
            "risk_params": self.risk_params,
            "peak_equity": self.peak_equity,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "stopped_at": self.stopped_at.isoformat() if self.stopped_at else None,
            "last_polled_at": self.last_polled_at.isoformat() if self.last_polled_at else None,
            "last_error": self.last_error,
        }
