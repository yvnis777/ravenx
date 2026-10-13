import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()


class Config:
    # Database
    SQLALCHEMY_DATABASE_URI = os.environ["DATABASE_URL"]
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # JWT
    JWT_SECRET_KEY = os.environ["JWT_SECRET_KEY"]
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)

    # Master key(s) encrypting agent private keys at rest — see models/encrypted.py.
    # Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    AGENT_KEY_ENCRYPTION_KEY = os.environ["AGENT_KEY_ENCRYPTION_KEY"]

    # Trading
    MIN_POSITION_SIZE_USD = float(os.environ.get("MIN_POSITION_SIZE_USD", "10.0"))

    # Background workers
    TRADER_SCAN_INTERVAL_MINUTES = int(os.environ.get("TRADER_SCAN_INTERVAL_MINUTES", "30"))
    DISABLE_BACKGROUND_WORKERS = bool(os.environ.get("DISABLE_BACKGROUND_WORKERS", ""))
    # Wallet discovery (harvesters, scanner, price feed) for the public leaderboard.
    # Off by default: copying never reads it, and it is most of our HL API traffic.
    ENABLE_LEADERBOARD = os.environ.get("ENABLE_LEADERBOARD", "").strip().lower() in ("1", "true", "yes")

    # Auth
    NONCE_EXPIRY_SECONDS = int(os.environ.get("NONCE_EXPIRY_SECONDS", "300"))

    # Agent wallets
    # Time (seconds) a generated agent address sits in memory awaiting HL approval
    AGENT_PENDING_TTL_SECONDS = int(os.environ.get("AGENT_PENDING_TTL_SECONDS", "600"))
    # GC private keys for subscriptions inactive longer than this (days)
    AGENT_KEY_GC_DAYS = int(os.environ.get("AGENT_KEY_GC_DAYS", "90"))

    # Builder fee — RavenX's revenue, collected by HL on each order we place.
    # BUILDER_ADDRESS must hold >= 100 USDC of perps account value or HL
    # rejects the fee. Unset (the default) disables fees entirely.
    BUILDER_ADDRESS = (os.environ.get("BUILDER_ADDRESS") or "").lower() or None
    # Fee in tenths of a basis point, HL's unit for the order's "f" field.
    # 30 = 3 bps = 0.03%.
    BUILDER_FEE_TENTHS_BPS = int(os.environ.get("BUILDER_FEE_TENTHS_BPS", "30"))

    @staticmethod
    def builder_max_fee_rate(tenths_bps: int) -> str:
        """The same fee as the percent string HL wants in ApproveBuilderFee."""
        return f"{tenths_bps / 1000:.4f}".rstrip("0").rstrip(".") + "%"

    # CORS
    CORS_ORIGINS = [
        o.strip()
        for o in os.environ.get(
            "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
        ).split(",")
        if o.strip()
    ]
