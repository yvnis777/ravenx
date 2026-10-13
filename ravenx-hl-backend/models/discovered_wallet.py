from datetime import datetime
from extensions import db


class DiscoveredWallet(db.Model):
    """
    Wallet addresses discovered by scanning Hyperliquid trade activity.
    Separate from Trader — a wallet only becomes a Trader once it's been
    enriched with performance metrics and meets the minimum threshold.
    """
    __tablename__ = "discovered_wallets"

    address = db.Column(db.String(42), primary_key=True)
    first_seen_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    last_seen_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    # Set after trader_scanner successfully enriches this address
    enriched_at = db.Column(db.DateTime, nullable=True)
    # Incremented each time the address appears in a harvest sweep
    sighting_count = db.Column(db.Integer, nullable=False, default=1)

    def touch(self):
        self.last_seen_at = datetime.utcnow()
        self.sighting_count += 1
