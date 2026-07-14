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

### Spotify (lecture complète Premium)

L’app Mac utilise **Electron Castlabs** + **Widevine**. Spotify exige une **signature VMP production** (Castlabs EVS, gratuit) — sans elle, la lecture coupe après ~1 s (`playback_error`).

**Une fois (compte EVS + signature du binaire de dev) :**

```bash
python3 -m venv .venv-evs && .venv-evs/bin/pip install castlabs-evs
.venv-evs/bin/python -m castlabs_evs.account signup   # e-mail + confirmation
chmod +x scripts/sign-electron-widevine.sh
./scripts/sign-electron-widevine.sh
./scripts/desktop-dev.sh
```

Ensuite la musique joue **dans Hall** comme dans le navigateur. Les builds `.dmg` sont signés automatiquement via `desktop/afterPack.cjs` si le compte EVS est configuré.

**Prérequis :** Spotify Premium + connecteur lié (scope `streaming`).

### Clé API (Grok) en mode app

Le fichier de config est créé automatiquement :

- macOS : `~/Library/Application Support/forma-desktop/forma-data/.env`
- ou `~/.forma/.env` selon version

Collez-y votre `XAI_API_KEY=...` puis relancez l’app.

### Firebase (connexion + sync cloud)

L’app bureau utilise le même projet Firebase que le web (`forma-cad-dev`) :

- **Connexion** : Google / Microsoft / Facebook via **navigateur externe** → page web `https://forma-cad-dev.web.app/auth` (ou `https://forma.app/auth` après déploiement Netlify), puis retour automatique dans l'app
- **Clés API LLM** : enregistrées via Cloud Functions (Settings → Plugins), sans `.env`
- **Données** : profil, workspaces et projets synchronisés dans Firestore après connexion

Configuration Firebase Console requise :

1. [Domaines autorisés](https://console.firebase.google.com/project/forma-cad-dev/authentication/settings) : ajoutez `forma-cad-dev.web.app`, `forma.app`, `127.0.0.1`, `localhost`
2. Activez **Microsoft** et **Facebook** — guide Facebook : [`docs/FACEBOOK_AUTH.md`](../docs/FACEBOOK_AUTH.md)
   ```bash
   cp oauth.env.example oauth.env   # remplir FACEBOOK_OAUTH_* (+ MICROSOFT_OAUTH_* si besoin)
   ./scripts/setup-facebook-login.sh
   ```
3. Déployez la landing + page d'auth :
   ```bash
   ./scripts/deploy-landing.sh
   ```
   (Firebase Hosting — auth live sur `https://forma-cad-dev.web.app/auth`)
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

**À construire sur une machine Windows** (ou via GitHub Actions — voir ci-dessous) :

```bat
scripts\build-desktop-win.bat
```

Fichier produit : `desktop/release/Hall Setup 0.1.0.exe`

Double-cliquez pour installer (assistant NSIS), puis lancez **Hall** depuis le menu Démarrer.

Config utilisateur : `%APPDATA%\forma-desktop\forma-data\.env`

### Installateur Windows signé (téléchargement utilisateurs)

Pour que Windows **SmartScreen** fasse confiance à l’installateur, Hall utilise **Azure Trusted Signing** (Artifact Signing, ~10 $/mois) via `electron-builder` 26.

La signature **VMP Widevine** (Castlabs EVS) s’applique ensuite dans `desktop/afterSign.cjs`.

#### 1. Configuration Azure (une fois)

Sur ta machine, avec Azure CLI et GitHub CLI :

```bash
brew install azure-cli   # si besoin
./scripts/setup-azure-trusted-signing.sh
```

Le script :
1. Lance `az login` (connexion navigateur — **je ne peux pas le faire sans toi**)
2. Crée le compte Artifact Signing + app registration GitHub
3. Configure les secrets/variables GitHub automatiquement

**Étape manuelle obligatoire** (portail Azure, ~20 min) : validation d’identité (pièce d’identité + facture + Microsoft Authenticator). Impossible à automatiser.

#### 2. Secrets GitHub

| Type | Nom | Description |
|------|-----|-------------|
| Variable | `AZURE_CODESIGN_ENDPOINT` | ex. `https://eus.codesigning.azure.net/` |
| Variable | `AZURE_CODESIGN_CERT_PROFILE` | Nom du certificate profile |
| Variable | `AZURE_CODESIGN_ACCOUNT` | Nom du compte Artifact Signing |
| Variable | `AZURE_CODESIGN_PUBLISHER` | Nom légal (= CN du certificat) |
| Secret | `AZURE_TENANT_ID` | Tenant Entra ID |
| Secret | `AZURE_CLIENT_ID` | Application (client) ID de l’app registration |
| Secret | `AZURE_CLIENT_SECRET` | Client secret de l’app registration |
| Secret | `EVS_ACCOUNT_NAME` | Compte Castlabs EVS (ex. `Willgb`) |
| Secret | `EVS_PASSWD` | Mot de passe Castlabs EVS |

#### 3. Lancer le build CI

```bash
gh workflow run "Release Windows Desktop"
```

Artefact : **Hall-windows-installer** → `Hall-windows.exe`

#### Build local signé (machine Windows)

```bat
set AZURE_CODESIGN_ENDPOINT=https://eus.codesigning.azure.net/
set AZURE_CODESIGN_CERT_PROFILE=hall-public
set AZURE_CODESIGN_ACCOUNT=hall-signing
set AZURE_CODESIGN_PUBLISHER=William Gadoua-Billette
set AZURE_TENANT_ID=...
set AZURE_CLIENT_ID=...
set AZURE_CLIENT_SECRET=...
scripts\build-desktop-win.bat
scripts\prepare-landing-downloads.bat
```

Publier :

```bash
./scripts/upload-desktop-downloads.sh
```

URL : `https://forma.app/downloads/Hall-windows.exe`

### Spotify (lecture complète Premium)

Sur Windows, l’app `.exe` utilise un **lecteur WebView2** (moteur Microsoft Edge) en arrière-plan pour le Spotify Web Playback SDK. Edge embarque Widevine DRM, ce qu’Electron seul ne fournit pas — d’où les échecs de lecture complète dans la fenêtre principale.

**Prérequis :**
- Compte **Spotify Premium**
- Connecteur Spotify lié dans **Settings → Plugins** (scope `streaming`)
- **WebView2 Runtime** installé (présent par défaut sur Windows 11 ; [téléchargement](https://developer.microsoft.com/microsoft-edge/webview2/) sur Windows 10 si besoin)

Au premier lancement Windows, Hall démarre une fenêtre WebView2 cachée qui s’enregistre comme appareil Spotify « Hall WebView2 Player ». L’audio sort des haut-parleurs système normalement ; le Hall DJ et la barre de lecture utilisent ce chemin automatiquement.

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
- **Spotify : lecture complète ne marche pas (Windows)** → Premium + reconnecter le connecteur ; installez [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) si absent ; relancez l’app
- **Spotify : lecture complète ne marche pas (Mac)** → Premium + reconnecter le connecteur ; au 1er lancement attendez le téléchargement Widevine ; relancez si besoin (`cd desktop && npm install` installe Electron Castlabs)
