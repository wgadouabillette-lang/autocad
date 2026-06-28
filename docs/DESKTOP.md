# Hall — application bureau (.dmg / Windows)

Hall peut tourner comme une **vraie application** (fenêtre native), sans ouvrir le terminal ni `localhost:5173`.

## Prérequis

| Outil | macOS | Windows |
|-------|-------|---------|
| Python | 3.11+ | 3.11+ |
| Node.js | 18+ | 18+ |

---

## Option A — Tester tout de suite (fenêtre app, sans .dmg)

Après `./setup.sh` :

```bash
chmod +x scripts/desktop-dev.sh
./scripts/desktop-dev.sh
```

Une fenêtre **Hall** s’ouvre (Electron). Le backend tourne en arrière-plan sur le port `47831`.

---

## Option B — Installer comme une vraie app macOS (.dmg)

**À construire sur un Mac** (une fois) :

```bash
chmod +x scripts/build-desktop-mac.sh
./scripts/build-desktop-mac.sh
```

Fichier produit : `desktop/release/Hall-0.1.0.dmg`

1. Double-cliquez le `.dmg`
2. Glissez **Hall** dans **Applications**
3. Lancez depuis le Launchpad (comme n’importe quelle app Mac)

> Au premier lancement, macOS peut afficher « développeur non identifié » :  
> **Réglages Système → Confidentialité et sécurité → Ouvrir quand même**.

### Clé API (Grok) en mode app

Le fichier de config est créé automatiquement :

- macOS : `~/Library/Application Support/forma-desktop/forma-data/.env`
- ou `~/.forma/.env` selon version

Collez-y votre `XAI_API_KEY=...` puis relancez l’app.

### Firebase (connexion + sync cloud)

L’app bureau utilise le même projet Firebase que le web (`forma-cad-dev`) :

- **Connexion** : Google / Microsoft / Facebook via **navigateur externe** → page web `https://forma-cad-dev.web.app/auth.html` (ou `https://forma.app/auth.html` après déploiement Netlify), puis retour automatique dans l'app
- **Clés API LLM** : enregistrées via Cloud Functions (Settings → Plugins), sans `.env`
- **Données** : profil, workspaces et projets synchronisés dans Firestore après connexion

Configuration Firebase Console requise :

1. [Domaines autorisés](https://console.firebase.google.com/project/forma-cad-dev/authentication/settings) : ajoutez `forma-cad-dev.web.app`, `forma.app`, `127.0.0.1`, `localhost`
2. Activez **Microsoft** et **Facebook** :
   ```bash
   ./scripts/configure-firebase-oauth-providers.sh
   ```
   Facebook nécessite une app Meta (`FACEBOOK_OAUTH_APP_ID` + `FACEBOOK_OAUTH_APP_SECRET`).
   Microsoft nécessite un app registration Azure AD
   (`MICROSOFT_OAUTH_CLIENT_ID` + `MICROSOFT_OAUTH_CLIENT_SECRET`).
3. Déployez la landing + page d'auth :
   ```bash
   ./scripts/deploy-landing.sh
   ```
   (Firebase Hosting — auth live sur `https://forma-cad-dev.web.app/auth.html`)
4. *(Optionnel)* Cloud Functions si plan Blaze :
   ```bash
   cd functions && npm run build && firebase deploy --only functions
   ```
   Sans Blaze, la session passe par **Firestore** (déjà configuré).

Pour que le **backend embarqué** lise les clés utilisateur depuis Firestore (requêtes IA authentifiées) :

1. Téléchargez un compte de service Firebase (rôle **Firebase Admin SDK Administrator Service Agent** ou accès Firestore lecture seule sur `users/*/private/*`)
2. Placez-le soit :
   - au build : `desktop/secrets/firebase-adminsdk.json` puis reconstruisez le `.dmg`
   - ou après install : `forma-data/firebase-adminsdk.json` (même dossier que `.env`)

---

## Option C — Installateur Windows (.exe)

**À construire sur une machine Windows** :

```bat
scripts\build-desktop-win.bat
```

Fichier produit : `desktop/release/Hall Setup 0.1.0.exe`

Double-cliquez pour installer (assistant NSIS), puis lancez **Hall** depuis le menu Démarrer.

Config utilisateur : `%APPDATA%\forma-desktop\forma-data\.env`

---

## Différences avec le mode développeur

| | Dev (`start.sh`) | App bureau |
|--|------------------|------------|
| Interface | Navigateur :5173 | Fenêtre native |
| Backend | Terminal visible | Arrière-plan |
| Frontend | Vite hot-reload | Build statique embarqué |
| Distribution | Non | .dmg / .exe |

---

## Dépannage

- **`npm error EACCES` sur `~/.npm/_cacache`** → les scripts utilisent des caches locaux
  (`desktop/.npm-cache`, `desktop/.electron-cache`). Relancez `./scripts/desktop-dev.sh`.
  Si besoin : `rm -rf desktop/node_modules desktop/.npm-cache desktop/.electron-cache`
  puis relancez.
- **`permission denied: ./setup.sh`** → `chmod +x setup.sh start.sh scripts/*.sh`
- **Écran noir au lancement** → attendez 10–20 s (démarrage Python)
- **LLM déconnecté** → éditez le `.env` utilisateur (voir ci-dessus)
- **Build .dmg échoue** → vérifiez `python3`, espace disque (~1 Go pour le venv embarqué)
