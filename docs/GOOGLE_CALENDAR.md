# Google Calendar — configuration

La connexion Google Calendar est **distincte** de la connexion Google utilisée pour se connecter à Lyte (Firebase Auth). L'utilisateur doit lier son compte Calendar explicitement via **Settings → Plugins** ou le bandeau du panneau Calendar.

## Prérequis

1. **Backend Python** en marche (`uvicorn` sur le port 8000)
2. **Frontend Vite** (`npm run dev` dans `frontend/`)
3. **Firebase Admin** configuré sur le backend (`FIREBASE_PROJECT_ID` + credentials) pour stocker les tokens par utilisateur dans Firestore (`users/{uid}/private/connectors`)

## Google Cloud Console

1. Ouvrir [Google Cloud Console](https://console.cloud.google.com/) (projet lié à `forma-cad-dev` ou le vôtre)
2. **APIs & Services → Library** → activer **Google Calendar API**
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Type : **Web application**
   - **Authorized redirect URIs** (obligatoire) :
     - Local : `http://127.0.0.1:8000/api/connectors/oauth/callback`
     - Prod : `https://VOTRE-BACKEND/api/connectors/oauth/callback`
4. Copier **Client ID** et **Client secret**

## Variables d'environnement (`backend/.env`)

```env
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxx

# OAuth callback (backend)
FORMA_OAUTH_REDIRECT_BASE=http://127.0.0.1:8000

# Origine du frontend (postMessage OAuth popup)
FORMA_FRONTEND_ORIGIN=http://127.0.0.1:5173

# Si Vite utilise un autre port (ex. 5174) :
# FORMA_FRONTEND_ORIGIN=http://127.0.0.1:5174

# CORS (ajouter le port Vite si différent)
# FORMA_CORS=http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:5174
```

## Firebase Admin (backend)

Le backend stocke les tokens OAuth **par utilisateur** dans Firestore. Il faut l'une de ces options :

- `GOOGLE_APPLICATION_CREDENTIALS=/chemin/vers/service-account.json`
- ou copier le JSON dans `forma-data/firebase-adminsdk.json` (voir `backend/.env.example`)

Sans Firebase Admin, la liste/connecteur renverra `401 Authentication required`.

## Flux utilisateur

1. Se connecter à l'app (Firebase Auth)
2. **Settings → Plugins → Google Calendar → Connecter** (ou bandeau dans le panneau Calendar)
3. Popup Google → autoriser l'accès au calendrier
4. Les événements Google du jour sélectionné s'affichent dans le panneau Calendar
5. Les événements créés in-app (composer, follow-up, `/manage`) sont poussés vers Google Calendar primary

## Scopes OAuth

- `openid`, `email` (compte lié affiché dans l'UI)
- `calendar.readonly` (lecture / sync)
- `calendar.events` (création d'événements)

## Dépannage

| Symptôme | Cause probable |
|----------|----------------|
| `OAuth credentials missing` | `GOOGLE_CLIENT_ID` / `SECRET` absents du `backend/.env` |
| `redirect_uri_mismatch` | URI de callback non enregistrée dans Google Cloud |
| `401 Authentication required` | Utilisateur non connecté ou Firebase Admin absent |
| Popup se ferme sans succès | `FORMA_FRONTEND_ORIGIN` ne correspond pas au port Vite |
| Événements Google absents | Compte non connecté ou jour sans événements |

## Production

En production, déployer le backend avec les mêmes variables et ajouter l'URI de callback prod dans Google Cloud. Le frontend doit proxy `/api` vers ce backend (ou même origine).
