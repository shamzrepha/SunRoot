// ---------------------------------------------------------------------------
// SaveManager
//
// Every piece of session state in this app — the farm, the circuit graph, the
// coding blocks, the learner model, the scoreboard, XP/badges — lives as a
// plain in-memory singleton (`export const farm = {...}`, etc). That's fine
// for a running tab, but it means a refresh re-runs module init and throws
// everything away. This file is the fix: it snapshots all of those singletons
// into localStorage on a short interval and on tab close, and restores them
// by mutating the same singleton objects in place *before* any screen renders.
//
// Local-first by design: it works with zero backend, offline, immediately.
// If/when accounts ship, swap `writeLocal`/`readLocal` for calls that also
// sync to Firestore keyed by uid — the shape of what's saved doesn't change.
// ---------------------------------------------------------------------------

import { farm } from '../simulation/FarmState'
import { graph } from '../hardware/CircuitGraph'
import { learner } from '../learning/LearnerModel'
import { score } from '../simulation/Scoreboard'
import { progress } from '../game/progress'
import { getSavedWorkspace, setSavedWorkspace } from '../screens/codingLab'

const SAVE_KEY = 'sunroot:save:v1'
const CURRENT_VERSION = 1

interface SaveBlob {
  version: number
  savedAt: number
  farm: unknown
  graph: { placed: unknown[]; wires: unknown[]; lastCheckedAt: number }
  learner: unknown
  score: unknown
  progress: unknown
  workspace: object | null
}

function snapshot(): SaveBlob {
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

/** Write the current state to localStorage. Safe to call often — it's cheap. */
export function saveAll() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot()))
  } catch (err) {
    // Quota exceeded or private-browsing restrictions — not fatal, just log it.
    console.error('SunRoot: autosave failed', err)
  }
}

export function hasSave(): boolean {
  return localStorage.getItem(SAVE_KEY) !== null
}

export function lastSavedAt(): number | null {
  const raw = localStorage.getItem(SAVE_KEY)
  if (!raw) return null
  try {
    return (JSON.parse(raw) as SaveBlob).savedAt
  } catch {
    return null
  }
}

/**
 * Mutates every live singleton in place to match the saved blob. Must run
 * before any screen renders, since screens read these objects directly.
 * Returns false (and leaves everything at its fresh-boot defaults) if there
 * is no save or it fails to parse — a corrupt save should never crash boot.
 */
export function restoreAll(): boolean {
  const raw = localStorage.getItem(SAVE_KEY)
  if (!raw) return false

  try {
    const blob = JSON.parse(raw) as SaveBlob
    if (blob.version !== CURRENT_VERSION) return false // shape changed — start fresh rather than guess

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
    console.error('SunRoot: restore failed, starting fresh', err)
    return false
  }
}

/** Wipe the save — wire this to a "reset farm" button if you want one. */
export function clearSave() {
  localStorage.removeItem(SAVE_KEY)
}

let intervalHandle = 0

/** Call once at boot, after restoreAll(). Autosaves periodically and on tab close/hide. */
export function startAutosave(intervalMs = 3000) {
  window.clearInterval(intervalHandle)
  intervalHandle = window.setInterval(saveAll, intervalMs)

  // 'beforeunload' doesn't fire reliably on mobile Safari or when a tab is
  // just backgrounded — 'visibilitychange' catches those cases too.
  window.addEventListener('beforeunload', saveAll)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveAll()
  })
}
