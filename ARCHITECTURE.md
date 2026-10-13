# RavenX — Backend

Copy-trading platform for Hyperliquid. Users connect their own wallet, browse a trader leaderboard, authorize a limited agent wallet, and mirror a target wallet's positions. The RavenX algorithm keeps the follower's average entry price ≤ the target's (for longs) by placing GTC limit orders.

**Non-custodial.** RavenX never holds user funds or private keys. Trading is authorized through a Hyperliquid agent wallet, which can place orders but cannot withdraw.

## Stack

| Layer | Tech |
|-------|------|
| Backend | Python 3.12 / Flask |
| Database | PostgreSQL in production, SQLite in dev (SQLAlchemy 2.x) |
| Auth | EIP-191 wallet signature → JWT |
| Trading auth | HL agent wallets (`ApproveAgent`); private key encrypted at rest in `subscriptions` (Fernet) |
| Revenue | HL builder fee (`ApproveBuilderFee`), 0.03% per order |
| Exchange | `hyperliquid-python-sdk==0.22.0` |
| Background jobs | APScheduler |
| Monitoring | `websockets` daemon thread |
| Tests | pytest (17 tests) |

## Quick Start

```bash
cd ravenx-hl-backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # DATABASE_URL, JWT_SECRET_KEY, AGENT_KEY_ENCRYPTION_KEY at minimum
flask --app app run --port 5000

python seed_traders.py        # seed the leaderboard on first run

DISABLE_BACKGROUND_WORKERS=1 python -m pytest -q    # tests
```

Frontend lives in `ravenx-frontend/` — see [`ravenx-frontend/ARCHITECTURE.md`](ravenx-frontend/ARCHITECTURE.md). `npm run dev` → http://localhost:3000.

## Environment Variables

```
DATABASE_URL                  PostgreSQL connection string (required)
JWT_SECRET_KEY                Long random string for JWT signing (required)
AGENT_KEY_ENCRYPTION_KEY      Fernet key(s) encrypting agent private keys (required). "new,old" to rotate.
BUILDER_ADDRESS               HL account receiving builder fees. EMPTY = fees off.
                              Must hold >= 100 USDC perps account value or HL rejects the fee.
BUILDER_FEE_TENTHS_BPS        Fee in tenths of a bp, default 30 (= 0.03%). HL caps perps at 100.
MIN_POSITION_SIZE_USD         Minimum order size in USD, default 10.0
TRADER_SCAN_INTERVAL_MINUTES  Enrichment interval, default 30
NONCE_EXPIRY_SECONDS          Auth nonce TTL, default 300
AGENT_PENDING_TTL_SECONDS     How long a generated agent waits for approval, default 600
AGENT_KEY_GC_DAYS             Intended retention for stopped subs' agent keys, default 90 — NOT YET ENFORCED, no job reads it
ENABLE_LEADERBOARD            1 = run wallet discovery (harvesters, scanner, price feed). Default off.
DISABLE_BACKGROUND_WORKERS    Set to any value to skip background threads
CORS_ORIGINS                  Comma-separated frontend URLs
```

`BUILDER_ADDRESS` must match `NEXT_PUBLIC_BUILDER_ADDRESS` in the frontend, or the two will disagree about whether users are charged.

`ENABLE_LEADERBOARD` should match `NEXT_PUBLIC_ENABLE_LEADERBOARD`. With both off (the launch setup), only the copy WS daemon runs; users paste a wallet address instead of browsing.

## Directory Structure

