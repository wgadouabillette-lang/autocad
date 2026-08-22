import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
  signOut,
  type UserCredential,
} from "firebase/auth";
import { doc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseConfig, functionsRegion } from "./lib/firebase/config";
import { resolveAuthDomain } from "./lib/firebase/resolveAuthDomain";

const SESSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_STORAGE_KEY = "meetraDesktopAuthSession";
const PLATFORM_STORAGE_KEY = "meetraDesktopAuthPlatform";
const GOOGLE_AUTO_KEY = "meetraDesktopAuthGoogle";
const LAST_EMAIL_KEY = "meetraDesktopAuthLastEmail";
const LAST_ACCOUNT_KEY = "meetraDesktopAuthLastAccount";
const REQUIRE_CHOICE_KEY = "meetraDesktopAuthRequireChoice";

type LastAccount = {
  email: string;
  displayName: string | null;
  photoURL: string | null;
};

const params = new URLSearchParams(window.location.search);
const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
const sessionParam = params.get("session") ?? hashParams.get("session");
const platformParam = params.get("platform") ?? hashParams.get("platform");
const googleParam = params.get("google") === "1" || hashParams.get("google") === "1";
const chooseParam = params.get("choose") === "1" || hashParams.get("choose") === "1";
const hintParam = (params.get("hint") ?? hashParams.get("hint") ?? "").trim().toLowerCase();

function persistValue(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Private mode / blocked storage
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode / blocked storage
  }
}

function readValue(key: string): string | null {
  try {
    const fromSession = sessionStorage.getItem(key);
    if (fromSession) return fromSession;
  } catch {
    // ignore
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function clearValue(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

if (sessionParam && SESSION_RE.test(sessionParam)) {
  persistValue(SESSION_STORAGE_KEY, sessionParam);
}
if (platformParam) {
  persistValue(PLATFORM_STORAGE_KEY, platformParam);
}
if (googleParam) {
  persistValue(GOOGLE_AUTO_KEY, "1");
}
if (chooseParam) {
  persistValue(REQUIRE_CHOICE_KEY, "1");
}
if (hintParam && hintParam.includes("@")) {
  persistValue(LAST_EMAIL_KEY, hintParam);
}

const app = initializeApp({
  ...firebaseConfig,
  authDomain: resolveAuthDomain(),
});
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, functionsRegion);

function resolvedSessionId(): string | null {
  if (sessionParam && SESSION_RE.test(sessionParam)) return sessionParam;
  const stored = readValue(SESSION_STORAGE_KEY);
  return stored && SESSION_RE.test(stored) ? stored : null;
}

function shouldOfferDesktopGoogle(): boolean {
  return googleParam || readValue(GOOGLE_AUTO_KEY) === "1" || Boolean(resolvedSessionId());
}

function requiresAccountChoice(): boolean {
  return chooseParam || readValue(REQUIRE_CHOICE_KEY) === "1";
}

function lastKnownEmail(): string | null {
  return lastKnownAccount()?.email ?? null;
}

function normalizeAccount(input: {
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
}): LastAccount | null {
  const email = input.email?.trim().toLowerCase() ?? "";
  if (!email.includes("@")) return null;
  return {
    email,
    displayName: input.displayName?.trim() || null,
    photoURL: input.photoURL?.trim() || null,
  };
}

function parseStoredAccount(raw: string | null): LastAccount | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as {
        email?: unknown;
        displayName?: unknown;
        photoURL?: unknown;
      };
      return normalizeAccount({
        email: typeof parsed.email === "string" ? parsed.email : null,
        displayName: typeof parsed.displayName === "string" ? parsed.displayName : null,
        photoURL: typeof parsed.photoURL === "string" ? parsed.photoURL : null,
      });
    } catch {
      return null;
    }
  }
  return normalizeAccount({ email: trimmed });
}

function persistLastAccount(account: LastAccount): void {
  persistValue(LAST_EMAIL_KEY, account.email);
  persistValue(LAST_ACCOUNT_KEY, JSON.stringify(account));
}

function rememberCurrentUserAccount(): void {
  const user = auth.currentUser;
  const account = normalizeAccount({
    email: user?.email,
    displayName: user?.displayName,
    photoURL: user?.photoURL,
  });
  if (account) persistLastAccount(account);
}

function lastKnownAccount(): LastAccount | null {
  const fromUser = normalizeAccount({
    email: auth.currentUser?.email,
    displayName: auth.currentUser?.displayName,
    photoURL: auth.currentUser?.photoURL,
  });
  if (fromUser) return fromUser;

  const stored = parseStoredAccount(readValue(LAST_ACCOUNT_KEY));
  const email =
    (hintParam.includes("@") ? hintParam : null) ??
    parseStoredAccount(readValue(LAST_EMAIL_KEY))?.email ??
    stored?.email ??
    null;
  if (!email) return null;
  if (stored?.email === email) return stored;
  return { email, displayName: null, photoURL: null };
}

