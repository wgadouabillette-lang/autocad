#!/usr/bin/env bash
# Signature ad hoc + DMG reconstruit avec l'app signée (évite « fichier endommagé »).
set -euo pipefail
cd "$(dirname "$0")/.."

APP=""
for candidate in \
  desktop/release/mac-universal/Meetra.app \
  desktop/release/mac/Meetra.app \
  desktop/release/mac-arm64/Meetra.app \
  desktop/release/mac-x64/Meetra.app \
  desktop/release/mac-universal/Hall.app \
  desktop/release/mac/Hall.app
do
  if [[ -d "$candidate" ]]; then
    APP="$candidate"
    break
  fi
done
if [[ -z "$APP" ]]; then
  APP="$(find desktop/release -maxdepth 2 \( -name 'Meetra.app' -o -name 'Hall.app' \) -type d | head -1)"
fi
if [[ -z "$APP" ]]; then
  echo "Meetra.app introuvable dans desktop/release/"
  exit 1
fi

echo "→ App: $APP"
echo "→ Nettoyage attributs étendus…"
xattr -cr "$APP"

sign_if_macho() {
  local file="$1"
  if file "$file" | grep -q "Mach-O"; then
    codesign --force --sign - --timestamp=none "$file" >/dev/null || true
  fi
}

echo "→ Signature ad hoc des binaires (frameworks)…"
while IFS= read -r -d '' bin; do
  sign_if_macho "$bin"
done < <(find "$APP/Contents/Frameworks" -type f -print0 2>/dev/null)

echo "→ Signature ad hoc des frameworks…"
while IFS= read -r -d '' fw; do
  codesign --force --sign - --timestamp=none "$fw"
done < <(find "$APP/Contents/Frameworks" -name '*.framework' -maxdepth 1 -print0)

echo "→ Signature ad hoc des helpers…"
while IFS= read -r -d '' helper; do
  codesign --force --sign - --timestamp=none "$helper"
done < <(find "$APP/Contents/Frameworks" -name '*.app' -maxdepth 1 -print0)

echo "→ Signature ad hoc de l'app…"
codesign --force --sign - --timestamp=none "$APP"

echo "→ Vérification…"
codesign --verify --verbose=0 "$APP"

REL_APP="${APP#desktop/}"
echo "→ Reconstruction du .dmg / .zip avec l'app signée…"
rm -f desktop/release/*.dmg desktop/release/*.blockmap desktop/release/*.zip
export CSC_IDENTITY_AUTO_DISCOVERY=false
(cd desktop && npx electron-builder --mac dmg zip --prepackaged "$REL_APP" --publish never)

DMG="$(find desktop/release -maxdepth 1 -name '*.dmg' -type f -print -quit)"
if [[ -n "$DMG" ]]; then
  xattr -cr "$DMG"
  echo "→ DMG final: $DMG"
fi

echo "✓ Application prête à distribuer."
