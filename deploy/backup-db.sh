#!/usr/bin/env bash
# Nightly PostgreSQL dump, kept 14 days. Installed by the setup guide as a cron job:
#   15 3 * * * root /opt/ravenx/deploy/backup-db.sh
# The dump contains *encrypted* agent keys. The master key (AGENT_KEY_ENCRYPTION_KEY)
# must NOT be stored next to these files — keep it in your password manager.
set -euo pipefail

DIR=/var/backups/ravenx
mkdir -p "$DIR"
chmod 700 "$DIR"
sudo -u postgres pg_dump -Fc ravenx > "$DIR/ravenx-$(date +%F).dump"
find "$DIR" -name 'ravenx-*.dump' -mtime +14 -delete