```
ravenx-hl-backend/
├── app.py                    # Flask app factory + staggered background service startup
├── config.py                 # Env-based config
├── extensions.py             # db, jwt singletons
├── seed_traders.py           # CLI: harvest + enrich wallets
├── models/
│   ├── user.py               # ParentWallet
│   ├── subscription.py       # Subscription (parent → target, agent keypair, N per user)
│   ├── position.py           # TrackedPosition (this sub's intended share per coin)
│   ├── trader.py             # Trader (leaderboard cache + period PnL columns)
│   ├── discovered_wallet.py  # DiscoveredWallet (harvested addresses, pre-enrichment)
│   ├── nonce.py              # AuthNonce (single-use, TTL-expiring)
│   └── notification.py       # Notification (per-user copy events)
├── routes/
│   ├── auth.py               # /auth/nonce, /auth/verify
│   ├── agent.py              # /agent/generate
│   ├── copy.py               # /copy/start, /stop, /subscriptions
│   ├── dashboard.py          # PUBLIC leaderboard + cohorts
│   └── notifications.py      # /notifications, /unread-count, /read
├── services/
│   ├── auth_service.py       # EIP-191 verify + JWT issue
│   ├── agent_service.py      # Agent keypair gen, HL agent + builder-fee verification, Exchange factory
│   ├── copy_service.py       # Core algorithm (per-sub locked, delta-based, GTC limits)
│   ├── trader_service.py     # Leaderboard query + metric computation
│   └── notification_service.py
├── monitoring/
│   ├── websocket_manager.py  # WS daemon for target fill events
│   ├── copy_engine.py        # On fill event → execute_copy for each follower
│   └── price_feed.py         # allMids WS feed for live position pricing
└── workers/
    ├── trade_stream_harvester.py  # Continuous WS stream over all trade feeds
    ├── wallet_harvester.py        # REST sweep: recentTrades per coin (bootstrap)
    └── trader_scanner.py          # Enriches discovered_wallets → traders
```

## Wallet Discovery Pipeline

**Disabled unless `ENABLE_LEADERBOARD=1`.** Kept in the codebase for later; nothing in the copy path reads the `traders` table.

The leaderboard is built from our own scanner — no dependency on any HL leaderboard API.

1. **Harvesting** — `trade_stream_harvester` subscribes to the live `trades` WS channel for all 230+ perp markets and flushes new addresses every ~10s. `wallet_harvester` is a REST fallback sweeping `recentTrades` per coin every 5 min.
2. **Enrichment** (`trader_scanner`) — a fast pass upserts equity/positions/uPnL, then a deep pass computes PnL, win rate and trade counts (all-time and 1D/7D/30D/90D). Wallets under $100 equity are skipped. Rate-limited with backoff on 429.

## API Surface

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/auth/nonce?address=0x...` | — | Get message to sign |
| POST | `/auth/verify` | — | Submit signature → JWT |
| POST | `/agent/generate` | JWT | Generate an agent keypair; returns `agent_address` |
| POST | `/copy/start` | JWT | Start copying (verifies agent + builder fee on HL) |
| POST | `/copy/stop` | JWT | Stop copying; cancels this sub's open orders |
| GET | `/copy/subscriptions` | JWT | My subscriptions |
| PATCH | `/copy/subscriptions/<id>` | JWT | Update scaling_pct / risk_params / target_name |
| GET | `/notifications` | JWT | Recent copy events |
| GET | `/notifications/unread-count` | JWT | Unread badge count |
| POST | `/notifications/read` | JWT | Mark read |
| GET | `/dashboard/traders` | **public** | Leaderboard (sortable, filterable, paginated, search) |
| GET | `/dashboard/traders/stream` | **public** | Live trader updates |
| GET | `/dashboard/traders/<address>` | **public** | Trader detail |
| GET | `/dashboard/traders/<address>/pnl-history` | **public** | Cumulative PnL chart data |
| GET | `/dashboard/traders/<address>/fills` | **public** | Recent fills |
| GET | `/dashboard/stats` | **public** | Wallet cohorts |
| GET | `/dashboard/cohorts/<name>` | **public** | Cohort detail (stats + paginated wallets) |

`sort_by`: `pnl`, `pnl_1d`, `pnl_7d`, `pnl_30d`, `pnl_90d`, `win_rate`, `perp_equity`, `trade_count`, `growth_rate`, `upnl`.
Cohorts: `shrimp` ($100–$1K), `fish` ($1K–$10K), `dolphin` ($10K–$100K), `shark` ($100K–$500K), `whale` ($500K–$5M), `mega-whale` ($5M+).

## Copy Flow (V2)

1. User connects wallet → signs nonce → JWT.
2. User clicks Copy → frontend approves the **builder fee** (skipped if `maxBuilderFee` already ≥ our rate, or if no builder is configured).
3. `POST /agent/generate` → backend generates a keypair, caches the private key in memory keyed by the pending agent address.
4. Frontend builds the `ApproveAgent` typed data, user signs, frontend submits to `https://api.hyperliquid.xyz/exchange`.
5. `POST /copy/start` → backend verifies **both** approvals on HL (`extraAgents` and `maxBuilderFee`), then persists the subscription with the agent key.
6. The WS daemon subscribes to the target. On each fill, the copy engine signs orders with the agent key; they execute on the user's own HL account.
7. Stop → sub marked inactive, this sub's open GTC orders cancelled. **The agent is not auto-revoked** — the user can revoke it on HL.