function accountDisplayName(account: LastAccount): string {
  if (account.displayName) return account.displayName;
  const local = account.email.split("@")[0]?.trim();
  return local || account.email;
}

function accountInitials(account: LastAccount): string {
  const source = account.displayName || account.email.split("@")[0] || "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function renderAccountAvatar(el: HTMLElement, account: LastAccount): void {
  el.replaceChildren();
  el.classList.toggle("account-card__avatar--initials", !account.photoURL);
  if (!account.photoURL) {
    el.textContent = accountInitials(account);
    return;
  }
  const img = document.createElement("img");
  img.src = account.photoURL;
  img.alt = "";
  img.referrerPolicy = "no-referrer";
  img.addEventListener("error", () => {
    el.replaceChildren();
    el.classList.add("account-card__avatar--initials");
    el.textContent = accountInitials(account);
  });
  el.appendChild(img);
}

function googleProvider(loginHint?: string | null) {
  const provider = new GoogleAuthProvider();
  const params: Record<string, string> = { prompt: "select_account" };
  if (loginHint) params.login_hint = loginHint;
  provider.setCustomParameters(params);
  return provider;
}

function appHint(): string {
  const normalized = (platformParam ?? readValue(PLATFORM_STORAGE_KEY) ?? "").toLowerCase();
  if (normalized.includes("win")) return "Windows";
  if (normalized.includes("linux") || normalized.includes("x11")) return "Linux";
  if (normalized.includes("mac") || normalized.includes("darwin")) return "macOS";
  return "your computer";
}

function showBusy(): void {
  document.documentElement.classList.remove("is-error", "is-done", "is-choose", "has-account");
  document.documentElement.classList.add("is-busy");
}

function showChoose(account: LastAccount | null): void {
  const title = document.getElementById("choose-title");
  const lead = document.getElementById("choose-lead");
  const continueSame = document.getElementById("continue-same");
  const useAnother = document.getElementById("use-another");
  const avatar = document.getElementById("account-avatar");
  const nameEl = document.getElementById("account-name");
  const emailEl = document.getElementById("account-email");
  if (title) {
    title.hidden = !account;
    title.textContent = "Sign in to Meetra Desktop";
  }
  if (lead) {
    lead.textContent = account
      ? "The Meetra desktop app is asking to sign in with this account."
      : "Sign in with Google to continue.";
  }
  if (continueSame instanceof HTMLButtonElement) {
    if (account) {
      const name = accountDisplayName(account);
      continueSame.hidden = false;
      continueSame.setAttribute("aria-label", `Continue as ${name}`);
      if (nameEl) nameEl.textContent = name;
      if (emailEl) emailEl.textContent = account.email;
      if (avatar) renderAccountAvatar(avatar, account);
    } else {
      continueSame.hidden = true;
      continueSame.removeAttribute("aria-label");
    }
  }
  if (useAnother instanceof HTMLButtonElement) {
    useAnother.textContent = account ? "Use another account" : "Continue with Google";
    useAnother.classList.toggle("btn-secondary", Boolean(account));
  }
  document.documentElement.classList.toggle("has-account", Boolean(account));
  document.documentElement.classList.remove("is-error", "is-busy", "is-done");
  document.documentElement.classList.add("is-choose");
}

function showDone(): void {
  const lead = document.getElementById("done-lead");
  if (lead) {
    lead.textContent = `You can reopen the app on ${appHint()}. Your account is synced.`;
  }
  document.documentElement.classList.remove("is-error", "is-busy", "is-choose", "has-account");
  document.documentElement.classList.add("is-done");
  rememberCurrentUserAccount();
  clearValue(SESSION_STORAGE_KEY);
  clearValue(PLATFORM_STORAGE_KEY);
  clearValue(GOOGLE_AUTO_KEY);
  clearValue(REQUIRE_CHOICE_KEY);
  window.history.replaceState({}, document.title, window.location.pathname);
}

function showError(message: string): void {
  const lead = document.getElementById("error-lead");
  if (lead) lead.textContent = message;
  document.documentElement.classList.remove("is-done", "is-busy", "is-choose", "has-account");
  document.documentElement.classList.add("is-error");
}

function errorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

