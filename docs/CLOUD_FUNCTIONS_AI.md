# Cloud Functions — secrets LLM (optionnel)

Les clés plateforme peuvent être configurées comme secrets Firebase :

```bash
firebase functions:secrets:set XAI_API_KEY
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set ANTHROPIC_API_KEY
```

Variables optionnelles (modèles) :

- `XAI_MODEL` (défaut `grok-3-mini`)
- `OPENAI_MODEL` / `OPENAI_AUTO_CHAT_MODEL`
- `FORMA_OPUS_47_MODEL` / `FORMA_OPUS_48_MODEL`

## Fonctions sensibles

| Callable | Auth | Rôle |
|----------|------|------|
| `setUserApiKey` | oui | Stocke une clé utilisateur dans Firestore (`users/{uid}/private/apiKeys`) |
| `deleteUserApiKey` | oui | Supprime une clé utilisateur |
| `getUserApiKeyStatus` | oui | Retourne statut + preview (4 derniers chars) |
| `aiChat` | oui | Chat IA — appelle xAI/OpenAI/Anthropic côté serveur |
| `aiHealth` | oui | Indique si un LLM est disponible (sans exposer de clés) |
| `completeDesktopAuthSession` | oui | Auth bureau |
| `claimDesktopAuthSession` | non | Récupère le token desktop |

`resolveUserApiKeys` a été **supprimée** : les clés brutes ne doivent jamais être renvoyées au client.

## Déploiement

```bash
cd functions && npm run build
firebase deploy --only functions
```

## Dev local (émulateur)

```bash
cd functions
export XAI_API_KEY=...
npm run serve
```

Dans le frontend : `VITE_FIREBASE_FUNCTIONS_EMULATOR=1` dans `.env.local`.
