# Deploying RavenX to a Hetzner VPS (ravenx.app)

One small server runs everything:

```
Internet ──HTTPS──▶ nginx ──┬── /api/*  ──▶ gunicorn :5000  (Flask API + copy engine, ONE process)
                            └── /*      ──▶ Next.js  :3000
                                    PostgreSQL (local) · nightly pg_dump · systemd restarts
```

Files in this folder:

| File | Goes to |
|---|---|
| `systemd/ravenx-backend.service` | `/etc/systemd/system/` |
| `systemd/ravenx-frontend.service` | `/etc/systemd/system/` |
| `nginx/ravenx.app.conf` | `/etc/nginx/sites-available/ravenx.app` |
| `deploy.sh` | run on the server for every update |
| `backup-db.sh` | nightly cron |

> **Never run more than one backend process.** The copy engine lives inside it: a second
> process would copy every fill again, doubling users' positions with real money.
> `gunicorn.conf.py` refuses `workers > 1`, and a file lock stops a second engine on the
> same host, but don't fight them: no `-w 4`, no extra `flask run` on the server.

---

## 0. Before you start

You need:
- A Hetzner Cloud account.
- Access to the DNS settings for `ravenx.app`, wherever you bought it.
- A password manager, for the secrets generated below.
- An SSH key. Create one on your own computer if you don't have one:
  ```bash
  ssh-keygen -t ed25519 -f ~/.ssh/ravenx-hetzner -C ravenx
  cat ~/.ssh/ravenx-hetzner.pub        # paste this into Hetzner in step 1
  ```

## 1. Create the server (Hetzner Cloud Console)

**Add Server**:
- **Location:** any EU site (Falkenstein, Nuremberg, Helsinki).
- **Image:** Ubuntu 24.04.
- **Type:** shared vCPU x86, **2 vCPU / 4 GB RAM** (CX22 or its current equivalent). Plenty while the leaderboard is off.
- **Networking:** public IPv4 + IPv6.
- **SSH keys:** add `ravenx-hetzner.pub`. Password login is then disabled.
- **Firewalls:** create one allowing inbound **TCP 22, 80, 443** only.
- **Backups:** enable them. It costs about 20% extra and gives daily whole-server snapshots.
- **Name:** `ravenx-1`

Note the server's IPv4 and IPv6 addresses.

## 2. Point the domain at it

At your DNS provider:

| Type | Name | Value |
|---|---|---|
| A | `@` (ravenx.app) | server IPv4 |
| AAAA | `@` | server IPv6 |
| A | `www` | server IPv4 |
| AAAA | `www` | server IPv6 |

If the DNS is on Cloudflare, set these records to **DNS only** (grey cloud) for now, so the
certificate step works. Check propagation from your computer: `dig +short ravenx.app`
should print the server IP.

## 3. First login and base setup

```bash
ssh -i ~/.ssh/ravenx-hetzner root@<SERVER_IPV4>
```

Then, on the server:

```bash
apt update && apt -y full-upgrade
apt -y install git nginx postgresql python3.12-venv python3-pip certbot python3-certbot-nginx \
               unattended-upgrades ufw curl ca-certificates
dpkg-reconfigure -f noninteractive unattended-upgrades      # automatic security updates

# Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt -y install nodejs
node --version                                               # v22.x

# Host firewall (in addition to Hetzner's)
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable

# Service user that owns the app; no login shell
useradd --system --create-home --home-dir /home/ravenx --shell /usr/sbin/nologin ravenx
```

## 4. PostgreSQL

```bash
DB_PASS=$(openssl rand -hex 24); echo "DB password: $DB_PASS"   # save it in your password manager
sudo -u postgres psql -c "CREATE USER ravenx WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -c "CREATE DATABASE ravenx OWNER ravenx;"
```

Tables are created automatically the first time the backend starts.

## 5. Get the code

The repo is public, so no token is needed:

```bash
git clone https://github.com/yvnis777/ravenx.git /opt/ravenx
chown -R ravenx:ravenx /opt/ravenx
```

## 6. Backend

```bash
cd /opt/ravenx/ravenx-hl-backend
sudo -u ravenx python3.12 -m venv venv
sudo -u ravenx venv/bin/pip install -r requirements.txt
```

Generate the secrets. **Save all three in your password manager now.**

```bash
openssl rand -hex 32                                          # → JWT_SECRET_KEY
venv/bin/python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
                                                              # → AGENT_KEY_ENCRYPTION_KEY
```

> **The `AGENT_KEY_ENCRYPTION_KEY` is critical.** If you lose it, every user's copy stops
> working and they all have to re-approve. If it leaks along with a database backup, agent
> keys are exposed. Keep it in your password manager, never next to the backups.

Create the environment file. systemd reads it as root, so it can be private:

