#!/usr/bin/env bash
# Crée les produits/prix Stripe (Pro + usage à la demande) pour Hall.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
PYTHON="$BACKEND/.venv/bin/python"

if [[ ! -x "$PYTHON" ]]; then
  echo "Environnement Python introuvable. Lancez d'abord ./setup.sh ou setup.bat." >&2
  exit 1
fi

if [[ -f "$BACKEND/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$BACKEND/.env"
  set +a
fi

exec "$PYTHON" "$ROOT/scripts/setup-stripe.py" "$@"
