<p align="center">
  <img src="branding/ravenx-raven.svg" width="88" alt="RavenX logo" />
</p>

<h1 align="center">RavenX</h1>

<p align="center">Non-custodial copy trading for Hyperliquid — always at an entry price at least as good as the trader you copy.</p>

---

Paste any Hyperliquid wallet address, set your size and risk limits, and RavenX mirrors that wallet's perp trades from **your own Hyperliquid account**. Copying is free.

> **Status: beta.** The copy engine is unit-tested but has had limited live use. Start with a small amount you can afford to lose. Nothing here is financial advice.

## Why you can trust it

**RavenX never holds your funds and never sees your wallet's private key.**

You authorize a Hyperliquid **agent wallet**, a key that Hyperliquid lets place orders on your account but **cannot withdraw**. That restriction is enforced by Hyperliquid itself, not by RavenX's code, so it holds whatever this server runs. Only your own wallet can move funds. You can revoke the agent at any time from Hyperliquid's API settings.

This repository is the code RavenX runs, published so the claims above can be checked.

## How the copy algorithm works

- **Better-or-equal entry.** Every increase is placed as a limit order priced so that your weighted-average entry stays **≤ the target's for longs** and **≥ for shorts**. If the price never becomes favorable, no order is placed: the guarantee is never traded for speed. Any part that can't fill immediately is cancelled and retried on the target's next fill, so RavenX always knows exactly what you hold.
- **Proportional sizing.** `your size = your equity × (target size / target equity) × scaling %`.
- **Per-fill decisions.** On each target fill, per coin: stop-loss → close · target closed → close · direction flip → close then open · reducing → reduce-only close · increasing at a favorable price → limit order · otherwise skip.
- **New only, by default.** Positions the trader already held when you started copying are left alone; you copy what they open from then on.
- **Multiple copies per account.** Each copy tracks its own share of every position and only cancels orders it placed itself.

Details: [`ravenx-hl-backend/services/copy_service.py`](ravenx-hl-backend/services/copy_service.py).

## What RavenX stores

- Your wallet address (sign-in is a wallet signature; no email, no password).
- Your copy settings: which wallet you copy, scaling, risk limits.
- Agent private keys, **encrypted at rest** with a master key that lives outside the database ([`models/encrypted.py`](ravenx-hl-backend/models/encrypted.py)).
- Copy events and notifications.

This data is used to run the service and to look at usage in aggregate (for example, which wallets are copied most). It is not sold. See the in-app privacy page.

## Architecture

```
ravenx-frontend/     Next.js 16 · wagmi + Reown AppKit · TanStack Query · Tailwind v4
ravenx-hl-backend/   Python 3.12 · Flask · SQLAlchemy · APScheduler · hyperliquid-python-sdk
branding/            Logo assets + build-logo.js (regenerates them from one shape)
```

- **Auth:** EIP-191 wallet signature → JWT.
- **Trading:** a WebSocket daemon watches each copied wallet; on a fill, the copy engine signs orders with that user's agent key.
- **Trader pages** read Hyperliquid's public API directly, so any address works.

Deeper notes for contributors: [`ARCHITECTURE.md`](ARCHITECTURE.md) (backend) and [`ravenx-frontend/ARCHITECTURE.md`](ravenx-frontend/ARCHITECTURE.md).

## Run it locally

Requirements: Python 3.12, Node 20+, PostgreSQL (SQLite works for development).

```bash
# Backend
cd ravenx-hl-backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # set DATABASE_URL, JWT_SECRET_KEY, AGENT_KEY_ENCRYPTION_KEY
flask --app app run --port 5000

# Frontend (second terminal)
cd ravenx-frontend
cp .env.example .env.local   # set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
npm install
npm run dev                  # http://localhost:3000
```

Generate the agent-key master key with:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

`HL_ENV` / `NEXT_PUBLIC_HL_ENV` select Hyperliquid **mainnet** (real funds) or **testnet**, and must match.

### Self-hosting

[`deploy/README.md`](deploy/README.md) is the step-by-step runbook for a single VPS: nginx, systemd, PostgreSQL, HTTPS, backups. Run **exactly one** backend process; the copy engine lives inside it.

### Tests

```bash
cd ravenx-hl-backend && DISABLE_BACKGROUND_WORKERS=1 python -m pytest -q
cd ravenx-frontend && npm run test:run
```

## Security

Found a vulnerability? Please **don't open a public issue**. Report it privately through GitHub's **Security → Report a vulnerability** on this repository.

## License

[AGPL-3.0](LICENSE). You may use, modify and self-host RavenX; if you run a modified version as a public service, you must publish your changes under the same license.
