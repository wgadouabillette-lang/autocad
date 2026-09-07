#!/usr/bin/env bash
# Construit Meetra.dmg pour macOS — signe Developer ID + notarise si ~/.meetra/apple-notarize.env est présent.
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

NOTARY_ENV="${MEETRA_APPLE_ENV:-$HOME/.meetra/apple-notarize.env}"
USE_NOTARY=0
if [[ -f "$NOTARY_ENV" ]]; then
  # shellcheck disable=SC1090
  source "$NOTARY_ENV"
  USE_NOTARY=1
  echo "→ Notarize env: $NOTARY_ENV"
else
  echo "→ Pas de $NOTARY_ENV — build ad hoc (Gatekeeper bloquera les autres Mac)."
  export CSC_IDENTITY_AUTO_DISCOVERY=false
fi

# Universal (Intel + Apple Silicon) par défaut.
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

DIR_ARGS=(--mac dir)
DMG_ARGS=(--mac dmg zip)
case "$MAC_ARCH" in
  universal)
    DIR_ARGS+=(--universal)
    DMG_ARGS+=(--universal)
    ;;
  arm64|x64)
    DIR_ARGS+=(--"$MAC_ARCH")
    DMG_ARGS+=(--"$MAC_ARCH")
    ;;
  *)
    echo "FORMA_MAC_ARCH invalide: $MAC_ARCH (universal|arm64|x64)"
    exit 1
    ;;
esac

if [[ "$USE_NOTARY" -eq 1 ]]; then
  echo "[4/5] Construction + Developer ID + notarize (${MAC_ARCH})…"
  (cd desktop && npx electron-builder "${DMG_ARGS[@]}" --publish never)
else
  echo "[4/5] Construction ad hoc (${MAC_ARCH})…"
  (cd desktop && npx electron-builder "${DIR_ARGS[@]}" --publish never)
  chmod +x scripts/fix-mac-app-sign.sh
  ./scripts/fix-mac-app-sign.sh
fi

echo ""
echo "[5/5] Copie vers landing/downloads…"
chmod +x scripts/prepare-landing-downloads.sh
./scripts/prepare-landing-downloads.sh

echo ""
echo "Terminé."
echo "  DMG : desktop/release/Meetra-*.dmg"
echo "  Lien site : landing/public/downloads/Hall-mac.dmg"
if [[ "$USE_NOTARY" -eq 1 ]]; then
  # Prefer the DMG matching package.json version (avoid stapling an older leftover).
  PKG_VER="$(node -p "require('./desktop/package.json').version" 2>/dev/null || true)"
  DMG=""
  if [[ -n "$PKG_VER" && -f "desktop/release/Meetra-${PKG_VER}-mac.dmg" ]]; then
    DMG="desktop/release/Meetra-${PKG_VER}-mac.dmg"
  else
    DMG="$(ls -t desktop/release/Meetra-*-mac.dmg 2>/dev/null | head -1 || true)"
  fi
  if [[ -n "$DMG" ]]; then
    echo ""
    echo "→ Notarize + staple du .dmg ($DMG)…"
    xcrun notarytool submit "$DMG" \
      --key "$APPLE_API_KEY" \
      --key-id "$APPLE_API_KEY_ID" \
      --issuer "$APPLE_API_ISSUER" \
      --wait
    xcrun stapler staple "$DMG"
    xcrun stapler validate "$DMG"
    echo ""
    echo "Vérifier l'app :"
    echo "  spctl -a -vv desktop/release/mac-universal/Meetra.app"
  fi
fi
echo ""
echo "Publier : ./scripts/upload-desktop-downloads.sh"
