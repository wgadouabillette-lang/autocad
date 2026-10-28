import { createHash, timingSafeEqual } from "crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { runAiChat, assertAuthenticated } from "./ai/chat";
import { runAiTranscribe } from "./ai/transcribe";
import { platformKeyStatus, userApiKeyDocPath, userApiKeysCollectionPath } from "./ai/keys";
import { syncDevSubscriptionPlan as applyDevSubscriptionPlan } from "./billing/syncDevSubscription";
import { ensureFunctionsSecretsLoaded } from "./loadSecrets";
import "./loadSecrets";
import { FUNCTIONS_REGION } from "./region";

/** Webhook Stripe (Checkout + abonnements Pro / Entreprise). */
export { stripeWebhook } from "./billing/stripeWebhook";

/** ACL RTDB (presence / knocks / typing workspace). */
export {
  ensureWorkspaceAcl,
  onWorkspaceMemberAclWrite,
  onWorkspaceSharedAclWrite,
} from "./workspaceAcl";

/** Amitiés (DM) matérialisées à l’acceptation. */
export { ensureFriendship, onFriendRequestAccepted } from "./friendship";

/** ACL RTDB typing groupes. */
export { ensureGroupAcl, onGroupChatAclWrite } from "./groupAcl";

initializeApp();

setGlobalOptions({ region: FUNCTIONS_REGION });

const db = getFirestore();

const ALLOWED_PROVIDERS = new Set(["xai", "openai", "anthropic"]);

function apiKeyRef(uid: string, provider: string) {
  return db.doc(userApiKeyDocPath(uid, provider));
}

function keyPreview(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 4) return "****";
  return `…${trimmed.slice(-4)}`;
}

function assertProvider(provider: unknown): string {
  if (typeof provider !== "string" || !ALLOWED_PROVIDERS.has(provider)) {
    throw new HttpsError("invalid-argument", "Unsupported API key provider.");
  }
  return provider;
}

function assertApiKey(apiKey: unknown): string {
  if (typeof apiKey !== "string") {
    throw new HttpsError("invalid-argument", "API key must be a string.");
  }
  const trimmed = apiKey.trim();
  if (trimmed.length < 8 || trimmed.length > 512) {
    throw new HttpsError("invalid-argument", "API key length is invalid.");
  }
  return trimmed;
}

