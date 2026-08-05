// ---------------------------------------------------------------------------
// ContextualTutor
//
// The tutor never guesses what the student is doing — the engine already knows.
// This module reads the live circuit graph, the compiled program and the farm
// state, works out the single most useful next action, and expresses it at a
// depth chosen from the learning mode and the student's measured mastery.
//
// Four depths of the same guidance:
//
//   HINT        a nudge toward the area              ("Something upstream of the pump is missing.")
//   QUESTION    Socratic, the default for practice   ("How does current reach the pump?")
//   POINTER     names the subsystem and the parts    ("The relay's IN pin has no connection.")
//   INSTRUCTION the literal wire to run              ("Connect relay IN to ESP32 D21.")
//
// The last one matters. A student who has never seen a relay cannot discover
// its pinout by reasoning, and withholding it is not pedagogy, it is an
// obstacle. Learn mode instructs; Challenge mode asks; Exam mode says nothing.
// ---------------------------------------------------------------------------

import {
  graph,
  netOf,
  partOf,
  peersOf,
  wiredOutputs,
  wiredSensors,
  wiresOnPin,
} from '../hardware/CircuitGraph'
import { RAILS, railHole } from '../hardware/Breadboard'
import { terminalsFor } from '../hardware/PinRegistry'
import { farm } from '../simulation/FarmState'
import { hydraulicPath, topology } from '../simulation/PowerSystem'
import { appState } from '../appState'
import { masteryOf } from './LearnerModel'
import type { ConceptId } from './LearnerModel'
import { currentMode, guidanceDepthFor } from './LearningModes'

export type Depth = 'hint' | 'question' | 'pointer' | 'instruction' | 'silent'

export interface Guidance {
  /** What the student should do next, phrased at the chosen depth. */
  text: string
  /** The concept this step teaches, so the learner model can be updated. */
  concept: ConceptId
  /** Instance ids to highlight on screen. */
  highlight: string[]
  depth: Depth
  /** Short label for the step, e.g. "Power the relay". */
  step: string
  /** Progress through the build: which step of how many. */
  index: number
  total: number
}

/**
 * Whether a pin reaches a breadboard rail.
 *
 * `peersOf` deliberately omits breadboards — it answers "which components does
 * this touch", and a hole is not a component. For coaching we need the opposite
 * question, so this compares nets against one hole per rail. Each rail is a
 * single node, so one hole per rail is sufficient.
 */
function reachesRail(instanceId: string, pin: string, boardId: string): boolean {
  const target = netOf(instanceId, pin)
  return RAILS.some((r) => netOf(boardId, railHole(r, 0)) === target)
}

/** Whether a pin is connected to anything at all. */
function isWired(instanceId: string, pin: string): boolean {
  return wiresOnPin(instanceId, pin).length > 0 || peersOf(instanceId, pin).length > 0
}

/** One diagnosable gap in the build, with all four phrasings ready. */
interface Gap {
  step: string
  concept: ConceptId
  highlight: string[]
  hint: string
  question: string
  pointer: string
  instruction: string
}

/**
 * Walk the build in dependency order and return the first thing missing. The
 * order matters: telling a student to write control logic before they have a
 * controller on the bench would be noise.
 */
