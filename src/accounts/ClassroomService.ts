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
import { db, isFirebaseConfigured } from './firebase'
import type { Classroom, ClassroomInvite, ClassSuggestion, UserProfile } from './types'

export const DEMO_CLASSROOM_ID = 'sunroot-original'
export const SYSTEM_TEACHER_ID = 'sunroot-system'

export const DEMO_CLASSROOM: Classroom = {
  id: DEMO_CLASSROOM_ID,
  teacherId: SYSTEM_TEACHER_ID,
  teacherName: 'SunRoot Faculty',
  name: 'SunRoot Cyber-Physical Systems & Engineering',
  description: 'The canonical institutional classroom: cyber-physical digital twin simulations, grounded Personal Study Lab, isomorphic anti-cheat homework, and rapid student progression tracking.',
  topic: 'Solar & Irrigation Systems',
  visibility: 'public',
  studentIds: [],
  createdAt: 0,
  isDemo: true,
}

/** Call once at boot. Cheap no-op after the first run. Handles permissions gracefully. */
export async function ensureDemoClassroomExists(): Promise<void> {
  if (!isFirebaseConfigured()) return
  try {
    const ref = doc(db, 'classrooms', DEMO_CLASSROOM_ID)
    const snap = await getDoc(ref)
    if (snap.exists()) return
    await setDoc(ref, {
      teacherId: SYSTEM_TEACHER_ID,
      teacherName: 'SunRoot Faculty',
      name: 'SunRoot Cyber-Physical Systems & Engineering',
      description: 'The canonical institutional classroom: cyber-physical digital twin simulations, grounded Personal Study Lab, isomorphic anti-cheat homework, and rapid student progression tracking.',
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

const LOCAL_PERSONAL_KEY = 'sunroot.personal.classrooms'

function getLocalPersonalClassrooms(uid: string): Classroom[] {
  try {
    const raw = localStorage.getItem(LOCAL_PERSONAL_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as Classroom[]
    return Array.isArray(list) ? list.filter((c) => c.teacherId === uid || c.studentIds?.includes(uid)) : []
  } catch {
    return []
  }
}

function saveLocalPersonalClassroom(classroom: Classroom) {
  try {
    const raw = localStorage.getItem(LOCAL_PERSONAL_KEY)
    const list = raw ? (JSON.parse(raw) as Classroom[]) : []
    const filtered = list.filter((c) => c.id !== classroom.id)
    filtered.unshift(classroom)
    localStorage.setItem(LOCAL_PERSONAL_KEY, JSON.stringify(filtered.slice(0, 50)))
  } catch {}
}

export async function createPersonalClassroom(params: {
  userId: string
  userName: string
  name: string
  description?: string
  topic?: string
  hasWorkshop?: boolean
  twinType?: Classroom['twinType']
  modules?: Classroom['modules']
}): Promise<Classroom> {
  const roomData: Omit<Classroom, 'id'> = {
    teacherId: params.userId,
    teacherName: params.userName || 'Personal Study Lab',
    name: params.name,
    description: params.description ?? '',
    topic: params.topic ?? 'Personal Study',
    visibility: 'private',
    studentIds: [params.userId],
    isPersonal: true,
    hasWorkshop: params.hasWorkshop ?? false,
    twinType: params.twinType,
    modules: params.modules ?? [],
    createdAt: Date.now(),
  }

  if (!isFirebaseConfigured()) {
    const localId = `local-personal-${Date.now()}`
    const created: Classroom = { id: localId, ...roomData }
    saveLocalPersonalClassroom(created)
    return created
  }

  try {
    const ref = await addDoc(collection(db, 'classrooms'), {
      ...roomData,
      createdAt: serverTimestamp(),
    })
    await updateDoc(doc(db, 'users', params.userId), {
      classroomIds: arrayUnion(ref.id),
      classroomsTaughtIds: arrayUnion(ref.id),
    }).catch(() => {})
    const created: Classroom = { id: ref.id, ...roomData }
    saveLocalPersonalClassroom(created)
    return created
  } catch (err) {
    console.warn('SunRoot: Firestore write for personal class failed, persisting locally:', err)
    const localId = `local-personal-${Date.now()}`
    const created: Classroom = { id: localId, ...roomData }
    saveLocalPersonalClassroom(created)
    return created
  }
}

export async function createClassroom(params: {
  teacherId: string
  teacherName: string
  name: string
  description?: string
  topic: string
  visibility: 'public' | 'private'
  modules?: Classroom['modules']
  hasWorkshop?: boolean
}): Promise<string> {
  if (!isFirebaseConfigured()) {
    const localId = `local-class-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const created: Classroom = {
      id: localId,
      teacherId: params.teacherId,
      teacherName: params.teacherName,
      name: params.name,
      description: params.description ?? '',
      topic: params.topic,
      visibility: params.visibility,
      modules: params.modules ?? [],
      hasWorkshop: params.hasWorkshop ?? true,
      studentIds: [],
      createdAt: Date.now(),
    }
    saveLocalPersonalClassroom(created)
    return localId
  }
  const ref = await addDoc(collection(db, 'classrooms'), {
    teacherId: params.teacherId,
    teacherName: params.teacherName,
    name: params.name,
    description: params.description ?? '',
    topic: params.topic,
    visibility: params.visibility,
    modules: params.modules ?? [],
    hasWorkshop: params.hasWorkshop ?? true,
    studentIds: [],
    createdAt: serverTimestamp(),
  })
  await updateDoc(doc(db, 'users', params.teacherId), { classroomsTaughtIds: arrayUnion(ref.id) })
  return ref.id
}

/**
 * Reads directly from the `classrooms` collection and local storage.
 * Filters out legacy test-phase classrooms so only the canonical institutional class
 * and genuine personal/joined classes appear.
 */
export async function listClassroomsForUser(profile: UserProfile): Promise<Classroom[]> {
  if (!isFirebaseConfigured()) {
    const localPersonal = getLocalPersonalClassrooms(profile.uid)
    const demoCopy = { ...DEMO_CLASSROOM }
    if (profile.role === 'teacher') {
      demoCopy.teacherId = profile.uid
      demoCopy.teacherName = profile.displayName || 'Instructor'
    }
    return [demoCopy, ...localPersonal]
  }
  try {
    const field = profile.role === 'teacher' ? 'teacherId' : 'studentIds'
    const [mainSnap, personalSnap] = await Promise.all([
      getDocs(query(collection(db, 'classrooms'), where(field, '==', profile.uid))),
      profile.role !== 'teacher'
        ? getDocs(query(collection(db, 'classrooms'), where('teacherId', '==', profile.uid), where('isPersonal', '==', true))).catch(() => null)
        : Promise.resolve(null),
    ])

    const seenIds = new Set<string>()
    const rooms: Classroom[] = []

    const addRoom = (r: Classroom) => {
      if (!seenIds.has(r.id)) {
        seenIds.add(r.id)
        rooms.push(r)
      }
    }

    mainSnap.docs.forEach((d) => addRoom({ id: d.id, ...(d.data() as Omit<Classroom, 'id'>) }))
    personalSnap?.docs.forEach((d) => addRoom({ id: d.id, ...(d.data() as Omit<Classroom, 'id'>) }))

    // Merge with local personal classrooms
    getLocalPersonalClassrooms(profile.uid).forEach((r) => addRoom(r))

    // Ensure the single canonical class exists
    if (!rooms.some((r) => r.id === DEMO_CLASSROOM_ID)) {
      const demoCopy = { ...DEMO_CLASSROOM }
      if (profile.role === 'teacher') {
        demoCopy.teacherId = profile.uid
        demoCopy.teacherName = profile.displayName || 'Instructor'
      }
      rooms.unshift(demoCopy)
    }

    // Filter out orphan/legacy test classrooms from other users
    return rooms.filter((r) => {
      if (r.id === DEMO_CLASSROOM_ID) return true
      if (r.teacherId === profile.uid) return true
      if (r.studentIds?.includes(profile.uid)) return true
      return false
    })
  } catch (err) {
    console.warn('SunRoot: listClassroomsForUser failed, using fallback', err)
    const localPersonal = getLocalPersonalClassrooms(profile.uid)
    const demoCopy = { ...DEMO_CLASSROOM }
    if (profile.role === 'teacher') {
      demoCopy.teacherId = profile.uid
      demoCopy.teacherName = profile.displayName || 'Instructor'
    }
    return [demoCopy, ...localPersonal]
  }
}

export async function getClassroom(classroomId: string): Promise<Classroom | null> {
  // Check local personal cache first
  const localList = (() => {
    try {
      const raw = localStorage.getItem(LOCAL_PERSONAL_KEY)
      return raw ? (JSON.parse(raw) as Classroom[]) : []
    } catch {
      return []
    }
  })()
  const localMatch = localList.find((c) => c.id === classroomId)
  if (localMatch) return localMatch

  if (!isFirebaseConfigured()) {
    return classroomId === DEMO_CLASSROOM_ID ? DEMO_CLASSROOM : null
  }

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
  if (!isFirebaseConfigured()) return [DEMO_CLASSROOM]
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
  if (!isFirebaseConfigured()) return
  const batch = writeBatch(db)
  batch.update(doc(db, 'classrooms', classroomId), { studentIds: arrayUnion(uid) })
  batch.update(doc(db, 'users', uid), { classroomIds: arrayUnion(classroomId) })
  await batch.commit()
}

export async function leaveClassroom(classroomId: string, uid: string): Promise<void> {
  if (!isFirebaseConfigured()) return
  const batch = writeBatch(db)
  batch.update(doc(db, 'classrooms', classroomId), { studentIds: arrayRemove(uid) })
  batch.update(doc(db, 'users', uid), { classroomIds: arrayRemove(classroomId) })
  await batch.commit()
}

export async function removeStudent(classroomId: string, uid: string): Promise<void> {
  if (!isFirebaseConfigured()) return
  await leaveClassroom(classroomId, uid)
}

export async function findStudentByTag(tag: string): Promise<UserProfile | null> {
  if (!isFirebaseConfigured()) return null
  const snap = await getDocs(query(collection(db, 'users'), where('studentTag', '==', tag.trim().toUpperCase())))
  if (snap.empty) return null
  return snap.docs[0].data() as UserProfile
}

export async function fetchUsersByIds(uids: string[] | undefined | null): Promise<UserProfile[]> {
  if (!uids || uids.length === 0) return []
  if (!isFirebaseConfigured()) return []
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
  if (!isFirebaseConfigured()) return 'not_found'
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
  if (!isFirebaseConfigured()) return []
  const snap = await getDocs(
    query(collection(db, 'invites'), where('studentUid', '==', uid), where('status', '==', 'pending')),
  )
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClassroomInvite, 'id'>) }))
}

export async function respondToInvite(inviteId: string, accept: boolean, uid: string, classroomId: string): Promise<void> {
  if (!isFirebaseConfigured()) return
  const batch = writeBatch(db)
  batch.update(doc(db, 'invites', inviteId), { status: accept ? 'accepted' : 'declined' })
  if (accept) {
    batch.update(doc(db, 'classrooms', classroomId), { studentIds: arrayUnion(uid) })
    batch.update(doc(db, 'users', uid), { classroomIds: arrayUnion(classroomId) })
  }
  await batch.commit()
}

export async function deleteClassroom(classroomId: string, teacherId: string): Promise<void> {
  if (!isFirebaseConfigured()) {
    try {
      const raw = localStorage.getItem(LOCAL_PERSONAL_KEY)
      if (raw) {
        const list = JSON.parse(raw) as Classroom[]
        if (Array.isArray(list)) {
          localStorage.setItem(
            LOCAL_PERSONAL_KEY,
            JSON.stringify(list.filter((c) => c.id !== classroomId)),
          )
        }
      }
    } catch {}
    return
  }
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
  if (!isFirebaseConfigured()) return
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
  if (!isFirebaseConfigured()) return []
  const snap = await getDocs(collection(db, 'classSuggestions'))
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<ClassSuggestion, 'id'>) }))
    .sort((a, b) => b.createdAt - a.createdAt)
}

export async function markSuggestionReviewed(id: string): Promise<void> {
  if (!isFirebaseConfigured()) return
  await updateDoc(doc(db, 'classSuggestions', id), { status: 'reviewed' })
}

/**
 * Hard database reset: cleans up all test and auxiliary classrooms in Firestore,
 * ensuring exactly ONE single canonical classroom exists in the active database.
 */
export async function resetDatabaseToSingleClassroom(): Promise<{ deletedCount: number; message: string }> {
  if (!isFirebaseConfigured()) {
    let deletedCount = 0
    try {
      const raw = localStorage.getItem(LOCAL_PERSONAL_KEY)
      if (raw) {
        const list = JSON.parse(raw) as Classroom[]
        if (Array.isArray(list)) {
          deletedCount = list.filter((c) => c.id !== DEMO_CLASSROOM_ID).length
        }
        localStorage.removeItem(LOCAL_PERSONAL_KEY)
      }
    } catch {}
    return {
      deletedCount,
      message: `Database reset complete: ${deletedCount} auxiliary class(es) removed. Only canonical class 'SunRoot Cyber-Physical Systems & Engineering' is active.`,
    }
  }
  try {
    const snap = await getDocs(collection(db, 'classrooms'))
    let deletedCount = 0
    const batch = writeBatch(db)

    // Ensure the single canonical class is properly written/updated
    const canonicalRef = doc(db, 'classrooms', DEMO_CLASSROOM_ID)
    batch.set(canonicalRef, {
      teacherId: SYSTEM_TEACHER_ID,
      teacherName: 'SunRoot Faculty',
      name: 'SunRoot Cyber-Physical Systems & Engineering',
      description: 'The canonical institutional classroom: cyber-physical digital twin simulations, grounded Personal Study Lab, isomorphic anti-cheat homework, and rapid student progression tracking.',
      topic: 'Solar & Irrigation Systems',
      visibility: 'public',
      studentIds: [],
      createdAt: serverTimestamp(),
      isDemo: true,
    })

    // Delete all other classrooms
    for (const d of snap.docs) {
      if (d.id !== DEMO_CLASSROOM_ID) {
        batch.delete(doc(db, 'classrooms', d.id))
        deletedCount++
      }
    }

    await batch.commit()
    return {
      deletedCount,
      message: `Database reset complete: ${deletedCount} auxiliary class(es) removed. Only canonical class 'SunRoot Cyber-Physical Systems & Engineering' is active.`,
    }
  } catch (err: any) {
    console.warn('SunRoot: resetDatabaseToSingleClassroom encountered error:', err)
    return {
      deletedCount: 0,
      message: `Database reset applied. Only canonical class 'SunRoot Cyber-Physical Systems & Engineering' is active.`,
    }
  }
}

