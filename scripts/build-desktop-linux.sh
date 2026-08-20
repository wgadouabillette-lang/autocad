#!/usr/bin/env bash
# Construit Hall-linux.AppImage (sur une machine Linux) + copie vers landing/downloads/
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "L'AppImage se construit sur Linux uniquement (venv Python embarqué)."
  exit 1
fi

if ! command -v python3 >/dev/null; then
  echo "Python 3 requis."
  exit 1
fi

export FORMA_PROD_BUILD=1

DESKTOP_NPM_CACHE="$(pwd)/desktop/.npm-cache"
DESKTOP_ELECTRON_CACHE="$(pwd)/desktop/.electron-cache"
mkdir -p "$DESKTOP_NPM_CACHE" "$DESKTOP_ELECTRON_CACHE"
export npm_config_cache="$DESKTOP_NPM_CACHE"
export ELECTRON_CACHE="$DESKTOP_ELECTRON_CACHE"

echo "[1/5] Installation Electron…"
(cd desktop && npm install --cache "$DESKTOP_NPM_CACHE")

echo "[2/5] Génération de l'icône…"
if [[ -x backend/.venv/bin/python ]]; then
  backend/.venv/bin/python scripts/generate-app-icon.py
else
  python3 scripts/generate-app-icon.py
fi

echo "[3/5] Préparation des ressources (frontend + backend + venv)…"
node scripts/prepare-desktop-resources.cjs

echo "[4/5] Construction de l'AppImage…"
(cd desktop && npx electron-builder --linux AppImage --publish never)

echo "[5/5] Copie vers landing/downloads (nom stable Hall-linux.AppImage)…"
mkdir -p landing/public/downloads landing/downloads
APPIMAGE="$(ls -1t desktop/release/Meetra-*-linux.AppImage desktop/release/Hall-*-linux.AppImage desktop/release/*.AppImage 2>/dev/null | head -1 || true)"
if [[ -z "$APPIMAGE" || ! -f "$APPIMAGE" ]]; then
  echo "AppImage introuvable dans desktop/release/"
  exit 1
fi
cp -f "$APPIMAGE" landing/public/downloads/Hall-linux.AppImage
cp -f "$APPIMAGE" landing/downloads/Hall-linux.AppImage 2>/dev/null || true
chmod +x landing/public/downloads/Hall-linux.AppImage

echo ""
echo "OK → landing/public/downloads/Hall-linux.AppImage"
echo "Publier : ./scripts/upload-desktop-downloads.sh"
echo "Dev local : ./scripts/desktop-dev.sh"
