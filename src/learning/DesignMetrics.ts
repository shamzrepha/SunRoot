// ---------------------------------------------------------------------------
// DesignMetrics
//
// Six dimensions of a design, recomputed from the bench on every change, so the
// report moves as the student works rather than only when a run finishes.
//
// Two principles shape what is measured here.
//
// First, **no prescribed architecture**. Nothing rewards using a breadboard, a
// relay rather than a MOSFET, or any particular part. What is measured is
// whether the choices hold together: does the switching stage carry the current
// the load needs, does the array meet the daily demand, does the logic branch
// on something real. A student who solders point to point and one who uses a
// breadboard can both score full marks.
//
// Second, **creativity is measured as divergence that works**. Using an unusual
// part, or solving the problem with fewer components than expected, scores —
// but only when the design still functions. Novelty that fails is not
// creativity, it is a mistake, and the model is told to treat it as one.
// ---------------------------------------------------------------------------

import { graph, partOf, wiredOutputs, wiredSensors } from '../hardware/CircuitGraph'
import { checkGraph } from '../hardware/GraphChecker'
import { alwaysOnLoads, hydraulicPath, topology } from '../simulation/PowerSystem'
import { score } from '../simulation/Scoreboard'
import { learner, overallMastery } from './LearnerModel'
import { programStructure } from './DesignDossier'

export type DimensionId =
  | 'correctness'
  | 'systemThinking'
  | 'efficiency'
  | 'creativity'
  | 'tidiness'
  | 'robustness'

export interface Dimension {
  id: DimensionId
  label: string
  /** 0–100, or null where the student has not yet done enough to judge it. */
  value: number | null
  /** What produced this number, in plain language. */
  notes: string[]
}

