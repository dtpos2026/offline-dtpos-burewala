// ============================================================
// Firebase for the Super Admin WEB panel only.
//
// The POS itself stays 100% offline — nothing here is ever bundled into the
// Windows app. This panel uses Firestore so the client registry and support
// messages live in Digital Target's own cloud instead of one browser.
//
// The web apiKey below is a public identifier (Firebase is secured by
// Firestore rules + sign-in, not by hiding this string).
// ============================================================
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

export const firebaseConfig = {
  apiKey: 'AIzaSyCgLRlvTaXyuk13vWCQ1vCKUbAmC5IY9cU',
  authDomain: 'dtpos-offline.firebaseapp.com',
  projectId: 'dtpos-offline',
  storageBucket: 'dtpos-offline.firebasestorage.app',
  messagingSenderId: '162015010597',
  appId: '1:162015010597:web:a9652b102446ea37e004cc',
  measurementId: 'G-WZD013JSHK',
};

// The default app specifically — another (named) app existing must not be
// mistaken for it.
export const app = getApps().some(a => a.name === '[DEFAULT]') ? getApp() : initializeApp(firebaseConfig);
// ignoreUndefinedProperties: an optional field that is not set (a device
// without a location, a note without a shop) is left out of the write instead
// of failing it with "Unsupported field value: undefined". Writes also pass
// through firestoreSafe(); this is the safety net for any that do not.
function makeDb(): Firestore {
  try {
    return initializeFirestore(app, { ignoreUndefinedProperties: true });
  } catch {
    // Already initialised (dev hot reload) — reuse that instance.
    return getFirestore(app);
  }
}
export const db = makeDb();
export const auth = getAuth(app);
