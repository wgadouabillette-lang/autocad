import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
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
  { id: "apple", label: "Continue with Apple" },
];

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
  return new OAuthProvider("apple.com");
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
    button.textContent = label;
    button.addEventListener("click", () => onSelect(id));
    providersEl.appendChild(button);
  }
}

function oauthPayloadFromResult(providerId, result) {
  const credential =
    providerId === "google"
      ? GoogleAuthProvider.credentialFromResult(result)
      : OAuthProvider.credentialFromResult(result);

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
