#!/usr/bin/env bash
# Ajoute les domaines OAuth requis pour Lyte (auth bureau + web).
set -euo pipefail

PROJECT_ID="${FIREBASE_PROJECT_ID:-forma-cad-dev}"
DOMAINS=(
  "localhost"
  "127.0.0.1"
  "forma-cad-dev.web.app"
  "forma-cad-dev.firebaseapp.com"
  "forma.app"
  "autocad-blue.vercel.app"
)

echo "Projet Firebase : $PROJECT_ID"
echo "Domaines à autoriser : ${DOMAINS[*]}"
echo ""
echo "Ouvrez cette page et ajoutez les domaines manquants :"
echo "https://console.firebase.google.com/project/${PROJECT_ID}/authentication/settings"
echo ""
echo "Cliquez « Add domain » pour chaque domaine absent de la liste."
echo ""
echo "Sans cela, Google/Microsoft/Facebook renvoient auth/unauthorized-domain."

if command -v open >/dev/null 2>&1; then
  open "https://console.firebase.google.com/project/${PROJECT_ID}/authentication/settings"
fi
