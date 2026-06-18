#!/usr/bin/env bash
# Copy backend secrets from Google Secret Manager into Vercel Environment Variables.
# Vercel serverless cannot read GSM at runtime — secrets must live in Vercel settings.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="${FORMA_SECRETS_PROJECT:-forma-cad-dev}"
SECRET="${FORMA_BACKEND_SECRET_ID:-forma-backend-env}"
VERCEL_ENV="${VERCEL_TARGET_ENV:-production}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI required." >&2
  exit 1
fi
if ! command -v vercel >/dev/null 2>&1 && ! command -v npx >/dev/null 2>&1; then
  echo "vercel CLI required: npm i -g vercel && vercel login" >&2
  exit 1
fi

VERCEL=(vercel)
if ! command -v vercel >/dev/null 2>&1; then
  VERCEL=(npx vercel)
fi

TMP="$(mktemp)"
cleanup() { rm -f "$TMP"; }
trap cleanup EXIT

echo "Pulling projects/${PROJECT}/secrets/${SECRET} ..."
gcloud secrets versions access latest --secret="$SECRET" --project="$PROJECT" >"$TMP"

added=0
skipped=0
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%%$'\r'}"
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  if [[ ! "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
    continue
  fi
  key="${BASH_REMATCH[1]}"
  value="${BASH_REMATCH[2]}"
  # Skip commented-out placeholders in the bundle
  [[ -z "$value" ]] && continue
  # GSM is for local/Cloud Functions only on Vercel
  [[ "$key" == "FORMA_SECRETS_REQUIRED" ]] && continue

  if printf '%s' "$value" | "${VERCEL[@]}" env add "$key" "$VERCEL_ENV" --force >/dev/null 2>&1; then
    echo "  + $key"
    added=$((added + 1))
  else
    echo "  ~ $key (update manually in Vercel dashboard if --force failed)"
    skipped=$((skipped + 1))
  fi
done <"$TMP"

cat <<EOF

Done ($added vars pushed, $skipped need manual check).

Also add Firebase Admin for Firestore (connector tokens):
  Vercel → Settings → Environment Variables → FIREBASE_SERVICE_ACCOUNT_JSON
  = full JSON from Firebase Console → Project settings → Service accounts → Generate key

Then redeploy: vercel --prod
EOF