function findGaps(): Gap[] {
  const gaps: Gap[] = []
  const placed = graph.placed.map((p) => ({ id: p.instanceId, part: partOf(p.instanceId)! }))
  const byCat = (c: string) => placed.filter((p) => p.part?.category === c)

  const controllers = byCat('controllers')
  const sensors = byCat('sensors')
  const drivers = byCat('drivers')
  const actuators = byCat('actuators')
  const boards = placed.filter((p) => p.part?.id.startsWith('breadboard'))

  // --- 1. a controller must exist ---
  if (!controllers.length) {
    gaps.push({
      step: 'Place a controller',
      concept: 'grounding',
      highlight: [],
      hint: 'Nothing on this bench can make a decision yet.',
      question: 'What part of this system is meant to run your program?',
      pointer: 'There is no microcontroller on the bench. Your parts tray has one.',
      instruction: 'Drag your ESP32 or Arduino from the parts tray onto the bench. Everything else connects to it.',
    })
    return gaps
  }

  const ctrl = controllers[0]

  // --- 2. power rails, if a breadboard is in use ---
  if (boards.length) {
    const board = boards[0]
    const ctrlTerms = terminalsFor(ctrl.part)
    const supply = ctrlTerms.find((t) => t.role === 'powerOut' && /3V3|5V/.test(t.name))
    const ground = ctrlTerms.find((t) => t.role === 'groundIn')

    const supplyWired = supply && reachesRail(ctrl.id, supply.name, board.id)
    const groundWired = ground && reachesRail(ctrl.id, ground.name, board.id)

    if (supply && !supplyWired) {
      gaps.push({
        step: 'Power the board',
        concept: 'grounding',
        highlight: [ctrl.id, board.id],
        hint: 'The breadboard rails have no power on them.',
        question: 'Your components will all need a supply. Where should it come from?',
        pointer: `The ${ctrl.part.name} ${supply.name} pin is not connected to the breadboard.`,
        instruction: `Click ${ctrl.part.name} ${supply.name}, then click a hole on the top positive rail (marked +). That energises the whole rail.`,
      })
    }
    if (ground && !groundWired) {
      gaps.push({
        step: 'Ground the board',
        concept: 'grounding',
        highlight: [ctrl.id, board.id],
        hint: 'There is no shared ground yet.',
        question: 'Every device in a circuit shares one thing. What is it?',
        pointer: `The ${ctrl.part.name} ${ground.name} pin is not connected to the breadboard.`,
        instruction: `Click ${ctrl.part.name} ${ground.name}, then click a hole on the negative rail (marked −). Every component's ground goes to that same rail.`,
      })
    }
  }

  // --- 3. sensors need power, ground and a signal path ---
  for (const s of sensors) {
    const terms = terminalsFor(s.part)
    const vcc = terms.find((t) => t.role === 'supplyIn')
    const gnd = terms.find((t) => t.role === 'groundIn')
    const sig = terms.find((t) => t.role === 'signalOut')

    if (vcc && !isWired(s.id, vcc.name)) {
      gaps.push({
        step: 'Power the sensor',
        concept: 'grounding',
        highlight: [s.id],
        hint: `The ${s.part.name} has no supply.`,
        question: `What does the ${s.part.name} need before it can measure anything?`,
        pointer: `${s.part.name} ${vcc.name} is unconnected. It expects ${vcc.volts ?? 3.3} V.`,
        instruction: `Click ${s.part.name} ${vcc.name}, then click the ${vcc.volts === 5 ? '5 V' : '3.3 V'} rail. Check the voltage matches — this sensor wants ${vcc.volts ?? 3.3} V.`,
      })
    }
    if (gnd && !isWired(s.id, gnd.name)) {
      gaps.push({
        step: 'Ground the sensor',
        concept: 'grounding',
        highlight: [s.id],
        hint: `The ${s.part.name} has no ground reference.`,
        question: 'A reading is a voltage difference. Different from what?',
        pointer: `${s.part.name} ${gnd.name} is unconnected.`,
        instruction: `Click ${s.part.name} ${gnd.name}, then click the negative rail.`,
      })
    }
    if (sig) {
      const reaches = wiredSensors().some((w) => w.instanceId === s.id)
      if (!reaches) {
        const adcPins = (ctrl.part.pins ?? []).filter((p) => p.kind === 'adc').map((p) => p.name)
        gaps.push({
          step: 'Route the reading',
          concept: 'pin_capability',
          highlight: [s.id, ctrl.id],
          hint: `The ${s.part.name} is powered but reporting nowhere.`,
          question: 'The reading has to physically travel somewhere. Where is it going?',
          pointer: `${s.part.name} ${sig.name} does not reach the controller. It needs a pin that can measure a voltage.`,
          instruction: `Click ${s.part.name} ${sig.name}, then click ${ctrl.part.name} ${adcPins[0] ?? 'an ADC pin'}. ${adcPins.length ? `Pins with an ADC on this board: ${adcPins.slice(0, 4).join(', ')}.` : ''}`,
        })
      } else {
        const w = wiredSensors().find((x) => x.instanceId === s.id)!
        if (!w.readable) {
          const adcPins = (ctrl.part.pins ?? []).filter((p) => p.kind === 'adc').map((p) => p.name)
          gaps.push({
            step: 'Use a pin that can read',
            concept: 'pin_capability',
            highlight: [s.id, ctrl.id],
            hint: `That pin cannot read the ${s.part.name}.`,
            question: 'Which pins on your board can measure a voltage, rather than only detect one?',
            pointer: `${w.pinName} has no ADC behind it, so an analog reading is lost there.`,
            instruction: `Shift-click the wire on ${s.part.name} ${sig.name} to lift it, then land it on ${adcPins[0] ?? 'an ADC pin'}.`,
          })
        }
      }
    }
  }

  // --- 4. an actuator needs a switching stage ---
  if (actuators.length) {
    const act = actuators[0]
    if (!drivers.length) {
      gaps.push({
        step: 'Add a switching stage',
        concept: 'drive_stage',
        highlight: [act.id],
        hint: 'Nothing on the bench can switch that load.',
        question: `The ${act.part.name} draws ${act.part.currentMa ?? 'hundreds of'} mA. Can a control pin supply that?`,
        pointer: `A controller pin sources about ${ctrl.part.pinCurrentLimitMa ?? 12} mA. The ${act.part.name} needs far more.`,
        instruction: `Go back to the Tool Shed and buy a relay module or a MOSFET module, then place it on the bench. It lets a small signal switch a large current.`,
      })
    } else {
      const drv = drivers[0]
      const dTerms = terminalsFor(drv.part)
      const ctrlIn = dTerms.find((t) => t.role === 'signalIn')
      const dVcc = dTerms.find((t) => t.role === 'supplyIn')
      const dGnd = dTerms.find((t) => t.role === 'groundIn')
      const loadOut = dTerms.filter((t) => t.role === 'loadOut')

      if (dVcc && !isWired(drv.id, dVcc.name)) {
        gaps.push({
          step: 'Power the driver',
          concept: 'grounding',
          highlight: [drv.id],
          hint: `The ${drv.part.name} has no supply.`,
          question: 'What does the switching stage need in order to operate its coil?',
          pointer: `${drv.part.name} ${dVcc.name} is unconnected. It expects ${dVcc.volts ?? 5} V.`,
          instruction: `Click ${drv.part.name} ${dVcc.name}, then click a ${dVcc.volts ?? 5} V rail. Note this module wants ${dVcc.volts ?? 5} V, not 3.3 V.`,
        })
      }
      if (dGnd && !isWired(drv.id, dGnd.name)) {
        gaps.push({
          step: 'Ground the driver',
          concept: 'grounding',
          highlight: [drv.id],
          hint: `The ${drv.part.name} has no ground.`,
          question: 'What does the driver share with the controller so the signal means something?',
          pointer: `${drv.part.name} ${dGnd.name} is unconnected.`,
          instruction: `Click ${drv.part.name} ${dGnd.name}, then click the negative rail.`,
        })
      }
      if (ctrlIn && !wiredOutputs().some((o) => o.instanceId === drv.id)) {
        const outPins = (ctrl.part.pins ?? [])
          .filter((p) => p.kind === 'digital' || p.kind === 'adc')
          .map((p) => p.name)
        gaps.push({
          step: 'Give the driver a command line',
          concept: 'drive_stage',
          highlight: [drv.id, ctrl.id],
          hint: 'Your program has no way to reach that switch.',
          question: 'How would a line of your code reach this component?',
          pointer: `${drv.part.name} ${ctrlIn.name} is not connected to the controller, so nothing can command it.`,
          instruction: `Click ${drv.part.name} ${ctrlIn.name}, then click ${ctrl.part.name} ${outPins[0] ?? 'a digital pin'}. That pin then appears as a block in the Coding Lab.`,
        })
      }
      const switchesLoad = wiredOutputs().some((o) => o.instanceId === drv.id && o.loadInstance)
      if (loadOut.length && !switchesLoad) {
        gaps.push({
          step: 'Wire the load through the switch',
          concept: 'drive_stage',
          highlight: [drv.id, act.id],
          hint: 'The switch is not actually in the load circuit.',
          question: 'What is this switching stage meant to be turning on?',
          pointer: `${drv.part.name} ${loadOut.map((t) => t.name).join(' and ')} carry the switched current, and nothing is attached to them.`,
          instruction: `Click ${drv.part.name} ${loadOut[0].name}, then click ${act.part.name} +. Then ${drv.part.name} ${loadOut[1]?.name ?? 'COM'} to ${act.part.name} −.`,
        })
      }
    }
  }

  // --- 5. plumbing ---
  const path = hydraulicPath()
  if (actuators.some((a) => a.part.id.startsWith('pump')) && !path.complete) {
    const pump = actuators.find((a) => a.part.id.startsWith('pump'))!
    gaps.push({
      step: 'Plumb the water path',
      concept: 'hydraulics',
      highlight: [pump.id],
      hint: 'The pump has nowhere to draw from or send water to.',
      question: 'The motor will spin. Will anything actually reach the crops?',
      pointer: path.reason ?? 'The water path is incomplete.',
      instruction: path.hasSource
        ? `Click the water tank OUT port, then the pump IN port. Then pump OUT to the sprinkler IN.`
        : `Buy a water tank and a sprinkler head from the Tool Shed, then connect tank OUT to pump IN, and pump OUT to sprinkler IN.`,
    })
  }

  // --- 6. energy chain ---
  const topo = topology()
  if (topo.installedPeakWatts > 0 && !topo.chargePathComplete) {
    gaps.push({
      step: 'Complete the charging path',
      concept: 'energy_budget',
      highlight: [],
      hint: 'Your panel is generating nothing useful.',
      question: 'The panel is installed. Where is that energy going?',
      pointer: `${topo.installedPeakWatts} W of panel is on the bench but nothing reaches the battery.`,
      instruction: `Connect the panel + to the charge controller PV+, and the controller BAT+ to the battery +. Repeat for the negatives. Without a controller the panel harvests only about 55%.`,
    })
  }

  // --- 7. the program ---
  // Only once something is actually wired. Telling a student to write control
  // logic when the bench holds a lone controller is advice they cannot act on.
  const hasIo = wiredSensors().length > 0 || wiredOutputs().length > 0
  if (!gaps.length && hasIo && !appState.codeReady) {
    const sensorName = wiredSensors()[0]?.part.name ?? 'sensor'
    const pinName = wiredSensors()[0]?.pinName ?? 'its pin'
    const outName = wiredOutputs()[0]?.pinName ?? 'the driver pin'
    gaps.push({
      step: 'Write the control logic',
      concept: 'feedback_control',
      highlight: [],
      hint: 'The hardware is ready. Nothing is telling it what to do.',
      question: 'What measurement should decide when irrigation happens?',
      pointer: 'The Coding Lab has blocks for everything you wired, but the workspace is empty.',
      instruction: `In the Coding Lab, take an "if" block. Put "read ${sensorName.toLowerCase()} (${pinName})" and a number into a comparison, and inside the if, "set … (${outName}) ON". Use two different thresholds for on and off so the relay does not chatter.`,
    })
  }

  // Bare bench: a controller and nothing to sense or switch.
  if (!gaps.length && !hasIo && placed.length < 3) {
    gaps.push({
      step: 'Add the rest of your parts',
      concept: 'feedback_control',
      highlight: [],
      hint: 'There is a controller here and little else.',
      question: 'What does this system need in order to sense the field and act on it?',
      pointer: 'Nothing on the bench can measure the soil or move water yet.',
      instruction: 'Drag the rest of your tray onto the bench — a breadboard to wire on, a soil sensor to measure with, a relay to switch, and the pump it switches.',
    })
  }

  // --- 8. running-system advice ---
  if (!gaps.length && appState.codeReady) {
    if (farm.soilMoisture > 85) {
      gaps.push({
        step: 'Stop over-watering',
        concept: 'water_efficiency',
        highlight: [],
        hint: 'The soil is saturated.',
        question: 'Does running the pump longer necessarily improve crop health?',
        pointer: `Moisture is at ${farm.soilMoisture.toFixed(0)}%, past the point where roots start suffocating.`,
        instruction: `Lower your on-threshold and add an off-threshold below 70. Saturated soil harms the crop and wastes a finite tank.`,
      })
    } else if (farm.battery < 15 && farm.battery > 0) {
      gaps.push({
        step: 'Fix the energy budget',
        concept: 'energy_budget',
        highlight: [],
        hint: 'The bank is nearly flat.',
        question: 'Your pump is consuming faster than the array replaces. What gives first?',
        pointer: `Battery at ${farm.battery.toFixed(0)}% with ${topo.activeLoadWatts.toFixed(0)} W of load and ${farm.solarGeneration} W coming in.`,
        instruction: `Either add generation, add storage, or gate the pump on battery level in your program — check battery before switching the relay on.`,
      })
    }
  }

  return gaps
}

