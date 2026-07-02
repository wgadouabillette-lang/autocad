#!/usr/bin/env bash
# Active Facebook Login dans Firebase Auth (projet forma-cad-dev).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OAUTH_ENV="${ROOT}/oauth.env"

if [[ -f "$OAUTH_ENV" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$OAUTH_ENV"
  set +a
  echo "Credentials chargés depuis oauth.env"
else
  echo "Astuce : copiez oauth.env.example → oauth.env pour ne pas exporter les secrets à la main."
fi

echo ""
exec "${ROOT}/scripts/configure-firebase-oauth-providers.sh"
