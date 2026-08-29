// ---------------------------------------------------------------------------
// SaveManager
//
// Every piece of session state in this app — the farm, the circuit graph, the
// coding blocks, the learner model, the scoreboard, XP/badges — lives as a
// plain in-memory singleton (`export const farm = {...}`, etc). That's fine
// for a running tab, but it means a refresh re-runs module init and throws
// everything away. This file fixes that: it snapshots all of those
// singletons into localStorage on a short interval and on tab close, and
// restores them by mutating the same singleton objects in place before any
// screen renders.
//
// Scoped per classroom (see WorkshopContext.ts): the save key includes which
// classroom is active, so opening a different class's workshop starts that
// class's own save, not the same blob every class shared before. Skipped
// entirely when no classroom is active — there's nothing meaningful to save
// outside a workshop session.
// ---------------------------------------------------------------------------

import { farm } from '../simulation/FarmState'
import { graph } from '../hardware/CircuitGraph'
import { learner, CONCEPTS, masteryOf, overallMastery, MASTERY_THRESHOLD } from '../learning/LearnerModel'
import { score } from '../simulation/Scoreboard'
import { progress } from '../game/progress'
import { getSavedWorkspace, setSavedWorkspace } from '../screens/codingLab'
import { session } from '../accounts/Session'
import { pushProgressSnapshot } from '../accounts/ProgressService'
import { getActiveClassroom } from '../accounts/WorkshopContext'

const CURRENT_VERSION = 1

export interface SaveBlob {
  version: number
  savedAt: number
  farm: unknown
  graph: { placed: unknown[]; wires: unknown[]; lastCheckedAt: number }
  learner: unknown
  score: unknown
  progress: unknown
  workspace: object | null
}

function saveKey(classroomId: string): string {
  return `sunroot:save:v1:${classroomId}`
}

/** A full snapshot of every live singleton — also what gets shipped to a team on "save & ship". */
export function buildSnapshot(): SaveBlob {
  // Deep-clone via JSON round-trip — every one of these objects is plain
  // data (numbers, strings, arrays, nested plain objects), so this is safe
  // and avoids accidentally sharing references with the live singletons.
  return {
    version: CURRENT_VERSION,
    savedAt: Date.now(),
    farm: JSON.parse(JSON.stringify(farm)),
    graph: {
      placed: JSON.parse(JSON.stringify(graph.placed)),
      wires: JSON.parse(JSON.stringify(graph.wires)),
      lastCheckedAt: graph.lastCheckedAt,
    },
    learner: JSON.parse(JSON.stringify(learner)),
    score: JSON.parse(JSON.stringify(score)),
    progress: JSON.parse(JSON.stringify(progress)),
    workspace: getSavedWorkspace(),
  }
}

/**
 * Mutates every live singleton in place to match a snapshot — used both for
 * localStorage restore and for pulling a team's shared state. Returns false
 * (leaving everything untouched) if the blob is missing or the wrong shape,
 * so a corrupt or foreign snapshot never half-applies.
 */
export function applySnapshot(blob: SaveBlob | null | undefined): boolean {
  if (!blob || blob.version !== CURRENT_VERSION) return false
  try {
    Object.assign(farm, blob.farm as object)

    graph.placed.length = 0
    graph.placed.push(...(blob.graph.placed as typeof graph.placed))
    graph.wires.length = 0
    graph.wires.push(...(blob.graph.wires as typeof graph.wires))
    graph.lastCheckedAt = blob.graph.lastCheckedAt

    Object.assign(learner, blob.learner as object)
    Object.assign(score, blob.score as object)
    Object.assign(progress, blob.progress as object)

    if (blob.workspace) setSavedWorkspace(blob.workspace)
    return true
  } catch (err) {
    console.error('SunRoot: applying snapshot failed', err)
    return false
  }
}

