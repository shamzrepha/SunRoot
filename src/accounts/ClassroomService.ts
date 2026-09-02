import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  documentId,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'
import type { Classroom, ClassroomInvite, ClassSuggestion, UserProfile } from './types'

export const DEMO_CLASSROOM_ID = 'sunroot-original'
const SYSTEM_TEACHER_ID = 'sunroot-system'

export const DEMO_CLASSROOM: Classroom = {
  id: DEMO_CLASSROOM_ID,
  teacherId: SYSTEM_TEACHER_ID,
  teacherName: 'Admin',
  name: 'SunRoot Original — Digital Twin Practical',
  description: 'The first practical session: wire a live solar + irrigation digital twin from scratch. Open to everyone, no verification required.',
  topic: 'Solar & Irrigation Systems',
  visibility: 'public',
  studentIds: [],
  createdAt: 0,
  isDemo: true,
}

/** Call once at boot. Cheap no-op after the first run. Handles permissions gracefully. */
export async function ensureDemoClassroomExists(): Promise<void> {
  try {
    const ref = doc(db, 'classrooms', DEMO_CLASSROOM_ID)
    const snap = await getDoc(ref)
    if (snap.exists()) return
    await setDoc(ref, {
      teacherId: SYSTEM_TEACHER_ID,
      teacherName: 'Admin',
      name: 'SunRoot Original — Digital Twin Practical',
      description: 'The first practical session: wire a live solar + irrigation digital twin from scratch. Open to everyone, no verification required.',
      topic: 'Solar & Irrigation Systems',
      visibility: 'public',
      studentIds: [],
      createdAt: serverTimestamp(),
      isDemo: true,
    })
  } catch (_err) {
    // Expected when client security rules restrict creating demo classroom with system teacherId.
    // The client-side fallback DEMO_CLASSROOM handles display seamlessly.
  }
}

export async function createClassroom(params: {
  teacherId: string
  teacherName: string
  name: string
  description?: string
  topic: string
  visibility: 'public' | 'private'
}): Promise<string> {
  const ref = await addDoc(collection(db, 'classrooms'), {
    teacherId: params.teacherId,
    teacherName: params.teacherName,
    name: params.name,
    description: params.description ?? '',
    topic: params.topic,
    visibility: params.visibility,
    studentIds: [],
    createdAt: serverTimestamp(),
  })
  await updateDoc(doc(db, 'users', params.teacherId), { classroomsTaughtIds: arrayUnion(ref.id) })
  return ref.id
}

/**
 * Reads directly from the `classrooms` collection rather than the
 * `classroomsTaughtIds`/`classroomIds` arrays on the user doc. Those arrays
 * are still written (invite/removal logic checks them), but using them as
 * the source of truth for this list is what caused newly created classes to
 * sometimes not show up — if that second write ever lagged behind or raced
 * with a profile refresh, the class existed but the list didn't know it yet.
 * A direct query can't drift out of sync like that.
 */
export async function listClassroomsForUser(profile: UserProfile): Promise<Classroom[]> {
  try {
    const field = profile.role === 'teacher' ? 'teacherId' : 'studentIds'
    const snap =
      profile.role === 'teacher'
        ? await getDocs(query(collection(db, 'classrooms'), where(field, '==', profile.uid)))
        : await getDocs(query(collection(db, 'classrooms'), where(field, 'array-contains', profile.uid)))
    const rooms = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Classroom, 'id'>) }))
    if (profile.role !== 'teacher' && !rooms.some((r) => r.id === DEMO_CLASSROOM_ID)) {
      rooms.unshift(DEMO_CLASSROOM)
    }
    return rooms
  } catch (err) {
    console.warn('SunRoot: listClassroomsForUser failed, using fallback', err)
    if (profile.role !== 'teacher') {
      return [DEMO_CLASSROOM]
    }
    return []
  }
}

export async function getClassroom(classroomId: string): Promise<Classroom | null> {
  try {
    const snap = await getDoc(doc(db, 'classrooms', classroomId))
    if (snap.exists()) {
      return { id: snap.id, ...(snap.data() as Omit<Classroom, 'id'>) }
    }
  } catch (err) {
    console.warn('SunRoot: getClassroom fetch failed', err)
  }
  if (classroomId === DEMO_CLASSROOM_ID) {
    return DEMO_CLASSROOM
  }
  return null
}

export async function listPublicClassrooms(): Promise<Classroom[]> {
  try {
    const snap = await getDocs(query(collection(db, 'classrooms'), where('visibility', '==', 'public')))
    const rooms = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Classroom, 'id'>) }))
    if (!rooms.some((r) => r.id === DEMO_CLASSROOM_ID)) {
      rooms.unshift(DEMO_CLASSROOM)
    }
    return rooms.sort((a, b) => (a.isDemo ? -1 : b.isDemo ? 1 : 0))
  } catch (err) {
    console.warn('SunRoot: listPublicClassrooms failed', err)
    return [DEMO_CLASSROOM]
  }
}

