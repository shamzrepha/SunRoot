import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'
import { listTeamsForClassroom } from './TeamService'
import type { LeaderboardCategory, LeaderboardEntry, ProgressSnapshot, TeamLeaderboardEntry, UserProfile } from './types'

export interface LeagueInfo {
  name: string
  icon: string
  color: string
  minXp: number
  tier: number
}

export const LEAGUES: LeagueInfo[] = [
  { name: 'Obsidian League', icon: '🔮', color: '#c084fc', minXp: 1000, tier: 5 },
  { name: 'Diamond League', icon: '💎', color: '#38bdf8', minXp: 600, tier: 4 },
  { name: 'Gold League', icon: '🥇', color: '#f59e0b', minXp: 300, tier: 3 },
  { name: 'Silver League', icon: '🥈', color: '#94a3b8', minXp: 100, tier: 2 },
  { name: 'Bronze League', icon: '🥉', color: '#d97706', minXp: 0, tier: 1 },
]

export function getLeagueForXp(xp: number): LeagueInfo {
  for (const league of LEAGUES) {
    if (xp >= league.minXp) return league
  }
  return LEAGUES[LEAGUES.length - 1]
}

function getTodayString(): string {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function bestSnapshotPerUser(): Promise<Map<string, ProgressSnapshot>> {
  try {
    const snap = await getDocs(collection(db, 'progressSnapshots'))
    const best = new Map<string, ProgressSnapshot>()
    snap.forEach((d) => {
      const s = d.data() as ProgressSnapshot
      const existing = best.get(s.uid)
      if (!existing || s.overallMastery > existing.overallMastery) best.set(s.uid, s)
    })
    return best
  } catch {
    return new Map()
  }
}

async function getAllUsers(): Promise<Map<string, UserProfile>> {
  try {
    const snap = await getDocs(collection(db, 'users'))
    const map = new Map<string, UserProfile>()
    snap.forEach((d) => {
      map.set(d.id, d.data() as UserProfile)
    })
    return map
  } catch {
    return new Map()
  }
}

function metricFor(category: LeaderboardCategory, s?: ProgressSnapshot, u?: UserProfile): number {
  const today = getTodayString()
  if (category === 'streak') {
    // Duolingo streak rule: strictly 0 until clocked in today!
    if (u?.streak?.lastClockInDate === today) {
      return u.streak.current ?? 1
    }
    return 0
  }
  if (category === 'xp') {
    return Math.max(s?.xp ?? 0, (u as any)?.xp ?? 0)
  }
  if (category === 'mastery') {
    return s?.overallMastery ?? 0
  }
  return s?.conceptsMastered ?? 0
}

export async function fetchGlobalLeaderboard(category: LeaderboardCategory, limitTo = 50): Promise<LeaderboardEntry[]> {
  const [bestSnaps, usersMap] = await Promise.all([bestSnapshotPerUser(), getAllUsers()])
  const allUids = new Set<string>([...bestSnaps.keys(), ...usersMap.keys()])

  const entries: LeaderboardEntry[] = []
  allUids.forEach((uid) => {
    const s = bestSnaps.get(uid)
    const u = usersMap.get(uid)
    const displayName = u?.displayName || s?.displayName || 'Cadet'
    const value = metricFor(category, s, u)
    const streak = u?.streak?.lastClockInDate === getTodayString() ? u.streak.current : 0
    const xp = Math.max(s?.xp ?? 0, (u as any)?.xp ?? 0)
    entries.push({ uid, displayName, value, streak, xp })
  })

  return entries.sort((a, b) => b.value - a.value).slice(0, limitTo)
}

export async function fetchFriendsLeaderboard(
  friendUids: string[],
  selfUid: string,
  selfName: string,
  category: LeaderboardCategory,
): Promise<LeaderboardEntry[]> {
  const [bestSnaps, usersMap] = await Promise.all([bestSnapshotPerUser(), getAllUsers()])
  const relevant = [selfUid, ...friendUids]

  const entries: LeaderboardEntry[] = relevant.map((uid) => {
    const s = bestSnaps.get(uid)
    const u = usersMap.get(uid)
    const displayName = uid === selfUid ? selfName : u?.displayName || s?.displayName || 'Friend'
    const value = metricFor(category, s, u)
    const streak = u?.streak?.lastClockInDate === getTodayString() ? u.streak.current : 0
    const xp = Math.max(s?.xp ?? 0, (u as any)?.xp ?? 0)
    return { uid, displayName, value, streak, xp }
  })

  return entries.sort((a, b) => b.value - a.value)
}

export async function fetchTeamLeaderboard(classroomId: string, category: LeaderboardCategory): Promise<TeamLeaderboardEntry[]> {
  const [teams, snapsQuery, usersMap] = await Promise.all([
    listTeamsForClassroom(classroomId),
    getDocs(query(collection(db, 'progressSnapshots'), where('classroomId', '==', classroomId))).catch(() => null),
    getAllUsers(),
  ])

  const byUid = new Map<string, ProgressSnapshot>()
  snapsQuery?.forEach((d) => {
    const s = d.data() as ProgressSnapshot
    byUid.set(s.uid, s)
  })

  return teams
    .map((t) => {
      const members = t.memberUids.map((uid) => byUid.get(uid)).filter((s): s is ProgressSnapshot => !!s)
      const value = members.length
        ? members.reduce((sum, s) => sum + metricFor(category, s, usersMap.get(s.uid)), 0) / members.length
        : 0
      return { teamId: t.id, name: t.name, classroomId, value, memberCount: t.memberUids.length }
    })
    .sort((a, b) => b.value - a.value)
}
