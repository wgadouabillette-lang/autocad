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
| `redirect_uri_mismatch` | URI de callback non enregistrée dans Google Cloud, ou `FORMA_OAUTH_REDIRECT_BASE` pointe vers le frontend (port **5173**) au lieu du backend (**8000**) |
| Mauvais nom / logo Google (autre projet) | `GOOGLE_CLIENT_ID` provient d’un **autre** projet GCP — voir ci-dessous |
| `401 Authentication required` | Utilisateur non connecté ou Firebase Admin absent |
| Popup se ferme sans succès | `FORMA_FRONTEND_ORIGIN` ne correspond pas au port Vite |
| Événements Google absents | Compte non connecté ou jour sans événements |

## Production

URL de prod actuelle : **`https://autocad-blue.vercel.app`** (frontend + API via `/api` sur le même domaine).

### 1. Google Cloud Console

1. **APIs & Services → Library** → activer **Google Calendar API**
2. **Credentials → OAuth client ID → Web application** (client **dédié** aux connecteurs — pas le client Firebase Auth)
3. **Authorized redirect URIs** — ajouter **exactement** :
   ```
   https://autocad-blue.vercel.app/api/connectors/oauth/callback
   ```
4. **OAuth consent screen**
   - **Testing** : ajoutez chaque compte testeur (ex. `uplearn.support@gmail.com`) dans **Test users**
   - **Production** (public) : soumettez l’app à la validation Google pour que n’importe quel utilisateur puisse connecter Calendar

### 2. Secrets backend

Dans `backend/.env` (local, gitignored), renseignez :

```env
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxx
FORMA_OAUTH_REDIRECT_BASE=https://autocad-blue.vercel.app
FORMA_FRONTEND_ORIGIN=https://autocad-blue.vercel.app
FIREBASE_PROJECT_ID=forma-cad-dev
# FIREBASE_SERVICE_ACCOUNT_JSON=…  (pour Vercel, voir ci-dessous)
```

Pousser vers Secret Manager (URLs prod forcées) :

```bash
./scripts/push-prod-secrets-to-gsm.sh
```

### 3. Vercel

Le runtime Vercel **ne lit pas** Secret Manager. Variables **obligatoires** dans **Vercel → Settings → Environment Variables** (Production) :

| Variable | Valeur |
|----------|--------|
| `GOOGLE_CLIENT_ID` | Client OAuth Google (connecteurs) |
| `GOOGLE_CLIENT_SECRET` | Secret du client |
| `FORMA_OAUTH_REDIRECT_BASE` | `https://autocad-blue.vercel.app` |
| `FORMA_FRONTEND_ORIGIN` | `https://autocad-blue.vercel.app` |
| `FORMA_USE_LOCAL_ENV` | `1` |
| `FIREBASE_PROJECT_ID` | `forma-cad-dev` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | JSON compte de service Firebase (une ligne) |

Sync automatique depuis GSM :

```bash
vercel login
./scripts/sync-gsm-to-vercel-env.sh
# Puis ajouter FIREBASE_SERVICE_ACCOUNT_JSON à la main si absent
vercel --prod
```

### 4. Firebase Auth

Domaine autorisé pour la connexion Lyte :

```bash
./scripts/configure-firebase-auth-domains.sh
```

(`autocad-blue.vercel.app` doit figurer dans **Authentication → Settings → Authorized domains**.)

### 5. Vérification

1. Ouvrir `https://autocad-blue.vercel.app/app/`
2. Se connecter → **Settings → Plugins → Google Calendar → Connecter**
3. La popup Google ne doit **pas** afficher `redirect_uri_mismatch`
4. Après autorisation, les événements du jour apparaissent dans le panneau Calendar

### Domaine personnalisé (plus tard)

Si vous ajoutez un domaine (ex. `lyte.app`) :

1. Ajouter `https://VOTRE-DOMAINE/api/connectors/oauth/callback` dans Google Cloud
2. Mettre à jour `FORMA_OAUTH_REDIRECT_BASE` et `FORMA_FRONTEND_ORIGIN` sur Vercel
3. Ajouter le domaine dans Firebase Authorized domains

### Mauvais branding OAuth (autre projet Google)

La popup « Choisir un compte » affiche le **nom, logo et écran de consentement** du projet Google Cloud qui possède le `GOOGLE_CLIENT_ID` configuré dans le backend — **pas** le projet Firebase de connexion Lyte, sauf si c’est le même client.

**Cause fréquente :** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` copiés depuis un autre projet (ou le mauvais client OAuth dans la liste).

**Correction :**

1. Ouvrir [Google Cloud Console](https://console.cloud.google.com/) et sélectionner le projet **`forma-cad-dev`** (menu en haut — pas un autre projet)
2. **APIs & Services → OAuth consent screen** → configurer le branding **Lyte** (nom de l’app, logo, e-mail support, domaine `autocad-blue.vercel.app`)
3. **Credentials → Create credentials → OAuth client ID → Web application**
   - Nom suggéré : `Lyte Connectors (Calendar/Gmail)`
   - Redirect URI : `https://autocad-blue.vercel.app/api/connectors/oauth/callback`
   - *(+ `http://127.0.0.1:8000/api/connectors/oauth/callback` si vous testez en local)*
4. Copier le **nouveau** Client ID et Secret dans :
   - `backend/.env` → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
   - Vercel → Environment Variables (Production)
   - `./scripts/push-prod-secrets-to-gsm.sh` puis `./scripts/sync-gsm-to-vercel-env.sh`
5. `vercel --prod`

**Vérification :** dans **Credentials**, le Client ID configuré dans `.env` doit apparaître **dans le projet forma-cad-dev**. S’il n’y est pas, il appartient à un autre projet → mauvais branding garanti.

> Ne réutilisez **pas** le client OAuth auto-généré par Firebase (`…firebaseapp.com/__/auth/handler`) : son redirect URI ne convient pas aux connecteurs Calendar/Gmail.
