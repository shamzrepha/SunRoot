// ---------------------------------------------------------------------------
// A student reaches the simulation ONLY by opening a specific classroom's
// "Open Workshop" button (see classes.ts) — there's no way into Farm/Circuit
// Lab/Coding Lab that skips a classroom. This module remembers which
// classroom that was (and, if they entered via a team, which team), so
// progress syncs and saves are tagged to that class/team instead of being
// one global blob that mixes together every class a student is in.
//
// Persisted to localStorage (unlike the module-only version this replaces)
// specifically so a mid-workshop refresh can resume the same classroom
// automatically — see main.ts's auth gate, which checks this on boot.
// ---------------------------------------------------------------------------

const CLASSROOM_KEY = 'sunroot:activeClassroom'
const TEAM_KEY = 'sunroot:activeTeam'

let activeClassroomId: string | null = safeGet(CLASSROOM_KEY)
let activeTeamId: string | null = safeGet(TEAM_KEY)

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function setActiveClassroom(classroomId: string | null) {
  activeClassroomId = classroomId
  try {
    if (classroomId) localStorage.setItem(CLASSROOM_KEY, classroomId)
    else localStorage.removeItem(CLASSROOM_KEY)
  } catch {
    /* private browsing or quota — in-memory value still works for this tab */
  }
}

export function getActiveClassroom(): string | null {
  return activeClassroomId
}

/** Set when a student enters a specific team's shared workshop rather than their own solo one. */
export function setActiveTeam(teamId: string | null) {
  activeTeamId = teamId
  try {
    if (teamId) localStorage.setItem(TEAM_KEY, teamId)
    else localStorage.removeItem(TEAM_KEY)
  } catch {
    /* ignore */
  }
}

export function getActiveTeam(): string | null {
  return activeTeamId
}
