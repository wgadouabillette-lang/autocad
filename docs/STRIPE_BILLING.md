# Facturation Stripe — Lyte

Guide pour configurer l'abonnement **Pro** et l'add-on **usage à la demande**, en local et en production.

## Vue d'ensemble

| Composant | Rôle |
|-----------|------|
| **Pro** | Abonnement mensuel récurrent — débloque l'IA, connecteurs, AI Notes, Follow-up |
| **Usage à la demande** | Add-on metered — facturation au fil des requêtes IA, **uniquement si Pro actif** |
| **Webhooks** | Synchronisent `subscriptionPlan` et `onDemandUsageEnabled` dans Firestore |
| **Checkout** | Paiement initial Pro via Stripe Checkout |
| **Portail client** | Gestion carte, factures, résiliation |

Flux côté serveur : `backend/app/billing/stripe_service.py`  
Routes API : `backend/app/api/billing.py`

---

## 1. Prérequis

- Compte [Stripe](https://dashboard.stripe.com)
- [Stripe CLI](https://stripe.com/docs/stripe-cli) (tests locaux)
- Backend Lyte avec Firebase Admin configuré
- Variable `FORMA_FRONTEND_ORIGIN` pointant vers le frontend (ex. `http://127.0.0.1:5173`)

```bash
cd backend
.venv/bin/pip install -r requirements.txt
```

---

## 2. Créer les produits et prix (script automatique)

1. Ajoutez votre clé secrète dans `backend/.env` :

```env
STRIPE_SECRET_KEY=sk_test_...
```

2. Lancez le script :

```bash
./scripts/setup-stripe.sh
```

Options utiles :

```bash
# Simulation sans appel API
./scripts/setup-stripe.sh --dry-run

# Montants personnalisés (centimes)
./scripts/setup-stripe.sh --pro-amount 3000 --currency usd

# Ne pas modifier backend/.env
./scripts/setup-stripe.sh --no-env
```

Le script crée (ou réutilise) :

- **Lyte Pro** — prix récurrent mensuel (**30 $/mois** par défaut, USD)
- **Lyte — Usage à la demande** — prix metered (`usage_type: metered`)

Il écrit `STRIPE_PRO_PRICE_ID` et `STRIPE_ON_DEMAND_PRICE_ID` dans `backend/.env`.

### Création manuelle (Dashboard)

Si vous préférez le Dashboard Stripe :

1. **Produit Pro** → Prix récurrent mensuel → copier `price_...`
2. **Produit On-demand** → Prix récurrent **metered** (agrégation `sum`) → copier `price_...`

---

## 3. Webhooks — développement local

1. Connectez la CLI :

```bash
stripe login
```

2. Forwardez les événements vers le backend :

```bash
stripe listen --forward-to http://127.0.0.1:8000/api/billing/webhook
```

3. Copiez le secret affiché (`whsec_...`) dans `backend/.env` :

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

4. Démarrez le backend et testez un checkout :

```bash
cd backend && .venv/bin/uvicorn app.main:app --reload
```

Événements requis (configurés automatiquement par `stripe listen`) :

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

### Test manuel d'un événement

```bash
stripe trigger checkout.session.completed
```

---

## 4. Webhooks — production

### Option A — Cloud Function Firebase (recommandé)

Endpoint HTTPS public, sans backend FastAPI :

```
https://europe-west1-forma-cad-dev.cloudfunctions.net/stripeWebhook
```

(Remplacez `forma-cad-dev` par votre projet Firebase si différent.)

#### Déploiement

1. Copiez `functions/.env.example` → `functions/.env` (ou `functions/.env.forma-cad-dev`) :

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...        # rempli après création de l'endpoint Stripe
STRIPE_PRO_PRICE_ID=price_...
STRIPE_ON_DEMAND_PRICE_ID=price_...
```

2. Définissez les secrets (recommandé pour les clés sensibles) :

```bash
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
```

3. Déployez :

```bash
cd functions && npm install && npm run build
firebase deploy --only functions:stripeWebhook
```

4. Dans [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks) → **Add endpoint** :
   - URL : `https://europe-west1-forma-cad-dev.cloudfunctions.net/stripeWebhook`
   - Événements :
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
5. Copiez le **Signing secret** (`whsec_...`) dans `STRIPE_WEBHOOK_SECRET` puis redéployez si nécessaire.

Code : `functions/src/billing/stripeWebhook.ts`

### Option B — Backend FastAPI

#### URL de l'endpoint

```
https://VOTRE_DOMAINE/api/billing/webhook
```

Exemples :

- `https://api.forma.app/api/billing/webhook`
- `https://forma-cad-dev.web.app/api/billing/webhook` (si le backend est derrière le même hôte)

### Configuration Dashboard

1. [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks)
2. **Add endpoint**
3. URL : `https://VOTRE_DOMAINE/api/billing/webhook`
4. Sélectionnez les événements :
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Copiez le **Signing secret** (`whsec_...`) dans les variables d'environnement de production :

```env
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_ON_DEMAND_PRICE_ID=price_...
FORMA_FRONTEND_ORIGIN=https://forma.app
```

### Checklist production

- [ ] Clés **live** (`sk_live_...`) — pas de clés test en prod
- [ ] Webhook endpoint en **HTTPS**
- [ ] Secret webhook distinct par environnement (test vs live)
- [ ] `FORMA_FRONTEND_ORIGIN` = URL réelle du frontend (redirections Checkout / portail)
- [ ] Firebase Admin SDK déployé (mise à jour Firestore depuis les webhooks)
- [ ] Portail client Stripe activé (voir §5)
- [ ] Tester un abonnement réel puis vérifier Firestore : `subscriptionPlan: "pro"`

### Vérifier les livraisons webhook

Dashboard → Webhooks → votre endpoint → **Event deliveries**  
En cas d'échec : consulter les logs backend et le code HTTP renvoyé (400 = signature invalide, 503 = secret manquant).

---

## 5. Portail client Stripe

Le bouton **Gérer l'abonnement** ouvre le portail Stripe.

1. [Dashboard → Settings → Billing → Customer portal](https://dashboard.stripe.com/settings/billing/portal)
2. Activez : mise à jour du moyen de paiement, consultation des factures, annulation d'abonnement
3. URL de retour : gérée par le backend (`FORMA_FRONTEND_ORIGIN/settings?tab=billing`)

---

## 6. Variables d'environnement complètes

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `STRIPE_SECRET_KEY` | Oui | Clé secrète Stripe (`sk_test_` ou `sk_live_`) |
| `STRIPE_WEBHOOK_SECRET` | Oui | Secret de signature webhook (`whsec_...`) |
| `STRIPE_PRO_PRICE_ID` | Oui | ID du prix mensuel Pro |
| `STRIPE_ON_DEMAND_PRICE_ID` | Recommandé | ID du prix metered on-demand |
| `FORMA_FRONTEND_ORIGIN` | Oui | Origine frontend pour Checkout / portail |

Sans ces variables, l'app retombe sur le mode local (toggle plan dans les réglages, sans paiement).

---

## 7. Comportement applicatif

### Abonnement Pro

1. Utilisateur connecté → **Souscrire à Pro** → Stripe Checkout
2. Webhook `checkout.session.completed` → lecture de l'abonnement
3. Firestore `users/{uid}` :
   - `subscriptionPlan: "pro"`
   - `billingManaged: true`

### Usage à la demande

1. Utilisateur **Pro** active l'add-on dans Réglages → Billing
2. API `POST /api/billing/on-demand/enable` ajoute un `SubscriptionItem` metered
3. Webhook `customer.subscription.updated` → `onDemandUsageEnabled: true`
4. Désactivation : `POST /api/billing/on-demand/disable`

### Résiliation

Via le portail client → webhook `customer.subscription.deleted` :

- `subscriptionPlan: "free"`
- `onDemandUsageEnabled: false`

### Données privées Stripe

`users/{uid}/private/billing` :

- `stripeCustomerId`
- `stripeSubscriptionId`
- `stripeOnDemandItemId`
- `stripeSubscriptionStatus`

---

## 8. Rapport d'usage (on-demand)

L'add-on metered nécessite d'**envoyer la consommation** à Stripe (ex. une unité par requête IA).  
Point d'extension futur : appeler `SubscriptionItem.create_usage_record` depuis le backend après chaque requête IA éligible.

En attendant, l'activation/désactivation de l'add-on et la synchronisation du profil utilisateur fonctionnent via les webhooks décrits ci-dessus.

---

## 9. Dépannage

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| Boutons Stripe absents | `STRIPE_SECRET_KEY` ou `STRIPE_PRO_PRICE_ID` manquant | Vérifier `.env`, relancer le backend |
| Webhook 400 | Mauvais `STRIPE_WEBHOOK_SECRET` | Recopier le secret du bon endpoint (CLI vs Dashboard) |
| Plan reste « Gratuit » après paiement | Webhook non reçu ou Firebase indisponible | Vérifier Event deliveries + logs backend |
| On-demand indisponible | `STRIPE_ON_DEMAND_PRICE_ID` vide | Relancer `./scripts/setup-stripe.sh` |
| « Abonnement Pro requis » | Pas d'abonnement actif côté Stripe | Compléter Checkout Pro d'abord |

---

## 10. Références

- [Stripe Checkout — subscriptions](https://docs.stripe.com/billing/subscriptions/build-subscriptions)
- [Stripe CLI — webhooks locaux](https://docs.stripe.com/webhooks/test)
- [Customer portal](https://docs.stripe.com/customer-management/integrate-customer-portal)
- Code : `backend/app/billing/stripe_service.py`, `backend/app/api/billing.py`
