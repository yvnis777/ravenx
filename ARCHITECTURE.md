# RavenX — Backend

Copy-trading platform for Hyperliquid. Users connect their own wallet, paste the address of a wallet to copy (the leaderboard is switched off for launch), authorize a limited agent wallet, and mirror that wallet's positions. The RavenX algorithm keeps the follower's average entry price ≤ the target's (for longs) by placing limit orders.

**Non-custodial.** RavenX never holds user funds or private keys. Trading is authorized through a Hyperliquid agent wallet, which can place orders but cannot withdraw.

## Stack

| Layer | Tech |
|-------|------|
| Backend | Python 3.12 / Flask |
| Database | PostgreSQL in production, SQLite in dev (SQLAlchemy 2.x) |
| Auth | EIP-191 wallet signature → JWT |
| Trading auth | HL agent wallets (`ApproveAgent`); private key encrypted at rest in `subscriptions` (Fernet) |
| Revenue | None for now — copying is free. Builder-fee rail (`ApproveBuilderFee`) is built but dormant |
| Exchange | `hyperliquid-python-sdk==0.22.0` |
| Background jobs | APScheduler |
| Monitoring | `websockets` daemon thread |
| Tests | pytest (75 tests) |

## Quick Start

```bash
cd ravenx-hl-backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # DATABASE_URL, JWT_SECRET_KEY, AGENT_KEY_ENCRYPTION_KEY at minimum
flask --app app run --port 5000

python seed_traders.py        # only if ENABLE_LEADERBOARD=1: seed the leaderboard

DISABLE_BACKGROUND_WORKERS=1 python -m pytest -q    # tests
```

Frontend lives in `ravenx-frontend/` — see [`ravenx-frontend/ARCHITECTURE.md`](ravenx-frontend/ARCHITECTURE.md). `npm run dev` → http://localhost:3000.

## Environment Variables

```
DATABASE_URL                  PostgreSQL connection string (required). postgresql:// is rewritten to postgresql+psycopg:// (only psycopg 3 is installed)
JWT_SECRET_KEY                Long random string for JWT signing (required)
HL_ENV                        mainnet | testnet (default mainnet). Must match NEXT_PUBLIC_HL_ENV — the copy flow refuses to start otherwise.
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
COPY_ENGINE_LOCK_FILE         Per-host copy-engine lock, default <tmp>/ravenx-copy-engine.lock (prod: /var/lib/ravenx/copy-engine.lock)
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
├── hl_env.py                 # HL_ENV → mainnet/testnet API URLs
├── seed_traders.py           # CLI: harvest + enrich wallets
├── models/
│   ├── user.py               # ParentWallet
│   ├── encrypted.py          # EncryptedText column type (Fernet) for agent keys
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
│   ├── copy_service.py       # Core algorithm (per-sub locked, delta-based, IOC limits)
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
7. Stop → sub marked inactive, any of this sub's open orders cancelled. **The agent is not auto-revoked** — the user can revoke it on HL.

## Copy Algorithm

**Entry invariant:** each increase places an IOC limit at a weighted-average price keeping the follower's total entry ≤ the target's (longs) or ≥ (shorts).

**Fills, not requests:** every order is IOC, and a sub's intended share records the size and average price HL reports as filled. Whatever didn't fill is re-ordered on the target's next fill. Nothing is left resting on the book, where it could fill later without being recorded.

**New only** (`copy_existing_mode: "none"`, the default): `/copy/start` stores the target's open coins and directions in `subscriptions.held_at_start`. The engine never opens those; a coin is released once the target closes or flips it. If HL can't be read at start, the copy is refused instead of starting without the list.

**Multi-copy:** one user can run N subscriptions on one HL account. Each sub owns an *intended share* per coin (`TrackedPosition`); orders are sized to that sub's delta, never to the account's actual position. Cancels filter by a per-sub cloid prefix, so one sub never touches another's orders.

**Decision tree per coin on fill:** stop-loss → close this sub's share · target closed → close · direction flip → close then open · reducing → reduce-only close of the surplus · held at start → skip · increasing at a favorable price → IOC limit · otherwise skip.

**Scaling:** `ideal_szi = my_equity × (target_szi / target_equity) × (scaling_pct / 100)`

**Concurrency:** a `threading.Lock` per subscription prevents double execution on rapid fills.

## Business Model

**Copying is free at launch** — `BUILDER_ADDRESS` is empty, so no fee is attached and users never see a fee signature. The user still wants to see usage (who copies which wallet, most-copied wallets): that's a query on `subscriptions`, disclosed on the privacy page.

The fee rail is kept, dormant: setting `BUILDER_ADDRESS` turns on a **0.03% builder fee per bot order**, collected by Hyperliquid and claimed like referral rewards. Competitors: Dextrabot 0.055%, Phantom 0.05%, Based 0.025%.

## Key Gotchas

- **Exactly one backend process, ever.** The copy engine runs inside the web process, so a second process copies every fill again (double positions, real money). Guards: `gunicorn.conf.py` refuses `workers > 1` and sets `preload_app = False`; `app._try_engine_lock` holds an exclusive flock so a second process on the host *waits* (it doesn't give up — on a graceful reload the new worker boots before the old exits). Run with `gunicorn -c gunicorn.conf.py "app:create_app()"`.
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
- **No Alembic yet.** `db.create_all()` creates missing tables only; columns added later go in `app._add_missing_columns()`, which runs `ALTER TABLE` on boot when they're missing.
- `risk_params` supports: `stop_loss_pct`, `max_drawdown_pct`, `max_position_usd`, `min_position_usd`, `price_tolerance_pct`, `copy_existing_mode`.

## Production

Self-hosted on a single VPS behind nginx — see [`deploy/README.md`](deploy/README.md) for the full runbook (systemd units, nginx config, backups, updates).

## Status

V2 is implemented and unit-tested, and runs locally against **mainnet** (`HL_ENV=mainnet`) with the leaderboard off. **The agent-approval flow has never run against real Hyperliquid** — no signature has been submitted from this code. An end-to-end test with a small funded account is the main outstanding risk before launch. Also open: `AGENT_KEY_GC_DAYS` isn't enforced.
