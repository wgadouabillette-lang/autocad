# Connexion Facebook (Firebase Auth)

Le bouton **Continue with Facebook** est déjà branché dans l’app (`AuthPage`, landing `auth.html`, app bureau). Il reste à créer l’app Meta et à activer le provider dans Firebase.

## État actuel

| Couche | Statut |
|--------|--------|
| UI (web + desktop) | OK |
| SDK Firebase (`FacebookAuthProvider`) | OK |
| Provider Firebase `facebook.com` | **À activer** (credentials Meta requis) |

Vérifier les providers actifs :

```bash
./scripts/configure-firebase-oauth-providers.sh
```

## 1. Créer l’app Meta

1. Ouvrir [Meta for Developers](https://developers.facebook.com/apps/) → **Create App**.
2. Type d’usage : **Authenticate and request data from users with Facebook Login** (ou équivalent « Consumer »).
3. Nom de l’app : **Hall** (ou le nom affiché aux utilisateurs).

## 2. Configurer Facebook Login

Dans le dashboard Meta :

1. **Add product** → **Facebook Login** → **Settings**.
2. **Valid OAuth Redirect URIs** — ajouter **exactement** :

   ```
   https://forma-cad-dev.firebaseapp.com/__/auth/handler
   ```

   Firebase redirige toujours via ce handler, y compris en local (`localhost:5173`) et sur `forma.app`.

3. **Client OAuth settings** :
   - **Login from Devices** : Non (sauf besoin TV)
   - **Use Strict Mode for Redirect URIs** : Oui (recommandé)

4. **Settings → Basic** :
   - **App Domains** : `forma-cad-dev.firebaseapp.com`, `forma.app`, `hall.app`
   - **Privacy Policy URL** : `https://hall.app/privacy` (ou votre URL publique)
   - **Terms of Service URL** : `https://hall.app/terms`
   - **Category** : selon votre produit (ex. Business)

5. Copier **App ID** et **App Secret** (Settings → Basic).

## 3. Brancher Firebase

```bash
cp oauth.env.example oauth.env
# Éditez oauth.env :
#   FACEBOOK_OAUTH_APP_ID=…
#   FACEBOOK_OAUTH_APP_SECRET=…

./scripts/setup-facebook-login.sh
```

Le script appelle l’API Identity Platform et active `facebook.com` sur le projet `forma-cad-dev`.

Alternative manuelle :

```bash
export FACEBOOK_OAUTH_APP_ID='…'
export FACEBOOK_OAUTH_APP_SECRET='…'
./scripts/configure-firebase-oauth-providers.sh
```

## 4. Domaines autorisés Firebase

Déjà listés dans `firebase.json` :

- `localhost`, `127.0.0.1`
- `forma-cad-dev.web.app`, `forma-cad-dev.firebaseapp.com`
- `forma.app`, `autocad-blue.vercel.app`

Après modification :

```bash
firebase deploy --only auth
```

## 5. Tester

1. `npm run dev` dans `frontend/` → http://localhost:5173/app/
2. Page de connexion → **Continue with Facebook**
3. Popup Meta → autoriser → retour dans l’app connecté

App bureau : la page `https://forma-cad-dev.web.app/auth` utilise le même flux popup.

## Mode développement Meta

Tant que l’app Meta est en **Development** :

- Seuls les comptes ajoutés comme **Testers** / **Developers** dans Meta → **App roles** peuvent se connecter.
- Pour la prod publique : passer l’app en **Live** (Meta peut demander une revue + URLs légales).

## Dépannage

| Erreur | Cause probable |
|--------|----------------|
| `auth/operation-not-allowed` | Provider `facebook.com` pas activé dans Firebase → relancer `./scripts/setup-facebook-login.sh` |
| `auth/invalid-credential` + invalid_client | App ID / Secret incorrects dans Firebase |
| URL blocked / redirect URI | URI Meta ≠ `https://forma-cad-dev.firebaseapp.com/__/auth/handler` |
| App Not Setup | Produit **Facebook Login** non ajouté à l’app Meta |
| Connexion refusée (dev) | Votre compte Facebook n’est pas **Tester** sur l’app Meta |
| `auth/unauthorized-domain` | Domaine absent de Firebase → `firebase deploy --only auth` |

## Scopes demandés

L’app demande `email` et `public_profile` (voir `frontend/src/lib/firebase/client.ts`). L’email peut être absent si l’utilisateur ne le partage pas ; le compte Firebase sera quand même créé avec l’UID Facebook.

## Références

- [Firebase — Authenticate Using Facebook](https://firebase.google.com/docs/auth/web/facebook-login)
- Script d’activation : `scripts/configure-firebase-oauth-providers.sh`
- App bureau : `docs/DESKTOP.md`
