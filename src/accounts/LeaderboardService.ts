import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'
import { listTeamsForClassroom } from './TeamService'
import type { LeaderboardCategory, LeaderboardEntry, ProgressSnapshot, TeamLeaderboardEntry } from './types'

function metricFor(category: LeaderboardCategory, s: ProgressSnapshot): number {
  if (category === 'mastery') return s.overallMastery
  if (category === 'xp') return s.xp
  return s.conceptsMastered
}

/**
 * Progress is stored per-classroom (a student in three classes has three
 * snapshots), so a cross-class leaderboard takes each student's BEST
 * snapshot by the chosen metric — their personal best, not an average that
 * would unfairly punish someone active in more classes.
 */
async function bestSnapshotPerUser(): Promise<Map<string, ProgressSnapshot>> {
  const snap = await getDocs(collection(db, 'progressSnapshots'))
  const best = new Map<string, ProgressSnapshot>()
  snap.forEach((d) => {
    const s = d.data() as ProgressSnapshot
    const existing = best.get(s.uid)
    if (!existing || s.overallMastery > existing.overallMastery) best.set(s.uid, s)
  })
  return best
}

export async function fetchGlobalLeaderboard(category: LeaderboardCategory, limitTo = 50): Promise<LeaderboardEntry[]> {
  const best = await bestSnapshotPerUser()
  return [...best.values()]
    .map((s) => ({ uid: s.uid, displayName: s.displayName, value: metricFor(category, s) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limitTo)
}

export async function fetchFriendsLeaderboard(friendUids: string[], selfUid: string, selfName: string, category: LeaderboardCategory): Promise<LeaderboardEntry[]> {
  const best = await bestSnapshotPerUser()
  const relevant = [selfUid, ...friendUids]
  const entries: LeaderboardEntry[] = relevant.map((uid) => {
    const s = best.get(uid)
    return { uid, displayName: uid === selfUid ? selfName : s?.displayName ?? 'Unknown', value: s ? metricFor(category, s) : 0 }
  })
  return entries.sort((a, b) => b.value - a.value)
}

export async function fetchTeamLeaderboard(classroomId: string, category: LeaderboardCategory): Promise<TeamLeaderboardEntry[]> {
  const [teams, snapsQuery] = await Promise.all([
    listTeamsForClassroom(classroomId),
    getDocs(query(collection(db, 'progressSnapshots'), where('classroomId', '==', classroomId))),
  ])
  const byUid = new Map<string, ProgressSnapshot>()
  snapsQuery.forEach((d) => {
    const s = d.data() as ProgressSnapshot
    byUid.set(s.uid, s)
  })

  return teams
    .map((t) => {
      const members = t.memberUids.map((uid) => byUid.get(uid)).filter((s): s is ProgressSnapshot => !!s)
      const value = members.length ? members.reduce((sum, s) => sum + metricFor(category, s), 0) / members.length : 0
      return { teamId: t.id, name: t.name, classroomId, value, memberCount: t.memberUids.length }
    })
    .sort((a, b) => b.value - a.value)
}
