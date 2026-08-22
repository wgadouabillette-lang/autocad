import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyCEgeoE7cOh8OA1l2rQSF0VTJ0pY1GYgx4",
  authDomain: "forma-cad-dev.firebaseapp.com",
  projectId: "forma-cad-dev",
  storageBucket: "forma-cad-dev.firebasestorage.app",
  messagingSenderId: "341690938979",
  appId: "1:341690938979:web:e44bbe2e180e0b1cdaea56",
};

const SESSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_STORAGE_KEY = "meetraDesktopAuthSession";
const PLATFORM_STORAGE_KEY = "meetraDesktopAuthPlatform";
const REDIRECT_STARTED_KEY = "meetraDesktopAuthRedirectStarted";
const GOOGLE_AUTO_KEY = "meetraDesktopAuthGoogle";

const params = new URLSearchParams(window.location.search);
const sessionParam = params.get("session");
const platformParam = params.get("platform");
const googleParam = params.get("google") === "1";
const redirectingDesktopBoot = Boolean(sessionParam || googleParam);

if (redirectingDesktopBoot) {
  window.location.replace(`/app/auth.html${window.location.search}${window.location.hash}`);
}

if (sessionParam && SESSION_RE.test(sessionParam)) {
  const previous = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (previous && previous !== sessionParam) {
    sessionStorage.removeItem(REDIRECT_STARTED_KEY);
  }
  sessionStorage.setItem(SESSION_STORAGE_KEY, sessionParam);
}
if (platformParam) {
  sessionStorage.setItem(PLATFORM_STORAGE_KEY, platformParam);
}
if (googleParam) {
  sessionStorage.setItem(GOOGLE_AUTO_KEY, "1");
}

const titleEl = document.getElementById("auth-title");
const leadEl = document.getElementById("auth-lead");
const errorEl = document.getElementById("auth-error");
const statusEl = document.getElementById("auth-status");
const signInBtn = document.getElementById("auth-signin");

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "northamerica-northeast1");

let desktopHandoffDone = false;

function resolvedSessionId() {
  const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (sessionParam && SESSION_RE.test(sessionParam)) return sessionParam;
  return stored && SESSION_RE.test(stored) ? stored : null;
}

function shouldAutoStartGoogle() {
  if (googleParam) return true;
  try {
    if (sessionStorage.getItem(GOOGLE_AUTO_KEY) === "1") return true;
  } catch {
    // sessionStorage unavailable
  }
  return Boolean(resolvedSessionId());
}

function hideAuthUi() {
  document.documentElement.classList.add("auth-handoff");
  document.documentElement.classList.remove("auth-error");
}

function revealAuthUi() {
  document.documentElement.classList.remove("auth-handoff");
  document.documentElement.classList.remove("auth-error");
}

function startGoogleRedirect() {
  hideAuthUi();
  sessionStorage.setItem(REDIRECT_STARTED_KEY, "1");
  return signInWithRedirect(auth, googleProvider());
}

function googleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

function appHint() {
  const normalized = (platformParam ?? sessionStorage.getItem(PLATFORM_STORAGE_KEY) ?? "").toLowerCase();
  if (normalized.includes("win")) return "Windows";
  if (normalized.includes("linux") || normalized.includes("x11")) return "Linux";
  if (normalized.includes("mac") || normalized.includes("darwin")) return "macOS";
  return "your computer";
}

function showError(message) {
  errorEl.hidden = false;
  errorEl.textContent = message;
}

function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = "";
}

function setStatus(message) {
  if (!message) {
    statusEl.hidden = true;
    statusEl.textContent = "";
    return;
  }
  statusEl.hidden = false;
  statusEl.textContent = message;
}

function setBusy(busy) {
  signInBtn.disabled = busy;
  const label = signInBtn.querySelector(".auth-signin-btn__label");
  if (label) {
    label.textContent = busy ? "Signing in…" : "Sign in";
  } else {
    signInBtn.textContent = busy ? "Signing in…" : "Sign in";
  }
}

