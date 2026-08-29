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
import { CATALOG_BY_ID } from '../hardware/ComponentCatalog'
import type { Team, TeamCommit, TeamPurchase, TeamRole } from './types'

/** A team gets a bigger shared pool than a solo student's 260 — there's more than one person's worth of building to do. */
const DEFAULT_TEAM_BUDGET = 500

export async function createTeam(params: { classroomId: string; name: string; creatorUid: string }): Promise<string> {
  const ref = await addDoc(collection(db, 'teams'), {
    classroomId: params.classroomId,
    name: params.name,
    memberUids: [params.creatorUid],
    memberRoles: {},
    budget: DEFAULT_TEAM_BUDGET,
    purchaseLog: [],
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

interface TrayLike {
  lines?: { partId: string; quantity: number }[]
}

/**
 * Compares the tray in the old shared state against the new one being
 * shipped and logs any quantity increases as purchases, attributed to
 * whoever is shipping. This stays entirely inside this file — it does not
 * touch PartsTray.ts or the tool shed UI at all, on purpose, since those are
 * core files this feature doesn't need to risk changing.
 */
function diffPurchases(
  oldState: Record<string, unknown> | undefined,
  newState: Record<string, unknown>,
  who: { uid: string; displayName: string },
): TeamPurchase[] {
  const oldLines = ((oldState?.tray as TrayLike | undefined)?.lines ?? []) as { partId: string; quantity: number }[]
  const newLines = ((newState.tray as TrayLike | undefined)?.lines ?? []) as { partId: string; quantity: number }[]
  const oldQty = new Map(oldLines.map((l) => [l.partId, l.quantity]))

  const purchases: TeamPurchase[] = []
  for (const line of newLines) {
    const before = oldQty.get(line.partId) ?? 0
    const added = line.quantity - before
    if (added <= 0) continue
    const part = CATALOG_BY_ID.get(line.partId)
    purchases.push({
      uid: who.uid,
      displayName: who.displayName,
      partName: part?.name ?? line.partId,
      quantityAdded: added,
      cost: (part?.cost ?? 0) * added,
      timestamp: Date.now(),
    })
  }
  return purchases
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

  const newPurchases = diffPurchases(existing?.sharedState, state, commit)
  const purchaseLog: TeamPurchase[] = [...newPurchases, ...(existing?.purchaseLog ?? [])].slice(0, 30)

  // The team's budget is authoritative, not whatever the shipping member's
  // local tray happened to say — keeps it from drifting per-member.
  const budget = existing?.budget ?? DEFAULT_TEAM_BUDGET
  const stateWithTeamBudget = {
    ...state,
    tray: { ...(state.tray as object), budget },
  }

  await updateDoc(doc(db, 'teams', teamId), {
    sharedState: stateWithTeamBudget,
    commits,
    purchaseLog,
    lastSavedBy: commit.displayName,
    lastSavedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

/** How much of the team's shared budget is left, computed from whatever's currently in the shared tray. */
export function teamBudgetRemaining(team: Team): number {
  const lines = ((team.sharedState?.tray as TrayLike | undefined)?.lines ?? []) as { partId: string; quantity: number }[]
  const spent = lines.reduce((sum, l) => {
    const part = CATALOG_BY_ID.get(l.partId)
    return sum + (part ? part.cost * l.quantity : 0)
  }, 0)
  return team.budget - spent
}
