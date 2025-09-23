#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/srv/clash-dual"
SRV_DIR="$APP_DIR/server"
CLI_DIR="$APP_DIR/client"
WEB_DIR="/var/www/clashdual"
SERVICE="clash-dual.service"
PORT="8081"

log(){ echo "[deploy] $*"; }

log "Pull latest..."
cd "$APP_DIR"
git fetch --all
git reset --hard origin/main

# (опционально) если хочешь хранить юнит в репо: ops/clash-dual.service
if [ -f "$APP_DIR/ops/clash-dual.service" ]; then
  log "Install systemd unit from repo..."
  sudo install -m 0644 "$APP_DIR/ops/clash-dual.service" "/etc/systemd/system/$SERVICE"
fi

log "Server build..."
cd "$SRV_DIR"
npm ci || npm i
npm run build

log "Restart systemd..."
sudo systemctl daemon-reload
sudo systemctl restart "$SERVICE"

log "Health-check :$PORT ..."
# ждём до 20 сек, пока порт начнёт слушаться
for i in {1..40}; do
  if ss -ltnH "sport = :$PORT" | grep -q ":$PORT"; then
    log "OK, port $PORT is listening."
    break
  fi
  sleep 0.5
  if [ "$i" -eq 40 ]; then
    echo "[deploy] ERROR: service didn't open port :$PORT in time" >&2
    sudo journalctl -u "$SERVICE" -n 80 --no-pager || true
    exit 1
  fi
done

# --- фронт (без sudo; сделай владельцем каталог один раз: sudo chown -R $USER:$USER /var/www/clashdual)
if [ -f "$CLI_DIR/package.json" ]; then
  log "Client build..."
  cd "$CLI_DIR"
  npm ci || npm i
  npm run build
  mkdir -p "$WEB_DIR"
  rsync -a --delete "$CLI_DIR/dist/" "$WEB_DIR/"
  log "Client synced -> $WEB_DIR"
fi

log "Done."
