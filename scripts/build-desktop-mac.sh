#!/usr/bin/env bash
# Construit Hall.dmg pour macOS (sur une machine Mac) + copie vers landing/downloads/
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "$(uname)" != "Darwin" ]]; then
  echo "Le .dmg se construit sur macOS uniquement."
  exit 1
fi

if ! command -v python3 >/dev/null; then
  echo "Python 3 requis."
  exit 1
fi

export FORMA_PROD_BUILD=1
export CSC_IDENTITY_AUTO_DISCOVERY=false

# Universal (Intel + Apple Silicon) par défaut pour un seul lien de téléchargement.
# FORMA_MAC_ARCH=arm64|x64 pour un build mono-arch plus rapide.
MAC_ARCH="${FORMA_MAC_ARCH:-universal}"

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

echo "[4/5] Construction de l'app (${MAC_ARCH})…"
BUILD_ARGS=(--mac dir)
case "$MAC_ARCH" in
  universal) BUILD_ARGS+=(--universal) ;;
  arm64|x64) BUILD_ARGS+=(--"$MAC_ARCH") ;;
  *)
    echo "FORMA_MAC_ARCH invalide: $MAC_ARCH (universal|arm64|x64)"
    exit 1
    ;;
esac
(cd desktop && npx electron-builder "${BUILD_ARGS[@]}" --publish never)

echo ""
echo "→ Signature ad hoc macOS et création du .dmg…"
chmod +x scripts/fix-mac-app-sign.sh
./scripts/fix-mac-app-sign.sh

echo ""
echo "[5/5] Copie vers landing/downloads (nom stable Hall-mac.dmg)…"
chmod +x scripts/prepare-landing-downloads.sh
./scripts/prepare-landing-downloads.sh

echo ""
echo "Terminé."
echo "  DMG versionné : desktop/release/Hall-*.dmg"
echo "  Lien site     : landing/public/downloads/Hall-mac.dmg"
echo ""
echo "Publier sur Firebase Storage (téléchargement public) :"
echo "  ./scripts/upload-desktop-downloads.sh"
echo "URL : https://forma.app/downloads/Hall-mac.dmg"
