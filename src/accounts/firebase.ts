import { initializeApp, getApps, type FirebaseApp, type FirebaseOptions } from 'firebase/app'
import { getAuth, setPersistence, browserLocalPersistence, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const rawConfig = {
  apiKey: import.meta.env?.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env?.VITE_FIREBASE_APP_ID,
}

function isNonEmptyConfigValue(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim() !== 'undefined' &&
    value.trim() !== 'null'
  )
}

const REQUIRED_KEYS = ['apiKey', 'authDomain', 'projectId'] as const
const missingRequiredKeys = REQUIRED_KEYS.filter((k) => !isNonEmptyConfigValue(rawConfig[k]))
const firebaseConfigured = missingRequiredKeys.length === 0

const FALLBACK_CONFIG: FirebaseOptions = {
  apiKey: 'unconfigured-demo-key',
  authDomain: 'unconfigured.firebaseapp.com',
  projectId: 'unconfigured',
  storageBucket: 'unconfigured.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:unconfigured',
}

function buildLiveConfig(): FirebaseOptions {
  const cfg: FirebaseOptions = {
    apiKey: rawConfig.apiKey!.trim(),
    authDomain: rawConfig.authDomain!.trim(),
    projectId: rawConfig.projectId!.trim(),
  }
  if (isNonEmptyConfigValue(rawConfig.storageBucket)) cfg.storageBucket = rawConfig.storageBucket.trim()
  if (isNonEmptyConfigValue(rawConfig.messagingSenderId)) cfg.messagingSenderId = rawConfig.messagingSenderId.trim()
  if (isNonEmptyConfigValue(rawConfig.appId)) cfg.appId = rawConfig.appId.trim()
  return cfg
}

if (!firebaseConfigured) {
  console.warn(
    `SunRoot: Firebase env vars not configured (${missingRequiredKeys.join(', ')}). Running in offline/local-fallback mode.`,
  )
}

const effectiveConfig: FirebaseOptions = firebaseConfigured ? buildLiveConfig() : FALLBACK_CONFIG

const existingDefault = getApps().find((a) => a.name === '[DEFAULT]')
export const app: FirebaseApp = existingDefault
  ? existingDefault.options.projectId === effectiveConfig.projectId
    ? existingDefault
    : initializeApp(effectiveConfig, `sunroot-${effectiveConfig.projectId}`)
  : initializeApp(effectiveConfig)

export const auth: Auth = getAuth(app)
export const db: Firestore = getFirestore(app)

export function isFirebaseConfigured(): boolean {
  return firebaseConfigured
}

if (firebaseConfigured && typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.error('Failed to set auth persistence', err)
  })
}
