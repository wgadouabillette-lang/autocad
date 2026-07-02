#!/usr/bin/env bash
# Déploie landing/ sur Firebase Hosting (auth + téléchargements).
# Pour forma.app sur Netlify : netlify login && ./scripts/deploy-landing.sh
set -e
cd "$(dirname "$0")/.."

if [[ -d desktop/release ]]; then
  ./scripts/prepare-landing-downloads.sh || true
fi

# nav.js / footer.js live in landing/; public/ copies stay aligned for Vite.
cp landing/nav.js landing/public/nav.js
cp landing/footer.js landing/public/footer.js

if [[ "${SKIP_LANDING_PREVIEW_SYNC:-}" != "1" ]]; then
  ./scripts/sync-landing-dashboard-preview.sh
fi

echo "Déploiement Firebase Hosting (landing/)…"
firebase deploy --only hosting --message "Hall landing $(date +%Y-%m-%d)"
