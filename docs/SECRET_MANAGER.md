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
| `FORMA_USE_LOCAL_ENV=1` | Ignore GSM ; utilise `.env` local ou les variables du process (Vercel) |
| `FORMA_SECRETS_REQUIRED=1` | Échec si GSM indisponible (prod **hors Vercel**) |
| `FORMA_BACKEND_SECRET_ID` | Nom du secret backend (défaut `forma-backend-env`) |
| `FORMA_FUNCTIONS_SECRET_ID` | Nom du secret functions (défaut `forma-functions-env`) |
| `FORMA_FRONTEND_SECRET_ID` | Nom du secret frontend (défaut `forma-frontend-env`) |

## Vercel (backend Python)

Le runtime Vercel **n’a pas accès** à Google Secret Manager et **n’installe pas** les dépendances CAO lourdes (`requirements-cad.txt` — bundle trop gros). Vercel utilise uniquement `backend/requirements.txt` (API connecteurs / billing).

Les variables backend doivent être dans **Vercel → Settings → Environment Variables**, pas seulement dans GSM :

```bash
vercel login
./scripts/sync-gsm-to-vercel-env.sh
vercel --prod
```

Variables **obligatoires** pour que `/api/connectors` fonctionne en prod :

| Variable | Exemple |
|----------|---------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | JSON compte de service Firebase (une ligne) |
| `FIREBASE_PROJECT_ID` | `forma-cad-dev` |
| `FORMA_OAUTH_REDIRECT_BASE` | `https://autocad-blue.vercel.app` |
| `FORMA_FRONTEND_ORIGIN` | `https://autocad-blue.vercel.app` |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Dashboard Spotify |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console |

Sans `FIREBASE_SERVICE_ACCOUNT_JSON`, le backend démarre mais Firestore (tokens OAuth) est indisponible.

Le backend détecte `VERCEL=1` et **ne tente pas** GSM au démarrage (évite `FUNCTION_INVOCATION_FAILED`).

## Rotation

1. Mettre à jour la valeur localement (ou éditer le bundle)
2. `./scripts/sync-env-to-secret-manager.sh --push --target backend`
3. Redémarrer le backend / redéployer les functions

Les versions précédentes restent dans GSM (audit / rollback).
