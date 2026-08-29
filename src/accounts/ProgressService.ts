import { doc, setDoc, getDocs, collection, query, where, documentId, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import type { ProgressSnapshot } from './types'

export async function pushProgressSnapshot(snapshot: Omit<ProgressSnapshot, 'updatedAt'>): Promise<void> {
  await setDoc(doc(db, 'progressSnapshots', snapshot.uid), { ...snapshot, updatedAt: serverTimestamp() })
}

export async function fetchProgressSnapshots(uids: string[]): Promise<Record<string, ProgressSnapshot>> {
  if (uids.length === 0) return {}
  const snap = await getDocs(query(collection(db, 'progressSnapshots'), where(documentId(), 'in', uids.slice(0, 30))))
  const map: Record<string, ProgressSnapshot> = {}
  snap.docs.forEach((d) => {
    const data = d.data()
    map[d.id] = { ...(data as Omit<ProgressSnapshot, 'updatedAt'>), updatedAt: data.updatedAt?.toMillis?.() ?? Date.now() }
  })
  return map
}
