#!/usr/bin/env bash
# Configure Azure Trusted Signing + GitHub Actions pour Hall Windows.
# Prérequis : az login (ce script lance la connexion si besoin).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v az >/dev/null; then
  echo "Azure CLI requis. macOS : brew install azure-cli"
  exit 1
fi
if ! command -v gh >/dev/null; then
  echo "GitHub CLI requis : brew install gh"
  exit 1
fi

echo "=== Azure Trusted Signing — configuration Hall ==="
echo ""

if ! az account show >/dev/null 2>&1; then
  echo "→ Connexion Azure (navigateur)…"
  az login
fi

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
TENANT_ID="$(az account show --query tenantId -o tsv)"
echo "Subscription : $SUBSCRIPTION_ID"
echo "Tenant ID    : $TENANT_ID"
echo ""

read -r -p "Resource group [hall-codesign]: " RG
RG="${RG:-hall-codesign}"
read -r -p "Région Azure [eastus]: " LOCATION
LOCATION="${LOCATION:-eastus}"
read -r -p "Artifact Signing account name [hall-signing]: " SIGN_ACCOUNT
SIGN_ACCOUNT="${SIGN_ACCOUNT:-hall-signing}"
read -r -p "Certificate profile name [hall-public]: " CERT_PROFILE
CERT_PROFILE="${CERT_PROFILE:-hall-public}"
read -r -p "Publisher name (nom légal, = CN du certificat) : " PUBLISHER
if [[ -z "$PUBLISHER" ]]; then
  echo "Le publisher name est obligatoire (identique à la validation d'identité Azure)."
  exit 1
fi
read -r -p "App registration name [hall-codesign-github]: " APP_NAME
APP_NAME="${APP_NAME:-hall-codesign-github}"

case "$LOCATION" in
  eastus) ENDPOINT="https://eus.codesigning.azure.net/" ;;
  westus) ENDPOINT="https://wus.codesigning.azure.net/" ;;
  westus2) ENDPOINT="https://wus2.codesigning.azure.net/" ;;
  centralus) ENDPOINT="https://cus.codesigning.azure.net/" ;;
  northcentralus) ENDPOINT="https://ncus.codesigning.azure.net/" ;;
  westcentralus) ENDPOINT="https://wcus.codesigning.azure.net/" ;;
  southcentralus) ENDPOINT="https://scus.codesigning.azure.net/" ;;
  canadacentral) ENDPOINT="https://cca.codesigning.azure.net/" ;;
  canadaeast) ENDPOINT="https://cce.codesigning.azure.net/" ;;
  northeurope) ENDPOINT="https://neu.codesigning.azure.net/" ;;
  westeurope) ENDPOINT="https://weu.codesigning.azure.net/" ;;
  *)
    echo "Région non mappée automatiquement. Entrez l'endpoint Artifact Signing :"
    read -r ENDPOINT
    ;;
esac

echo ""
echo "→ Enregistrement du provider Microsoft.CodeSigning…"
az provider register --namespace Microsoft.CodeSigning --wait

echo "→ Resource group…"
az group create --name "$RG" --location "$LOCATION" >/dev/null

echo "→ Artifact Signing account…"
if az artifact-signing show -g "$RG" -n "$SIGN_ACCOUNT" >/dev/null 2>&1; then
  echo "  Compte existant : $SIGN_ACCOUNT"
else
  az artifact-signing create -g "$RG" -n "$SIGN_ACCOUNT" -l "$LOCATION" --sku Basic
fi

ACCOUNT_ID="$(az artifact-signing show -g "$RG" -n "$SIGN_ACCOUNT" --query id -o tsv)"
echo "  Account ID : $ACCOUNT_ID"

echo ""
echo "=== Étape manuelle obligatoire (portail Azure) ==="
echo "1. https://portal.azure.com → Artifact Signing → $SIGN_ACCOUNT"
echo "2. Access control (IAM) → vous ajouter le rôle « Artifact Signing Identity Verifier »"
echo "3. Identity validations → New → Individual → Public"
echo "   (email = celui de votre compte Microsoft)"
echo "4. Compléter la vérification (pièce d'identité + facture + Authenticator)"
echo "5. Une fois « Approved », revenez ici et appuyez Entrée"
read -r -p "Validation d'identité approuvée ? [Entrée pour continuer]"