export interface MetricSet {
  dimensions: Dimension[]
  /** Weighted overall, 0–100, or null when nothing is measurable yet. */
  overall: number | null
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

/**
 * Recomputed on demand. Cheap enough to call on every wire change — the whole
 * point is that the figure moves while the student is working.
 */
export function computeMetrics(): MetricSet {
  const placed = graph.placed.map((p) => partOf(p.instanceId)!).filter(Boolean)
  const check = checkGraph()
  const topo = topology()
  const water = hydraulicPath()
  const hard = alwaysOnLoads()
  const sensors = wiredSensors()
  const outputs = wiredOutputs()
  const prog = programStructure()
  const best = score.runs[0]

  const nothingYet = placed.length === 0

  // --- correctness: does it hold together electrically ---------------------
  const correctness: Dimension = { id: 'correctness', label: 'Electrical correctness', value: null, notes: [] }
  if (!nothingYet) {
    let v = 100
    v -= check.errors * 18
    v -= check.warnings * 5
    if (sensors.some((s) => !s.readable)) {
      v -= 10
      correctness.notes.push('A sensor is on a pin that cannot read it')
    }
    if (outputs.some((o) => !o.drivable)) {
      v -= 10
      correctness.notes.push('An output is on a pin that cannot drive')
    }
    if (check.errors === 0) correctness.notes.push('No electrical faults outstanding')
    else correctness.notes.push(`${check.errors} fault${check.errors === 1 ? '' : 's'} outstanding`)
    correctness.value = clamp(v)
  }

  // --- system thinking: are the subsystems joined into one machine ---------
  const systemThinking: Dimension = { id: 'systemThinking', label: 'System thinking', value: null, notes: [] }
  if (!nothingYet) {
    let v = 0
    if (sensors.length) { v += 25; systemThinking.notes.push('Something is being measured') }
    if (outputs.length) { v += 25; systemThinking.notes.push('Something is under program control') }
    if (outputs.some((o) => o.loadInstance)) { v += 15; systemThinking.notes.push('A load is actually switched') }
    if (topo.chargePathComplete) { v += 15; systemThinking.notes.push('Generation reaches storage') }
    if (water.complete) { v += 20; systemThinking.notes.push('The water path is complete') }
    if (!sensors.length && outputs.length) {
      systemThinking.notes.push('Acting without measuring — the loop is open')
    }
    systemThinking.value = clamp(v)
  }

  // --- efficiency: did it cost what it needed to, and no more --------------
  const efficiency: Dimension = { id: 'efficiency', label: 'Efficiency', value: null, notes: [] }
  if (!nothingYet) {
    let v = 60
    const cost = placed.reduce((sum, p) => sum + p.cost, 0)
    if (topo.installedPeakWatts > 0) {
      const demand = (topo.activeLoadWatts + topo.standbyWatts) * 8
      const supply = topo.arrayPeakWatts * topo.harvestEfficiency * 6
      if (supply >= demand) { v += 15; efficiency.notes.push('Generation covers a day of demand') }
      else { v -= 15; efficiency.notes.push('Generation falls short of daily demand') }
    }
    if (topo.controllerName.startsWith('none') && topo.installedPeakWatts > 0) {
      v -= 12
      efficiency.notes.push('No charge controller — roughly 45% of the array is wasted')
    } else if (!topo.controllerName.startsWith('none')) {
      v += 8
      efficiency.notes.push(`Harvesting through ${topo.controllerName}`)
    }
    if (best) {
      if (best.litresUsed < 60) { v += 12; efficiency.notes.push(`Rescued on ${Math.round(best.litresUsed)} litres`) }
      else if (best.litresUsed > 140) { v -= 10; efficiency.notes.push(`${Math.round(best.litresUsed)} litres used — heavy`) }
    }
    efficiency.notes.push(`Build cost ${cost} credits across ${placed.length} parts`)
    efficiency.value = clamp(v)
  }

  // --- creativity: divergence that works -----------------------------------
  const creativity: Dimension = { id: 'creativity', label: 'Creativity', value: null, notes: [] }
  if (!nothingYet) {
    let v = 45
    const working = check.errors === 0

    // Sensing beyond the obvious moisture probe.
    const kinds = new Set(sensors.map((s) => s.part.id))
    if (kinds.size >= 2) {
      v += 15
      creativity.notes.push(`${kinds.size} different sensing inputs, not just moisture`)
    }
    // A MOSFET or transistor instead of the obvious relay.
    if (placed.some((p) => p.id === 'mosfetIRF520' || p.id === 'transistor2N2222')) {
      v += 10
      creativity.notes.push('Chose solid-state switching over a relay')
    }
    // Solving it without a breadboard at all.
    if (placed.length >= 4 && !placed.some((p) => p.id.startsWith('breadboard'))) {
      v += 10
      creativity.notes.push('Built without a breadboard — wired point to point')
    }
    // Doing more with less.
    if (best && best.parts <= 6) {
      v += 12
      creativity.notes.push(`Rescued the farm with only ${best.parts} parts`)
    }
    // Logic that goes beyond a single threshold.
    if (prog && prog.distinctThresholds.length >= 3) {
      v += 8
      creativity.notes.push('Layered conditions rather than one threshold')
    }
    if (prog && prog.hasWait) {
      v += 5
      creativity.notes.push('Used timing as part of the control strategy')
    }

    // Novelty that does not work is not creativity.
    if (!working && v > 55) {
      v = 55
      creativity.notes.push('Unusual choices, but the circuit does not yet work')
    }
    creativity.value = clamp(v)
  }

  // --- tidiness: is the build clean and deliberate --------------------------
  const tidiness: Dimension = { id: 'tidiness', label: 'Tidiness', value: null, notes: [] }
  if (!nothingYet) {
    let v = 80
    const unwired = placed.filter((p) => {
      const inst = graph.placed.find((g) => partOf(g.instanceId) === p)
      if (!inst) return false
      return !graph.wires.some(
        (w) => w.fromInstance === inst.instanceId || w.toInstance === inst.instanceId,
      )
    })
    if (unwired.length) {
      v -= unwired.length * 12
      tidiness.notes.push(`${unwired.length} component(s) placed but never connected`)
    }
    if (hard.length) {
      v -= 15
      tidiness.notes.push(`${hard[0].part.name} bypasses the switching stage entirely`)
    }
    // Redundant wires: more than one run between the same pair of pins.
    const seen = new Set<string>()
    let dupes = 0
    for (const w of graph.wires) {
      const key = [`${w.fromInstance}.${w.fromPin}`, `${w.toInstance}.${w.toPin}`].sort().join('|')
      if (seen.has(key)) dupes++
      seen.add(key)
    }
    if (dupes) { v -= dupes * 6; tidiness.notes.push(`${dupes} duplicate connection(s)`) }
    if (v >= 80) tidiness.notes.push('Clean build with nothing left dangling')
    tidiness.value = clamp(v)
  }

  // --- robustness: would it survive a bad week ------------------------------
  const robustness: Dimension = { id: 'robustness', label: 'Robustness', value: null, notes: [] }
  if (prog || best) {
    let v = 50
    if (prog) {
      if (prog.distinctThresholds.length >= 2) {
        v += 20
        robustness.notes.push('Separate on and off thresholds — hysteresis')
      } else if (prog.distinctThresholds.length === 1) {
        v -= 15
        robustness.notes.push('One threshold for both directions — this will chatter')
      }
      if (!prog.hasConditional && prog.blockCount > 0) {
        v -= 20
        robustness.notes.push('The logic never branches on a reading')
      }
    }
    if (best) {
      if (best.lowestBattery > 20) { v += 15; robustness.notes.push(`Battery never fell below ${Math.round(best.lowestBattery)}%`) }
      else if (best.lowestBattery < 5) { v -= 15; robustness.notes.push('Battery reached empty during the run') }
      if (best.relayCycles < 12) { v += 15; robustness.notes.push(`Only ${best.relayCycles} switch operations`) }
      else if (best.relayCycles > 60) { v -= 15; robustness.notes.push(`${best.relayCycles} switch operations — hard on the hardware`) }
    }
    robustness.value = clamp(v)
  }

  const dimensions = [correctness, systemThinking, efficiency, creativity, tidiness, robustness]

  const weights: Record<DimensionId, number> = {
    correctness: 0.24,
    systemThinking: 0.22,
    efficiency: 0.16,
    creativity: 0.16,
    tidiness: 0.10,
    robustness: 0.12,
  }

  const scored = dimensions.filter((d) => d.value !== null)
  const overall = scored.length
    ? clamp(
        scored.reduce((sum, d) => sum + (d.value ?? 0) * weights[d.id], 0) /
          scored.reduce((sum, d) => sum + weights[d.id], 0),
      )
    : null

  return { dimensions, overall }
}

/** A compact line for the live badge, and for the model's dossier. */
export function metricsDigest(): string {
  const m = computeMetrics()
  if (m.overall === null) return 'Nothing built yet, so nothing is measurable.'
  return (
    `Overall ${m.overall}/100. ` +
    m.dimensions
      .filter((d) => d.value !== null)
      .map((d) => `${d.label} ${d.value}`)
      .join(', ') +
    '. ' +
    m.dimensions
      .flatMap((d) => d.notes.map((n) => `${d.label}: ${n}`))
      .join(' | ')
  )
}

/** Mastery and attempts, kept alongside so the report reads as one picture. */
export function progressDigest(): string {
  return `Mastery ${Math.round(overallMastery() * 100)}%, ${learner.attempts} deployment(s), ${score.runs.length} rescue(s).`
}
