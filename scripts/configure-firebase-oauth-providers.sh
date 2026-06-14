#!/usr/bin/env bash
# Active Microsoft et Apple dans Firebase Auth (Identity Platform API).
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

# --- Apple ---
APPLE_SERVICE_ID="${APPLE_OAUTH_SERVICE_ID:-${APPLE_OAUTH_CLIENT_ID:-}}"
APPLE_TEAM_ID="${APPLE_OAUTH_TEAM_ID:-}"
APPLE_KEY_ID="${APPLE_OAUTH_KEY_ID:-}"
APPLE_PRIVATE_KEY="${APPLE_OAUTH_PRIVATE_KEY:-}"

if idp_exists "apple.com"; then
  echo "✓ Apple (apple.com) — déjà configuré"
  if [[ -n "$APPLE_SERVICE_ID" && -n "$APPLE_TEAM_ID" && -n "$APPLE_KEY_ID" && -n "$APPLE_PRIVATE_KEY" ]]; then
    APPLE_BODY="$(python3 - <<PY
import json, os
print(json.dumps({
  "enabled": True,
  "clientId": os.environ["APPLE_SERVICE_ID"],
  "appleSignInConfig": {
    "teamId": os.environ["APPLE_TEAM_ID"],
    "keyId": os.environ["APPLE_KEY_ID"],
    "privateKey": os.environ["APPLE_PRIVATE_KEY"].replace("\\\\n", "\\n"),
  },
}))
PY
)"
    RESULT="$(patch_idp "apple.com" "$APPLE_BODY" "enabled,clientId,appleSignInConfig")"
    if echo "$RESULT" | grep -q '"error"'; then
      echo "  ⚠ Mise à jour Apple échouée : $RESULT"
    else
      echo "  ✓ Apple mis à jour (Service ID + clé OAuth web)"
    fi
  fi
else
  if [[ -n "$APPLE_SERVICE_ID" && -n "$APPLE_TEAM_ID" && -n "$APPLE_KEY_ID" && -n "$APPLE_PRIVATE_KEY" ]]; then
    APPLE_BODY="$(python3 - <<PY
import json, os
print(json.dumps({
  "name": f"projects/{os.environ['PROJECT_ID']}/defaultSupportedIdpConfigs/apple.com",
  "enabled": True,
  "clientId": os.environ["APPLE_SERVICE_ID"],
  "appleSignInConfig": {
    "teamId": os.environ["APPLE_TEAM_ID"],
    "keyId": os.environ["APPLE_KEY_ID"],
    "privateKey": os.environ["APPLE_PRIVATE_KEY"].replace("\\\\n", "\\n"),
  },
}))
PY
)"
  else
    APPLE_BODY="$(python3 - <<PY
import json, os
print(json.dumps({
  "name": f"projects/{os.environ['PROJECT_ID']}/defaultSupportedIdpConfigs/apple.com",
  "enabled": True,
}))
PY
)"
  fi
  RESULT="$(create_idp "apple.com" "$APPLE_BODY")"
  if echo "$RESULT" | grep -q '"error"'; then
    echo "✗ Apple : $RESULT"
  else
    echo "✓ Apple (apple.com) activé"
    if [[ -z "$APPLE_SERVICE_ID" ]]; then
      echo "  → Pour le web : définissez APPLE_OAUTH_SERVICE_ID, APPLE_OAUTH_TEAM_ID,"
      echo "    APPLE_OAUTH_KEY_ID, APPLE_OAUTH_PRIVATE_KEY puis relancez ce script."
    fi
  fi
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