```bash
mkdir -p /etc/ravenx
cat > /etc/ravenx/backend.env <<'ENV'
DATABASE_URL=postgresql://ravenx:<DB_PASS>@localhost:5432/ravenx
JWT_SECRET_KEY=<JWT_SECRET_KEY>
AGENT_KEY_ENCRYPTION_KEY=<AGENT_KEY_ENCRYPTION_KEY>
HL_ENV=mainnet
BUILDER_ADDRESS=
BUILDER_FEE_TENTHS_BPS=30
ENABLE_LEADERBOARD=
CORS_ORIGINS=https://ravenx.app
ENV
nano /etc/ravenx/backend.env          # replace the three <...> placeholders
chmod 600 /etc/ravenx/backend.env
```

## 7. Frontend

```bash
cd /opt/ravenx/ravenx-frontend
sudo -u ravenx tee .env.production >/dev/null <<'ENV'
NEXT_PUBLIC_API_URL=https://ravenx.app/api
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<your Reown project ID>
NEXT_PUBLIC_HL_ENV=mainnet
NEXT_PUBLIC_BUILDER_ADDRESS=
NEXT_PUBLIC_BUILDER_FEE_TENTHS_BPS=30
NEXT_PUBLIC_ENABLE_LEADERBOARD=
ENV
sudo -u ravenx nano .env.production   # fill in the Reown project ID
sudo -u ravenx npm ci --no-audit --no-fund
sudo -u ravenx npm run build
```

`NEXT_PUBLIC_*` values are baked in at build time, so change them only together with a rebuild (`deploy.sh` does that).

## 8. Start the services

```bash
cp /opt/ravenx/deploy/systemd/ravenx-*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now ravenx-backend ravenx-frontend

curl -s http://127.0.0.1:5000/health        # {"hl_env":"mainnet","status":"ok"}
curl -sI http://127.0.0.1:3000 | head -1    # HTTP/1.1 200 OK
journalctl -u ravenx-backend -n 20 --no-pager
```

The backend log should show `Hyperliquid network: MAINNET` and `Leaderboard disabled`, and
**no** "Copy engine lock … is held by another process" warning.

## 9. nginx and HTTPS

```bash
cp /opt/ravenx/deploy/nginx/ravenx.app.conf /etc/nginx/sites-available/ravenx.app
ln -s /etc/nginx/sites-available/ravenx.app /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

certbot --nginx -d ravenx.app -d www.ravenx.app --redirect -m <your email> --agree-tos -n
```

Certbot adds HTTPS and renews the certificate automatically. Check:
`curl -s https://ravenx.app/api/health` should return the health JSON.

## 10. Allow the domain in Reown (WalletConnect)

Go to **cloud.reown.com → your project → Domain / Allowlist** and add `https://ravenx.app`.
Without this, wallet connection fails in production.

## 11. Nightly database backups

```bash
echo '15 3 * * * root /opt/ravenx/deploy/backup-db.sh' > /etc/cron.d/ravenx-backup
/opt/ravenx/deploy/backup-db.sh && ls -lh /var/backups/ravenx/      # test it once
```

Dumps are kept for 14 days. Hetzner's server backups (step 1) cover off-machine copies.

## 12. Uptime alerts

Create a free monitor (UptimeRobot or similar):
- **Type:** HTTPS
- **URL:** `https://ravenx.app/api/health`
- **Interval:** 5 minutes
- **Alert:** your email or phone

If the backend is down, copies are being missed, so you want to know quickly.

## 13. Final check

- [ ] `https://ravenx.app` loads, with the padlock and the raven favicon.
- [ ] Connect wallet → sign in works.
- [ ] Paste a wallet → the trader page shows positions, PnL chart and stats.
- [ ] `systemctl status ravenx-backend ravenx-frontend` shows both active.

Then run the **real-money end-to-end test**: a separate wallet holding $50–100, copying a
wallet that trades often in small sizes, with a low `max_position_usd`.

---

## Updating

1. Get the change into the GitHub repo (copy into `ravenx-public`, commit, push).
2. On the server: `sudo /opt/ravenx/deploy/deploy.sh`

`deploy.sh` pulls, installs dependencies, rebuilds the frontend and restarts both services.
The backend is stopped fully before the new one starts, so there are a few seconds without a
copy engine. Deploy when the copied wallets are quiet.

## Troubleshooting

```bash
journalctl -u ravenx-backend -f          # live backend logs (copy decisions, errors)
journalctl -u ravenx-frontend -f
systemctl restart ravenx-backend
tail -f /var/log/nginx/error.log
sudo -u postgres psql ravenx             # inspect the DB
```

Copy activity (who copies which wallet):

```sql
SELECT target_address, count(*) AS followers
FROM subscriptions WHERE is_active GROUP BY 1 ORDER BY 2 DESC;
```
