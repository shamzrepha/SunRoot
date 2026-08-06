// ---------------------------------------------------------------------------
// ContextBuilder
//
// Everything the assistant can see. The previous snapshot covered the bench and
// the farm only, which is why it answered "I don't have the exact list in front
// of me" to a student standing in the tool shed — a fair answer to a question
// it had been given no way to answer.
//
// The engine knows all of this already. The assistant should not have to guess
// at any of it: which screen the student is on, what is in their tray, what
// they can still afford, what is wired, what the farm is doing, and what they
// have just done.
// ---------------------------------------------------------------------------

import { appState } from '../appState'
import { CATALOG, CATEGORY_LABELS, CATEGORY_ORDER, partsInCategory } from '../hardware/ComponentCatalog'
import { canProceed, distinctOwned, remaining, spent, tray } from '../hardware/PartsTray'
import { graph, partOf, wiredOutputs, wiredSensors } from '../hardware/CircuitGraph'
import { describeCircuit, describeProgram } from './DesignDossier'
import { checkGraph } from '../hardware/GraphChecker'
import { farm } from '../simulation/FarmState'
import { alwaysOnLoads, hydraulicPath, topology } from '../simulation/PowerSystem'
import { score } from '../simulation/Scoreboard'
import { CONCEPTS, learner, masteryOf } from '../learning/LearnerModel'
import { currentMode } from '../learning/LearningModes'

/** A short trail of what the student just did, so advice can reference it. */
const recent: string[] = []
const RECENT_LIMIT = 8

export function noteAction(text: string) {
  recent.unshift(text)
  if (recent.length > RECENT_LIMIT) recent.pop()
}

export function recentActions(): string[] {
  return [...recent]
}

const SCREEN_NAMES: Record<string, string> = {
  loading: 'the loading screen',
  intro: 'the introduction',
  shed: 'the Tool Shed (buying components)',
  circuit: 'the Circuit Lab (wiring the bench)',
  coding: 'the Coding Lab (writing block logic)',
  farm: 'the Farm (watching the digital twin)',
  learning: 'the Learning Model dashboard',
  teacher: 'the Class View',
  tutor: 'the Tutor screen',
  report: 'the Engineer Report',
  quiz: 'the Learning Check',
  rewards: 'the Rewards screen',
  access: 'the Accessibility settings',
}

/** What the student owns, in plain language. */
export function trayDescription(): string {
  const owned = distinctOwned()
  if (!owned.length) return 'Their parts tray is EMPTY — they have bought nothing yet.'
  return (
    'In their parts tray: ' +
    owned.map((o) => `${o.quantity}× ${o.part.name} (${o.part.cost}c)`).join(', ') +
    `. Spent ${spent()} of ${tray.budget} credits, ${remaining()} remaining.`
  )
}

/**
 * The catalogue, grouped and priced. Included whenever the student is shopping
 * so the assistant can recommend real parts at real prices rather than
 * inventing a shopping list.
 */
export function catalogueDigest(): string {
  return CATEGORY_ORDER.map((cat) => {
    const items = partsInCategory(cat)
      .map((p) => `${p.name} ${p.cost}c`)
      .join('; ')
    return `${CATEGORY_LABELS[cat]}: ${items}`
  }).join('\n')
}

/** A minimum viable shopping list, costed against the real catalogue. */
export function suggestedLoadout(): string {
  const pick = (id: string) => CATALOG.find((p) => p.id === id)!
  const essential = [
    ['esp32', 'a 3.3 V controller with ADC pins'],
    ['breadboardFull', 'somewhere to wire without soldering'],
    ['wireMM', 'jumper wires'],
    ['soilCapacitive', 'measures moisture, and will not corrode'],
    ['relay1ch', 'lets a logic pin switch a 12 V load'],
    ['pump12v', 'moves the water'],
    ['waterTank', 'something to draw from'],
    ['tubing', 'carries water to the field'],
    ['sprinklerHead', 'delivers it to the bed'],
    ['solar20', 'generation'],
    ['mpptController', 'harvests ~95% instead of ~55% unregulated'],
    ['lifepo4_7', 'stores energy for the night'],
  ] as const

  const lines = essential.map(([id, why]) => {
    const p = pick(id)
    return `- ${p.name} (${p.cost}c) — ${why}`
  })
  const total = essential.reduce((sum, [id]) => sum + pick(id).cost, 0)
  return `${lines.join('\n')}\nTotal: ${total} credits of the ${tray.budget} budget.`
}

