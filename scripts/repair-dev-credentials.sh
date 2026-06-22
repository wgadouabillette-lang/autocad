#!/usr/bin/env bash
# Répare l'environnement dev local quand Secret Manager / Firestore ne répondent plus.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="${FORMA_SECRETS_PROJECT:-forma-cad-dev}"
ADC_FILE="${HOME}/.config/gcloud/application_default_credentials.json"

echo "== Lyte dev credentials repair =="
echo ""

# 1. Frontend .env depuis GSM (gcloud user auth — pas besoin d'ADC)
if command -v gcloud >/dev/null 2>&1; then
  if gcloud secrets versions access latest \
    --secret=forma-frontend-env \
    --project="$PROJECT" \
    > frontend/.env 2>/dev/null; then
    echo "✓ frontend/.env restauré depuis forma-frontend-env"
  else
    echo "⚠ Impossible de lire forma-frontend-env (gcloud auth login ?)"
  fi
else
  echo "⚠ gcloud absent — installez Google Cloud SDK"
fi

# 2. Backend : FORMA_USE_LOCAL_ENV=1
if [[ -f backend/.env ]]; then
  if grep -q '^FORMA_USE_LOCAL_ENV=1' backend/.env; then
    echo "✓ backend/.env utilise déjà FORMA_USE_LOCAL_ENV=1"
  else
    echo "FORMA_USE_LOCAL_ENV=1" >> backend/.env
    echo "✓ FORMA_USE_LOCAL_ENV=1 ajouté à backend/.env"
  fi
else
  echo "⚠ backend/.env absent — copiez backend/.env.example"
fi

# 3. ADC (Firestore Admin + billing webhooks locaux)
echo ""
if [[ -f "$ADC_FILE" ]]; then
  echo "✓ Application Default Credentials présents"
else
  echo "✗ ADC manquants — Firestore Admin ne fonctionne pas côté backend"
  echo ""
  echo "  Lancez UNE FOIS (ouvre le navigateur) :"
  echo "    gcloud auth application-default login --project=$PROJECT"
  echo ""
  echo "  Puis redémarrez le backend :"
  echo "    cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000"
fi

# 4. Diagnostic rapide
echo ""
if [[ -d backend/.venv ]]; then
  backend/.venv/bin/python - <<'PY' 2>/dev/null || true
import os
os.environ.setdefault("FORMA_USE_LOCAL_ENV", "1")
from app.core.firebase import firestore_available
from app.connectors.registry import connector_configured
print("Firestore Admin :", "OK" if firestore_available() else "INDISPONIBLE")
for c in ("calendar", "gmail", "outlook", "spotify"):
    print(f"  connecteur {c} :", "configuré" if connector_configured(c) else "clés manquantes")
PY
fi

echo ""
echo "Terminé."