function errorMessage(error: unknown, fallback: string): string {
  const code = errorCode(error);
  if (code === "auth/popup-blocked") {
    return "The sign-in window was blocked. Click Continue with Google.";
  }
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return "Sign-in was cancelled. Click Continue with Google to try again.";
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function oauthPayloadFromResult(result: UserCredential) {
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const idToken = credential?.idToken || "";
  const accessToken = credential?.accessToken || null;
  if (!idToken && !accessToken) {
    throw new Error("OAuth token missing after sign-in.");
  }
  return {
    provider: "google" as const,
    idToken,
    accessToken,
  };
}

async function completeViaBackend(sessionId: string): Promise<boolean> {
  const idToken = await auth.currentUser?.getIdToken(true);
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

async function completeViaFunction(sessionId: string): Promise<boolean> {
  const callable = httpsCallable(functions, "completeDesktopAuthSession");
  await callable({ sessionId });
  return true;
}

async function completeViaFirestore(result: UserCredential): Promise<boolean> {
  const sessionId = resolvedSessionId();
  if (!sessionId) return false;
  const payload = oauthPayloadFromResult(result);
  if (!payload.idToken || payload.idToken.length <= 100) return false;
  await setDoc(doc(db, "desktopAuthSessions", sessionId), {
    provider: payload.provider,
    idToken: payload.idToken,
    accessToken: payload.accessToken,
    createdAt: serverTimestamp(),
  });
  return true;
}

function settledOk(result: PromiseSettledResult<boolean>, label: string): boolean {
  if (result.status === "fulfilled" && result.value) {
    console.info(`[desktop-auth] session written via ${label}`);
    return true;
  }
  if (result.status === "rejected") {
    console.info(
      `[desktop-auth] ${label} complete failed`,
      result.reason instanceof Error ? result.reason.message : errorCode(result.reason) ?? "unknown",
    );
  }
  return false;
}

async function completeSession(result: UserCredential | null): Promise<void> {
  const sessionId = resolvedSessionId();
  if (!sessionId) {
    throw new Error("This sign-in is not linked to the desktop app. Return to Meetra and try again.");
  }

  // Fan-out: Electron polls local backend, Firestore, and the claim function.
  // Redirect leftovers used to try the function first and never reach localhost.
  const writes = await Promise.allSettled([
    completeViaBackend(sessionId),
    completeViaFunction(sessionId),
    result ? completeViaFirestore(result) : Promise.resolve(false),
  ]);

  const ok =
    settledOk(writes[0], "local backend") ||
    settledOk(writes[1], "function") ||
    settledOk(writes[2], "firestore");
  if (!ok) {
    throw new Error("Could not reach the desktop app. Try signing in again.");
  }
}

async function finishSignIn(result: UserCredential | null): Promise<void> {
  if (!resolvedSessionId()) {
    showError("This sign-in is not linked to the desktop app. Return to Meetra and try again.");
    return;
  }
  await completeSession(result);
  showDone();
}

async function startGooglePopup(loginHint?: string | null): Promise<void> {
  showBusy();
  const result = await signInWithPopup(auth, googleProvider(loginHint));
  await finishSignIn(result);
}

async function continueAsLastAccount(): Promise<void> {
  showBusy();
  await auth.authStateReady();
  if (auth.currentUser) {
    try {
      await finishSignIn(null);
      return;
    } catch {
      // Need a fresh Google credential from the picker.
    }
  }
  await startGooglePopup(lastKnownEmail());
}

async function useAnotherAccount(): Promise<void> {
  showBusy();
  await auth.authStateReady();
  if (auth.currentUser) {
    await signOut(auth);
  }
  await startGooglePopup();
}

async function boot(): Promise<void> {
  if (!shouldOfferDesktopGoogle()) {
    showError("Open this page from the Meetra app to sign in.");
    return;
  }

  await auth.authStateReady();
  rememberCurrentUserAccount();

  // Never write a desktop session from a leftover browser Firebase user.
  // After logout the Chrome tab is still signed in — the user must choose.
  const account = lastKnownAccount();
  if (auth.currentUser || account || requiresAccountChoice()) {
    showChoose(account);
    return;
  }

  try {
    console.info("[desktop-auth] startGooglePopup", window.location.href);
    await startGooglePopup();
  } catch (err) {
    showError(errorMessage(err, "Sign-in failed."));
  }
}

function bindAction(id: string, action: () => Promise<void>): void {
  document.getElementById(id)?.addEventListener("click", () => {
    void action().catch((err: unknown) => {
      showError(errorMessage(err, "Sign-in failed."));
    });
  });
}

bindAction("continue-same", continueAsLastAccount);
bindAction("use-another", useAnotherAccount);
bindAction("retry", useAnotherAccount);

void boot();
