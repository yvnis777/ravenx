from datetime import datetime
from extensions import db


class Subscription(db.Model):
    __tablename__ = "subscriptions"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    parent_address = db.Column(
        db.String(42), db.ForeignKey("parent_wallets.address"), nullable=False, index=True
    )
    # The wallet's agent when this copy started. Copies share their wallet's
    # agent, whose key lives in AgentWallet. (Databases created before that
    # change still have an unused agent_private_key column here.)
    agent_address = db.Column(db.String(42), nullable=True)
    target_address = db.Column(db.String(42), nullable=False, index=True)
    target_name = db.Column(db.String(100), nullable=True)
    scaling_pct = db.Column(db.Float, default=100.0)
    is_active = db.Column(db.Boolean, default=False)
    risk_params = db.Column(db.JSON, default=lambda: {})
    # Per-sub high-watermark for max_drawdown_pct check; captured from
    # parent's HL account value at sub start. Not shared across subs.
    peak_equity = db.Column(db.Float, nullable=True)
    # "New only" copies: {coin: 1 | -1} for positions the target already held
    # when the copy started. The engine never opens these; a coin is dropped
    # once the target closes or flips it.
    held_at_start = db.Column(db.JSON, nullable=True)
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
