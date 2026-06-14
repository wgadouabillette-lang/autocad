import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  signInWithCustomToken,
  type AuthCredential,
  type UserCredential,
} from "firebase/auth";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getAuthIdToken } from "./authToken";
import { hasFormaDesktop } from "../formaDesktop";
import { auth, db, functions, type FirebaseAuthProvider } from "./client";

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 10 * 60 * 1000;

export interface DesktopAuthOAuthPayload {
  provider: FirebaseAuthProvider;
  idToken: string;
  accessToken?: string;
}

type DesktopAuthCompletion =
  | { kind: "customToken"; token: string }
  | { kind: "oauth"; payload: DesktopAuthOAuthPayload };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function desktopWebAuthBaseUrl(): string {
  const configured = import.meta.env.VITE_FORMA_WEB_AUTH_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  // Page hébergée Firebase — domaine toujours autorisé (évite localhost/127.0.0.1 en dev).
  return "https://forma-cad-dev.web.app/auth";
}

export function buildDesktopWebAuthUrl(sessionId: string): string {
  const url = new URL(desktopWebAuthBaseUrl());
  url.searchParams.set("session", sessionId);
  url.searchParams.set("platform", window.formaDesktop?.platform ?? navigator.platform.toLowerCase());
  return url.toString();
}

export function oauthPayloadFromResult(
  provider: FirebaseAuthProvider,
  result: UserCredential,
): DesktopAuthOAuthPayload {
  const credential =
    provider === "google"
      ? GoogleAuthProvider.credentialFromResult(result)
      : OAuthProvider.credentialFromResult(result);

  const idToken = credential?.idToken ?? undefined;
  const accessToken = credential?.accessToken ?? undefined;

  if (!idToken) {
    throw new Error("Jeton OAuth introuvable après connexion.");
  }

  return {
    provider,
    idToken,
    accessToken: accessToken || undefined,
  };
}

function oauthCredentialFromPayload(payload: DesktopAuthOAuthPayload): AuthCredential {
  if (payload.provider === "google") {
    return GoogleAuthProvider.credential(payload.idToken, payload.accessToken);
  }
  const providerId = payload.provider === "microsoft" ? "microsoft.com" : "apple.com";
  return new OAuthProvider(providerId).credential({
    idToken: payload.idToken,
    accessToken: payload.accessToken,
  });
}

async function openExternalAuthUrl(url: string): Promise<void> {
  if (hasFormaDesktop() && window.formaDesktop?.openExternal) {
    await window.formaDesktop.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

async function completeDesktopAuthSessionViaBackend(sessionId: string): Promise<boolean> {
  const idToken = await getAuthIdToken(true);
  if (!idToken) return false;
  const response = await fetch("/api/auth/desktop/complete", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId }),
  });
  return response.ok;
}

async function completeDesktopAuthSessionViaFirestore(
  sessionId: string,
  payload: DesktopAuthOAuthPayload,
): Promise<void> {
  await setDoc(doc(db, "desktopAuthSessions", sessionId), {
    provider: payload.provider,
    idToken: payload.idToken,
    accessToken: payload.accessToken ?? null,
    createdAt: serverTimestamp(),
  });
}

async function completeDesktopAuthSessionViaFunctions(sessionId: string): Promise<void> {
  const callable = httpsCallable(functions, "completeDesktopAuthSession");
  await callable({ sessionId });
}

export async function completeDesktopWebAuthSession(
  sessionId: string,
  provider: FirebaseAuthProvider,
  result: UserCredential,
): Promise<void> {
  const viaBackend = await completeDesktopAuthSessionViaBackend(sessionId);
  if (viaBackend) return;

  const payload = oauthPayloadFromResult(provider, result);
  try {
    await completeDesktopAuthSessionViaFirestore(sessionId, payload);
    return;
  } catch {
    // Firestore indisponible — tenter Cloud Functions si déployées.
  }

  await completeDesktopAuthSessionViaFunctions(sessionId);
}

async function claimDesktopAuthSessionViaBackend(
  sessionId: string,
): Promise<DesktopAuthCompletion | null> {
  const response = await fetch(`/api/auth/desktop/claim?sessionId=${encodeURIComponent(sessionId)}`);
  if (!response.ok) return null;
  const data = (await response.json()) as { status?: string; customToken?: string };
  if (data.status === "ready" && data.customToken) {
    return { kind: "customToken", token: data.customToken };
  }
  return null;
}

async function claimDesktopAuthSessionViaFirestore(
  sessionId: string,
): Promise<DesktopAuthCompletion | null> {
  const ref = doc(db, "desktopAuthSessions", sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data();
  const createdAt = data.createdAt?.toDate?.()?.getTime?.() ?? 0;
  if (!createdAt || Date.now() - createdAt > SESSION_TTL_MS) {
    await deleteDoc(ref);
    return null;
  }

  await deleteDoc(ref);

  const provider = data.provider;
  const idToken = data.idToken;
  if (
    (provider !== "google" && provider !== "microsoft" && provider !== "apple") ||
    typeof idToken !== "string" ||
    !idToken
  ) {
    return null;
  }

  return {
    kind: "oauth",
    payload: {
      provider,
      idToken,
      accessToken: typeof data.accessToken === "string" ? data.accessToken : undefined,
    },
  };
}

async function claimDesktopAuthSessionViaFunctions(
  sessionId: string,
): Promise<DesktopAuthCompletion | null> {
  const callable = httpsCallable(functions, "claimDesktopAuthSession");
  const result = await callable({ sessionId });
  const data = result.data as { status?: string; customToken?: string };
  if (data.status === "ready" && data.customToken) {
    return { kind: "customToken", token: data.customToken };
  }
  return null;
}

async function pollDesktopAuthSession(sessionId: string): Promise<DesktopAuthCompletion> {
  const started = Date.now();

  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const backendResult = await claimDesktopAuthSessionViaBackend(sessionId).catch(() => null);
    if (backendResult) return backendResult;

    const firestoreResult = await claimDesktopAuthSessionViaFirestore(sessionId).catch(() => null);
    if (firestoreResult) return firestoreResult;

    const functionsResult = await claimDesktopAuthSessionViaFunctions(sessionId).catch(() => null);
    if (functionsResult) return functionsResult;

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error("Connexion expirée. Fermez le navigateur et réessayez.");
}

async function applyDesktopAuthCompletion(completion: DesktopAuthCompletion): Promise<void> {
  if (completion.kind === "customToken") {
    await signInWithCustomToken(auth, completion.token);
    return;
  }
  await signInWithCredential(auth, oauthCredentialFromPayload(completion.payload));
}

export async function signInViaDesktopWebAuth(): Promise<void> {
  const sessionId = crypto.randomUUID();
  const url = buildDesktopWebAuthUrl(sessionId);
  await openExternalAuthUrl(url);
  const completion = await pollDesktopAuthSession(sessionId);
  await applyDesktopAuthCompletion(completion);
}
