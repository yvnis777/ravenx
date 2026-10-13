from datetime import datetime
from extensions import db


class TrackedPosition(db.Model):
    """
    Stores the last known position state per subscription per coin.
    Used for reconciliation; live state is always fetched from Hyperliquid.
    """
    __tablename__ = "tracked_positions"
    __table_args__ = (db.UniqueConstraint("subscription_id", "coin"),)

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    subscription_id = db.Column(
        db.Integer, db.ForeignKey("subscriptions.id"), nullable=False
    )
    coin = db.Column(db.String(100), nullable=False)
    szi = db.Column(db.Float, default=0.0)
    entry_px = db.Column(db.Float, default=0.0)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