/**
 * The next thing to do, phrased for this student. Returns null when the build
 * is complete and healthy, or when the mode suppresses guidance entirely.
 */
export function nextGuidance(): Guidance | null {
  const gaps = findGaps()
  if (!gaps.length) return null

  const gap = gaps[0]
  const depth = guidanceDepthFor(masteryOf(gap.concept))
  if (depth === 'silent') return null

  const text =
    depth === 'instruction' ? gap.instruction
    : depth === 'pointer' ? gap.pointer
    : depth === 'question' ? gap.question
    : gap.hint

  return {
    text,
    concept: gap.concept,
    highlight: gap.highlight,
    depth,
    step: gap.step,
    index: 1,
    total: gaps.length,
  }
}

/** Every outstanding step, for the guided checklist in Learn mode. */
export function remainingSteps(): { step: string; instruction: string; concept: ConceptId }[] {
  return findGaps().map((g) => ({ step: g.step, instruction: g.instruction, concept: g.concept }))
}

/** A plain-language snapshot the assistant can answer questions against. */
export function contextSummary(): string {
  const parts = graph.placed.map((p) => partOf(p.instanceId)?.name).filter(Boolean)
  const gaps = findGaps()
  return [
    `Mode: ${currentMode().label}.`,
    `On the bench: ${parts.join(', ') || 'nothing yet'}.`,
    `Sensors reporting: ${wiredSensors().map((s) => `${s.part.name} on ${s.pinName}`).join(', ') || 'none'}.`,
    `Under program control: ${wiredOutputs().map((o) => `${o.part.name} on ${o.pinName}`).join(', ') || 'none'}.`,
    `Farm: moisture ${farm.soilMoisture.toFixed(0)}%, crop ${farm.cropHealth.toFixed(0)}%, battery ${farm.battery.toFixed(0)}%, solar ${farm.solarGeneration} W.`,
    gaps.length ? `Next step: ${gaps[0].step} — ${gaps[0].instruction}` : 'The build is complete and running.',
  ].join(' ')
}
