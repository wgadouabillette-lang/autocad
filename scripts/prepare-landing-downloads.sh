#!/usr/bin/env bash
# Copie les installateurs construits vers landing/downloads/ avec des noms stables pour le site.
set -e
cd "$(dirname "$0")/.."

RELEASE_DIR="desktop/release"
OUT_DIR="landing/downloads"
MAC_OUT="$OUT_DIR/Lyte-mac.dmg"
WIN_OUT="$OUT_DIR/Lyte-windows.exe"

if [[ ! -d "$RELEASE_DIR" ]]; then
  echo "Dossier $RELEASE_DIR introuvable."
  echo "Construisez d'abord les installateurs :"
  echo "  macOS  → ./scripts/build-desktop-mac.sh"
  echo "  Windows → scripts/build-desktop-win.bat (sur Windows)"
  exit 1
fi

mkdir -p "$OUT_DIR"

MAC_SRC="$(find "$RELEASE_DIR" -maxdepth 1 -name '*.dmg' -type f | head -1)"
WIN_SRC="$(find "$RELEASE_DIR" -maxdepth 1 -name '*.exe' -type f | head -1)"

if [[ -z "$MAC_SRC" && -z "$WIN_SRC" ]]; then
  echo "Aucun .dmg ni .exe trouvé dans $RELEASE_DIR"
  exit 1
fi

if [[ -n "$MAC_SRC" ]]; then
  cp "$MAC_SRC" "$MAC_OUT"
  if [[ "$(uname)" == "Darwin" ]]; then
    xattr -cr "$MAC_OUT" 2>/dev/null || true
  fi
  echo "macOS  → $MAC_OUT  (depuis $(basename "$MAC_SRC"))"
else
  echo "macOS  → aucun .dmg trouvé (ignoré)"
fi

if [[ -n "$WIN_SRC" ]]; then
  cp "$WIN_SRC" "$WIN_OUT"
  echo "Windows → $WIN_OUT (depuis $(basename "$WIN_SRC"))"
else
  echo "Windows → aucun .exe trouvé (ignoré)"
fi

echo ""
echo "Déployez le dossier landing/ sur votre hébergeur (Netlify, Vercel, S3, nginx…)."
echo "URL de téléchargement :"
echo "  https://votre-domaine.com/downloads/Lyte-mac.dmg"
echo "  https://votre-domaine.com/downloads/Lyte-windows.exe"
