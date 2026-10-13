#!/usr/bin/env bash
# Pull the latest code from GitHub, rebuild, restart. Run on the server as root:
#   sudo /opt/ravenx/deploy/deploy.sh
set -euo pipefail

APP=/opt/ravenx
as_app() { sudo -u ravenx -H bash -c "$1"; }

echo "→ Pulling"
as_app "cd $APP && git pull --ff-only"

echo "→ Backend dependencies"
as_app "cd $APP/ravenx-hl-backend && venv/bin/pip install -q -r requirements.txt"

echo "→ Frontend build"
as_app "cd $APP/ravenx-frontend && npm ci --no-audit --no-fund && npm run build"

echo "→ Restarting"
systemctl restart ravenx-backend ravenx-frontend
sleep 5
systemctl --no-pager --lines=0 status ravenx-backend ravenx-frontend | grep -E "●|Active:"
curl -fsS http://127.0.0.1:5000/health && echo
echo "✓ Deployed $(as_app "cd $APP && git rev-parse --short HEAD")"
