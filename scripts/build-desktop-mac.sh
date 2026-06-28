#!/usr/bin/env bash
# Construit Hall.dmg pour macOS (sur une machine Mac)
set -e
cd "$(dirname "$0")/.."

if [[ "$(uname)" != "Darwin" ]]; then
  echo "Le .dmg se construit sur macOS uniquement."
  exit 1
fi

if ! command -v python3 >/dev/null; then
  echo "Python 3 requis."
  exit 1
fi

DESKTOP_NPM_CACHE="$(pwd)/desktop/.npm-cache"
DESKTOP_ELECTRON_CACHE="$(pwd)/desktop/.electron-cache"
mkdir -p "$DESKTOP_NPM_CACHE" "$DESKTOP_ELECTRON_CACHE"
export npm_config_cache="$DESKTOP_NPM_CACHE"
export ELECTRON_CACHE="$DESKTOP_ELECTRON_CACHE"

echo "[1/3] Installation Electron…"
(cd desktop && npm install --cache "$DESKTOP_NPM_CACHE")

echo "[2/4] Génération de l'icône…"
if [[ -x backend/.venv/bin/python ]]; then
  backend/.venv/bin/python scripts/generate-app-icon.py
else
  python3 scripts/generate-app-icon.py
fi

echo "[3/4] Préparation des ressources (frontend + backend + venv)…"
node scripts/prepare-desktop-resources.cjs

echo "[4/4] Construction de l'app + signature + .dmg…"
export CSC_IDENTITY_AUTO_DISCOVERY=false
(cd desktop && npx electron-builder --mac dir)

echo ""
echo "→ Signature macOS et création du .dmg signé…"
chmod +x scripts/fix-mac-app-sign.sh
./scripts/fix-mac-app-sign.sh

echo ""
echo "Terminé : desktop/release/Hall-*.dmg"
echo "Glissez Hall dans Applications, puis lancez depuis le Launchpad."
