import {
  GoogleAuthProvider,
  FacebookAuthProvider,
  OAuthProvider,
  signInWithCredential,
  signInWithCustomToken,
  type AuthCredential,
  type UserCredential,
} from "firebase/auth";
import {
  deleteDoc,
  doc,
  getDocFromServer,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getAuthIdToken } from "./authToken";
import { hasFormaDesktop } from "../formaDesktop";
import { auth, db, functions, type FirebaseAuthProvider } from "./client";

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 10 * 60 * 1000;
const FORCE_ACCOUNT_CHOICE_KEY = "meetraDesktopAuthForceChoice";
const LAST_DESKTOP_EMAIL_KEY = "meetraDesktopAuthLastEmail";

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode / blocked storage
  }
}

function clearLocal(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** After Electron logout, next browser Sign-in must show an account choice. */
export function markDesktopAuthAccountChoiceRequired(email?: string | null): void {
  writeLocal(FORCE_ACCOUNT_CHOICE_KEY, "1");
  const normalized = email?.trim().toLowerCase();
  if (normalized) writeLocal(LAST_DESKTOP_EMAIL_KEY, normalized);
}

export function rememberDesktopAuthEmail(email: string | null): void {
  const normalized = email?.trim().toLowerCase();
  if (normalized) writeLocal(LAST_DESKTOP_EMAIL_KEY, normalized);
}

export function clearDesktopAuthAccountChoiceRequired(): void {
  clearLocal(FORCE_ACCOUNT_CHOICE_KEY);
}

export interface DesktopAuthOAuthPayload {
  provider: FirebaseAuthProvider;
  idToken: string;
  accessToken?: string;
}

type DesktopAuthCompletion =
  | { kind: "customToken"; token: string }
  | { kind: "oauth"; payload: DesktopAuthOAuthPayload };

export class DesktopWebAuthCancelledError extends Error {
  constructor() {
    super("Desktop web auth cancelled");
    this.name = "DesktopWebAuthCancelledError";
  }
}

export function isDesktopWebAuthCancelled(error: unknown): boolean {
  return error instanceof DesktopWebAuthCancelledError;
}

type ActiveDesktopWebAuth = {
  url: string;
  controller: AbortController;
};

let activeDesktopWebAuth: ActiveDesktopWebAuth | null = null;

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DesktopWebAuthCancelledError();
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DesktopWebAuthCancelledError());
      return;
    }
    const timeout = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DesktopWebAuthCancelledError());
      },
      { once: true },
    );
  });
}

const PROD_DESKTOP_WEB_AUTH_URL = "https://meetra.cc/app/auth.html";

function isDedicatedGoogleBootUrl(raw: string): boolean {
  try {
    const path = new URL(raw, window.location.origin).pathname.replace(/\/+$/, "");
    return path.endsWith("/app/auth.html");
  } catch {
    return false;
  }
}

function isLocalDevOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function desktopWebAuthBaseUrl(): string {
  // VITE_FORMA_WEB_AUTH_URL still points at the marketing /auth card
  // (meetra.cc/auth). Only honor an explicit /app/auth.html boot page.
  const configured = import.meta.env.VITE_FORMA_WEB_AUTH_URL?.trim();
  if (configured && isDedicatedGoogleBootUrl(configured)) {
    return configured.replace(/\/$/, "");
  }

  // Packaged Electron serves the UI from 127.0.0.1 — never open that for Google.
  if (import.meta.env.PROD && hasFormaDesktop()) {
    return PROD_DESKTOP_WEB_AUTH_URL;
  }

  const origin = window.location.origin;
  if (import.meta.env.PROD && isLocalDevOrigin(origin)) {
    return PROD_DESKTOP_WEB_AUTH_URL;
  }

  const base = import.meta.env.BASE_URL || "/app/";
  return new URL("auth.html", `${origin}${base}`).href.replace(/\/$/, "");
}

export function buildDesktopWebAuthUrl(sessionId: string): string {
  const url = new URL(desktopWebAuthBaseUrl());
  url.searchParams.set("session", sessionId);
  url.searchParams.set("platform", window.formaDesktop?.platform ?? navigator.platform.toLowerCase());
  url.searchParams.set("google", "1");
  if (readLocal(FORCE_ACCOUNT_CHOICE_KEY) === "1") {
    url.searchParams.set("choose", "1");
    const hint = readLocal(LAST_DESKTOP_EMAIL_KEY)?.trim().toLowerCase();
    if (hint) url.searchParams.set("hint", hint);
  }
  return url.toString();
}

