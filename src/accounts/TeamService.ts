import {
  collection,
  doc,
  getDoc,
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
import type { Team, TeamCommit, TeamRole } from './types'

export async function createTeam(params: { classroomId: string; name: string; creatorUid: string }): Promise<string> {
  const ref = await addDoc(collection(db, 'teams'), {
    classroomId: params.classroomId,
    name: params.name,
    memberUids: [params.creatorUid],
    memberRoles: {},
    sharedState: {},
    commits: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function joinTeam(teamId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'teams', teamId), { memberUids: arrayUnion(uid) })
}

export async function setMyTeamRole(teamId: string, uid: string, role: TeamRole): Promise<void> {
  await updateDoc(doc(db, 'teams', teamId), { [`memberRoles.${uid}`]: role })
}

export async function listTeamsForClassroom(classroomId: string): Promise<Team[]> {
  const snap = await getDocs(query(collection(db, 'teams'), where('classroomId', '==', classroomId)))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Team, 'id'>) }))
}

export async function getTeam(teamId: string): Promise<Team | null> {
  const snap = await getDoc(doc(db, 'teams', teamId))
  return snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Team, 'id'>) } : null
}

/** Live-subscribe to a team's shared project state. Returns an unsubscribe function. */
export function subscribeToTeam(teamId: string, callback: (team: Team | null) => void): () => void {
  return onSnapshot(doc(db, 'teams', teamId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Team, 'id'>) } : null)
  })
}

/**
 * "Save & ship" — overwrites the team's shared state wholesale with the
 * caller's current local state, and records who did it and why. This is a
 * full-snapshot commit, not a diff/merge — simple and predictable: whoever
 * ships last is what the rest of the team pulls next, same as a force-push
 * to a single shared branch. Good enough for a small team taking turns;
 * real concurrent merging is a different, much bigger system.
 */
export async function shipTeamState(
  teamId: string,
  commit: { uid: string; displayName: string; message: string },
  state: Record<string, unknown>,
): Promise<void> {
  const existing = await getTeam(teamId)
  const commits: TeamCommit[] = [
    { uid: commit.uid, displayName: commit.displayName, message: commit.message, timestamp: Date.now() },
    ...(existing?.commits ?? []),
  ].slice(0, 20)

  await updateDoc(doc(db, 'teams', teamId), {
    sharedState: state,
    commits,
    lastSavedBy: commit.displayName,
    lastSavedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}
