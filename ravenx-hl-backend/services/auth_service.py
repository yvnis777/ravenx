import secrets
from datetime import datetime, timedelta

from eth_account import Account
from eth_account.messages import encode_defunct
from flask import current_app
from flask_jwt_extended import create_access_token

from extensions import db
from models.nonce import AuthNonce
from models.user import ParentWallet


def generate_nonce(address: str) -> str:
    address = address.lower()
    nonce = secrets.token_hex(16)
    expiry = datetime.utcnow() + timedelta(
        seconds=current_app.config["NONCE_EXPIRY_SECONDS"]
    )

    record = db.session.get(AuthNonce, address)
    if record:
        record.nonce = nonce
        record.expires_at = expiry
    else:
        db.session.add(AuthNonce(address=address, nonce=nonce, expires_at=expiry))

    db.session.commit()
    return nonce


def verify_and_authenticate(address: str, signature: str) -> str | None:
    address = address.lower()
    record = db.session.get(AuthNonce, address)

    if not record or record.expires_at < datetime.utcnow():
        return None

    message = f"Sign in to RavenX\nNonce: {record.nonce}"
    msg = encode_defunct(text=message)

    try:
        recovered = Account.recover_message(msg, signature=signature)
    except Exception:
        return None

    if recovered.lower() != address:
        return None

    # Nonce is single-use
    db.session.delete(record)

    # Register parent wallet on first sign-in
    if not db.session.get(ParentWallet, address):
        db.session.add(ParentWallet(address=address))

    db.session.commit()

    return create_access_token(identity=address)
