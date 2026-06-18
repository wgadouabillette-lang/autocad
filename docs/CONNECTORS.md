# Connecteurs (Plugins) — configuration OAuth

Les plugins **Settings → Plugins** utilisent OAuth côté backend (`backend/.env`). Chaque connecteur stocke ses tokens dans Firestore (`users/{uid}/private/connectors`).

**Redirect URI obligatoire pour tous les connecteurs :**

```
http://127.0.0.1:8000/api/connectors/oauth/callback
```

En production, remplacez par l’URL de votre backend.

Variables communes :

```env
FORMA_OAUTH_REDIRECT_BASE=http://127.0.0.1:8000
FORMA_FRONTEND_ORIGIN=http://127.0.0.1:5173
```

---

## Google Calendar + Gmail

Voir aussi [GOOGLE_CALENDAR.md](./GOOGLE_CALENDAR.md).

1. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Library**
   - Activer **Google Calendar API**
   - Activer **Gmail API**
2. **Credentials → OAuth client ID → Web application**
   - Redirect URI : `http://127.0.0.1:8000/api/connectors/oauth/callback`
3. **OAuth consent screen**
   - Mode **Testing** en dev → ajoutez vos comptes dans **Test users**
   - Sans validation Google, l’écran « Google n'a pas validé cette application » apparaît → **Paramètres avancés** → continuer

```env
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxx
```

| Plugin | Scopes |
|--------|--------|
| Calendar | `calendar.readonly`, `calendar.events` |
| Gmail | `gmail.readonly` |

---

## Outlook (Microsoft)

1. [Azure Portal](https://portal.azure.com/) → **Microsoft Entra ID → App registrations → New registration**
2. **Authentication → Web** → Redirect URI :
   `http://127.0.0.1:8000/api/connectors/oauth/callback`
3. **API permissions** (delegated) :
   - `User.Read`
   - `Mail.Read`
   - `Calendars.ReadWrite`
   - `offline_access`, `openid`, `profile`
4. **Certificates & secrets** → nouveau client secret

```env
MICROSOFT_OAUTH_CLIENT_ID=xxxx
MICROSOFT_OAUTH_CLIENT_SECRET=xxxx
MICROSOFT_OAUTH_TENANT=common
```

Le plugin Outlook couvre **mail + calendrier** (Microsoft Graph). Les événements Outlook s’affichent dans le panneau Calendar de l’app.

---

## Notion

1. [notion.so/my-integrations](https://www.notion.so/my-integrations) → **New integration**
2. Activer **OAuth** et définir la redirect URI :
   `http://127.0.0.1:8000/api/connectors/oauth/callback`
3. Copier **OAuth client ID** et **OAuth client secret**

```env
NOTION_CLIENT_ID=xxxx
NOTION_CLIENT_SECRET=secret_xxxx
```

Après connexion, l’aperçu liste les pages récentes via l’API Search.

---

## Figma

1. [figma.com/developers](https://www.figma.com/developers) → **Create OAuth app**
2. Redirect URI : `http://127.0.0.1:8000/api/connectors/oauth/callback`
3. Scope : `file_read`

```env
FIGMA_CLIENT_ID=xxxx
FIGMA_CLIENT_SECRET=xxxx
# Optionnel — pour lister les fichiers d’une équipe :
FIGMA_TEAM_ID=1234567890
```

Sans `FIGMA_TEAM_ID`, la connexion affiche le profil Figma ; avec, l’aperçu liste les fichiers du team.

---

## Spotify

1. [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → **Create app**
2. **Settings → Redirect URIs** :
   `http://127.0.0.1:8000/api/connectors/oauth/callback`
3. Copier **Client ID** et **Client Secret**

```env
SPOTIFY_CLIENT_ID=xxxx
SPOTIFY_CLIENT_SECRET=xxxx
```

| Plugin | Scopes |
|--------|--------|
| Spotify | `user-read-playback-state`, `user-modify-playback-state`, `user-read-currently-playing`, `user-read-email`, `user-read-private` |

Dans le chat, utilisez le skill **`/play`** (menu `/`) ou la commande **`/play titre ou artiste`** pour lancer une piste sur Spotify. Une carte avec pochette et métadonnées s’affiche dans le fil.

---

## Dépannage

| Symptôme | Cause |
|----------|--------|
| `OAuth credentials missing` | Clés absentes du `backend/.env` |
| `redirect_uri_mismatch` | URI non enregistrée chez le provider |
| `401 Authentication required` | Non connecté à Lyte ou Firebase Admin absent |
| Popup se ferme sans succès | `FORMA_FRONTEND_ORIGIN` ≠ port Vite |
| Google « non validé » | App en Testing — ajoutez-vous en test user ou soumettez à la validation |
| Outlook `AADSTS` | Mauvais tenant ou permissions API manquantes |
| Figma sans fichiers | Définir `FIGMA_TEAM_ID` (ID dans l’URL Figma `/team/…`) |
| Spotify sans lecture | Ouvrir Spotify sur un appareil actif (Premium requis pour contrôle à distance) |

---

## APIs backend (après connexion)

| Connecteur | Endpoints |
|------------|-----------|
| Calendar | `GET/POST /api/connectors/calendar/events` |
| Gmail | `GET /api/connectors/gmail/messages` |
| Outlook mail | `GET /api/connectors/outlook/messages` |
| Outlook calendar | `GET/POST /api/connectors/outlook/calendar/events` |
| Notion | `GET /api/connectors/notion/search` |
| Figma | `GET /api/connectors/figma/files`, `GET /api/connectors/figma/me` |
| Spotify | `POST /api/connectors/spotify/play`, `GET /api/connectors/spotify/playback`, `GET /api/connectors/spotify/me` |
