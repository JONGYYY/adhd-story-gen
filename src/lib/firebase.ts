import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getFirestore, Firestore, enableIndexedDbPersistence } from 'firebase/firestore';

type FirebaseConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
};

// Lazily initialized singletons
let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;
let warnedMissingConfig = false;

function getConfig(): FirebaseConfig {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  };
}

function hasRequiredConfig(cfg: FirebaseConfig): boolean {
  const required = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'] as const;
  return required.every((k) => Boolean(cfg[k]));
}

function warnMissing(cfg: FirebaseConfig) {
  if (warnedMissingConfig) return;
  const required = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'] as const;
  const missing = required.filter((k) => !cfg[k]);
  if (missing.length > 0) {
    console.error('Missing Firebase configuration keys:', missing);
    if (typeof window !== 'undefined') {
      console.error('Firebase configuration is incomplete. Please check your NEXT_PUBLIC_* environment variables.');
    }
    warnedMissingConfig = true;
  }
}

function ensureClient(): boolean {
  return typeof window !== 'undefined';
}

export function getClientApp(): FirebaseApp | null {
  if (!ensureClient()) return null;
  if (cachedApp) return cachedApp;

  const cfg = getConfig();
  if (!hasRequiredConfig(cfg)) {
    warnMissing(cfg);
    return null;
  }

  try {
    cachedApp = getApps().length === 0 ? initializeApp(cfg as any) : getApps()[0];
    return cachedApp;
  } catch (err) {
    console.error('Failed to initialize Firebase app:', err);
    cachedApp = null;
    return null;
  }
}

export function getClientAuth(): Auth | null {
  if (!ensureClient()) return null;
  if (cachedAuth) return cachedAuth;
  const app = getClientApp();
  if (!app) return null;
  try {
    cachedAuth = getAuth(app);
    return cachedAuth;
  } catch (err) {
    console.error('Failed to get Firebase Auth:', err);
    cachedAuth = null;
    return null;
  }
}

export function getClientDb(): Firestore | null {
  if (!ensureClient()) return null;
  if (cachedDb) return cachedDb;
  const app = getClientApp();
  if (!app) return null;
  try {
    cachedDb = getFirestore(app);
    if (typeof window !== 'undefined') {
      enableIndexedDbPersistence(cachedDb).catch((err: any) => {
        if (err?.code === 'failed-precondition') {
          console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
        } else if (err?.code === 'unimplemented') {
          console.warn('The current browser does not support persistence.');
        }
      });
    }
    return cachedDb;
  } catch (err) {
    console.error('Failed to get Firestore:', err);
    cachedDb = null;
    return null;
  }
}

// Initialize Analytics only on client side, best-effort
if (typeof window !== 'undefined') {
  try {
    const app = getClientApp();
    if (app) {
      isSupported().then((yes) => yes && getAnalytics(app)).catch((err) => {
        console.warn('Failed to initialize analytics:', err);
      });
    }
  } catch {}
}

export type { Auth };