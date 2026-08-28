import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  getDocs,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import type { Team } from './types'

export async function createTeam(params: { classroomId: string; name: string; creatorUid: string }): Promise<string> {
  const ref = await addDoc(collection(db, 'teams'), {
    classroomId: params.classroomId,
    name: params.name,
    memberUids: [params.creatorUid],
    sharedState: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function joinTeam(teamId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'teams', teamId), { memberUids: arrayUnion(uid) })
}

export async function listTeamsForClassroom(classroomId: string): Promise<Team[]> {
  const snap = await getDocs(query(collection(db, 'teams'), where('classroomId', '==', classroomId)))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Team, 'id'>) }))
}

/** Live-subscribe to a team's shared project state. Returns an unsubscribe function. */
export function subscribeToTeam(teamId: string, callback: (team: Team | null) => void): () => void {
  return onSnapshot(doc(db, 'teams', teamId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Team, 'id'>) } : null)
  })
}

export async function updateTeamState(teamId: string, partialState: Record<string, unknown>): Promise<void> {
  await updateDoc(doc(db, 'teams', teamId), { sharedState: partialState, updatedAt: serverTimestamp() })
}
