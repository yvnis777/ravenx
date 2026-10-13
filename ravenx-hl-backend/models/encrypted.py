"""Column type that encrypts at rest — used for agent private keys.

Values are Fernet tokens (AES-128-CBC + HMAC-SHA256) under the master key in
AGENT_KEY_ENCRYPTION_KEY, which lives in the server environment, never the DB.
A stolen database alone yields no usable keys.

Rotation: set AGENT_KEY_ENCRYPTION_KEY="new,old". The first key encrypts every
write; all of them decrypt, so old rows keep working until they are rewritten.
"""
from cryptography.fernet import Fernet, MultiFernet
from flask import current_app
from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator


def _cipher() -> MultiFernet:
    raw = current_app.config.get("AGENT_KEY_ENCRYPTION_KEY") or ""
    keys = [k.strip() for k in raw.split(",") if k.strip()]
    if not keys:
        raise RuntimeError("AGENT_KEY_ENCRYPTION_KEY is not set; refusing to read or write agent keys")
    return MultiFernet([Fernet(k) for k in keys])


class EncryptedText(TypeDecorator):
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return _cipher().encrypt(value.encode()).decode()

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return _cipher().decrypt(value.encode()).decode()
