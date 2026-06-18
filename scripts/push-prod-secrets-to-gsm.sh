#!/usr/bin/env bash
# Push prod secrets to Google Secret Manager without keeping them in tracked files.
# One-time source: backend/.env and frontend/.env (gitignored), then optional scrub.
set -euo pipefail
cd "$(dirname "$0")/.."

SCRUB_LOCAL=0
if [[ "${1:-}" == "--scrub-local" ]]; then
  SCRUB_LOCAL=1
fi

if ! gcloud auth application-default print-access-token &>/dev/null; then
  echo "Connexion GCP requise :" >&2
  echo "  gcloud auth login" >&2
  echo "  gcloud auth application-default login" >&2
  exit 1
fi

PY="backend/.venv/bin/python"
SYNC="scripts/sync-env-to-secret-manager.py"
TMP_BACKEND=""
TMP_FRONTEND=""
cleanup() { rm -f "$TMP_BACKEND" "$TMP_FRONTEND"; }
trap cleanup EXIT

if [[ -f backend/.env ]]; then
  TMP_BACKEND="$(mktemp)"
  sed \
    -e 's|^FORMA_OAUTH_REDIRECT_BASE=.*|FORMA_OAUTH_REDIRECT_BASE=https://autocad-blue.vercel.app|' \
    -e 's|^FORMA_FRONTEND_ORIGIN=.*|FORMA_FRONTEND_ORIGIN=https://autocad-blue.vercel.app|' \
    -e 's|^FORMA_CORS=.*|FORMA_CORS=https://autocad-blue.vercel.app,http://localhost:5173,http://127.0.0.1:5173|' \
    backend/.env > "$TMP_BACKEND"
  "$PY" "$SYNC" --push --target backend --env-file "$TMP_BACKEND"
else
  echo "skip backend: backend/.env introuvable (déjà migré ?)" >&2
fi

if [[ -f frontend/.env ]]; then
  TMP_FRONTEND="$(mktemp)"
  cp frontend/.env "$TMP_FRONTEND"
  "$PY" "$SYNC" --push --target frontend --env-file "$TMP_FRONTEND"
else
  echo "skip frontend: frontend/.env introuvable" >&2
fi

if [[ "$SCRUB_LOCAL" -eq 1 ]]; then
  rm -f backend/.env frontend/.env
  echo "Local .env files removed. Runtime loads from Secret Manager."
fi

echo "Done. Secrets are in Google Secret Manager (forma-*-env)."
