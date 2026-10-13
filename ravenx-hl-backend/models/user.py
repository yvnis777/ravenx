from datetime import datetime
from extensions import db


class ParentWallet(db.Model):
    __tablename__ = "parent_wallets"

    address = db.Column(db.String(42), primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    subscriptions = db.relationship(
        "Subscription", backref="parent_wallet", lazy=True, cascade="all, delete-orphan"
    )