export const setUserApiKey = onCall({ cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const provider = assertProvider(request.data?.provider);
  const apiKey = assertApiKey(request.data?.apiKey);
  const uid = request.auth.uid;

  await apiKeyRef(uid, provider).set({
    provider,
    apiKey,
    keyPreview: keyPreview(apiKey),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { provider, configured: true, keyPreview: keyPreview(apiKey) };
});

export const deleteUserApiKey = onCall({ cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const provider = assertProvider(request.data?.provider);
  await apiKeyRef(request.auth.uid, provider).delete();
  return { provider, configured: false };
});

export const getUserApiKeyStatus = onCall({ cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  await ensureFunctionsSecretsLoaded();
  const uid = request.auth.uid;
  const snap = await db.collection(userApiKeysCollectionPath(uid)).get();
  const status: Record<string, { configured: boolean; keyPreview?: string }> = {
    xai: { configured: false },
    openai: { configured: false },
    anthropic: { configured: false },
  };

  for (const doc of snap.docs) {
    const data = doc.data();
    status[doc.id] = {
      configured: true,
      keyPreview: typeof data.keyPreview === "string" ? data.keyPreview : undefined,
    };
  }

  const platform = platformKeyStatus();
  for (const provider of ["xai", "openai", "anthropic"] as const) {
    if (!status[provider].configured && platform[provider]) {
      status[provider] = { configured: true, keyPreview: "Plateforme" };
    }
  }

  return { providers: status };
});

/** Chat IA — clés lues côté serveur uniquement (Firestore + secrets Functions). */
export const aiChat = onCall({ cors: true, timeoutSeconds: 120 }, async (request) => {
  assertAuthenticated(request.auth?.uid);
  await ensureFunctionsSecretsLoaded();
  return runAiChat(request.auth.uid, request.data ?? {});
});

/** Live notes STT — Whisper. Electron Web Speech fails with error "network". */
export const aiTranscribe = onCall({ cors: true, timeoutSeconds: 60 }, async (request) => {
  assertAuthenticated(request.auth?.uid);
  await ensureFunctionsSecretsLoaded();
  return runAiTranscribe(request.auth.uid, request.data ?? {});
});

/** Sync plan Pro local (Stripe désactivé) vers Firestore pour le quota IA. */
export const syncDevSubscriptionPlan = onCall({ cors: true }, async (request) => {
  assertAuthenticated(request.auth?.uid);
  return applyDevSubscriptionPlan(request.auth.uid, request.data ?? {});
});

/** Statut LLM côté Cloud Functions (sans exposer de clés). */
export const aiHealth = onCall({ cors: true }, async (request) => {
  assertAuthenticated(request.auth?.uid);
  await ensureFunctionsSecretsLoaded();
  const snap = await db.collection(userApiKeysCollectionPath(request.auth.uid)).get();
  const userConfigured = snap.docs.some((doc) => {
    const value = doc.data()?.apiKey;
    return typeof value === "string" && value.trim().length > 0;
  });
  const platform = platformKeyStatus();
  const platformConfigured = platform.xai || platform.openai || platform.anthropic;
  return {
    llm: userConfigured || platformConfigured,
    user_keys: userConfigured,
    platform_keys: platformConfigured,
  };
});

const DESKTOP_AUTH_SESSION_TTL_MS = 10 * 60 * 1000;
const DESKTOP_AUTH_SESSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertDesktopAuthSessionId(sessionId: unknown): string {
  if (typeof sessionId !== "string" || !DESKTOP_AUTH_SESSION_RE.test(sessionId)) {
    throw new HttpsError("invalid-argument", "Invalid desktop auth session id.");
  }
  return sessionId;
}

function desktopAuthSessionRef(sessionId: string) {
  return db.doc(`desktopAuthSessions/${sessionId}`);
}

function claimSecretDigest(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

function claimSecretMatches(stored: unknown, secret: string): boolean {
  if (typeof stored !== "string" || typeof secret !== "string") return false;
  const digest = claimSecretDigest(secret);
  const left = Buffer.from(stored);
  const right = Buffer.from(digest);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function assertClaimSecret(secret: unknown): string {
  if (typeof secret !== "string" || secret.length < 32 || secret.length > 200) {
    throw new HttpsError("permission-denied", "Desktop auth claim was refused.");
  }
  return secret;
}

export const completeDesktopAuthSession = onCall({ cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const sessionId = assertDesktopAuthSessionId(request.data?.sessionId);
  const ref = desktopAuthSessionRef(sessionId);
  const customToken = await getAuth().createCustomToken(request.auth.uid);
  await ref.set(
    {
      token: customToken,
      uid: request.auth.uid,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { ok: true };
});

export const claimDesktopAuthSession = onCall({ cors: true }, async (request) => {
  const sessionId = assertDesktopAuthSessionId(request.data?.sessionId);
  const rawSecret = request.data?.claimSecret;
  const ref = desktopAuthSessionRef(sessionId);
  const snap = await ref.get();
  if (!snap.exists) {
    return { status: "pending" as const };
  }

  const data = snap.data();
  const storedHash = data?.claimSecretHash;
  const hasClaimHash = typeof storedHash === "string" && storedHash.length === 64;
  if (hasClaimHash) {
    const claimSecret = assertClaimSecret(rawSecret);
    if (!claimSecretMatches(storedHash, claimSecret)) {
      throw new HttpsError("permission-denied", "Desktop auth claim was refused.");
    }
  } else if (typeof rawSecret === "string" && rawSecret.length > 0) {
    return { status: "pending" as const };
  }
  const createdAt = data?.createdAt?.toDate?.()?.getTime?.() ?? 0;
  if (createdAt && Date.now() - createdAt > DESKTOP_AUTH_SESSION_TTL_MS) {
    await ref.delete();
    throw new HttpsError("deadline-exceeded", "Desktop auth session expired.");
  }

  const customToken = data?.token;
  if (typeof customToken === "string" && customToken) {
    await ref.delete();
    return { status: "ready" as const, customToken };
  }

  const provider = data?.provider;
  const idToken = data?.idToken;
  if (
    provider === "google" &&
    typeof idToken === "string" &&
    idToken
  ) {
    await ref.delete();
    return {
      status: "ready" as const,
      provider,
      idToken,
      accessToken: typeof data?.accessToken === "string" ? data.accessToken : undefined,
    };
  }

  return { status: "pending" as const };
});

