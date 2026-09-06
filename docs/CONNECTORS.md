# Connecteurs (Plugins) — configuration OAuth

Les plugins **Settings → Plugins** utilisent OAuth côté backend. Chaque connecteur stocke ses tokens dans Firestore (`users/{uid}/private/connectors`).

Depuis **0.1.4**, l’app packagée (Windows / Mac / Linux) appelle l’API **`https://meetra.cc/api`**. Le callback OAuth des plugins est donc le même que le web — pas le backend embarqué `:47831`.

`FORMA_OAUTH_REDIRECT_BASE=https://meetra.cc`

L’UI Electron reste sur `http://127.0.0.1:47832` uniquement pour le retour après OAuth (deep-link / refresh), jamais comme `redirect_uri` provider.

## Redirect URIs à enregistrer chez chaque provider

| Contexte | URI |
|----------|-----|
| **Prod (web + app installée)** | `https://meetra.cc/api/connectors/oauth/callback` |
| Dev local (`desktop-dev.sh` / uvicorn :8000) | `http://127.0.0.1:8000/api/connectors/oauth/callback` |

Ajoutez **les deux**. Ne pas enregistrer `http://127.0.0.1:47832/...` — ce n’est pas le callback API.

Secrets : Google Secret Manager (`forma-backend-env`), pas de `.env` local.

---

## Google Calendar + Gmail

Voir aussi [GOOGLE_CALENDAR.md](./GOOGLE_CALENDAR.md).

1. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Library**
   - Activer **Google Calendar API**
   - Activer **Gmail API**
2. **Credentials → OAuth client ID → Web application**
   - Redirect URIs :
     - `https://meetra.cc/api/connectors/oauth/callback`
     - `http://127.0.0.1:8000/api/connectors/oauth/callback`
3. **OAuth consent screen**
   - Mode **Testing** en dev → ajoutez vos comptes dans **Test users**
   - Pour le public : passer en **Production** (validation Google possible)

```env
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxx
```

| Plugin | Scopes |
|--------|--------|
| Calendar | `calendar.readonly`, `calendar.events` |
| Gmail | `gmail.readonly`, `gmail.send` |

---

## Outlook (Microsoft)

1. [Azure Portal](https://portal.azure.com/) → **Microsoft Entra ID → App registrations → New registration**
2. **Authentication → Web** → Redirect URIs :
   - `https://meetra.cc/api/connectors/oauth/callback`
   - `http://127.0.0.1:8000/api/connectors/oauth/callback`
3. **API permissions** (delegated) :
   - `User.Read`
   - `Mail.Read`
   - `Calendars.ReadWrite`
   - `offline_access`, `openid`, `profile`
4. **Certificates & secrets** → nouveau client secret → pousser dans GSM :
   `MICROSOFT_OAUTH_CLIENT_ID`, `MICROSOFT_OAUTH_CLIENT_SECRET`, `MICROSOFT_OAUTH_TENANT=common`

Le plugin Outlook couvre **mail + calendrier** (Microsoft Graph).

---

## Spotify

1. [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → votre app → **Settings**
2. **Redirect URIs** — ajoutez :
   - `https://meetra.cc/api/connectors/oauth/callback` (web + app installée)
   - `http://127.0.0.1:8000/api/connectors/oauth/callback` (dev)
3. Client ID / Secret déjà dans GSM (`SPOTIFY_CLIENT_*`)

---

## Checklist prod desktop

- [ ] Google : URI `https://meetra.cc/api/connectors/oauth/callback` + `8000`
- [ ] Spotify : URI `https://meetra.cc/api/connectors/oauth/callback` + `8000`
- [ ] Microsoft : URI `https://meetra.cc/api/connectors/oauth/callback` + `8000` + secrets dans GSM
- [ ] Consent Google en Production (quand prêt pour le public)
- [ ] Rebuild `.dmg` seulement si vous changez les secrets embarqués / Admin SDK

| Plugin | Scopes |
|--------|--------|
| Spotify | `streaming`, `user-read-playback-state`, `user-modify-playback-state`, `user-read-currently-playing`, `user-read-email`, `user-read-private`, `user-top-read`, `user-read-recently-played` |

Dans le chat, utilisez le skill **`/play`** (menu `/`) ou la commande **`/play titre ou artiste`** pour lancer une piste sur Spotify. Une carte avec pochette et métadonnées s’affiche dans le fil.

**Lecture complète dans l’app** : Spotify **Premium** + scope **`streaming`** (reconnecter le connecteur si la connexion date d’avant cette autorisation). Sans Premium : extraits 30 s dans l’app quand Spotify fournit un `preview_url`.

---

## Coming soon (pas encore disponibles)

**Figma** et **Dropbox** apparaissent dans **Settings → Plugins** (icône + nom) mais ne sont pas connectables : pas d’OAuth, pas d’API, bouton Connect désactivé. Badge **Coming soon** / **Bientôt disponible**.

---

## Dépannage

| Symptôme | Cause |
|----------|--------|
| `OAuth credentials missing` | Clés absentes de GSM (`forma-backend-env`) |
| `redirect_uri_mismatch` | URI non enregistrée chez le provider — prod = `https://meetra.cc/api/connectors/oauth/callback` |
| `401 Authentication required` | Non connecté à Hall ou Firebase Admin absent |
| Popup se ferme sans succès | Origine frontend ≠ celle attendue |
| Google « non validé » | App en Testing — ajoutez-vous en test user ou passez en Production |
| Outlook `AADSTS` | Mauvais tenant, URI manquante, ou permissions API / secrets GSM manquants |
| Spotify sans lecture | Ouvrir Spotify sur un appareil actif (Premium requis pour contrôle à distance) |
| Spotify ouvre l'app externe au lieu de lire dans Hall | Compte **Free** ou scope **`streaming`** manquant — reconnecter Spotify dans Settings → Plugins ; Premium requis pour piste complète |
| Safari / navigateur « ne peut pas ouvrir le serveur » | L’app 0.1.4 callback sur `https://meetra.cc` — pas `47831` / `47832` |
| Spotify `Active premium subscription required for the owner of the app` | Le **compte propriétaire** de l'app sur [developer.spotify.com](https://developer.spotify.com/dashboard) doit avoir **Spotify Premium** (règle Spotify Dev Mode). Propagation : quelques heures après activation. |

---

## APIs backend (après connexion)

| Connecteur | Endpoints |
|------------|-----------|
| Calendar | `GET/POST /api/connectors/calendar/events` |
| Gmail | `GET /api/connectors/gmail/messages` |
| Outlook mail | `GET /api/connectors/outlook/messages` |
| Outlook calendar | `GET/POST /api/connectors/outlook/calendar/events` |
| Spotify | `POST /api/connectors/spotify/play`, `GET /api/connectors/spotify/playback`, `GET /api/connectors/spotify/me` |
