from datetime import datetime
from extensions import db


class AuthNonce(db.Model):
    __tablename__ = "auth_nonces"

    address = db.Column(db.String(42), primary_key=True)
    nonce = db.Column(db.String(64), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
