# Meetra

Workspace collaboratif : appels, messages, calendrier, notes et connecteurs. Le site public est [meetra.cc](https://meetra.cc). La connexion se fait avec Google.

## Dossiers

| Dossier | Rôle |
|---------|------|
| `frontend/` | Application React (Vite), servie sous `/app` |
| `backend/` | API FastAPI |
| `landing/` | Site marketing, pages légales, auth |
| `desktop/` | Application Electron |
| `functions/` | Cloud Functions Firebase (IA, webhook Stripe, auth bureau) |
| `docs/` | Config production : Stripe, connecteurs, bureau, secrets |
| `scripts/` | Build bureau, déploiement, icônes |
| `brand/` | Marque source |

## Lancer en local

```bash
./setup.sh
./start.sh
```

Fenêtre bureau : `./scripts/desktop-dev.sh`

## Docs utiles

- [Connecteurs](docs/CONNECTORS.md)
- [Stripe](docs/STRIPE_BILLING.md)
- [Application bureau](docs/DESKTOP.md)
- [Secrets](docs/SECRET_MANAGER.md)
