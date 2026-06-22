# Architecture Lyte / Forma

Documentation complète de l'architecture applicative — authentification, features, appels, connecteurs, Firebase, billing Stripe et autorisations.

> **Téléchargement / export**
> - Ce fichier : `docs/ARCHITECTURE.md` (Markdown, versionné dans le repo)
> - Version HTML navigable : `docs/ARCHITECTURE.html` (ouvrir dans le navigateur → Imprimer → Enregistrer en PDF)
> - Diagrammes Mermaid : copier un bloc ` ```mermaid ` dans [mermaid.live](https://mermaid.live) pour exporter PNG/SVG

**Projet Firebase :** `forma-cad-dev`  
**Déploiement prod :** Vercel — SPA `/app`, API `/api/*` → FastAPI, landing `/`  
**Secrets :** Google Secret Manager (`forma-backend-env`, `forma-functions-env`, `forma-frontend-env`)

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Parcours utilisateur](#2-parcours-utilisateur)
3. [Authentification](#3-authentification)
4. [Modèle Firestore](#4-modèle-firestore)
5. [Connecteurs OAuth](#5-connecteurs-oauth)
6. [Appels vocaux & Théâtre](#6-appels-vocaux--théâtre)
7. [Chat IA vs Messages](#7-chat-ia-vs-messages)
8. [Billing Stripe](#8-billing-stripe)
9. [Autorisations](#9-autorisations)
10. [Routes API](#10-routes-api)
11. [Référence fichiers](#11-référence-fichiers)

---

## 1. Vue d'ensemble

```mermaid
flowchart TB
  subgraph CLIENT["Frontend React (Vite)"]
    APP[App.tsx]
    AUTH_STORE[useAuthStore]
    WS_STORE[useWorkspacesStore]
    CALLS[useCallsStore]
    CHAT[useStore — AI Chat]
    PEOPLE[FriendsChatPanel — Messages]
    BILLING_UI[BillingSettings]
    CONNECTORS_UI[useConnectors]
  end

  subgraph FIREBASE["Firebase"]
    FB_AUTH[Firebase Auth]
    FS[(Firestore)]
    CF[Cloud Functions europe-west1]
    HOSTING[Hosting / Vercel SPA]
  end

  subgraph BACKEND["Backend FastAPI"]
    AUTH_DEP[auth_deps — verify ID token]
    CONNECTORS[/api/connectors]
    BILLING[/api/billing]
    HANDOFFS[/api/handoffs]
    CAL_SYNC[calendar_sync]
    CAD[/api — CAD local]
  end

  subgraph EXTERNAL["Services externes"]
    STRIPE[Stripe]
    GOOGLE[Google OAuth + Calendar + Gmail]
    MS[Microsoft OAuth + Outlook]
    SPOTIFY[Spotify OAuth]
    LLM[xAI / OpenAI / Anthropic]
  end

  APP --> AUTH_STORE
  AUTH_STORE --> FB_AUTH
  AUTH_STORE --> FS
  APP --> WS_STORE & CALLS & CHAT & PEOPLE
  CHAT --> CF
  CONNECTORS_UI --> CONNECTORS
  BILLING_UI --> BILLING
  PEOPLE --> FS
  CALLS --> FS

  CONNECTORS --> GOOGLE & MS & SPOTIFY
  CONNECTORS --> FS
  BILLING --> STRIPE
  BILLING --> FS
  CAL_SYNC --> GOOGLE & MS
  CF --> LLM
  CF --> FS
  AUTH_DEP --> FB_AUTH
  BACKEND --> AUTH_DEP
```

### Carte des composants

| Couche | Éléments clés |
|--------|---------------|
| **UI** | `AuthPage`, `ChatPanel`, `FriendsChatPanel`, `CallsView`, `TheaterView`, `PlanSettingsSection` |
| **Stores** | `useAuthStore`, `useWorkspacesStore`, `useCallsStore`, `useStore`, `usePeopleStore`, `useConnectorsStore` |
| **Firebase client** | `client.ts`, `userData.ts`, `friendChats.ts`, `webrtcSignaling.ts` |
| **Backend** | `main.py`, `connectors/`, `billing/`, `api/handoffs.py` |
| **Cloud Functions** | `aiChat`, `setUserApiKey`, `stripeWebhook`, `completeDesktopAuthSession` |
| **Externe** | Stripe, Google, Microsoft, Spotify, LLM providers |

---

## 2. Parcours utilisateur

```mermaid
flowchart LR
  A[1. Connexion Firebase] --> B[2. Onboarding workspace]
  B --> C[3. Chat IA / Skills]
  B --> D[4. Messages amis/groupes]
  B --> E[5. Appels vocaux / Théâtre]
  B --> F[6. Connecteurs OAuth]
  C --> G[7. Abonnement Pro / Enterprise]
  G --> H[8. AI Notes / Follow-up]
  D --> I[9. Handoffs]
  F --> J[10. Calendrier / Mail / Spotify]
```

| # | Parcours | Fichiers principaux |
|---|----------|---------------------|
| 1 | Connexion OAuth ou magic link | `useAuthStore.ts`, `firebase/client.ts` |
| 2 | Création/jointure workspace | `useWorkspacesStore.ts`, `workspacesShared/` |
| 3 | Chat agent IA | `ChatPanel.tsx`, CF `aiChat` |
| 4 | Skills slash | `chatSkills.ts`, `mailSkill.ts`, `playSkill.ts` |
| 5 | Messages people | `FriendsChatPanel.tsx`, `friendChats/`, `groupChats/` |
| 6 | Appel vocal workspace | `useCallsStore.ts`, WebRTC signaling |
| 7 | Mode théâtre | `TheaterView.tsx`, `theaterChat/` |
| 8 | Calendrier sync | `calendarSync.ts`, `calendar_sync.py` |
| 9 | Connecteurs OAuth | `useConnectors.ts`, `connectors.py` |
| 10 | Abonnement Pro | `billingApi.ts`, Stripe webhooks |
| 11 | Enterprise workspace | `subscriptionPlans.ts`, checkout enterprise |
| 12 | Handoff | `useHandoffStore.ts`, `/api/handoffs` |
| 13 | Desktop Electron | `desktopAuthSessions/`, custom token |
| 14 | CAD (local only) | `/api/agent`, `/api/rebuild` |

---

## 3. Authentification

```mermaid
sequenceDiagram
  participant U as Utilisateur
  participant FE as Frontend
  participant FA as Firebase Auth
  participant FS as Firestore
  participant BE as Backend FastAPI
  participant CF as Cloud Functions

  U->>FE: Ouvre /app/
  FE->>FA: watchAuthState()

  alt Email magic link
    U->>FE: continueWithEmail(email)
    FE->>FA: sendEmailSignInLink
    U->>FA: Clique lien email
    FA->>FE: completeEmailSignInIfPresent()
  else OAuth Google / Microsoft / Facebook
    U->>FE: signInWithProvider()
    FA->>FE: completeOAuthRedirectIfPresent()
  end

  FA-->>FE: User uid, email, token
  FE->>FS: loadUserProfile, loadUserWorkspaces
  FE->>FS: saveUserDirectoryProfile
  FE->>WS_STORE: hydrate workspaces actifs

  Note over FE,BE: Requêtes API authentifiées
  FE->>BE: Authorization Bearer Firebase ID Token
  BE->>FA: verify_id_token()
  BE-->>FE: FirebaseUser uid/email

  FE->>CF: onCall aiChat / setUserApiKey
  CF->>FA: request.auth.uid
```

### Documents Firestore à l'auth

| Collection | Contenu |
|------------|---------|
| `users/{uid}` | profil, préférences, `subscriptionPlan`, `billingManaged` |
| `users/{uid}/private/apiKeys` | clés LLM BYOK (Functions/backend only) |
| `users/{uid}/private/connectors` | tokens OAuth (backend only) |
| `userDirectory/{uid}` | email, displayName pour @mentions |

### Auth desktop

```mermaid
sequenceDiagram
  participant D as App Desktop
  participant B as Navigateur
  participant CF as Cloud Functions
  participant FS as Firestore

  D->>D: Génère sessionId UUID
  D->>B: Ouvre /auth/desktop?session=...
  B->>B: Login Firebase normal
  B->>CF: completeDesktopAuthSession(sessionId)
  CF->>FS: desktopAuthSessions/{sessionId} = customToken
  D->>CF: claimDesktopAuthSession(sessionId)
  CF-->>D: customToken
  D->>D: signInWithCustomToken
```

---

## 4. Modèle Firestore

```mermaid
erDiagram
  USERS ||--o{ PRIVATE : subcollections
  USERS ||--o| USER_DIRECTORY : miroir public
  USERS ||--o{ FRIEND_CHATS : DM
  USERS ||--o{ GROUP_CHATS : groupes

  WORKSPACES_SHARED ||--o{ VOICE_RTC : signaling WebRTC
  WORKSPACES_SHARED ||--o{ THEATER_CHAT : chat scène
  WORKSPACES_SHARED ||--o{ VOICE_POLL : sondages
  WORKSPACES_SHARED ||--o{ PRESENCE : membres en ligne
  WORKSPACES_SHARED ||--o{ HANDOFFS : transferts

  USERS {
    string uid PK
    string email
    string subscriptionPlan
    bool billingManaged
    string stripeCustomerId
  }

  WORKSPACES_SHARED {
    string workspaceId PK
    string ownerUid
    bool enterpriseBillingManaged
    array memberIds
  }

  VOICE_RTC {
    string sessionId PK
    subcollection signals
  }
```

### Arborescence complète

```
users/{uid}                          # profil (owner read/write)
users/{uid}/workspaces/{id}
users/{uid}/memberships/{id}
users/{uid}/chatSessions/{id}
users/{uid}/projects/{id}            # CAD autosave
users/{uid}/friends/{friendUid}
users/{uid}/notifications/{id}
users/{uid}/private/billing          # Admin write only
users/{uid}/private/connectors         # Admin write only
users/{uid}/private/apiKeys/{provider}
users/{uid}/private/usage

userDirectory/{uid}
friendRequests/{id}
friendChats/{id}/messages/{msgId}
groupChats/{id}/messages/{msgId}
handoffs/{id}                        # create via Admin API

workspacesShared/{wid}
workspacesShared/{wid}/joinRequests/{uid}
workspacesShared/{wid}/members/{uid}
workspacesShared/{wid}/presence/{uid}
workspacesShared/{wid}/voiceKnocks/{id}
workspacesShared/{wid}/openVoiceChannels/{id}
workspacesShared/{wid}/voicePoll/active
workspacesShared/{wid}/theaterChat/{msgId}
workspacesShared/{wid}/voiceRtc/{sessionId}/signals/{signalId}
workspacesShared/{wid}/private/billing

desktopAuthSessions/{sessionId}
```

---

## 5. Connecteurs OAuth

### Registry

| ID | Provider | Scopes principaux | Skill |
|----|----------|-------------------|-------|
| `calendar` | Google | calendar.readonly, calendar.events | `/manage`, `/meeting` |
| `gmail` | Google | gmail.readonly, gmail.send | `/mail` |
| `outlook` | Microsoft | Mail.Read, Calendars.ReadWrite | calendrier Outlook |
| `spotify` | Spotify | streaming, playback | `/play` |

### Cycle OAuth complet

```mermaid
sequenceDiagram
  participant U as User
  participant FE as Frontend
  participant BE as Backend
  participant P as Provider
  participant FS as Firestore

  U->>FE: Clique Connecter Gmail
  FE->>BE: GET /connectors/gmail/authorize + Bearer token
  BE->>BE: require_firebase_user()
  BE->>BE: create_authorize_session(uid, state)
  BE-->>FE: url provider OAuth
  FE->>P: Redirect
  P->>U: Consent screen
  P->>BE: GET /oauth/callback?code&state
  BE->>BE: pop_state → uid, connector_id
  BE->>P: POST token exchange
  P-->>BE: access_token + refresh_token
  BE->>FS: users/{uid}/private/connectors
  BE-->>FE: HTML postMessage → app reconnectée
  FE->>BE: GET /connectors (status connected)
```

```mermaid
flowchart LR
  UI[Settings / Chat] --> AUTHZ[GET /authorize]
  AUTHZ --> REDIR[Redirect provider]
  REDIR --> CB[GET /oauth/callback]
  CB --> STORE[Firestore private/connectors]
  STORE --> SKILLS[Skills /mail /play /manage]
  SKILLS --> API[POST connector_resources]
  API --> EXT[Gmail / Calendar / Spotify API]
```

**Redirect URI prod :** `https://autocad-blue.vercel.app/api/connectors/oauth/callback`  
**Redirect URI dev :** `http://127.0.0.1:8000/api/connectors/oauth/callback`

### Exemple `/mail`

```mermaid
sequenceDiagram
  participant U as User
  participant FE as ChatPanel
  participant BE as Backend
  participant G as Gmail API
  participant FS as Firestore

  U->>FE: /mail @alice sujet: Hello corps: ...
  FE->>FE: mailSkill.ts parse recipients
  FE->>FS: userDirectory lookup @alice
  FE->>BE: POST /connectors/gmail/send + Bearer token
  BE->>FS: users/{uid}/private/connectors
  BE->>G: Gmail API send MIME
  G-->>BE: messageId
  BE-->>FE: ok
```

---

## 6. Appels vocaux & Théâtre

```mermaid
flowchart TB
  subgraph JOIN["Rejoindre un appel"]
    J1[User clique Rejoindre]
    J2[useCallsStore.joinCall]
    J3[Session voiceRtc/sessionId]
    J4[RTCPeerConnection]
  end

  subgraph SIGNAL["Signaling Firestore"]
    S1[sendRtcSignal offer/answer/candidate]
    S2[workspacesShared/wid/voiceRtc/session/signals]
    S3[watchIncomingRtcSignals toUid]
  end

  subgraph TYPES["Types d'appel"]
    T1[Bloc privé 1:1 — knock]
    T2[Canal ouvert — openVoiceChannels]
    T3[Théâtre — speaker/audience]
  end

  subgraph FEATURES["Features en appel"]
    F1[VoiceParticipantsInCallGrid]
    F2[TheaterChatPanel]
    F3[AI Notes Pro/Enterprise]
    F4[Follow-up post-appel]
    F5[Voice polls]
  end

  J1 --> J2 --> J3 --> J4
  J4 --> S1 --> S2 --> S3 --> J4
  TYPES --> JOIN
  J3 --> FEATURES
```

### Cycle WebRTC

```mermaid
sequenceDiagram
  participant A as User A caller
  participant FS as Firestore signals
  participant B as User B callee

  A->>A: createOffer()
  A->>FS: signal type offer toUid B
  FS-->>B: onSnapshot offer
  B->>B: setRemoteDescription + createAnswer()
  B->>FS: signal type answer toUid A
  FS-->>A: onSnapshot answer
  A->>B: ICE candidates via FS
  Note over A,B: Connexion P2P — audio/vidéo direct
```

### Knock flow

1. Appelant : `sendVoiceKnock(workspaceId, fromUid, toUid)`
2. Destinataire : `JoinKnockOverlay` → accept/decline
3. Accept : `completeRemoteKnockJoin` → session RTC `private__{sorted_uids}`
4. Présence : `workspacesShared/{wid}/presence/{uid}` — `voiceInPrivateCall`, `voiceSpeaking`

---

## 7. Chat IA vs Messages

```mermaid
flowchart TB
  subgraph AI["Chat IA — ChatPanel"]
    AC1[useStore.sendChat]
    AC2[Skills slash]
    AC3{Type?}
    AC4[connectorSkills → Backend API]
    AC5[Cloud Function aiChat]
    AC6[LLM xAI/OpenAI/Anthropic]
    AC1 --> AC2 --> AC3
    AC3 -->|Connector| AC4
    AC3 -->|IA pure| AC5 --> AC6
  end

  subgraph PEOPLE["Messages — FriendsChatPanel"]
    PC1[friendChats / groupChats]
    PC2[/manage /group /handoff]
    PC3[Firestore temps réel]
    PC1 --> PC2 --> PC3
  end

  subgraph SHARED["Partagé"]
    M1[userDirectory @mentions]
    M2[handoffs + /api/handoffs]
    M3[workspacePolls]
  end

  AI --> SHARED
  PEOPLE --> SHARED
```

### Skills slash

| Skill | Fichier | Pro requis | Connecteur |
|-------|---------|------------|------------|
| `/manage` | `manageSchedulePrompt.ts` | Oui | Calendar |
| `/meeting` | `meetingSkill.ts` | Non | Calendar |
| `/mail` | `mailSkill.ts` | Non | Gmail |
| `/play` | `playSkill.ts` | Non | Spotify |
| `/group` | `createGroupSkill.ts` | Non | — |
| `/handoff` | `useHandoffStore.ts` | Si dest. non-Pro | — |
| `/recap` | `recapSkill.ts` | Oui | — |

---

## 8. Billing Stripe

```mermaid
flowchart TB
  subgraph PLANS["Plans"]
    FREE[Gratuit — workspace, appels, messages, connecteurs]
    PRO[Pro 30 USD/mois — IA + AI Notes + Follow-up]
    ENT[Enterprise — pool IA workspace ≥10 membres]
  end

  subgraph CHECKOUT["Checkout"]
    C1[UpgradeProButton]
    C2[POST /api/billing/checkout]
    C3[Stripe Checkout Session]
    C4[Paiement Stripe]
    C5[Webhook checkout.session.completed]
  end

  subgraph STATE["Firestore"]
    S1[subscriptionPlan pro]
    S2[billingManaged true]
    S3[enterpriseBillingManaged workspace]
    S4[private/billing stripe IDs]
  end

  subgraph ACCESS["Gates frontend"]
    A1[hasAiAccess]
    A2[AI Chat]
    A3[AI Notes]
    A4[Follow-up / recap]
    A5[On-demand add-on]
  end

  PRO --> C1 --> C2 --> C3 --> C4 --> C5 --> STATE
  STATE --> A1 --> A2 & A3 & A4 & A5
```

```mermaid
sequenceDiagram
  participant S as Stripe
  participant WH as stripeWebhook CF ou /api/billing/webhook
  participant FS as Firestore
  participant FE as Frontend

  S->>WH: checkout.session.completed
  WH->>WH: verify signature
  WH->>FS: subscriptionPlan + billingManaged
  FE->>FE: GET /api/billing/status
  FE->>FE: effectiveSubscriptionPlan()
  FE->>FE: hasAiAccess() débloque IA
```

| Plan | Condition effective | Capacités |
|------|---------------------|-----------|
| **free** | défaut ou `billingManaged !== true` | Workspace, appels, messages, connecteurs |
| **pro** | `subscriptionPlan === "pro" && billingManaged` | IA, AI Notes, Follow-up, quota $30/mois |
| **enterprise** | workspace `enterpriseBillingManaged` | Pool IA partagé (≥10 membres) |

> **Règle critique :** `subscriptionPlan: "pro"` sans `billingManaged: true` = **free effectif**.

---

## 9. Autorisations

```mermaid
flowchart TB
  subgraph L1["Niveau 1 — Firestore Rules"]
    R1[users/uid owner write]
    R2[private/* DENY client write]
    R3[workspacesShared members]
    R4[friendChats participants]
    R5[voiceRtc signals participants]
    R6[billing fields webhook-only]
  end

  subgraph L2["Niveau 2 — Backend"]
    B1[require_firebase_user Bearer token]
    B2[Connectors uid scoped tokens]
    B3[Billing uid scoped Stripe]
  end

  subgraph L3["Niveau 3 — Cloud Functions"]
    C1[assertAuthenticated]
    C2[checkUsageGate quota Pro/Enterprise]
  end

  subgraph L4["Niveau 4 — Frontend"]
    F1[hasAiAccess subscriptionPlans.ts]
    F2[FREE_OWNED_WORKSPACE_LIMIT 3]
    F3[appAccess redirect mobile landing]
  end

  L1 --> L2 --> L3 --> L4
```

### Matrice d'accès

| Ressource | Client rules | Backend | Condition métier |
|-----------|-------------|---------|------------------|
| `users/{uid}` profil | owner | token verify | billing fields protégés |
| `users/{uid}/private/*` | deny write | Admin SDK | connectors, billing, usage |
| `workspacesShared/{wid}` | signed-in read | membership | enterprise webhook-only |
| `friendChats`, `groupChats` | participants | handoffs API | — |
| `handoffs/{id}` | read participants | create Admin only | Pro si dest. non-Pro |
| Connecteurs API | — | require_firebase_user | tokens server-side |
| IA chat | — | usage gate CF/backend | Pro ou Enterprise workspace |

---

## 10. Routes API

Base : `/api` (Vercel rewrite → FastAPI).

### Connecteurs

| Method | Route |
|--------|-------|
| GET | `/api/connectors` |
| GET | `/api/connectors/{id}/authorize` |
| GET | `/api/connectors/oauth/callback` |
| DELETE | `/api/connectors/{id}` |
| GET/POST | `/api/connectors/calendar/events` |
| GET/POST | `/api/connectors/gmail/send`, `/gmail/messages` |
| GET/POST | `/api/connectors/outlook/calendar/events` |
| GET/POST | `/api/connectors/spotify/play`, `/playback`, `/search` |

### Billing

| Method | Route |
|--------|-------|
| GET | `/api/billing/config`, `/status`, `/summary`, `/usage` |
| POST | `/api/billing/checkout/pro`, `/checkout/enterprise` |
| POST | `/api/billing/portal`, `/cancel`, `/sync` |
| POST | `/api/billing/on-demand/enable`, `/disable` |
| POST | `/api/billing/webhook` |

### Autres

| Method | Route |
|--------|-------|
| POST | `/api/handoffs` |
| POST/GET | `/api/auth/desktop/complete`, `/claim` |
| POST | `/api/chat`, `/api/recap` (full backend / local) |

### Cloud Functions (callable)

`aiChat`, `aiHealth`, `setUserApiKey`, `deleteUserApiKey`, `getUserApiKeyStatus`, `completeDesktopAuthSession`, `claimDesktopAuthSession`, `stripeWebhook`

---

## 11. Référence fichiers

| Domaine | Fichier |
|---------|---------|
| Règles Firestore | `firestore.rules` |
| Entry backend | `backend/app/main.py` |
| Registry connecteurs | `backend/app/connectors/registry.py` |
| OAuth flow | `backend/app/connectors/oauth.py`, `api/connectors.py` |
| Billing | `backend/app/api/billing.py`, `docs/STRIPE_BILLING.md` |
| Plans | `frontend/src/lib/subscriptionPlans.ts` |
| Auth store | `frontend/src/store/useAuthStore.ts` |
| Calls | `frontend/src/store/useCallsStore.ts` |
| WebRTC | `frontend/src/lib/webrtc/workspaceVoiceRtc.ts` |
| Skills | `frontend/src/lib/chatSkills.ts` |
| Cloud Functions | `functions/src/index.ts` |
| Connecteurs doc | `docs/CONNECTORS.md` |
| Déploiement | `vercel.json`, `firebase.json` |

---

## Carte mentale des features

```mermaid
mindmap
  root((Lyte App))
    Auth
      Email magic link
      Google OAuth
      Microsoft OAuth
      Facebook OAuth
      Desktop auth session
    Workspace
      Création switch
      Membres présence
      Polls workspace
      CAD Agent local
    Appels
      Voice WebRTC P2P
      Theater scène
      AI Notes Pro
      Follow-up post-appel
      Voice polls
    Chat IA
      Agent mode
      Skills slash
      Connectors inline
    Messages
      DM friendChats
      Groupes groupChats
      manage handoff group
    Connectors
      Google Calendar
      Gmail send
      Outlook calendar
      Spotify play
    Billing
      Pro 30 USD
      Enterprise par siège
      On-demand usage
      Stripe webhooks
```
