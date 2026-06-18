# Google Secret Manager — configuration Lyte

Toutes les variables sensibles (ex-`backend/.env`, `functions/.env`, `frontend/.env`) sont stockées dans **Google Secret Manager** sous forme de bundles dotenv.

| Secret GSM | Fichier source (migration) | Consommateur |
|------------|----------------------------|--------------|
| `forma-backend-env` | `backend/.env` | API FastAPI (uvicorn) |
| `forma-functions-env` | `functions/.env` | Cloud Functions |
| `forma-frontend-env` | `frontend/.env` | Vite (`predev` / `prebuild`) |

Projet GCP par défaut : **`forma-cad-dev`**.

## Prérequis IAM

Le compte qui lit les secrets doit avoir **`roles/secretmanager.secretAccessor`** sur le projet.

- Local : `gcloud auth application-default login`
- Cloud Functions : rôle par défaut du runtime Firebase
- Backend local : ADC ou `GOOGLE_APPLICATION_CREDENTIALS`

## Migration initiale (push)

Si vous avez encore des `.env` locaux :

```bash
# Une fois : installer la lib
cd backend && source .venv/bin/activate && pip install google-cloud-secret-manager

# Pousser les 3 bundles
./scripts/sync-env-to-secret-manager.sh --push
```

Cela crée (si besoin) les secrets et ajoute une nouvelle version avec le contenu de chaque `.env`.

## Développement local

### Backend (Secret Manager direct)

Par défaut le backend charge **`forma-backend-env`** au démarrage.

Repli fichier local uniquement :

```bash
export FORMA_USE_LOCAL_ENV=1
cd backend && uvicorn app.main:app --reload --port 8000
```

### Frontend

`npm run dev` exécute `scripts/load-frontend-env-from-gsm.mjs` qui écrit `frontend/.env` depuis **`forma-frontend-env`**.

```bash
export FORMA_USE_LOCAL_ENV=1   # garde le .env local sans appeler GSM
npm run dev
```

### Cloud Functions

Au cold start, `functions/src/loadSecrets.ts` charge **`forma-functions-env`** dans `process.env`.

Déployer après build :

```bash
cd functions && npm install && npm run build
firebase deploy --only functions
```

## Pull (récupérer les secrets en local)

```bash
./scripts/sync-env-to-secret-manager.sh --pull
# ou une cible :
./scripts/sync-env-to-secret-manager.sh --pull --target backend
```

## Variables de contrôle

| Variable | Description |
|----------|-------------|
| `FORMA_SECRETS_PROJECT` | Projet GCP (défaut : `forma-cad-dev`) |
| `FORMA_USE_LOCAL_ENV=1` | Ignore GSM, utilise les `.env` locaux |
| `FORMA_SECRETS_REQUIRED=1` | Échec si GSM indisponible (prod) |
| `FORMA_BACKEND_SECRET_ID` | Nom du secret backend (défaut `forma-backend-env`) |
| `FORMA_FUNCTIONS_SECRET_ID` | Nom du secret functions (défaut `forma-functions-env`) |
| `FORMA_FRONTEND_SECRET_ID` | Nom du secret frontend (défaut `forma-frontend-env`) |

## Rotation

1. Mettre à jour la valeur localement (ou éditer le bundle)
2. `./scripts/sync-env-to-secret-manager.sh --push --target backend`
3. Redémarrer le backend / redéployer les functions

Les versions précédentes restent dans GSM (audit / rollback).
