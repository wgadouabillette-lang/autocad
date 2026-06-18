#!/usr/bin/env bash
# Active Microsoft et Facebook dans Firebase Auth (Identity Platform API).
# Google + email/password restent gérés via firebase.json → firebase deploy --only auth
set -euo pipefail

PROJECT_ID="${FIREBASE_PROJECT_ID:-forma-cad-dev}"
API_BASE="https://identitytoolkit.googleapis.com/admin/v2"
TOKEN_FILE="${HOME}/.config/configstore/firebase-tools.json"

if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "Connexion Firebase requise : npx -y firebase-tools@latest login"
  exit 1
fi

ACCESS_TOKEN="$(python3 - <<'PY'
import json, os
path = os.path.expanduser("~/.config/configstore/firebase-tools.json")
data = json.load(open(path))
print(data.get("tokens", {}).get("access_token", ""))
PY
)"

if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "Token Firebase introuvable. Relancez : npx -y firebase-tools@latest login"
  exit 1
fi

idp_exists() {
  local idp_id="$1"
  local code
  code="$(curl -sS -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    "${API_BASE}/projects/${PROJECT_ID}/defaultSupportedIdpConfigs/${idp_id}")"
  [[ "$code" == "200" ]]
}

create_idp() {
  local idp_id="$1"
  local body="$2"
  curl -sS -X POST \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    "${API_BASE}/projects/${PROJECT_ID}/defaultSupportedIdpConfigs?idpId=${idp_id}" \
    -d "$body"
}

patch_idp() {
  local idp_id="$1"
  local body="$2"
  local mask="$3"
  curl -sS -X PATCH \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    "${API_BASE}/projects/${PROJECT_ID}/defaultSupportedIdpConfigs/${idp_id}?updateMask=${mask}" \
    -d "$body"
}

echo "Projet Firebase : ${PROJECT_ID}"
echo ""

# --- Facebook ---
FACEBOOK_APP_ID="${FACEBOOK_OAUTH_APP_ID:-${FACEBOOK_APP_ID:-}}"
FACEBOOK_APP_SECRET="${FACEBOOK_OAUTH_APP_SECRET:-${FACEBOOK_APP_SECRET:-}}"

if [[ -z "$FACEBOOK_APP_ID" || -z "$FACEBOOK_APP_SECRET" ]]; then
  echo "○ Facebook — en attente de credentials Meta"
  echo "  1. https://developers.facebook.com/apps/ → Create App"
  echo "  2. Facebook Login → Settings → Valid OAuth Redirect URIs :"
  echo "     https://${PROJECT_ID}.firebaseapp.com/__/auth/handler"
  echo "  3. Puis :"
  echo "     export FACEBOOK_OAUTH_APP_ID='…'"
  echo "     export FACEBOOK_OAUTH_APP_SECRET='…'"
  echo "     ./scripts/configure-firebase-oauth-providers.sh"
else
  FB_BODY="$(python3 - <<PY
import json, os
print(json.dumps({
  "name": f"projects/{os.environ['PROJECT_ID']}/defaultSupportedIdpConfigs/facebook.com",
  "enabled": True,
  "clientId": os.environ["FACEBOOK_APP_ID"],
  "clientSecret": os.environ["FACEBOOK_APP_SECRET"],
}))
PY
)"
  if idp_exists "facebook.com"; then
    PATCH_BODY="$(python3 - <<PY
import json, os
print(json.dumps({
  "enabled": True,
  "clientId": os.environ["FACEBOOK_APP_ID"],
  "clientSecret": os.environ["FACEBOOK_APP_SECRET"],
}))
PY
)"
    RESULT="$(patch_idp "facebook.com" "$PATCH_BODY" "enabled,clientId,clientSecret")"
    ACTION="mis à jour"
  else
    RESULT="$(create_idp "facebook.com" "$FB_BODY")"
    ACTION="activé"
  fi
  if echo "$RESULT" | grep -q '"error"'; then
    echo "✗ Facebook : $RESULT"
    exit 1
  fi
  echo "✓ Facebook (facebook.com) ${ACTION}"
fi

echo ""

# --- Apple (legacy — désactivé côté app, laisser tel quel si déjà configuré) ---
if idp_exists "apple.com"; then
  echo "○ Apple (apple.com) — encore présent dans Firebase, remplacé par Facebook dans l'app"
fi

echo ""

# --- Microsoft ---
MICROSOFT_CLIENT_ID="${MICROSOFT_OAUTH_CLIENT_ID:-}"
MICROSOFT_CLIENT_SECRET="${MICROSOFT_OAUTH_CLIENT_SECRET:-}"

if [[ -z "$MICROSOFT_CLIENT_ID" || -z "$MICROSOFT_CLIENT_SECRET" ]]; then
  echo "○ Microsoft — en attente de credentials Azure AD"
  echo "  1. https://portal.azure.com → App registrations → New registration"
  echo "  2. Redirect URI (Web) : https://${PROJECT_ID}.firebaseapp.com/__/auth/handler"
  echo "  3. Créez un Client secret, puis :"
  echo "     export MICROSOFT_OAUTH_CLIENT_ID='…'"
  echo "     export MICROSOFT_OAUTH_CLIENT_SECRET='…'"
  echo "     ./scripts/configure-firebase-oauth-providers.sh"
else
  MS_BODY="$(python3 - <<PY
import json, os
print(json.dumps({
  "name": f"projects/{os.environ['PROJECT_ID']}/defaultSupportedIdpConfigs/microsoft.com",
  "enabled": True,
  "clientId": os.environ["MICROSOFT_CLIENT_ID"],
  "clientSecret": os.environ["MICROSOFT_CLIENT_SECRET"],
}))
PY
)"
  if idp_exists "microsoft.com"; then
    PATCH_BODY="$(python3 - <<PY
import json, os
print(json.dumps({
  "enabled": True,
  "clientId": os.environ["MICROSOFT_CLIENT_ID"],
  "clientSecret": os.environ["MICROSOFT_CLIENT_SECRET"],
}))
PY
)"
    RESULT="$(patch_idp "microsoft.com" "$PATCH_BODY" "enabled,clientId,clientSecret")"
    ACTION="mis à jour"
  else
    RESULT="$(create_idp "microsoft.com" "$MS_BODY")"
    ACTION="activé"
  fi
  if echo "$RESULT" | grep -q '"error"'; then
    echo "✗ Microsoft : $RESULT"
    exit 1
  fi
  echo "✓ Microsoft (microsoft.com) ${ACTION}"
fi

echo ""
echo "Providers actifs :"
export LIST_JSON
LIST_JSON="$(curl -sS -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  "${API_BASE}/projects/${PROJECT_ID}/defaultSupportedIdpConfigs")"
python3 - <<'PY'
import json, os
data = json.loads(os.environ["LIST_JSON"])
for item in data.get("defaultSupportedIdpConfigs", []):
    name = item.get("name", "").rsplit("/", 1)[-1]
    status = "on" if item.get("enabled") else "off"
    print(f"  - {name}: {status}")
PY
