// ---------------------------------------------------------------------------
// EvidenceCollector
//
// The bridge between the simulation and the learner model. Every diagnosable
// event in SunRoot maps onto a concept, so mastery is inferred from the
// student's own engineering rather than from anything they were asked to
// declare. Building a correct drive stage is evidence for `drive_stage`; a
// battery flat at 03:00 is evidence against `energy_budget`.
//
// Evidence is only recorded where the situation genuinely tests the concept.
// A student with no pump installed is not demonstrating anything about
// switching stages, so nothing is recorded — silence is more honest than a
// guess, and a model fed on irrelevant events stops meaning anything.
// ---------------------------------------------------------------------------

import { graph, partOf, wiredOutputs, wiredSensors } from '../hardware/CircuitGraph'
import type { Issue } from '../hardware/GraphChecker'
import { farm } from '../simulation/FarmState'
import { alwaysOnLoads, hydraulicPath, topology } from '../simulation/PowerSystem'
import { observe } from './LearnerModel'
import type { ConceptId } from './LearnerModel'

/** Which concept a given checker message is about. */
function conceptForIssue(issue: Issue): ConceptId | null {
  const m = issue.message.toLowerCase()
  if (/ground/.test(m)) return 'grounding'
  if (/tolerates|volts|voltage|supplies/.test(m)) return 'logic_levels'
  if (/input-only|adc|cannot read|no adc/.test(m)) return 'pin_capability'
  if (/switching stage|straight to a controller pin|rated for/.test(m)) return 'drive_stage'
  if (/switched output|nothing your program controls/.test(m)) return 'drive_stage'
  if (/signal line does not reach/.test(m)) return 'feedback_control'
  if (/power connection|supplies power/.test(m)) return 'energy_budget'
  return null
}

/**
 * Called after every circuit check. Faults are negative evidence; a concept
 * the build clearly exercises without triggering a fault is positive evidence.
 */
export function observeCircuit(issues: Issue[]) {
  if (!graph.placed.length) return

  const faulted = new Set<ConceptId>()

  for (const issue of issues) {
    if (issue.severity !== 'error') continue
    const concept = conceptForIssue(issue)
    if (!concept) continue
    faulted.add(concept)
    observe(concept, false, issue.message)
  }

  // Positive evidence, but only where the build actually exercises the concept.
  const parts = graph.placed.map((p) => partOf(p.instanceId)!).filter(Boolean)
  const hasActuator = parts.some((p) => p.category === 'actuators')
  const hasSensor = parts.some((p) => p.category === 'sensors')
  const hasController = parts.some((p) => p.category === 'controllers')

  if (hasController && parts.length > 2 && !faulted.has('grounding')) {
    observe('grounding', true, 'Every powered device reached a shared ground.')
  }

  if (hasSensor && hasController && !faulted.has('logic_levels')) {
    observe('logic_levels', true, 'Sensor output voltage matched the input it was wired to.')
  }

  const readable = wiredSensors().filter((s) => s.readable)
  if (readable.length && !faulted.has('pin_capability')) {
    observe('pin_capability', true, `${readable[0].part.name} wired to ${readable[0].pinName}, which can read it.`)
  }

  // A drive stage is only demonstrated when a load is switched through one.
  if (hasActuator) {
    const switched = wiredOutputs().some(
      (o) => o.part.category === 'drivers' && o.loadInstance && o.drivable,
    )
    const hardWired = alwaysOnLoads().length > 0
    if (switched) {
      observe('drive_stage', true, 'Load switched through a driver under program control.')
    } else if (hardWired) {
      observe('drive_stage', false, 'Load wired directly across the supply with no switching stage.')
    }
  }

  // Hydraulics is only tested once a pump exists.
  if (parts.some((p) => p.id.startsWith('pump'))) {
    const path = hydraulicPath()
    observe('hydraulics', path.complete, path.complete
      ? 'Tank, pump and delivery formed a complete water path.'
      : (path.reason ?? 'Water path incomplete.'))
  }

  // Sizing is only meaningful when generation and storage are both present.
  const topo = topology()
  if (topo.installedPeakWatts > 0) {
    observe('energy_budget', topo.chargePathComplete, topo.chargePathComplete
      ? `${topo.arrayPeakWatts} W of generation reached the battery bank.`
      : 'Generation installed but not connected to storage.')
  }
}

/**
 * Called once per deployed run, when it ends or when the farm is rescued.
 * Outcomes over time are stronger evidence than a static circuit, because they
 * test whether the design actually holds up.
 */
export interface RunOutcome {
  rescued: boolean
  lowestBattery: number
  relayCycles: number
  farmHours: number
  peakMoisture: number
  dryRunStrain: number
}

export function observeRun(o: RunOutcome) {
  // Energy: did the design survive without flattening the bank?
  if (o.farmHours > 6) {
    observe('energy_budget', o.lowestBattery > 5, o.lowestBattery > 5
      ? `Battery never fell below ${o.lowestBattery.toFixed(0)}% across ${o.farmHours.toFixed(0)} farm hours.`
      : 'Battery reached empty and the pump stopped.')
    observe('renewable_variability', o.lowestBattery > 5, o.lowestBattery > 5
      ? 'System stayed alive through the dark hours.'
      : 'System failed overnight when generation stopped.')
  }

  // Stability: relay operations per farm day.
  if (o.farmHours > 2) {
    const perDay = o.relayCycles / (o.farmHours / 24)
    observe('hysteresis', perDay < 12, perDay < 12
      ? `Control loop stable at ${perDay.toFixed(0)} switch operations per day.`
      : `Actuator switched ${perDay.toFixed(0)} times per day — chattering.`)
  }

  // Water: was the optimal band respected?
  if (o.peakMoisture > 0) {
    observe('water_efficiency', o.peakMoisture <= 85, o.peakMoisture <= 85
      ? `Moisture peaked at ${o.peakMoisture.toFixed(0)}%, inside the optimal band.`
      : `Soil saturated to ${o.peakMoisture.toFixed(0)}%, past the point crops are harmed.`)
  }

  if (o.dryRunStrain > 0) {
    observe('hydraulics', false, 'Pump ran dry — the tank emptied while it was still powered.')
  }

  if (o.rescued) {
    observe('feedback_control', true, `Farm rescued in ${o.farmHours.toFixed(0)} farm hours by the student's own control loop.`)
  }
}

/** Live snapshot used by the conversational assistant for context. */
export function currentSituation(): string {
  const parts = graph.placed.map((p) => partOf(p.instanceId)!).filter(Boolean)
  return [
    `Components placed: ${parts.map((p) => p.name).join(', ') || 'none'}.`,
    `Sensors reporting: ${wiredSensors().map((s) => `${s.part.name} on ${s.pinName}`).join(', ') || 'none'}.`,
    `Outputs under control: ${wiredOutputs().map((o) => `${o.part.name} on ${o.pinName}`).join(', ') || 'none'}.`,
    `Soil moisture ${farm.soilMoisture.toFixed(0)}%, crop health ${farm.cropHealth.toFixed(0)}%,`,
    `battery ${farm.battery.toFixed(0)}%, solar ${farm.solarGeneration} W, tank ${farm.tankLitres.toFixed(0)} L.`,
    `Pump ${farm.pumpOn ? 'on' : 'off'}, water flow ${farm.waterFlow > 0 ? 'active' : 'none'}.`,
  ].join(' ')
}