/** Write the current state to localStorage under the active classroom's key. No-ops with no active classroom. */
export function saveAll() {
  const classroomId = getActiveClassroom()
  if (!classroomId) return
  try {
    localStorage.setItem(saveKey(classroomId), JSON.stringify(buildSnapshot()))
  } catch (err) {
    // Quota exceeded or private-browsing restrictions — not fatal, just log it.
    console.error('SunRoot: autosave failed', err)
  }
}

export function hasSaveFor(classroomId: string): boolean {
  return localStorage.getItem(saveKey(classroomId)) !== null
}

export function lastSavedAtFor(classroomId: string): number | null {
  const raw = localStorage.getItem(saveKey(classroomId))
  if (!raw) return null
  try {
    return (JSON.parse(raw) as SaveBlob).savedAt
  } catch {
    return null
  }
}

/** Restores whichever classroom is currently active (see WorkshopContext.ts). Call this once, right when entering that classroom's workshop — not on every screen change within it. */
export function restoreForActiveClassroom(): boolean {
  const classroomId = getActiveClassroom()
  if (!classroomId) return false
  const raw = localStorage.getItem(saveKey(classroomId))
  if (!raw) return false
  try {
    return applySnapshot(JSON.parse(raw) as SaveBlob)
  } catch (err) {
    console.error('SunRoot: restore failed, starting fresh', err)
    return false
  }
}

/** Wipe the save for one classroom — wire this to a "reset farm" button if you want one. */
export function clearSaveFor(classroomId: string) {
  localStorage.removeItem(saveKey(classroomId))
}

let intervalHandle = 0
let progressSyncHandle = 0

/**
 * Pushes a summary (XP, rank, concepts mastered, full per-concept detail) to
 * Firestore so a teacher can actually see it — scoped to whichever classroom
 * launched this workshop session. Skipped entirely if nobody is signed in,
 * or if there's no active classroom.
 */
async function syncProgressSnapshot() {
  const profile = session.profile
  const classroomId = getActiveClassroom()
  if (!profile || !classroomId) return
  try {
    const conceptMastery: ReturnType<typeof buildConceptMastery> = buildConceptMastery()
    await pushProgressSnapshot({
      uid: profile.uid,
      classroomId,
      displayName: profile.displayName,
      xp: progress.xp,
      rank: progress.rank,
      conceptsMastered: CONCEPTS.filter((c) => masteryOf(c.id) >= MASTERY_THRESHOLD).length,
      totalConcepts: CONCEPTS.length,
      overallMastery: overallMastery(),
      daysSurvived: progress.stats.daysSurvived,
      badgesEarned: progress.badges.filter((b) => b.earned).length,
      totalBadges: progress.badges.length,
      conceptMastery,
    })
  } catch (err) {
    console.error('SunRoot: progress sync failed', err)
  }
}

function buildConceptMastery() {
  const out: Record<
    string,
    { mastery: number; engaged: boolean; correct: number; incorrect: number; lastSeen: number; evidence: string[] }
  > = {}
  for (const c of CONCEPTS) {
    const st = learner.concepts[c.id]
    out[c.id] = {
      mastery: masteryOf(c.id),
      engaged: st.correct + st.incorrect > 0,
      correct: st.correct,
      incorrect: st.incorrect,
      lastSeen: st.lastSeen,
      evidence: st.evidence.slice(0, 6),
    }
  }
  return out
}

/** Call once at boot. Autosaves periodically (per active classroom) and on tab close/hide. */
export function startAutosave(intervalMs = 3000) {
  window.clearInterval(intervalHandle)
  intervalHandle = window.setInterval(saveAll, intervalMs)

  // 'beforeunload' doesn't fire reliably on mobile Safari or when a tab is
  // just backgrounded — 'visibilitychange' catches those cases too.
  window.addEventListener('beforeunload', saveAll)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveAll()
  })

  // Progress summary syncs far less often than the local save — it's a
  // network write, not a localStorage write, and a teacher's roster view
  // doesn't need second-by-second freshness.
  window.clearInterval(progressSyncHandle)
  progressSyncHandle = window.setInterval(syncProgressSnapshot, 20000)
  syncProgressSnapshot()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') syncProgressSnapshot()
  })
}
