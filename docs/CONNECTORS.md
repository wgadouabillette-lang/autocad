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

## Spotify

1. [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → **Create app**
2. **Settings → Redirect URIs** — ajoutez **les deux** :
   - `http://127.0.0.1:8000/api/connectors/oauth/callback` (dev local)
   - `https://autocad-blue.vercel.app/api/connectors/oauth/callback` (production)
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
| Spotify sans lecture | Ouvrir Spotify sur un appareil actif (Premium requis pour contrôle à distance) |
| Safari « ne peut pas ouvrir le serveur » | Redirect URI OAuth pointe vers `127.0.0.1:8000` en prod — ajoutez l’URL Vercel dans Spotify Dashboard **et** définissez `FORMA_OAUTH_REDIRECT_BASE=https://autocad-blue.vercel.app` sur Vercel |
| Spotify `Active premium subscription required for the owner of the app` | Le **compte propriétaire** de l'app sur [developer.spotify.com](https://developer.spotify.com/dashboard) doit avoir **Spotify Premium** (règle Spotify Dev Mode, fév. 2026). Ce n'est pas le forfait Lyte ni forcément le compte utilisateur connecté dans Lyte. Propagation : quelques heures après activation. |

---

## APIs backend (après connexion)

| Connecteur | Endpoints |
|------------|-----------|
| Calendar | `GET/POST /api/connectors/calendar/events` |
| Gmail | `GET /api/connectors/gmail/messages` |
| Outlook mail | `GET /api/connectors/outlook/messages` |
| Outlook calendar | `GET/POST /api/connectors/outlook/calendar/events` |
| Spotify | `POST /api/connectors/spotify/play`, `GET /api/connectors/spotify/playback`, `GET /api/connectors/spotify/me` |
