#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/srv/clash-dual"
SRV_DIR="$APP_DIR/server"
CLI_DIR="$APP_DIR/client"

require_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return
  fi

  if ! command -v sudo >/dev/null 2>&1; then
    echo "[deploy] Error: sudo is required to run '$*'" >&2
    return 1
  fi

  if sudo -n true >/dev/null 2>&1; then
    sudo "$@"
    return
  fi

  if [ -n "${SUDO_PASSWORD:-}" ]; then
    printf '%s\n' "$SUDO_PASSWORD" | sudo -S "$@"
    return
  fi

  echo "[deploy] Error: sudo password required for '$*'. Set SUDO_PASSWORD env var." >&2
  return 1
}

echo "[deploy] Pull latest..."
cd "$APP_DIR"
git fetch --all
git reset --hard origin/main

echo "[deploy] Server build..."
cd "$SRV_DIR"
npm ci || npm i
npm run build

echo "[deploy] Restart systemd..."
require_root systemctl daemon-reload
require_root systemctl restart clash-dual.service

# === Автодеплой фронта ===
if [ -d "$CLI_DIR" ] && [ -f "$CLI_DIR/package.json" ]; then
  echo "[deploy] Client build..."
  cd "$CLI_DIR"
  npm ci || npm i
  npm run build
  require_root mkdir -p /var/www/clashdual
  require_root rsync -a --delete "$CLI_DIR/dist/" /var/www/clashdual/
fi

echo "[deploy] Done."
