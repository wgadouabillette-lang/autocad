#!/usr/bin/env bash
# Publie les installateurs desktop sur Firebase Storage (lecture publique).
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT_ID="${FIREBASE_PROJECT_ID:-forma-cad-dev}"
BUCKET="${FIREBASE_STORAGE_BUCKET:-forma-cad-dev.firebasestorage.app}"
MAC_SRC="${1:-landing/public/downloads/Hall-mac.dmg}"
if [[ -n "${2:-}" ]]; then
  WIN_SRC="$2"
elif [[ -f landing/public/downloads/Hall.exe ]]; then
  WIN_SRC="landing/public/downloads/Hall.exe"
else
  WIN_SRC="landing/public/downloads/Hall-windows.exe"
fi
LINUX_SRC="${3:-landing/public/downloads/Hall-linux.AppImage}"

upload_one() {
  local src="$1"
  local name="$2"
  local download_name="${3:-$name}"
  if [[ ! -f "$src" ]]; then
    echo "$name → fichier introuvable ($src), ignoré"
    return 1
  fi
  echo "Upload $name → gs://${BUCKET}/downloads/${name}"
  gcloud storage cp "$src" "gs://${BUCKET}/downloads/${name}" \
    --content-type="application/octet-stream" \
    --cache-control="public, max-age=3600"
  gcloud storage objects update "gs://${BUCKET}/downloads/${name}" \
    --content-disposition="attachment; filename=\"${download_name}\""
  echo "  https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/downloads%2F${name}?alt=media"
  return 0
}

echo "Déploiement des règles Storage…"
firebase deploy --only storage --project "$PROJECT_ID"

echo ""
uploaded=0
if upload_one "$MAC_SRC" "Hall-mac.dmg"; then
  uploaded=1
fi
if upload_one "$WIN_SRC" "Hall.exe"; then
  uploaded=1
  upload_one "$WIN_SRC" "Hall-windows.exe" "Hall.exe" || true
fi
if upload_one "$LINUX_SRC" "Hall-linux.AppImage"; then
  uploaded=1
fi

if [[ "$uploaded" -eq 0 ]]; then
  echo "Aucun installateur trouvé."
  echo "Placez Hall-mac.dmg / Hall.exe / Hall-linux.AppImage dans landing/public/downloads/"
  echo "ou passez les chemins : $0 <mac.dmg> <win.exe> <linux.AppImage>"
  exit 1
fi
