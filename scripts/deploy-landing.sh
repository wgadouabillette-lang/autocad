#!/usr/bin/env bash
# Déploie landing/ sur Firebase Hosting (auth + téléchargements).
# Pour forma.app sur Netlify : netlify login && ./scripts/deploy-landing.sh
set -e
cd "$(dirname "$0")/.."

if [[ -d desktop/release ]]; then
  ./scripts/prepare-landing-downloads.sh || true
fi

# nav.js lives in public/ for Vite; copy for hosts that serve landing/ directly.
cp landing/public/nav.js landing/nav.js

if [[ "${SKIP_LANDING_PREVIEW_SYNC:-}" != "1" ]]; then
  ./scripts/sync-landing-dashboard-preview.sh
fi

echo "Déploiement Firebase Hosting (landing/)…"
firebase deploy --only hosting --message "Lyte landing $(date +%Y-%m-%d)"
