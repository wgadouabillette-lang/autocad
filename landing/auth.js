import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  FacebookAuthProvider,
  OAuthProvider,
  signInWithPopup,
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

const PROVIDERS = [
  { id: "google", label: "Continue with Google" },
  { id: "microsoft", label: "Continue with Microsoft" },
  { id: "facebook", label: "Continue with Facebook" },
];

const PROVIDER_ICONS = {
  google: `<svg viewBox="0 0 24 24" class="auth-provider-icon" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`,
  microsoft: `<svg viewBox="0 0 24 24" class="auth-provider-icon" aria-hidden="true"><path fill="#F25022" d="M1 1h10v10H1z"/><path fill="#7FBA00" d="M13 1h10v10H13z"/><path fill="#00A4EF" d="M1 13h10v10H1z"/><path fill="#FFB900" d="M13 13h10v10H13z"/></svg>`,
  facebook: `<svg viewBox="0 0 24 24" class="auth-provider-icon auth-provider-icon--facebook" aria-hidden="true"><path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
};

const params = new URLSearchParams(window.location.search);
const sessionId = params.get("session");
const platform = params.get("platform");
const hasDesktopSession = sessionId && SESSION_RE.test(sessionId);

const titleEl = document.getElementById("auth-title");
const leadEl = document.getElementById("auth-lead");
const errorEl = document.getElementById("auth-error");
const providersEl = document.getElementById("auth-providers");
const emailFormEl = document.getElementById("auth-email-form");
const cardEl = document.getElementById("auth-card");

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "us-central1");

function providerForId(id) {
  if (id === "google") {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    return provider;
  }
  if (id === "microsoft") {
    const provider = new OAuthProvider("microsoft.com");
    provider.setCustomParameters({
      prompt: "select_account",
      tenant: "common",
    });
    provider.addScope("email");
    provider.addScope("profile");
    provider.addScope("openid");
    provider.addScope("User.Read");
    return provider;
  }
  const provider = new FacebookAuthProvider();
  provider.addScope("email");
  provider.addScope("public_profile");
  return provider;
}

function appHint() {
  const normalized = (platform ?? "").toLowerCase();
  if (normalized.includes("win")) return "Windows";
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

function showSuccess() {
  titleEl.textContent = "Success!";
  leadEl.innerHTML = `You can reopen your app on ${appHint()}.<br /><br />Your account is synced.`;
  providersEl.innerHTML = "";
  emailFormEl.hidden = true;
  clearError();
  window.history.replaceState({}, document.title, window.location.pathname);
}

function renderProviders(onSelect) {
  providersEl.innerHTML = "";
  for (const { id, label } of PROVIDERS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "auth-provider-btn";
    button.innerHTML = `${PROVIDER_ICONS[id] ?? ""}<span>${label}</span>`;
    button.addEventListener("click", () => onSelect(id));
    providersEl.appendChild(button);
  }
}

function oauthPayloadFromResult(providerId, result) {
  if (providerId === "google") {
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const idToken = credential?.idToken;
    if (!idToken) {
      throw new Error("OAuth token missing after sign-in.");
    }
    return {
      provider: providerId,
      idToken,
      accessToken: credential?.accessToken || null,
    };
  }

  if (providerId === "facebook") {
    const credential = FacebookAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;
    if (!accessToken) {
      throw new Error("OAuth token missing after sign-in.");
    }
    return {
      provider: providerId,
      idToken: accessToken,
      accessToken,
    };
  }

  const credential = OAuthProvider.credentialFromResult(result);
  const idToken = credential?.idToken;
  if (!idToken) {
    throw new Error("OAuth token missing after sign-in.");
  }

  return {
    provider: providerId,
    idToken,
    accessToken: credential?.accessToken || null,
  };
}

async function completeSession(providerId, result) {
  if (!hasDesktopSession) return;
  const payload = oauthPayloadFromResult(providerId, result);
  try {
    await setDoc(doc(db, "desktopAuthSessions", sessionId), {
      provider: payload.provider,
      idToken: payload.idToken,
      accessToken: payload.accessToken,
      createdAt: serverTimestamp(),
    });
  } catch {
    const callable = httpsCallable(functions, "completeDesktopAuthSession");
    await callable({ sessionId });
  }
}

async function signIn(providerId) {
  clearError();
  try {
    const result = await signInWithPopup(auth, providerForId(providerId));
    await completeSession(providerId, result);
    showSuccess();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign-in failed.";
    showError(message);
  }
}

renderProviders((id) => void signIn(id));

emailFormEl.addEventListener("submit", (event) => {
  event.preventDefault();
  showError("Email sign-in on the web is coming soon. Use a provider above.");
});
