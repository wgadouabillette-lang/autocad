#!/usr/bin/env bash
# Lance Lyte en fenêtre bureau avec hot-reload (backend + Vite localhost)
set -e
cd "$(dirname "$0")/.."

if [[ ! -d backend/.venv ]]; then
  echo "Installation requise : ./setup.sh"
  exit 1
fi

cleanup() { kill 0 2>/dev/null; }
trap cleanup EXIT

DESKTOP_NPM_CACHE="$(pwd)/desktop/.npm-cache"
DESKTOP_ELECTRON_CACHE="$(pwd)/desktop/.electron-cache"
mkdir -p "$DESKTOP_NPM_CACHE" "$DESKTOP_ELECTRON_CACHE"
export npm_config_cache="$DESKTOP_NPM_CACHE"
export ELECTRON_CACHE="$DESKTOP_ELECTRON_CACHE"

if [[ ! -x desktop/node_modules/.bin/electron ]]; then
  echo "Installation Electron…"
  rm -rf desktop/node_modules
  (cd desktop && npm install --cache "$DESKTOP_NPM_CACHE")
fi

port_in_use() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

find_vite_port() {
  local port="${FORMA_VITE_PORT:-5173}"
  while port_in_use "$port"; do
    port=$((port + 1))
  done
  echo "$port"
}

VITE_PORT="$(find_vite_port)"

echo "Backend  → http://127.0.0.1:8000/docs"
export FORMA_SECRETS_PROJECT="${FORMA_SECRETS_PROJECT:-${FIREBASE_PROJECT_ID:-forma-cad-dev}}"
export FORMA_BILLING_TIMING=1
if [[ -f backend/.env ]]; then
  export FORMA_USE_LOCAL_ENV=1
fi
if port_in_use 8000; then
  echo "         (port 8000 occupé — redémarrage du backend pour recharger les secrets)"
  pkill -f "uvicorn app.main:app.*--port 8000" 2>/dev/null || true
  sleep 1
fi
# Secrets : Google Secret Manager (forma-backend-env). Repli local : FORMA_USE_LOCAL_ENV=1
(cd backend && source .venv/bin/activate && FORMA_DESKTOP=1 FORMA_BILLING_TIMING="${FORMA_BILLING_TIMING:-1}" FORMA_USE_LOCAL_ENV="${FORMA_USE_LOCAL_ENV:-}" FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-forma-cad-dev}" uvicorn app.main:app --reload --host 127.0.0.1 --port 8000) &

sleep 2
echo "Frontend → http://localhost:${VITE_PORT}"
(cd frontend && npm run dev -- --port "$VITE_PORT" --strictPort --host localhost) &

for _ in $(seq 1 60); do
  if curl -sf "http://localhost:${VITE_PORT}/" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

if ! curl -sf "http://localhost:${VITE_PORT}/" >/dev/null 2>&1; then
  echo "Erreur : Vite n'a pas démarré sur le port ${VITE_PORT}."
  exit 1
fi

echo "Ouverture de Lyte (fenêtre bureau)…"
# Ferme une ancienne fenêtre Electron (process principal non rechargé par Vite).
pkill -f "Electron.*forma-desktop" 2>/dev/null || true
pkill -f "electron.*desktop" 2>/dev/null || true
sleep 0.5
# Cursor/some shells set ELECTRON_RUN_AS_NODE=1 which breaks require("electron").
(cd desktop && env -u ELECTRON_RUN_AS_NODE FORMA_DEV_URL="http://localhost:${VITE_PORT}/app/" npm start)
