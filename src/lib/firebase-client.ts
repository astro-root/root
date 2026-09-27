// Used only by /admin pages (loaded client-side). The public site does not
// import this — it reads content through src/lib/content.ts instead, which
// works without Firebase configured at all (see the fallback there).
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID
};

export const ADMIN_UID = import.meta.env.PUBLIC_ADMIN_UID as string | undefined;

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

let app: FirebaseApp | undefined;
export function getFirebaseApp() {
  if (!isFirebaseConfigured) {
    throw new Error(
      'Firebase is not configured. Copy .env.example to .env and fill in your project config.'
    );
  }
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  return app;
}

export function getAuthClient() {
  return getAuth(getFirebaseApp());
}

export function getDb() {
  return getFirestore(getFirebaseApp());
}

/**
 * Resolves once with the signed-in admin user, or redirects to /admin/login
 * and never resolves. Call this at the top of every protected admin page.
 * The REAL enforcement is Firestore Security Rules — this is just UX so a
 * logged-out visitor sees a login screen instead of an empty dashboard.
 */
export function requireAdmin(): Promise<User> {
  return new Promise((resolve) => {
    if (!isFirebaseConfigured) {
      window.location.href = '/admin/login?error=not-configured';
      return;
    }
    const auth = getAuthClient();
    onAuthStateChanged(auth, (user) => {
      if (user && user.uid === ADMIN_UID) {
        resolve(user);
      } else {
        window.location.href = '/admin/login';
      }
    });
  });
}

export {
  signInWithEmailAndPassword,
  firebaseSignOut,
  onAuthStateChanged,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  orderBy,
  serverTimestamp
};
export type { User };
