import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth'
import { doc, setDoc, getDoc, getDocs, query, collection, where, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './firebase'
import type { Role, UserProfile } from './types'

const emptyLearningStyle = () => ({
  visual: 0.25,
  auditory: 0.25,
  kinesthetic: 0.25,
  readingWriting: 0.25,
  lastUpdated: Date.now(),
})

const TAG_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no O/0/I/1 — easy to type/read aloud

function randomTag(): string {
  let code = ''
  for (let i = 0; i < 6; i++) code += TAG_CHARS[Math.floor(Math.random() * TAG_CHARS.length)]
  return `SR-${code}`
}

async function generateUniqueStudentTag(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = randomTag()
    const existing = await getDocs(query(collection(db, 'users'), where('studentTag', '==', candidate)))
    if (existing.empty) return candidate
  }
  return `${randomTag()}-${Date.now().toString(36).toUpperCase().slice(-3)}`
}

export async function signUp(params: {
  email: string
  password: string
  displayName: string
  role: Role
}): Promise<UserProfile> {
  const { email, password, displayName, role } = params
  const credential = await createUserWithEmailAndPassword(auth, email, password)
  await updateProfile(credential.user, { displayName })

  const studentTag = role === 'teacher' ? undefined : await generateUniqueStudentTag()

  const profile: UserProfile = {
    uid: credential.user.uid,
    email,
    displayName,
    role,
    createdAt: Date.now(),
    learningStyle: emptyLearningStyle(),
    ...(studentTag ? { studentTag } : {}),
    ...(role !== 'teacher' ? { classroomIds: [] } : {}),
    ...(role === 'teacher' ? { classroomsTaughtIds: [] } : {}),
  }

  await setDoc(doc(db, 'users', credential.user.uid), { ...profile, createdAt: serverTimestamp() })
  return profile
}

export async function logIn(email: string, password: string): Promise<FirebaseUser> {
  const credential = await signInWithEmailAndPassword(auth, email, password)
  return credential.user
}

export async function logOut(): Promise<void> {
  await signOut(auth)
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? (snap.data() as UserProfile) : null
}

export function onAuthChange(callback: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, callback)
}

export function describeAuthError(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account already exists with that email.'
    case 'auth/invalid-email':
      return 'That email address doesn\u2019t look right.'
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Email or password is incorrect.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.'
    default:
      return 'Something went wrong. Please try again.'
  }
}
