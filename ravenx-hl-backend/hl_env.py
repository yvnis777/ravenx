"""
Which Hyperliquid network this process talks to — the single switch.

Read from the environment at import because the workers and monitoring
modules hold these as module-level constants outside any app context. This
is an env read, not an SDK client, so it is safe at import time.
"""
import os

from dotenv import load_dotenv
from hyperliquid.utils import constants

load_dotenv()

_API_URLS = {
    "mainnet": constants.MAINNET_API_URL,
    "testnet": constants.TESTNET_API_URL,
}


def resolve(raw: str | None) -> str:
    """Normalise HL_ENV. Unknown values raise — never silently fall back to mainnet."""
    value = (raw or "").strip().lower() or "mainnet"
    if value not in _API_URLS:
        raise ValueError(f"HL_ENV must be 'mainnet' or 'testnet', got {raw!r}")
    return value


HL_ENV = resolve(os.environ.get("HL_ENV"))
IS_MAINNET = HL_ENV == "mainnet"
API_URL = _API_URLS[HL_ENV]
INFO_URL = API_URL + "/info"
WS_URL = API_URL.replace("https://", "wss://", 1) + "/ws"