function resolveAppHref() {
  const hostname = window.location.hostname;
  const port = window.location.port;
  const isLocal = hostname === "127.0.0.1" || hostname === "localhost";
  if (isLocal && (port === "5190" || port === "5191" || port === "5192" || port === "5193")) {
    return "http://localhost:5173/app/";
  }
  return "/app/";
}

function redirectToApp() {
  window.location.assign(resolveAppHref());
}

function clearDesktopSession() {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  sessionStorage.removeItem(PLATFORM_STORAGE_KEY);
  sessionStorage.removeItem(REDIRECT_STARTED_KEY);
  sessionStorage.removeItem(GOOGLE_AUTO_KEY);
}

function showDesktopSuccess() {
  desktopHandoffDone = true;
  document.documentElement.classList.add("auth-done");
  revealAuthUi();
  titleEl.textContent = "Meetra";
  leadEl.textContent = `You can reopen the app on ${appHint()}. Your account is synced.`;
  signInBtn.hidden = true;
  setStatus("");
  clearError();
  clearDesktopSession();
  window.history.replaceState({}, document.title, window.location.pathname);
}

function oauthPayloadFromResult(result) {
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const idToken = credential?.idToken;
  if (!idToken) {
    throw new Error("OAuth token missing after sign-in.");
  }
  return {
    provider: "google",
    idToken,
    accessToken: credential?.accessToken || null,
  };
}

async function completeSession(result) {
  const sessionId = resolvedSessionId();
  if (!sessionId) return;

  try {
    const callable = httpsCallable(functions, "completeDesktopAuthSession");
    await callable({ sessionId });
    return;
  } catch {
    // Cloud Function unavailable — write OAuth tokens for the Electron poller.
  }

  if (!result) {
    throw new Error("Could not reach the desktop app. Try signing in again.");
  }
  const payload = oauthPayloadFromResult(result);
  await setDoc(doc(db, "desktopAuthSessions", sessionId), {
    provider: payload.provider,
    idToken: payload.idToken,
    accessToken: payload.accessToken,
    createdAt: serverTimestamp(),
  });
}

async function finishSignIn(result) {
  if (resolvedSessionId()) {
    await completeSession(result);
    showDesktopSuccess();
    return;
  }
  redirectToApp();
}

async function signIn() {
  clearError();
  setBusy(true);
  try {
    const result = await signInWithPopup(auth, googleProvider());
    await finishSignIn(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign-in failed.";
    showError(message);
  } finally {
    setBusy(false);
  }
}

async function bootDesktopGoogle() {
  if (!shouldAutoStartGoogle()) return;

  hideAuthUi();
  const returning = sessionStorage.getItem(REDIRECT_STARTED_KEY) === "1";
  if (!returning) {
    try {
      await startGoogleRedirect();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-in failed.";
      sessionStorage.removeItem(REDIRECT_STARTED_KEY);
      document.documentElement.classList.add("auth-error");
      showError(message);
    }
    return;
  }

  try {
    const redirectResult = await getRedirectResult(auth);
    if (redirectResult) {
      await finishSignIn(redirectResult);
      return;
    }

    const sessionId = resolvedSessionId();
    if (sessionId) {
      await auth.authStateReady();
      if (auth.currentUser) {
        try {
          await completeSession(null);
          showDesktopSuccess();
          return;
        } catch {
          // Need a fresh Google credential — restart Google, do not show chooser.
        }
      }
    }

    await startGoogleRedirect();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign-in failed.";
    sessionStorage.removeItem(REDIRECT_STARTED_KEY);
    document.documentElement.classList.add("auth-error");
    showError(message);
  }
}

signInBtn.addEventListener("click", () => {
  if (shouldAutoStartGoogle()) {
    void startGoogleRedirect().catch((err) => {
      const message = err instanceof Error ? err.message : "Sign-in failed.";
      document.documentElement.classList.add("auth-error");
      showError(message);
    });
    return;
  }
  void signIn();
});

onAuthStateChanged(auth, (user) => {
  if (!user || resolvedSessionId() || desktopHandoffDone) return;
  redirectToApp();
});

if (!redirectingDesktopBoot) {
  void bootDesktopGoogle();
}
