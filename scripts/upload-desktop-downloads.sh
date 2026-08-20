#!/usr/bin/env bash
# Publie les installateurs desktop + le feed auto-update sur Firebase Storage.
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

upload_update_file() {
  local src="$1"
  local name="$2"
  if [[ ! -f "$src" ]]; then
    return 1
  fi
  local content_type="application/octet-stream"
  local cache="public, max-age=3600"
  case "$name" in
    *.yml|*.yaml)
      content_type="text/yaml; charset=utf-8"
      cache="public, max-age=60"
      ;;
  esac
  echo "Upload feed $name → gs://${BUCKET}/desktop-updates/${name}"
  gcloud storage cp "$src" "gs://${BUCKET}/desktop-updates/${name}" \
    --content-type="$content_type" \
    --cache-control="$cache"
  echo "  https://meetra.cc/desktop-updates/${name}"
  return 0
}

upload_update_feed() {
  local dir="$1"
  [[ -d "$dir" ]] || return 0
  local f base uploaded=0
  shopt -s nullglob
  for f in "$dir"/latest.yml "$dir"/latest-mac.yml "$dir"/latest-linux.yml; do
    if [[ -f "$f" ]]; then
      upload_update_file "$f" "$(basename "$f")"
      uploaded=1
    fi
  done
  for f in "$dir"/*.exe "$dir"/*.zip "$dir"/*.AppImage "$dir"/*.blockmap; do
    [[ -f "$f" ]] || continue
    base="$(basename "$f")"
    case "$base" in
      *uninstaller*|*Uninstall*|*uninstall*) continue ;;
    esac
    upload_update_file "$f" "$base"
    uploaded=1
  done
  shopt -u nullglob
  return 0
}

find_and_upload_feed() {
  local start="$1"
  [[ -e "$start" ]] || return 0
  local dir
  if [[ -d "$start" ]]; then
    dir="$(cd "$start" && pwd)"
  else
    dir="$(cd "$(dirname "$start")" && pwd)"
  fi
  local i
  for i in 1 2 3 4 5 6 7 8; do
    if [[ -f "$dir/latest.yml" || -f "$dir/latest-mac.yml" || -f "$dir/latest-linux.yml" ]]; then
      upload_update_feed "$dir"
      return 0
    fi
    if [[ -f "$dir/desktop/release/latest.yml" || -f "$dir/desktop/release/latest-mac.yml" || -f "$dir/desktop/release/latest-linux.yml" ]]; then
      upload_update_feed "$dir/desktop/release"
      return 0
    fi
    if [[ "$dir" == "/" ]]; then
      break
    fi
    dir="$(dirname "$dir")"
  done
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

echo ""
echo "Feed auto-update…"
find_and_upload_feed "desktop/release"
find_and_upload_feed "$MAC_SRC"
find_and_upload_feed "$WIN_SRC"
find_and_upload_feed "$LINUX_SRC"

if [[ "$uploaded" -eq 0 ]]; then
  echo "Aucun installateur trouvé."
  echo "Placez Hall-mac.dmg / Hall.exe / Hall-linux.AppImage dans landing/public/downloads/"
  echo "ou passez les chemins : $0 <mac.dmg> <win.exe> <linux.AppImage>"
  exit 1
fi
