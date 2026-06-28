#!/usr/bin/env bash
# Signature ad hoc + DMG reconstruit avec l'app signée (évite « fichier endommagé »).
set -euo pipefail
cd "$(dirname "$0")/.."

APP="$(find desktop/release -maxdepth 2 -name 'Hall.app' -type d | head -1)"
if [[ -z "$APP" ]]; then
  echo "Hall.app introuvable dans desktop/release/"
  exit 1
fi

echo "→ Nettoyage attributs étendus…"
xattr -cr "$APP"

sign_if_macho() {
  local file="$1"
  if file "$file" | grep -q "Mach-O"; then
    codesign --force --sign - --timestamp=none "$file" 2>/dev/null || true
  fi
}

echo "→ Signature ad hoc des binaires…"
while IFS= read -r -d '' bin; do
  sign_if_macho "$bin"
done < <(find "$APP/Contents/MacOS" "$APP/Contents/Frameworks" -type f -print0 2>/dev/null)

sign_if_macho "$APP/Contents/MacOS/Hall"
codesign --force --sign - --timestamp=none "$APP"

echo "→ Vérification…"
codesign --verify --verbose=0 "$APP"

PACKAGED_DIR="$(dirname "$APP")"
REL_PACKAGED="${PACKAGED_DIR#desktop/}"
echo "→ Reconstruction du .dmg avec l'app signée…"
rm -f desktop/release/*.dmg desktop/release/*.blockmap
export CSC_IDENTITY_AUTO_DISCOVERY=false
(cd desktop && npx electron-builder --mac dmg --prepackaged "$REL_PACKAGED")

DMG="$(find desktop/release -maxdepth 1 -name '*.dmg' -type f -print -quit)"
if [[ -n "$DMG" ]]; then
  xattr -cr "$DMG"
  echo "→ DMG final: $DMG"
fi

echo "✓ Application prête à distribuer."
