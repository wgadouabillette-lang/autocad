import { initializeApp } from "firebase/app";
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  FacebookAuthProvider,
  OAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getStorage } from "firebase/storage";
import { shouldFallbackToOAuthRedirect } from "./authErrors";
import { firebaseConfig, functionsRegion } from "./config";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, functionsRegion);

if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR === "1") {
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

export type FirebaseAuthProvider = "google" | "microsoft" | "facebook";

const EMAIL_LINK_STORAGE_KEY = "forma-email-for-sign-in";

const OAUTH_POPUP_HOSTS = [
  "accounts.google.com",
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "login.microsoftonline.com",
  "live.com",
  "microsoft.com",
  "firebaseapp.com",
];

function isOAuthPopupUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return OAUTH_POPUP_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

/** Popup OAuth often fails on third-party hosts (Vercel, etc.) — redirect is reliable there. */
function preferOAuthRedirect(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  if (!host || host === "localhost" || host === "127.0.0.1") return false;
  return !host.endsWith(".firebaseapp.com") && !host.endsWith(".web.app");
}

export function providerForId(id: FirebaseAuthProvider) {
  if (id === "google") {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    return provider;
  }
  if (id === "microsoft") {
    const provider = new OAuthProvider("microsoft.com");
    provider.setCustomParameters({
      prompt: "select_account",
      tenant: import.meta.env.VITE_MICROSOFT_OAUTH_TENANT?.trim() || "common",
    });
    return provider;
  }
  const provider = new FacebookAuthProvider();
  provider.addScope("email");
  provider.addScope("public_profile");
  return provider;
}

export class OAuthRedirectStartedError extends Error {
  constructor() {
    super("oauth-redirect-started");
    this.name = "OAuthRedirectStartedError";
  }
}

export async function signInWithOAuthProvider(id: FirebaseAuthProvider): Promise<User> {
  const provider = providerForId(id);
  if (preferOAuthRedirect()) {
    await signInWithRedirect(auth, provider);
    throw new OAuthRedirectStartedError();
  }
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    if (shouldFallbackToOAuthRedirect(error)) {
      await signInWithRedirect(auth, provider);
      throw new OAuthRedirectStartedError();
    }
    throw error;
  }
}

export async function completeOAuthRedirectIfPresent(): Promise<User | null> {
  const result = await getRedirectResult(auth);
  return result?.user ?? null;
}

export function isFirebaseOAuthPopupUrl(url: string): boolean {
  return isOAuthPopupUrl(url);
}

export async function sendEmailSignInLink(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  window.localStorage.setItem(EMAIL_LINK_STORAGE_KEY, normalized);
  await sendSignInLinkToEmail(auth, normalized, {
    url: `${window.location.origin}${window.location.pathname}`,
    handleCodeInApp: true,
  });
}

export async function completeEmailLinkSignInIfPresent(): Promise<User | null> {
  if (!isSignInWithEmailLink(auth, window.location.href)) return null;
  let email = window.localStorage.getItem(EMAIL_LINK_STORAGE_KEY);
  if (!email) {
    email = window.prompt("Confirmez votre adresse email pour vous connecter.")?.trim() ?? "";
  }
  if (!email) throw new Error("Adresse email requise pour finaliser la connexion.");
  const result = await signInWithEmailLink(auth, email, window.location.href);
  window.localStorage.removeItem(EMAIL_LINK_STORAGE_KEY);
  window.history.replaceState({}, document.title, window.location.pathname);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await firebaseSignOut(auth);
}

export function watchAuthState(onChange: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, onChange);
}

export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}
