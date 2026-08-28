import { initializeApp } from 'firebase/app'
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Fail loudly and visibly instead of crashing to a blank screen. Without this
// check, a missing VITE_FIREBASE_* env var makes getAuth() throw during
// module load — before a single line of the app's own UI has rendered — so
// the page just goes blank with no on-screen signal of why. This turns that
// into an actual message, since "check the browser console" isn't something
// most people reach for the first time they see nothing at all.
const missingKeys = Object.entries(firebaseConfig)
  .filter(([, v]) => !v)
  .map(([k]) => k)

if (missingKeys.length > 0) {
  const message = `SunRoot can't start: missing Firebase configuration (${missingKeys.join(', ')}). This build is missing one or more VITE_FIREBASE_* environment variables.`
  document.body.innerHTML = `<div style="font-family:system-ui,sans-serif;max-width:640px;margin:80px auto;padding:24px;background:#1b2e22;color:#edefe6;border-radius:12px;line-height:1.5;">
    <h1 style="color:#e8836b;font-size:20px;margin:0 0 12px;">Configuration error</h1>
    <p style="margin:0;font-size:14px;">${message}</p>
  </div>`
  throw new Error(message)
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)

// Explicit local (IndexedDB) persistence — this is what stops the app from
// asking a returning student or teacher to log in again on every visit.
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error('Failed to set auth persistence', err)
})