## Copy Algorithm

**Entry invariant:** each increase places a GTC limit at a weighted-average price keeping the follower's total entry ≤ the target's (longs) or ≥ (shorts).

**Multi-copy:** one user can run N subscriptions on one HL account. Each sub owns an *intended share* per coin (`TrackedPosition`); orders are sized to that sub's delta, never to the account's actual position. Cancels filter by a per-sub cloid prefix, so one sub never touches another's orders.

**Decision tree per coin on fill:** stop-loss → close this sub's share · target closed → close · direction flip → close then open · reducing → reduce-only close of the surplus · increasing at a favorable price → GTC limit · otherwise skip.

**Scaling:** `ideal_szi = my_equity × (target_szi / target_equity) × (scaling_pct / 100)`

**Concurrency:** a `threading.Lock` per subscription prevents double execution on rapid fills.

## Business Model

**0.03% builder fee per order** placed by the bot, collected by Hyperliquid itself and claimed like referral rewards. No subscription, no profit share, nothing charged on trades the user places themselves. Competitors: Dextrabot 0.055%, Phantom 0.05%, Based 0.025%.

Fees are **off** whenever `BUILDER_ADDRESS` is empty — no fee is attached and users are never asked for the fee signature.

## Key Gotchas

- **The HL `Info` client is built lazily** (`copy_service._get_info()`). Never construct SDK clients at import time — a rate-limited HL made the module unimportable and took the backend down on boot.
- **HL metadata is cached** in `agent_service._get_metas()`. `Exchange(...)` fetches perp + spot meta on every construction, and we build one per copy execution — without the cache that's two extra calls per fill.
- **Hyperliquid rate limits are strict.** Max ~4 concurrent workers for `user_state`; startup jobs are staggered; never fire all background jobs at once on restart.
- **Agent private keys are encrypted at rest** (`models/encrypted.py`, `EncryptedText` column). The master key lives only in `AGENT_KEY_ENCRYPTION_KEY`; the app refuses to boot without a valid one. A stolen DB alone yields no keys — but an agent can still trade (never withdraw), so a stolen DB *plus* env is a real loss: keep the key out of DB backups.
  - **Losing the master key** means every stored agent becomes unusable; users must stop and re-approve their copies. Back it up separately.
  - **Rotation:** set `"new,old"`, restart, then remove `old` once rows have been rewritten (rows re-encrypt on their next write; there's no bulk re-encrypt script yet).
  - Stopped subs keep their key until a GC job exists — `AGENT_KEY_GC_DAYS` is configured but unused.
- **A fee-bearing order fails if the user hasn't approved the rate**, so `/copy/start` verifies the approval up front rather than letting the first fill fail.
- **HL unreachable reads as "not approved"** for both agent and fee checks — we never attach a fee the user didn't authorize.
- **SQLite throws "database is locked"** when background threads run concurrently. Use PostgreSQL in production.
- **Dashboard endpoints are intentionally public** — the leaderboard is browseable without login.
- `db.create_all()` is used in dev — use Alembic for production schema changes.
- `risk_params` supports: `stop_loss_pct`, `max_drawdown_pct`, `max_position_usd`, `min_position_usd`, `price_tolerance_pct`, `copy_existing_mode`.

## Status

V2 (non-custodial, HL-only, builder fee) is implemented and unit-tested. **The agent-approval and fee-approval flows have never run against real Hyperliquid** — no signature has been submitted from this code. An end-to-end test with a small funded account is the main outstanding risk before launch.
