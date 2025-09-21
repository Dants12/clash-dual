#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/srv/clash-dual"
SRV_DIR="$APP_DIR/server"
CLI_DIR="$APP_DIR/client"

echo "[deploy] Pull latest..."
cd "$APP_DIR"
git fetch --all
git reset --hard origin/main

echo "[deploy] Server build..."
cd "$SRV_DIR"
npm ci || npm i
npm run build

echo "[deploy] Restart systemd..."
sudo systemctl daemon-reload
sudo systemctl restart clash-dual.service

# === Автодеплой фронта ===
if [ -d "$CLI_DIR" ] && [ -f "$CLI_DIR/package.json" ]; then
  echo "[deploy] Client build..."
  cd "$CLI_DIR"
  npm ci || npm i
  npm run build
  sudo mkdir -p /var/www/clashdual
  sudo rsync -a --delete "$CLI_DIR/dist/" /var/www/clashdual/
fi

echo "[deploy] Done."
