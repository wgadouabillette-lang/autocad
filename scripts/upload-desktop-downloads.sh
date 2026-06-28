#!/usr/bin/env bash
# Publie les installateurs desktop sur Firebase Storage (lecture publique).
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT_ID="${FIREBASE_PROJECT_ID:-forma-cad-dev}"
BUCKET="${FIREBASE_STORAGE_BUCKET:-forma-cad-dev.firebasestorage.app}"
MAC_SRC="${1:-landing/public/downloads/Hall-mac.dmg}"
WIN_SRC="${2:-landing/public/downloads/Hall-windows.exe}"

if [[ ! -f "$MAC_SRC" ]]; then
  echo "Fichier macOS introuvable : $MAC_SRC"
  echo "Lancez d'abord : ./scripts/prepare-landing-downloads.sh"
  exit 1
fi

echo "Déploiement des règles Storage…"
firebase deploy --only storage --project "$PROJECT_ID"

echo ""
echo "Upload macOS → gs://${BUCKET}/downloads/Hall-mac.dmg"
gsutil cp "$MAC_SRC" "gs://${BUCKET}/downloads/Hall-mac.dmg"
gsutil acl ch -u AllUsers:R "gs://${BUCKET}/downloads/Hall-mac.dmg" 2>/dev/null || true

PUBLIC_MAC="https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/downloads%2FHall-mac.dmg?alt=media"

if [[ -f "$WIN_SRC" ]]; then
  echo "Upload Windows → gs://${BUCKET}/downloads/Hall-windows.exe"
  gsutil cp "$WIN_SRC" "gs://${BUCKET}/downloads/Hall-windows.exe"
  gsutil acl ch -u AllUsers:R "gs://${BUCKET}/downloads/Hall-windows.exe" 2>/dev/null || true
  PUBLIC_WIN="https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/downloads%2FHall-windows.exe?alt=media"
else
  echo "Windows → aucun .exe (ignoré)"
  PUBLIC_WIN=""
fi

echo ""
echo "URLs publiques :"
echo "  macOS   : $PUBLIC_MAC"
if [[ -n "$PUBLIC_WIN" ]]; then
  echo "  Windows : $PUBLIC_WIN"
fi
