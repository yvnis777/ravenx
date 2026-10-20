"""
Agent wallet service.

V2 RavenX uses Hyperliquid 'agent wallets' (a.k.a. 'API wallets'): a separate
keypair authorized via HL's `ApproveAgent` action to place trades on a user's
account but **not** withdraw. We generate the agent server-side, hand the
public address to the frontend, and keep the private key in memory until the
user's `ApproveAgent` signature lands on HL — at which point routes/copy.py
verifies on-chain and persists the key in the Subscription row.
"""
import logging
import threading
import time

import requests
from eth_account import Account
from eth_account.signers.local import LocalAccount
from flask import current_app
from hyperliquid.exchange import Exchange
import hl_env

logger = logging.getLogger(__name__)

# Default TTL — overridden by Config.AGENT_PENDING_TTL_SECONDS at runtime
_PENDING_TTL_SECONDS = 600

_pending_lock = threading.Lock()
# parent_address.lower() -> {agent_address.lower(): (private_key, created_at)}
_pending: dict[str, dict[str, tuple[str, float]]] = {}


class PendingAgentNotFound(Exception):
    pass


def _ttl() -> int:
    try:
        return int(current_app.config.get("AGENT_PENDING_TTL_SECONDS", _PENDING_TTL_SECONDS))
    except RuntimeError:
        # outside Flask app context (tests)
        return _PENDING_TTL_SECONDS


def generate_pending_agent(parent_address: str) -> str:
    """Generate a fresh agent keypair, stash the private key in memory, return the address."""
    parent_key = parent_address.lower()
    eth = Account.create()
    pkey_hex = eth.key.hex()
    # Normalize to 0x-prefixed (eth-account version differences)
    pkey = pkey_hex if pkey_hex.startswith("0x") else "0x" + pkey_hex
    addr = eth.address

    with _pending_lock:
        bucket = _pending.setdefault(parent_key, {})
        bucket[addr.lower()] = (pkey, time.time())
        # opportunistic GC of expired entries for this parent
        ttl = _ttl()
        now = time.time()
        for k in list(bucket.keys()):
            if now - bucket[k][1] > ttl:
                del bucket[k]

    return addr


def pop_pending_pkey(agent_address: str, parent_address: str) -> str:
    """Retrieve and remove the cached private key for (parent, agent). Raises if not found or expired."""
    parent_key = parent_address.lower()
    agent_key = agent_address.lower()
    ttl = _ttl()
    with _pending_lock:
        bucket = _pending.get(parent_key, {})
        entry = bucket.get(agent_key)
        if entry is None:
            raise PendingAgentNotFound(f"No pending agent {agent_key} for parent {parent_key}")
        pkey, created_at = entry
        if time.time() - created_at > ttl:
            del bucket[agent_key]
            raise PendingAgentNotFound(f"Pending agent {agent_key} expired")
        del bucket[agent_key]
        return pkey


_meta_lock = threading.Lock()
_meta_cache: dict | None = None
_spot_meta_cache: dict | None = None


def _get_metas() -> tuple[dict, dict]:
    """Fetch (and cache) HL perp + spot metadata.

    The Exchange constructor fetches both on every instantiation, and we build
    an Exchange per copy execution — without this cache that's two extra HL
    calls per fill, which is exactly the traffic that gets us rate-limited.
    """
    global _meta_cache, _spot_meta_cache
    with _meta_lock:
        if _meta_cache is None:
            _meta_cache = _info_post({"type": "meta"})
        if _spot_meta_cache is None:
            _spot_meta_cache = _info_post({"type": "spotMeta"})
        return _meta_cache, _spot_meta_cache


def _info_post(payload: dict) -> dict:
    """Thin wrapper — split out for tests to monkeypatch."""
    resp = requests.post(hl_env.INFO_URL, json=payload, timeout=10)
    resp.raise_for_status()
    return resp.json()


def verify_agent_approved(parent_address: str, agent_address: str) -> bool:
    """
    Confirm the user has actually approved this agent on HL by calling
    the `extraAgents` info endpoint. Compares addresses case-insensitively.
    """
    try:
        data = _info_post({"type": "extraAgents", "user": parent_address.lower()})
    except Exception as e:
        logger.warning("verify_agent_approved: HL API error: %s", e)
        return False
    # HL returns a bare list: [{"name", "address", "validUntil"}, ...]
    if not isinstance(data, list):
        logger.warning("verify_agent_approved: unexpected response %r", data)
        return False
    target = agent_address.lower()
    return any(
        isinstance(a, dict) and str(a.get("address", "")).lower() == target
        for a in data
    )


def get_max_builder_fee(parent_address: str, builder_address: str) -> int:
    """The builder fee this user has approved for us, in tenths of a basis point.

    Returns 0 when nothing is approved, or when HL can't be reached — callers
    treat 0 as "not approved" and refuse to place fee-bearing orders.
    """
    try:
        data = _info_post({
            "type": "maxBuilderFee",
            "user": parent_address.lower(),
            "builder": builder_address.lower(),
        })
    except Exception as e:
        logger.warning("get_max_builder_fee: HL API error: %s", e)
        return 0
    try:
        return int(data)
    except (TypeError, ValueError):
        logger.warning("get_max_builder_fee: unexpected response %r", data)
        return 0


def verify_builder_fee_approved(
    parent_address: str, builder_address: str, required_tenths_bps: int
) -> bool:
    """True when the user approved at least the fee we intend to charge."""
    return get_max_builder_fee(parent_address, builder_address) >= required_tenths_bps


def get_exchange(parent_address: str, agent_pkey: str) -> Exchange:
    """
    Build an HL Exchange object that signs orders with the agent's key but acts
    on the parent's account. The agent has only trading permissions on HL —
    HL itself enforces no-withdraw.
    """
    account: LocalAccount = Account.from_key(agent_pkey)
    meta, spot_meta = _get_metas()
    return Exchange(
        account,
        hl_env.API_URL,
        meta=meta,
        spot_meta=spot_meta,
        account_address=parent_address,
    )
