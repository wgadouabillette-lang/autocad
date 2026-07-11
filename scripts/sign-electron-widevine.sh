#!/usr/bin/env bash
# Signe le binaire Electron Castlabs (dev) avec Widevine VMP production via Castlabs EVS.
# Sans cette signature, Spotify coupe après ~1 s (playback_error DRM) — pas comme le web.
set -e
cd "$(dirname "$0")/.."

DIST="desktop/node_modules/electron/dist"
if [[ ! -d "$DIST" ]]; then
  echo "Electron absent. Lance : cd desktop && npm install"
  exit 1
fi

EVS_VENV=".venv-evs"
if [[ ! -x "$EVS_VENV/bin/python" ]]; then
  echo "→ Création venv EVS…"
  python3 -m venv "$EVS_VENV"
  "$EVS_VENV/bin/pip" install --upgrade pip castlabs-evs
fi

echo "→ Signature VMP de $DIST"
echo "  Compte EVS requis (gratuit) :"
echo "    $EVS_VENV/bin/python -m castlabs_evs.account signup"
echo ""
"$EVS_VENV/bin/python" -m castlabs_evs.vmp sign-pkg "$DIST"
echo ""
echo "OK. Relance Hall : ./scripts/desktop-dev.sh"
echo "La lecture Spotify Premium devrait rester dans l'app (comme le web)."
