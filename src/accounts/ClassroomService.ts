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
import type { Classroom, ClassroomInvite, UserProfile } from './types'

const DEMO_CLASSROOM_ID = 'sunroot-original'
const SYSTEM_TEACHER_ID = 'sunroot-system'

/** Call once at boot. Cheap no-op after the first run. */
export async function ensureDemoClassroomExists(): Promise<void> {
  const ref = doc(db, 'classrooms', DEMO_CLASSROOM_ID)
  const snap = await getDoc(ref)
  if (snap.exists()) return
  await setDoc(ref, {
    teacherId: SYSTEM_TEACHER_ID,
    name: 'SunRoot Original \u2014 Digital Twin Practical',
    description: 'The first practical session: wire a live solar + irrigation digital twin from scratch. Open to everyone.',
    visibility: 'public',
    studentIds: [],
    createdAt: serverTimestamp(),
    isDemo: true,
  })
}

export async function createClassroom(params: {
  teacherId: string
  name: string
  description?: string
  visibility: 'public' | 'private'
}): Promise<string> {
  const ref = await addDoc(collection(db, 'classrooms'), {
    teacherId: params.teacherId,
    name: params.name,
    description: params.description ?? '',
    visibility: params.visibility,
    studentIds: [],
    createdAt: serverTimestamp(),
  })
  await updateDoc(doc(db, 'users', params.teacherId), { classroomsTaughtIds: arrayUnion(ref.id) })
  return ref.id
}

export async function listClassroomsForUser(profile: UserProfile): Promise<Classroom[]> {
  const ids = profile.role === 'teacher' ? profile.classroomsTaughtIds ?? [] : profile.classroomIds ?? []
  if (ids.length === 0) return []
  const docs = await Promise.all(ids.map((id) => getDoc(doc(db, 'classrooms', id))))
  return docs.filter((d) => d.exists()).map((d) => ({ id: d.id, ...(d.data() as Omit<Classroom, 'id'>) }))
}

export async function listPublicClassrooms(): Promise<Classroom[]> {
  const snap = await getDocs(query(collection(db, 'classrooms'), where('visibility', '==', 'public')))
  const rooms = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Classroom, 'id'>) }))
  return rooms.sort((a, b) => (a.isDemo ? -1 : b.isDemo ? 1 : 0))
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

export async function fetchUsersByIds(uids: string[]): Promise<UserProfile[]> {
  if (uids.length === 0) return []
  const snap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', uids.slice(0, 30))))
  return snap.docs.map((d) => d.data() as UserProfile)
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
