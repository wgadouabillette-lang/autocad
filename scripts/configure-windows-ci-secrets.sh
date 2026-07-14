#!/usr/bin/env bash
# Configure les secrets GitHub pour le build Windows signé.
# Usage:
#   ./scripts/configure-windows-ci-secrets.sh <cert.pfx> <pfx-password> <evs-account> <evs-password>
set -euo pipefail

if [[ $# -lt 4 ]]; then
  echo "Usage: $0 <cert.pfx> <pfx-password> <evs-account-name> <evs-password>"
  echo ""
  echo "Exemple :"
  echo "  $0 ~/certs/hall-code-sign.pfx 'secret' my-evs-account 'evs-pass'"
  exit 1
fi

CERT_PATH="$1"
CSC_KEY_PASSWORD="$2"
EVS_ACCOUNT_NAME="$3"
EVS_PASSWD="$4"

if [[ ! -f "$CERT_PATH" ]]; then
  echo "Certificat introuvable : $CERT_PATH"
  exit 1
fi

WIN_CSC_LINK="$(base64 < "$CERT_PATH" | tr -d '\n')"

echo "→ Configuration des secrets GitHub…"
gh secret set WIN_CSC_LINK --body "$WIN_CSC_LINK"
gh secret set CSC_KEY_PASSWORD --body "$CSC_KEY_PASSWORD"
gh secret set EVS_ACCOUNT_NAME --body "$EVS_ACCOUNT_NAME"
gh secret set EVS_PASSWD --body "$EVS_PASSWD"

echo ""
echo "Secrets configurés. Lancez le build :"
echo "  gh workflow run \"Release Windows Desktop\""
