from datetime import datetime
from extensions import db


class Trader(db.Model):
    __tablename__ = "traders"

    address = db.Column(db.String(42), primary_key=True)
    display_name = db.Column(db.String(64))
    pnl = db.Column(db.Float)
    upnl = db.Column(db.Float)
    perp_equity = db.Column(db.Float)
    win_rate = db.Column(db.Float)
    long_pnl = db.Column(db.Float)
    short_pnl = db.Column(db.Float)
    growth_rate = db.Column(db.Float)
    trade_count = db.Column(db.Integer)
    win_count = db.Column(db.Integer)
    loss_count = db.Column(db.Integer)
    tx_count = db.Column(db.Integer)
    open_positions = db.Column(db.JSON)  # [{coin, szi, entry_px}, ...]
    pnl_1d = db.Column(db.Float)
    pnl_7d = db.Column(db.Float)
    pnl_30d = db.Column(db.Float)
    pnl_90d = db.Column(db.Float)
    trades_1d = db.Column(db.Integer)
    trades_7d = db.Column(db.Integer)
    trades_30d = db.Column(db.Integer)
    trades_90d = db.Column(db.Integer)
    win_rate_1d = db.Column(db.Float)
    win_rate_7d = db.Column(db.Float)
    win_rate_30d = db.Column(db.Float)
    win_rate_90d = db.Column(db.Float)
    last_updated = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "address": self.address,
            "display_name": self.display_name,
            "pnl": self.pnl,
            "upnl": self.upnl,
            "perp_equity": self.perp_equity,
            "win_rate": self.win_rate,
            "long_pnl": self.long_pnl,
            "short_pnl": self.short_pnl,
            "growth_rate": self.growth_rate,
            "trade_count": self.trade_count,
            "win_count": self.win_count,
            "loss_count": self.loss_count,
            "tx_count": self.tx_count,
            "open_positions": self.open_positions or [],
            "pnl_1d": self.pnl_1d,
            "pnl_7d": self.pnl_7d,
            "pnl_30d": self.pnl_30d,
            "pnl_90d": self.pnl_90d,
            "trades_1d": self.trades_1d,
            "trades_7d": self.trades_7d,
            "trades_30d": self.trades_30d,
            "trades_90d": self.trades_90d,
            "win_rate_1d": self.win_rate_1d,
            "win_rate_7d": self.win_rate_7d,
            "win_rate_30d": self.win_rate_30d,
            "win_rate_90d": self.win_rate_90d,
            "last_updated": self.last_updated.isoformat() if self.last_updated else None,
        }
