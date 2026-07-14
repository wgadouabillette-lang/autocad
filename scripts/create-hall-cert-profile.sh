#!/usr/bin/env bash
# Crée le profil certificat Hall après validation d'identité Azure approuvée.
# Usage: ./scripts/create-hall-cert-profile.sh <identity-validation-id>
set -euo pipefail

VALIDATION_ID="${1:-}"
if [[ -z "$VALIDATION_ID" ]]; then
  echo "Usage: $0 <identity-validation-id>"
  echo ""
  echo "Trouver l'ID : portail Azure → GB-studio → Identity validations → clic sur la validation → Identity validation Id"
  exit 1
fi

RG="trusted-signing-rg"
ACCOUNT="GB-studio"
PROFILE="hall-public"

az artifact-signing certificate-profile create \
  -g "$RG" \
  --account-name "$ACCOUNT" \
  -n "$PROFILE" \
  --profile-type PublicTrust \
  --identity-validation-id "$VALIDATION_ID"

echo ""
echo "Profil créé : $PROFILE"
echo "Lancez ensuite : gh workflow run \"Release Windows Desktop\""
