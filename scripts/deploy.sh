#!/usr/bin/env bash
set -euo pipefail

run_sudo() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif [ -n "${SUDO_PASSWORD-}" ]; then
    printf '%s\n' "$SUDO_PASSWORD" | sudo -S -p '' "$@"
  else
    sudo "$@"
  fi
}

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
run_sudo systemctl daemon-reload
run_sudo systemctl restart clash-dual.service

# === Автодеплой фронта ===
if [ -d "$CLI_DIR" ] && [ -f "$CLI_DIR/package.json" ]; then
  echo "[deploy] Client build..."
  cd "$CLI_DIR"
  npm ci || npm i
  npm run build
  run_sudo mkdir -p /var/www/clashdual
  run_sudo rsync -a --delete "$CLI_DIR/dist/" /var/www/clashdual/
fi

echo "[deploy] Done."
