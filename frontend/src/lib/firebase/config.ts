const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "AIzaSyCEgeoE7cOh8OA1l2rQSF0VTJ0pY1GYgx4",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "forma-cad-dev.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "forma-cad-dev",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "forma-cad-dev.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "341690938979",
  appId: env.VITE_FIREBASE_APP_ID ?? "1:341690938979:web:e44bbe2e180e0b1cdaea56",
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID ?? "",
};

export const functionsRegion = env.VITE_FIREBASE_FUNCTIONS_REGION ?? "us-central1";
