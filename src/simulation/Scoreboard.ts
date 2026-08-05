// ---------------------------------------------------------------------------
// Scoreboard
//
// How long it took to save the farm, and how that compares with previous
// attempts. The clock starts when a system is first deployed and stops the
// moment crop health crosses the rescue threshold — so it measures engineering,
// not menu navigation.
//
// Runs are held in memory for the session. Nothing is uploaded anywhere.
// ---------------------------------------------------------------------------

import { farm } from './FarmState'
import { graph, partOf } from '../hardware/CircuitGraph'

/** Crop health at which the farm counts as rescued. */
export const RESCUE_HEALTH = 75

export interface RunRecord {
  /** Farm-hours elapsed between deployment and rescue. */
  farmHours: number
  /** Real seconds the student spent. */
  realSeconds: number
  /** Peak crop health reached. */
  peakHealth: number
  /** Lowest the battery fell to, as a percentage. */
  lowestBattery: number
  /** Litres of water spent. */
  litresUsed: number
  /** Relay operations, which is a proxy for how stable the control loop was. */
  relayCycles: number
  /** Component count, so a lean design can be recognised as such. */
  parts: number
  /** Total credits the build cost. */
  cost: number
  finishedAt: number
}

export interface ScoreState {
  running: boolean
  rescued: boolean
  startFarmHour: number
  startReal: number
  litresAtStart: number
  cyclesAtStart: number
  lowestBattery: number
  peakHealth: number
  runs: RunRecord[]
}

export const score: ScoreState = {
  running: false,
  rescued: false,
  startFarmHour: 0,
  startReal: 0,
  litresAtStart: 0,
  cyclesAtStart: 0,
  lowestBattery: 100,
  peakHealth: 0,
  runs: [],
}

/** Called on every deploy. Restarts the clock for a fresh attempt. */
export function beginRun() {
  score.running = true
  score.rescued = false
  score.startFarmHour = farm.day * 24 + farm.hour
  score.startReal = performance.now()
  score.litresAtStart = farm.tankLitres
  score.cyclesAtStart = farm.actuator.cycles
  score.lowestBattery = farm.battery
  score.peakHealth = farm.cropHealth
}

/** Called each tick while the farm screen is live. */
export function tickScore(): RunRecord | null {
  if (!score.running) return null

  score.lowestBattery = Math.min(score.lowestBattery, farm.battery)
  score.peakHealth = Math.max(score.peakHealth, farm.cropHealth)

  if (farm.cropHealth < RESCUE_HEALTH) return null

  // Rescued. Close the run and record it.
  score.running = false
  score.rescued = true

  const record: RunRecord = {
    farmHours: farm.day * 24 + farm.hour - score.startFarmHour,
    realSeconds: (performance.now() - score.startReal) / 1000,
    peakHealth: score.peakHealth,
    lowestBattery: score.lowestBattery,
    litresUsed: Math.max(0, score.litresAtStart - farm.tankLitres),
    relayCycles: farm.actuator.cycles - score.cyclesAtStart,
    parts: graph.placed.length,
    cost: graph.placed.reduce((sum, p) => sum + (partOf(p.instanceId)?.cost ?? 0), 0),
    finishedAt: Date.now(),
  }

  score.runs.push(record)
  score.runs.sort((a, b) => a.farmHours - b.farmHours)
  return record
}

/** Elapsed farm-hours in the current attempt. */
export function elapsedFarmHours(): number {
  if (!score.running) return 0
  return farm.day * 24 + farm.hour - score.startFarmHour
}

export function bestRun(): RunRecord | undefined {
  return score.runs[0]
}

/** Human formatting for a duration in farm-hours. */
export function formatFarmTime(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`
  const d = Math.floor(hours / 24)
  const h = Math.round(hours % 24)
  return d > 0 ? `${d}d ${h}h` : `${h}h`
}

/**
 * A single figure of merit. Speed dominates, then efficiency: a design that
 * rescues the farm quickly on little water and few relay operations scores
 * above one that thrashes the hardware to get there.
 */
export function ratingFor(r: RunRecord): number {
  const speed = Math.max(0, 100 - r.farmHours * 1.6)
  const water = Math.max(0, 100 - r.litresUsed * 0.5)
  const stability = Math.max(0, 100 - r.relayCycles * 1.5)
  const reserve = Math.min(100, r.lowestBattery * 2)
  return Math.round(speed * 0.4 + water * 0.2 + stability * 0.2 + reserve * 0.2)
}