export async function joinPublicClassroom(classroomId: string, uid: string): Promise<void> {
  const batch = writeBatch(db)
  batch.update(doc(db, 'classrooms', classroomId), { studentIds: arrayUnion(uid) })
  batch.update(doc(db, 'users', uid), { classroomIds: arrayUnion(classroomId) })
  await batch.commit()
}

export async function leaveClassroom(classroomId: string, uid: string): Promise<void> {
  const batch = writeBatch(db)
  batch.update(doc(db, 'classrooms', classroomId), { studentIds: arrayRemove(uid) })
  batch.update(doc(db, 'users', uid), { classroomIds: arrayRemove(classroomId) })
  await batch.commit()
}

export async function removeStudent(classroomId: string, uid: string): Promise<void> {
  await leaveClassroom(classroomId, uid)
}

export async function findStudentByTag(tag: string): Promise<UserProfile | null> {
  const snap = await getDocs(query(collection(db, 'users'), where('studentTag', '==', tag.trim().toUpperCase())))
  if (snap.empty) return null
  return snap.docs[0].data() as UserProfile
}

export async function fetchUsersByIds(uids: string[] | undefined | null): Promise<UserProfile[]> {
  if (!uids || uids.length === 0) return []
  try {
    const validUids = uids.filter(Boolean)
    if (validUids.length === 0) return []
    const snap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', validUids.slice(0, 30))))
    return snap.docs.map((d) => d.data() as UserProfile)
  } catch (err) {
    console.warn('SunRoot: fetchUsersByIds failed', err)
    return []
  }
}

export async function inviteStudentByTag(params: {
  classroomId: string
  classroomName: string
  teacherId: string
  tag: string
}): Promise<'sent' | 'not_found' | 'already_pending' | 'already_member'> {
  const student = await findStudentByTag(params.tag)
  if (!student) return 'not_found'
  if (student.classroomIds?.includes(params.classroomId)) return 'already_member'

  const existing = await getDocs(
    query(
      collection(db, 'invites'),
      where('classroomId', '==', params.classroomId),
      where('studentUid', '==', student.uid),
      where('status', '==', 'pending'),
    ),
  )
  if (!existing.empty) return 'already_pending'

  await addDoc(collection(db, 'invites'), {
    classroomId: params.classroomId,
    classroomName: params.classroomName,
    teacherId: params.teacherId,
    studentUid: student.uid,
    status: 'pending',
    createdAt: serverTimestamp(),
  })
  return 'sent'
}

export async function listPendingInvites(uid: string): Promise<ClassroomInvite[]> {
  const snap = await getDocs(
    query(collection(db, 'invites'), where('studentUid', '==', uid), where('status', '==', 'pending')),
  )
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClassroomInvite, 'id'>) }))
}

export async function respondToInvite(inviteId: string, accept: boolean, uid: string, classroomId: string): Promise<void> {
  const batch = writeBatch(db)
  batch.update(doc(db, 'invites', inviteId), { status: accept ? 'accepted' : 'declined' })
  if (accept) {
    batch.update(doc(db, 'classrooms', classroomId), { studentIds: arrayUnion(uid) })
    batch.update(doc(db, 'users', uid), { classroomIds: arrayUnion(classroomId) })
  }
  await batch.commit()
}

export async function deleteClassroom(classroomId: string, teacherId: string): Promise<void> {
  await deleteDoc(doc(db, 'classrooms', classroomId))
  await updateDoc(doc(db, 'users', teacherId), { classroomsTaughtIds: arrayRemove(classroomId) })
}

// ---------------------------------------------------------------------------
// Admin — class suggestions from teachers. Relies on Firestore rules to
// actually enforce the admin check; the client-side `profile.isAdmin` gate
// in the UI is just for hiding the screen, not security.
// ---------------------------------------------------------------------------

export async function submitClassSuggestion(params: {
  teacherId: string
  teacherName: string
  title: string
  description: string
}): Promise<void> {
  await addDoc(collection(db, 'classSuggestions'), {
    teacherId: params.teacherId,
    teacherName: params.teacherName,
    title: params.title,
    description: params.description,
    status: 'new',
    createdAt: serverTimestamp(),
  })
}

export async function listClassSuggestions(): Promise<ClassSuggestion[]> {
  const snap = await getDocs(collection(db, 'classSuggestions'))
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<ClassSuggestion, 'id'>) }))
    .sort((a, b) => b.createdAt - a.createdAt)
}

export async function markSuggestionReviewed(id: string): Promise<void> {
  await updateDoc(doc(db, 'classSuggestions', id), { status: 'reviewed' })
}
