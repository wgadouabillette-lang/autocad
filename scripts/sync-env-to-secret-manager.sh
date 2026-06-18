#!/usr/bin/env bash
# Push ou pull les bundles .env ↔ Google Secret Manager
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -d backend/.venv ]]; then
  echo "Créez l'environnement Python : ./setup.sh" >&2
  exit 1
fi

export FORMA_SECRETS_PROJECT="${FORMA_SECRETS_PROJECT:-${FIREBASE_PROJECT_ID:-forma-cad-dev}}"

backend/.venv/bin/pip install -q google-cloud-secret-manager python-dotenv 2>/dev/null || true
backend/.venv/bin/python scripts/sync-env-to-secret-manager.py "$@"