echo "→ Identity validations…"
VALIDATION_ID="$(az rest --method get \
  --url "https://management.azure.com${ACCOUNT_ID}/certificateProfiles?api-version=2024-09-30-preview" \
  2>/dev/null | true)"

# List identity validations via portal API is awkward; ask user for ID if CLI can't list.
if az extension show --name artifact-signing >/dev/null 2>&1; then
  :
fi

echo ""
echo "Si le profil certificat n'existe pas encore, entrez l'Identity Validation ID"
echo "(UUID visible dans Identity validations du portail) :"
read -r -p "Identity validation ID : " VALIDATION_ID
if [[ -z "$VALIDATION_ID" ]]; then
  echo "Identity validation ID requis pour créer le profil certificat."
  exit 1
fi

echo "→ Certificate profile…"
if az artifact-signing certificate-profile show -g "$RG" --account-name "$SIGN_ACCOUNT" -n "$CERT_PROFILE" >/dev/null 2>&1; then
  echo "  Profil existant : $CERT_PROFILE"
else
  az artifact-signing certificate-profile create \
    -g "$RG" \
    --account-name "$SIGN_ACCOUNT" \
    -n "$CERT_PROFILE" \
    --profile-type PublicTrust \
    --identity-validation-id "$VALIDATION_ID"
fi

echo "→ App registration…"
APP_ID="$(az ad app list --display-name "$APP_NAME" --query "[0].appId" -o tsv 2>/dev/null || true)"
if [[ -z "$APP_ID" || "$APP_ID" == "null" ]]; then
  APP_ID="$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)"
  SP_ID="$(az ad sp create --id "$APP_ID" --query id -o tsv)"
  echo "  App créée : $APP_ID"
else
  echo "  App existante : $APP_ID"
  SP_ID="$(az ad sp list --filter "appId eq '$APP_ID'" --query "[0].id" -o tsv)"
fi

echo "→ Rôle « Artifact Signing Certificate Profile Signer »…"
SIGNER_ROLE="$(az role definition list --name "Artifact Signing Certificate Profile Signer" --query "[0].id" -o tsv)"
az role assignment create \
  --assignee "$SP_ID" \
  --role "$SIGNER_ROLE" \
  --scope "$ACCOUNT_ID" \
  >/dev/null 2>&1 || echo "  (rôle déjà assigné ou en attente de propagation)"

echo "→ Client secret (valable 24 mois)…"
SECRET_JSON="$(az ad app credential reset --id "$APP_ID" --display-name "GitHub Actions" --years 2)"
CLIENT_SECRET="$(echo "$SECRET_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['password'])")"

echo ""
echo "→ Secrets / variables GitHub…"
gh secret set AZURE_TENANT_ID --body "$TENANT_ID"
gh secret set AZURE_CLIENT_ID --body "$APP_ID"
gh secret set AZURE_CLIENT_SECRET --body "$CLIENT_SECRET"
gh variable set AZURE_CODESIGN_ENDPOINT --body "$ENDPOINT"
gh variable set AZURE_CODESIGN_CERT_PROFILE --body "$CERT_PROFILE"
gh variable set AZURE_CODESIGN_ACCOUNT --body "$SIGN_ACCOUNT"
gh variable set AZURE_CODESIGN_PUBLISHER --body "$PUBLISHER"

echo ""
echo "=== Configuration terminée ==="
echo ""
echo "Variables repo :"
echo "  AZURE_CODESIGN_ENDPOINT      = $ENDPOINT"
echo "  AZURE_CODESIGN_CERT_PROFILE  = $CERT_PROFILE"
echo "  AZURE_CODESIGN_ACCOUNT       = $SIGN_ACCOUNT"
echo "  AZURE_CODESIGN_PUBLISHER     = $PUBLISHER"
echo ""
echo "Secrets (configurés) : AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET"
echo ""
echo "N'oubliez pas aussi EVS (Widevine) :"
echo "  gh secret set EVS_ACCOUNT_NAME --body 'Willgb'"
echo "  gh secret set EVS_PASSWD --body '<mot de passe EVS>'"
echo ""
echo "Lancer le build Windows :"
echo "  gh workflow run \"Release Windows Desktop\""