/** Electrical and hydraulic state of the bench. */
export function benchDescription(): string {
  if (!graph.placed.length) return 'The workbench is EMPTY — nothing has been placed yet.'

  const parts = graph.placed.map((p) => partOf(p.instanceId)?.name).filter(Boolean)
  const sensors = wiredSensors()
  const outputs = wiredOutputs()
  const check = checkGraph()
  const errors = check.issues.filter((i) => i.severity === 'error')

  return [
    `On the workbench: ${parts.join(', ')}.`,
    sensors.length
      ? `Sensors reaching the controller: ${sensors.map((s) => `${s.part.name} on ${s.pinName}${s.readable ? '' : ' (CANNOT be read there)'}`).join(', ')}.`
      : 'No sensor signal reaches the controller.',
    outputs.length
      ? `Under program control: ${outputs.map((o) => `${o.part.name} on ${o.pinName}${o.drivable ? '' : ' (pin cannot drive)'}`).join(', ')}.`
      : 'Nothing is under program control.',
    errors.length
      ? `Circuit faults: ${errors.map((e) => e.message).join(' | ')}`
      : 'No circuit errors detected.',
  ].join(' ')
}

/** Power and water, from the real topology. */
export function systemsDescription(): string {
  const t = topology()
  const h = hydraulicPath()
  const hard = alwaysOnLoads()
  return [
    `Power: ${t.installedPeakWatts} W of panel installed, ${t.arrayPeakWatts} W of it reaching the bank;`,
    `storage ${t.capacityWh} Wh; charge controller ${t.controllerName};`,
    `load ${t.activeLoadWatts.toFixed(0)} W active plus ${t.standbyWatts.toFixed(1)} W standby.`,
    hard.length ? `WARNING: ${hard[0].part.name} is wired directly across the ${hard[0].via}, so it runs continuously regardless of any program.` : '',
    `Water: ${h.complete ? 'a complete path from tank through pump to delivery.' : `incomplete — ${h.reason}`}`,
  ]
    .filter(Boolean)
    .join(' ')
}

/** Live farm telemetry. */
export function farmDescription(): string {
  return [
    `Farm: day ${farm.day}, ${String(Math.floor(farm.hour)).padStart(2, '0')}:${String(Math.floor((farm.hour % 1) * 60)).padStart(2, '0')}.`,
    `Soil moisture ${farm.soilMoisture.toFixed(0)}% (optimal band 30–70).`,
    `Crop health ${farm.cropHealth.toFixed(0)}%.`,
    `Battery ${farm.battery.toFixed(0)}%, solar ${farm.solarGeneration} W.`,
    `Tank ${farm.tankCapacityLitres ? `${farm.tankLitres.toFixed(0)} of ${farm.tankCapacityLitres} L` : 'none installed'}.`,
    `Pump ${farm.pumpOn ? 'ON' : 'off'}, water flow ${farm.waterFlow > 0 ? 'active' : 'none'}.`,
    `Conditions ${farm.environment.activeEvents.join(', ') || 'clear'}, ${farm.environment.ambientTempC.toFixed(0)}°C.`,
    farm.actuator.strain > 0 ? `Pump strain ${farm.actuator.strain.toFixed(0)}%.` : '',
    score.runs.length ? `${score.runs.length} completed run(s); best rescue ${score.runs[0].farmHours.toFixed(1)} farm hours.` : 'No completed runs yet.',
  ]
    .filter(Boolean)
    .join(' ')
}

/** Mastery estimates, so the model can pitch its answer. */
export function learnerDescription(): string {
  const weak = CONCEPTS.filter((c) => masteryOf(c.id) < 0.5).map((c) => `${c.label} ${Math.round(masteryOf(c.id) * 100)}%`)
  const strong = CONCEPTS.filter((c) => masteryOf(c.id) >= 0.8).map((c) => c.label)
  return [
    `${learner.attempts} deployment(s) so far.`,
    weak.length ? `Weak: ${weak.join(', ')}.` : 'No concept measured weak.',
    strong.length ? `Solid: ${strong.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * The full snapshot. Assembled fresh on every question, so the assistant is
 * never answering about a state that has already moved on.
 */
export function fullContext(): string {
  const screen = SCREEN_NAMES[appState.screen] ?? appState.screen
  const shopping = appState.screen === 'shed'
  const gate = canProceed()

  const blocks = [
    `THE STUDENT IS CURRENTLY ON: ${screen}.`,
    `Teaching mode: ${currentMode().label}.`,
    '',
    trayDescription(),
    shopping
      ? `They ${gate.ok ? 'have enough to proceed to the circuit lab' : `cannot proceed yet: ${gate.reason}`}.`
      : '',
    '',
    benchDescription(),
    '',
    describeProgram(),
    '',
    systemsDescription(),
    '',
    farmDescription(),
    '',
    learnerDescription(),
    recent.length ? `\nRecent actions (newest first): ${recent.join(' | ')}` : '',
  ]

  // The full catalogue is only worth its tokens while they are shopping.
  if (shopping) {
    blocks.push(
      '',
      'FULL CATALOGUE AVAILABLE TO BUY (name and cost in credits):',
      catalogueDigest(),
      '',
      'A known-good minimum loadout, if they ask what to buy:',
      suggestedLoadout(),
    )
  }

  // On the bench and in the coding lab, the full netlist is worth its tokens:
  // it is what lets the assistant answer about a specific wire.
  if (appState.screen === 'circuit' || appState.screen === 'coding') {
    blocks.push('', 'FULL NETLIST:', describeCircuit())
  }

  return blocks.filter((b) => b !== '').join('\n')
}
