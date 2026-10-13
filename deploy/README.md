# Deploying RavenX to a VPS (ravenx.app)

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
| `cloudflare-ips.sh` | once after enabling the Cloudflare proxy, then monthly cron |

> **Never run more than one backend process.** The copy engine lives inside it: a second
> process would copy every fill again, doubling users' positions with real money.
> `gunicorn.conf.py` refuses `workers > 1`, and a file lock stops a second engine on the
> same host, but don't fight them: no `-w 4`, no extra `flask run` on the server.

---

## 0. Before you start

You need:
- An account with a VPS provider.
- Access to the DNS settings for `ravenx.app`, wherever you bought it.
- A password manager, for the secrets generated below.
- An SSH key. Create one on your own computer if you don't have one:
  ```bash
  ssh-keygen -t ed25519 -f ~/.ssh/ravenx-vps -C ravenx
  cat ~/.ssh/ravenx-vps.pub            # used in step 1
  ```

## 1. Create the server

Any provider works. Order a VPS with:
- **Virtualization:** KVM (a full VM). Avoid OpenVZ/LXC containers.
- **Image:** Ubuntu 26.04 LTS. The commands below assume it (Node 22 and PostgreSQL 18 come from Ubuntu's own packages).
- **Size:** x86, **2 vCPU / 4 GB RAM** or more. Plenty while the leaderboard is off; less RAM makes the frontend build struggle.
- **Location:** anywhere in or near the EU.
- **Networking:** a public IPv4 (IPv6 optional).
- **SSH key:** add `ravenx-vps.pub` if the provider's panel accepts one. If it only gives you a
  root password, install the key yourself:
  ```bash
  ssh-copy-id -i ~/.ssh/ravenx-vps.pub root@<SERVER_IPV4>
  ```
- **Firewall:** if the provider offers one, allow inbound **TCP 22, 80, 443** only. Step 3 sets
  up the same rules on the server either way.
- **Backups:** enable server backups or snapshots if offered. Without them, nothing is copied
  off the machine (see step 11).
- **Name:** `ravenx-1`

Note the server's IPv4 (and IPv6, if any) address.

## 2. Point the domain at it

At your DNS provider:

| Type | Name | Value |
|---|---|---|
| A | `@` (ravenx.app) | server IPv4 |
| AAAA | `@` | server IPv6 |
| A | `www` | server IPv4 |
| AAAA | `www` | server IPv6 |

Skip the AAAA records if the server has no IPv6.

If the DNS is on Cloudflare, set these records to **DNS only** (grey cloud) for now, so the
certificate step works. Check propagation from your computer: `dig +short ravenx.app`
should print the server IP.

## 3. First login and base setup

```bash
ssh -i ~/.ssh/ravenx-vps root@<SERVER_IPV4>
```

Once key login works, turn off password logins for SSH:

```bash
printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\n' > /etc/ssh/sshd_config.d/00-keys-only.conf
sshd -t && systemctl reload ssh
```

Keep this session open and check that a new `ssh -i ~/.ssh/ravenx-vps root@<SERVER_IPV4>`
still gets in before logging out.

Then, on the server:

```bash
apt update && apt -y full-upgrade
apt -y install git nginx postgresql nodejs npm certbot python3-certbot-nginx \
               unattended-upgrades ufw curl ca-certificates
dpkg-reconfigure -f noninteractive unattended-upgrades      # automatic security updates
node --version                                               # v22.x

# Python 3.12 for the backend (Ubuntu 26.04 ships 3.14, which the backend isn't tested on).
# Installed under /opt, not a home directory: the backend service runs with ProtectHome.
curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 sh
UV_PYTHON_INSTALL_DIR=/opt/uv/python uv python install 3.12
chmod -R a+rX /opt/uv

# Host firewall (in addition to any provider firewall)
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
sudo -u ravenx env UV_PYTHON_INSTALL_DIR=/opt/uv/python uv venv --seed --python 3.12 --managed-python venv
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

### Cloudflare proxy (optional)

If the DNS is on Cloudflare, you can now turn the proxy on:

1. In Cloudflare, set both A records to **Proxied** (orange cloud).
2. Set **SSL/TLS → Overview** to **Full (strict)**. Never use *Flexible*: it sends traffic
   to the server unencrypted, and nginx's HTTPS redirect makes it loop.
3. On the server:
   ```bash
   /opt/ravenx/deploy/cloudflare-ips.sh
   echo '30 4 1 * * root /opt/ravenx/deploy/cloudflare-ips.sh 2>&1 | logger -t cloudflare-ips' \
       > /etc/cron.d/ravenx-cloudflare
   ```

Behind the proxy, every request reaches nginx from a Cloudflare address. The script makes
nginx take the visitor's real IP from Cloudflare's `CF-Connecting-IP` header, so the API rate
limit is per visitor. Without it, everyone arriving through the same Cloudflare server shares
one limit. It also limits ports 80 and 443 to Cloudflare's IP ranges, so the server can't be
reached directly by its IP. SSH stays open. The cron job reruns it monthly to pick up changes
to Cloudflare's ranges. Certificate renewals keep working through the proxy.

**Turning the proxy off later** makes the site unreachable until the web ports are reopened:

```bash
rm /etc/cron.d/ravenx-cloudflare /etc/nginx/conf.d/cloudflare-realip.conf
ufw allow 80/tcp && ufw allow 443/tcp
ufw show added | grep "comment 'cloudflare'" | sed 's/^ufw allow/ufw delete allow/; s/ comment .*//' | sh
systemctl reload nginx
```

## 10. Allow the domain in Reown (WalletConnect)

Go to **cloud.reown.com → your project → Domain / Allowlist** and add `https://ravenx.app`.
Without this, wallet connection fails in production.

## 11. Nightly database backups

```bash
echo '15 3 * * * root /opt/ravenx/deploy/backup-db.sh' > /etc/cron.d/ravenx-backup
/opt/ravenx/deploy/backup-db.sh && ls -lh /var/backups/ravenx/      # test it once
```

Dumps are kept for 14 days, **on the same disk**. If the server dies, they go with it, so you
also need an off-machine copy: the provider's server backups (step 1), or a regular pull to your
own computer:

```bash
rsync -a -e "ssh -i ~/.ssh/ravenx-vps" root@<SERVER_IPV4>:/var/backups/ravenx/ ~/ravenx-backups/
```

Dumps hold agent keys encrypted, never the `AGENT_KEY_ENCRYPTION_KEY`. Never store that key
alongside them.

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