export function oauthPayloadFromResult(
  provider: FirebaseAuthProvider,
  result: UserCredential,
): DesktopAuthOAuthPayload {
  if (provider === "google") {
    const credential = GoogleAuthProvider.credentialFromResult(result);
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

  if (provider === "facebook") {
    const credential = FacebookAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken ?? undefined;
    if (!accessToken) {
      throw new Error("Jeton OAuth introuvable après connexion.");
    }
    return {
      provider,
      idToken: accessToken,
      accessToken,
    };
  }

  const credential = OAuthProvider.credentialFromResult(result);
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
    return GoogleAuthProvider.credential(payload.idToken || null, payload.accessToken);
  }
  if (payload.provider === "facebook") {
    return FacebookAuthProvider.credential(payload.accessToken ?? payload.idToken);
  }
  return new OAuthProvider("microsoft.com").credential({
    idToken: payload.idToken,
    accessToken: payload.accessToken,
  });
}

async function openExternalAuthUrl(url: string): Promise<void> {
  console.info("[desktop-auth] openExternal", url);
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
  if (!response.ok) return false;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return false;
  const data = (await response.json()) as { ok?: unknown };
  return data.ok === true;
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

type DesktopAuthSessionFields = {
  token?: unknown;
  customToken?: unknown;
  provider?: unknown;
  idToken?: unknown;
  accessToken?: unknown;
};

function completionFromSessionFields(data: DesktopAuthSessionFields): DesktopAuthCompletion | null {
  const customToken =
    (typeof data.token === "string" && data.token) ||
    (typeof data.customToken === "string" && data.customToken) ||
    "";
  if (customToken) {
    return { kind: "customToken", token: customToken };
  }

  const provider = data.provider;
  const idToken = typeof data.idToken === "string" ? data.idToken : "";
  const accessToken = typeof data.accessToken === "string" ? data.accessToken : undefined;
  if (
    (provider === "google" || provider === "microsoft" || provider === "facebook") &&
    (idToken || (provider === "google" && accessToken))
  ) {
    return {
      kind: "oauth",
      payload: {
        provider,
        idToken,
        accessToken,
      },
    };
  }

  return null;
}

async function claimDesktopAuthSessionViaBackend(
  sessionId: string,
  signal?: AbortSignal,
): Promise<DesktopAuthCompletion | null> {
  const response = await fetch(`/api/auth/desktop/claim?sessionId=${encodeURIComponent(sessionId)}`, {
    signal,
  });
  if (!response.ok) return null;
  const data = (await response.json()) as DesktopAuthSessionFields & { status?: string };
  if (data.status !== "ready") return null;
  return completionFromSessionFields(data);
}

async function claimDesktopAuthSessionViaFirestore(
  sessionId: string,
): Promise<DesktopAuthCompletion | null> {
  const ref = doc(db, "desktopAuthSessions", sessionId);
  const snap = await getDocFromServer(ref);
  if (!snap.exists()) return null;

  const data = snap.data();
  const createdAt = data.createdAt?.toDate?.()?.getTime?.() ?? 0;
  if (createdAt && Date.now() - createdAt > SESSION_TTL_MS) {
    await deleteDoc(ref);
    return null;
  }

  const completion = completionFromSessionFields(data);
  if (!completion) return null;

  await deleteDoc(ref);
  return completion;
}

async function claimDesktopAuthSessionViaFunctions(
  sessionId: string,
): Promise<DesktopAuthCompletion | null> {
  const callable = httpsCallable(functions, "claimDesktopAuthSession");
  const result = await callable({ sessionId });
  const data = result.data as DesktopAuthSessionFields & { status?: string };
  if (data.status !== "ready") return null;
  return completionFromSessionFields(data);
}

function logClaimFailure(channel: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.info("[desktop-auth] claim failed", channel, message);
}

function waitForFirestoreSession(
  sessionId: string,
  signal: AbortSignal,
): Promise<DesktopAuthCompletion> {
  return new Promise((resolve, reject) => {
    const ref = doc(db, "desktopAuthSessions", sessionId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const createdAt = data.createdAt?.toDate?.()?.getTime?.() ?? 0;
        if (createdAt && Date.now() - createdAt > SESSION_TTL_MS) {
          void deleteDoc(ref);
          return;
        }
        const completion = completionFromSessionFields(data);
        if (!completion) return;
        cleanup();
        void deleteDoc(ref).catch(() => undefined);
        resolve(completion);
      },
      (error) => {
        logClaimFailure("firestore-watch", error);
      },
    );
    const onAbort = () => {
      cleanup();
      reject(new DesktopWebAuthCancelledError());
    };
    const cleanup = () => {
      unsub();
      signal.removeEventListener("abort", onAbort);
    };
    if (signal.aborted) {
      cleanup();
      reject(new DesktopWebAuthCancelledError());
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function pollDesktopAuthSession(
  sessionId: string,
  signal: AbortSignal,
): Promise<DesktopAuthCompletion> {
  const started = Date.now();
  const firestoreWatch = waitForFirestoreSession(sessionId, signal).then((completion) => {
    console.info("[desktop-auth] claimed session via firestore watch");
    return completion;
  });
  firestoreWatch.catch((error) => {
    if (!isDesktopWebAuthCancelled(error)) {
      logClaimFailure("firestore-watch", error);
    }
  });

  const poll = (async () => {
    while (Date.now() - started < POLL_TIMEOUT_MS) {
      throwIfAborted(signal);

      const backendResult = await claimDesktopAuthSessionViaBackend(sessionId, signal).catch(
        (error) => {
          logClaimFailure("backend", error);
          return null;
        },
      );
      if (backendResult) {
        console.info("[desktop-auth] claimed session via backend");
        return backendResult;
      }

      throwIfAborted(signal);
      const firestoreResult = await claimDesktopAuthSessionViaFirestore(sessionId).catch((error) => {
        logClaimFailure("firestore", error);
        return null;
      });
      if (firestoreResult) {
        console.info("[desktop-auth] claimed session via firestore");
        return firestoreResult;
      }

      throwIfAborted(signal);
      const functionsResult = await claimDesktopAuthSessionViaFunctions(sessionId).catch((error) => {
        logClaimFailure("function", error);
        return null;
      });
      if (functionsResult) {
        console.info("[desktop-auth] claimed session via function");
        return functionsResult;
      }

      await sleep(POLL_INTERVAL_MS, signal);
    }

    throw new Error("Connexion expirée. Fermez le navigateur et réessayez.");
  })();

  return Promise.race([poll, firestoreWatch]);
}

async function applyDesktopAuthCompletion(completion: DesktopAuthCompletion): Promise<void> {
  if (completion.kind === "customToken") {
    const cred = await signInWithCustomToken(auth, completion.token);
    console.info("[desktop-auth] signed in with custom token", cred.user.uid);
    return;
  }
  const cred = await signInWithCredential(auth, oauthCredentialFromPayload(completion.payload));
  console.info("[desktop-auth] signed in with oauth credential", cred.user.uid);
}

export async function reopenDesktopWebAuth(): Promise<void> {
  const url = activeDesktopWebAuth?.url;
  if (!url) return;
  await openExternalAuthUrl(url);
}

export function cancelDesktopWebAuth(): void {
  activeDesktopWebAuth?.controller.abort();
}

export async function signInViaDesktopWebAuth(onSessionReady?: () => void): Promise<void> {
  activeDesktopWebAuth?.controller.abort();
  const sessionId = crypto.randomUUID();
  const url = buildDesktopWebAuthUrl(sessionId);
  const controller = new AbortController();
  activeDesktopWebAuth = { url, controller };
  try {
    console.info("[desktop-auth] waiting for session", sessionId);
    await openExternalAuthUrl(url);
    throwIfAborted(controller.signal);
    const completion = await pollDesktopAuthSession(sessionId, controller.signal);
    onSessionReady?.();
    await applyDesktopAuthCompletion(completion);
    clearDesktopAuthAccountChoiceRequired();
    rememberDesktopAuthEmail(auth.currentUser?.email ?? null);
  } finally {
    controller.abort();
    if (activeDesktopWebAuth?.url === url) {
      activeDesktopWebAuth = null;
    }
  }
}
