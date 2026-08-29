import { doc, setDoc, getDoc, getDocs, collection, query, where, documentId, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import type { ProgressSnapshot } from './types'

function snapshotId(classroomId: string, uid: string): string {
  return `${classroomId}_${uid}`
}

export async function pushProgressSnapshot(snapshot: Omit<ProgressSnapshot, 'updatedAt'>): Promise<void> {
  await setDoc(doc(db, 'progressSnapshots', snapshotId(snapshot.classroomId, snapshot.uid)), {
    ...snapshot,
    updatedAt: serverTimestamp(),
  })
}

/** One student's progress within one specific classroom. */
export async function fetchProgressSnapshot(classroomId: string, uid: string): Promise<ProgressSnapshot | null> {
  const snap = await getDoc(doc(db, 'progressSnapshots', snapshotId(classroomId, uid)))
  if (!snap.exists()) return null
  const data = snap.data()
  return { ...(data as Omit<ProgressSnapshot, 'updatedAt'>), updatedAt: data.updatedAt?.toMillis?.() ?? Date.now() }
}

/** Every roster student's progress within one specific classroom, keyed by bare uid for easy lookup. */
export async function fetchClassroomProgress(classroomId: string, uids: string[]): Promise<Record<string, ProgressSnapshot>> {
  if (uids.length === 0) return {}
  const ids = uids.map((uid) => snapshotId(classroomId, uid)).slice(0, 30)
  const snap = await getDocs(query(collection(db, 'progressSnapshots'), where(documentId(), 'in', ids)))
  const map: Record<string, ProgressSnapshot> = {}
  snap.docs.forEach((d) => {
    const data = d.data()
    const value = { ...(data as Omit<ProgressSnapshot, 'updatedAt'>), updatedAt: data.updatedAt?.toMillis?.() ?? Date.now() }
    map[value.uid] = value
  })
  return map
}

/** "Online now" is a recency heuristic (synced within the last ~45s), not a real presence system — good enough for a teacher glance, not exact. */
export function isRecentlyActive(updatedAt: number): boolean {
  return Date.now() - updatedAt < 45_000
}
