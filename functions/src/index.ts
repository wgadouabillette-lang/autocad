import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { runAiChat, assertAuthenticated } from "./ai/chat";

initializeApp();

setGlobalOptions({ region: "us-central1" });

const db = getFirestore();

const ALLOWED_PROVIDERS = new Set(["xai", "openai", "anthropic"]);

function apiKeyRef(uid: string, provider: string) {
  return db.doc(`users/${uid}/private/apiKeys/${provider}`);
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
  const uid = request.auth.uid;
  const snap = await db.collection(`users/${uid}/private/apiKeys`).get();
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

  return { providers: status };
});

/** Chat IA — clés lues côté serveur uniquement (Firestore + secrets Functions). */
export const aiChat = onCall({ cors: true, timeoutSeconds: 120 }, async (request) => {
  assertAuthenticated(request.auth?.uid);
  return runAiChat(request.auth.uid, request.data ?? {});
});

/** Statut LLM côté Cloud Functions (sans exposer de clés). */
export const aiHealth = onCall({ cors: true }, async (request) => {
  assertAuthenticated(request.auth?.uid);
  const snap = await db.collection(`users/${request.auth.uid}/private/apiKeys`).get();
  const userConfigured = snap.docs.some((doc) => {
    const value = doc.data()?.apiKey;
    return typeof value === "string" && value.trim().length > 0;
  });
  const platformConfigured = Boolean(
    process.env.XAI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY,
  );
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

export const completeDesktopAuthSession = onCall({ cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const sessionId = assertDesktopAuthSessionId(request.data?.sessionId);
  const customToken = await getAuth().createCustomToken(request.auth.uid);
  await desktopAuthSessionRef(sessionId).set({
    token: customToken,
    uid: request.auth.uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

export const claimDesktopAuthSession = onCall({ cors: true }, async (request) => {
  const sessionId = assertDesktopAuthSessionId(request.data?.sessionId);
  const ref = desktopAuthSessionRef(sessionId);
  const snap = await ref.get();
  if (!snap.exists) {
    return { status: "pending" as const };
  }

  const data = snap.data();
  const createdAt = data?.createdAt?.toDate?.()?.getTime?.() ?? 0;
  if (!createdAt || Date.now() - createdAt > DESKTOP_AUTH_SESSION_TTL_MS) {
    await ref.delete();
    throw new HttpsError("deadline-exceeded", "Desktop auth session expired.");
  }

  const customToken = data?.token;
  if (typeof customToken !== "string" || !customToken) {
    await ref.delete();
    throw new HttpsError("internal", "Desktop auth session is invalid.");
  }

  await ref.delete();
  return { status: "ready" as const, customToken };
});
