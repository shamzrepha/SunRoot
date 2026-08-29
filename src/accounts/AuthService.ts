import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  updatePassword as fbUpdatePassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth'
import { doc, setDoc, getDoc, getDocs, updateDoc, query, collection, where, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './firebase'
import { ensureDemoClassroomExists, joinPublicClassroom, DEMO_CLASSROOM_ID } from './ClassroomService'
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

/**
 * Every student/individual account automatically gets access to the demo
 * class — the "every user has it" requirement. Teachers don't join it as a
 * student. Best-effort: a failure here shouldn't block account creation, so
 * it's caught and logged rather than thrown.
 */
async function enrollInDemoClassIfLearner(uid: string, role: Role): Promise<void> {
  if (role === 'teacher') return
  try {
    await ensureDemoClassroomExists()
    await joinPublicClassroom(DEMO_CLASSROOM_ID, uid)
  } catch (err) {
    console.error('SunRoot: demo class auto-enroll failed', err)
  }
}

function buildProfile(uid: string, email: string, displayName: string, role: Role, studentTag?: string): UserProfile {
  return {
    uid,
    email,
    displayName,
    role,
    createdAt: Date.now(),
    learningStyle: emptyLearningStyle(),
    ...(studentTag ? { studentTag } : {}),
    ...(role !== 'teacher' ? { classroomIds: [] } : {}),
    ...(role === 'teacher' ? { classroomsTaughtIds: [] } : {}),
  }
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
  const profile = buildProfile(credential.user.uid, email, displayName, role, studentTag)

  await setDoc(doc(db, 'users', credential.user.uid), { ...profile, createdAt: serverTimestamp() })
  await enrollInDemoClassIfLearner(credential.user.uid, role)
  return profile
}

export async function logIn(email: string, password: string): Promise<FirebaseUser> {
  const credential = await signInWithEmailAndPassword(auth, email, password)
  return credential.user
}

/**
 * Google sign-in. Returns whether this is a brand-new account — the caller
 * must then collect a role (Teacher/Student/Individual) via
 * completeGoogleSignup(), since Google gives us no way to know which one a
 * first-time user wants. Returning users skip straight through.
 */
export async function signInWithGoogle(): Promise<{ user: FirebaseUser; isNewUser: boolean }> {
  const credential = await signInWithPopup(auth, new GoogleAuthProvider())
  const existing = await getDoc(doc(db, 'users', credential.user.uid))
  return { user: credential.user, isNewUser: !existing.exists() }
}

/** Creates the Firestore profile for an already-authenticated user who doesn't have one yet — called from completeProfile.ts, the single place that decides this is needed. */
export async function completeGoogleSignup(user: FirebaseUser, role: Role): Promise<UserProfile> {
  const displayName = user.displayName ?? user.email ?? 'New user'
  const studentTag = role === 'teacher' ? undefined : await generateUniqueStudentTag()
  const profile = buildProfile(user.uid, user.email ?? '', displayName, role, studentTag)
  await setDoc(doc(db, 'users', user.uid), { ...profile, createdAt: serverTimestamp() })
  await enrollInDemoClassIfLearner(user.uid, role)
  return profile
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

export async function requestPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email)
}

/** Changes the password for the currently signed-in user (must have recently logged in). */
export async function changePassword(newPassword: string): Promise<void> {
  if (!auth.currentUser) throw new Error('Not signed in')
  await fbUpdatePassword(auth.currentUser, newPassword)
}

export async function updateDisplayName(uid: string, displayName: string): Promise<void> {
  if (auth.currentUser) await updateProfile(auth.currentUser, { displayName })
  await updateDoc(doc(db, 'users', uid), { displayName })
}

export async function updateBio(uid: string, bio: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { bio })
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
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was closed before finishing.'
    case 'auth/requires-recent-login':
      return 'Please log out and back in, then try changing your password again.'
    default:
      return 'Something went wrong. Please try again.'
  }
}

