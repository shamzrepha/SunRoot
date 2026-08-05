// ---------------------------------------------------------------------------
// AdaptiveEngine
//
// Turns the learner model into a changed experience. Three things adapt:
//
//   1. Scaffolding depth. The same mistake produces a different intervention
//      depending on how well the student already understands the concept — a
//      bare question for someone close to mastery, a worked explanation for
//      someone who has failed it repeatedly. Fading support as competence grows
//      is the mechanism that makes scaffolding instructional rather than
//      merely helpful.
//
//   2. Objectives. The mission list is generated for this student, targeting
//      the weakest concept whose prerequisites are already met.
//
//   3. Challenges. A next task is proposed that forces the target concept to
//      matter — a night-time scenario for energy budgeting, a mixed-voltage
//      parts list for logic levels.
//
// Nothing here is random and nothing is one-size-fits-all: every output is a
// function of this student's evidence.
// ---------------------------------------------------------------------------

import {
  learner,
  masteryOf,
  nextConcept,
  observe,
} from './LearnerModel'
import type { ConceptId } from './LearnerModel'

/** How much support to give. Level rises as mastery falls. */
export type ScaffoldLevel = 1 | 2 | 3

export interface Scaffold {
  level: ScaffoldLevel
  concept: ConceptId
  /** What the student is shown. */
  text: string
  /** Why this depth was chosen, shown on the dashboard for transparency. */
  rationale: string
}

/**
 * Choose support depth for a concept the student has just got wrong.
 *
 * Level 1 asks a question, which is the right move for someone who nearly has
 * it. Level 2 names the subsystem to inspect. Level 3 explains the principle,
 * which is reserved for repeated failure — giving it earlier would rob the
 * student of the chance to reason.
 */
export function scaffoldFor(concept: ConceptId): Scaffold {
  const m = masteryOf(concept)
  const state = learner.concepts[concept]
  const failures = state?.incorrect ?? 0

  let level: ScaffoldLevel = 1
  let rationale = ''

  if (m < 0.3 && failures >= 3) {
    level = 3
    rationale = `Mastery ${(m * 100).toFixed(0)}% after ${failures} failed attempts — the principle is explained directly.`
  } else if (m < 0.55 || failures >= 2) {
    level = 2
    rationale = `Mastery ${(m * 100).toFixed(0)}% — pointed toward the subsystem rather than told the answer.`
  } else {
    level = 1
    rationale = `Mastery ${(m * 100).toFixed(0)}% — close enough to reason it out from a question alone.`
  }

  return { level, concept, text: PROMPTS[concept][level - 1], rationale }
}

/**
 * Three depths of support per concept. The level-1 line is always a question,
 * the level-3 line always states the principle without stating the fix — the
 * student must still apply it to their own circuit.
 */
const PROMPTS: Record<ConceptId, [string, string, string]> = {
  grounding: [
    'Every device in this circuit shares one thing. What is it?',
    'Trace the negative side of each component. Do they all arrive at the same place?',
    'Voltage is a difference between two points. Without a shared ground reference, a signal has nothing to be measured against, so a reading is meaningless even when the wire is intact.',
  ],
  logic_levels: [
    'One side of that connection speaks louder than the other can listen. What sits between two circuits in that situation?',
    'Compare the sensor output voltage against the input tolerance printed on your controller.',
    'Input pins clamp voltages above their rating through internal protection diodes. Sustained over-voltage destroys them, and the failure is often silent — the pin simply stops reading correctly.',
  ],
  pin_capability: [
    'Which pins on your board can measure a voltage, rather than only detect one?',
    'Check the pin notes on the controller you chose. Some are marked input-only.',
    'On the ESP32, GPIO34 to 39 are physically wired as inputs inside the silicon and have no output driver at all. No code can make them drive a load, and an analog reading needs a pin with an ADC behind it.',
  ],
  drive_stage: [
    'A control pin carries a decision, not the power to carry it out. What sits between the two?',
    'Compare your pump current draw against the milliamps a single controller pin can source.',
    'A controller pin supplies roughly 12 to 20 mA. A pump draws hundreds or thousands. The pin cannot deliver it: the rail collapses, the board browns out, and the internal driver fails. A relay or MOSFET lets a small signal switch a large current.',
  ],
  feedback_control: [
    'What measurement could tell your system when irrigation is actually needed?',
    'Follow the path from sensor reading, to decision, to actuator. Where does it break?',
    'Feedback control means the output changes the input. The sensor reads moisture, the logic decides, the pump acts, and the soil the sensor is sitting in changes as a result. Break any link and the loop is open — the system is no longer responding to the world.',
  ],
  hysteresis: [
    'The actuator is switching repeatedly. What might that do to a physical relay?',
    'Look at the threshold in your program. What happens when the reading sits exactly on it?',
    'A single threshold makes the actuator chatter: the reading crosses back and forth and the relay follows every crossing. Separating the on and off points creates a dead band, so the system must move meaningfully before it reverses. This is why a thermostat overshoots its target on purpose.',
  ],
  renewable_variability: [
    'The sun has gone. Which part of your system is keeping things running now?',
    'Watch the solar figure across a full day. Is it ever the same twice?',
    'Photovoltaic output follows sun elevation, cloud cover and panel temperature. It peaks near solar noon and is zero at night. A design that assumes constant supply will fail every evening.',
  ],
  energy_budget: [
    'Your pump is drawing more than expected. What is happening to your energy budget?',
    'Compare watt-hours generated across a day against watt-hours consumed. Which is larger?',
    'A battery stores energy, it does not create it. Over 24 hours, generation must exceed consumption or the bank trends to empty no matter how large it is. Capacity buys you nights of autonomy; it does not fix a negative daily balance.',
  ],
  hydraulics: [
    'The motor is running. Is anything actually reaching the crops?',
    'Follow the water: source, through the pump, to something that delivers it to the bed.',
    'Being powered and being plumbed are different conditions. A pump with an unconnected discharge spins, draws its full current, and moves nothing — and running dry destroys it, because the water it moves is also what cools and lubricates it.',
  ],
  water_efficiency: [
    'The soil is saturated. Does running the pump longer improve crop health?',
    'Watch crop health as moisture climbs past 85%. Which direction does it go?',
    'Saturated soil displaces the air in its pore spaces, and roots need oxygen. Beyond the optimal band, more water actively harms the crop while draining a finite tank and the battery that pumped it.',
  ],
}

// ---------------------------------------------------------------------------
// Personalised objectives
// ---------------------------------------------------------------------------

export interface AdaptiveObjective {
  id: string
  label: string
  concept: ConceptId
  done: boolean
  /** Why this student is being given this objective now. */
  reason: string
}

/**
 * A short objective list built for this student. Mastered concepts drop off,
 * so the list stays about what they cannot yet do.
 */
export function adaptiveObjectives(): AdaptiveObjective[] {
  const target = nextConcept()
  const out: AdaptiveObjective[] = []

  if (!target) {
    return [
      {
        id: 'mastered',
        label: 'Every concept mastered — try a leaner build, or a harder scenario',
        concept: 'energy_budget',
        done: true,
        reason: 'All tracked concepts are above the mastery threshold.',
      },
    ]
  }

  out.push({
    id: `focus_${target.id}`,
    label: OBJECTIVE_LABELS[target.id],
    concept: target.id,
    done: false,
    reason: `Weakest concept with prerequisites met (mastery ${(masteryOf(target.id) * 100).toFixed(0)}%).`,
  })

  // Two supporting objectives from the next weakest ready concepts.
  const others = Object.keys(PROMPTS)
    .filter((id) => id !== target.id && masteryOf(id as ConceptId) < 0.8)
    .sort((a, b) => masteryOf(a as ConceptId) - masteryOf(b as ConceptId))
    .slice(0, 2) as ConceptId[]

  for (const id of others) {
    out.push({
      id: `sub_${id}`,
      label: OBJECTIVE_LABELS[id],
      concept: id,
      done: false,
      reason: `Mastery ${(masteryOf(id) * 100).toFixed(0)}%.`,
    })
  }

  return out
}

const OBJECTIVE_LABELS: Record<ConceptId, string> = {
  grounding: 'Build a circuit where every device shares a ground',
  logic_levels: 'Match a sensor output to an input that can tolerate it',
  pin_capability: 'Read an analog sensor on a pin that has an ADC',
  drive_stage: 'Switch the pump through a relay or MOSFET, not a bare pin',
  feedback_control: 'Close the loop: sensor reading drives the pump',
  hysteresis: 'Give your control loop separate on and off thresholds',
  renewable_variability: 'Keep the system alive through a full night',
  energy_budget: 'Finish a day with more energy stored than you started with',
  hydraulics: 'Plumb tank, pump and sprinkler into a working path',
  water_efficiency: 'Hold moisture in the optimal band without saturating the soil',
}

// ---------------------------------------------------------------------------
// Adaptive challenges
// ---------------------------------------------------------------------------

export interface Challenge {
  title: string
  brief: string
  concept: ConceptId
  /** What the student must achieve for it to count. */
  successCondition: string
}

const CHALLENGES: Record<ConceptId, Challenge> = {
  grounding: {
    title: 'One reference',
    brief: 'Build with a breadboard and put every ground on a single rail.',
    concept: 'grounding',
    successCondition: 'Circuit check reports no missing-ground errors.',
  },
  logic_levels: {
    title: 'Mixed voltages',
    brief: 'Use a 5 V resistive sensor with a 3.3 V controller and make it read correctly.',
    concept: 'logic_levels',
    successCondition: 'A valid reading arrives without over-driving the input.',
  },
  pin_capability: {
    title: 'The right pin',
    brief: 'Wire the moisture sensor so the program can actually read a value.',
    concept: 'pin_capability',
    successCondition: 'Sensor reports a non-zero reading in the control box.',
  },
  drive_stage: {
    title: 'Switching current',
    brief: 'Run the 12 V pump from a controller that can only source milliamps.',
    concept: 'drive_stage',
    successCondition: 'Pump runs under program control with no pin overload flagged.',
  },
  feedback_control: {
    title: 'Close the loop',
    brief: 'Make the pump respond to moisture rather than to a fixed schedule.',
    concept: 'feedback_control',
    successCondition: 'Moisture recovers above 30% without manual intervention.',
  },
  hysteresis: {
    title: 'Stop the chatter',
    brief: 'Hold the moisture band steady without the relay switching constantly.',
    concept: 'hysteresis',
    successCondition: 'Fewer than 10 relay operations across a full farm day.',
  },
  renewable_variability: {
    title: 'Through the night',
    brief: 'Deploy at dusk and keep the system alive until sunrise.',
    concept: 'renewable_variability',
    successCondition: 'Battery above zero at 06:00 with crops still alive.',
  },
  energy_budget: {
    title: 'Positive balance',
    brief: 'Size generation and storage so a full day ends with more energy than it started.',
    concept: 'energy_budget',
    successCondition: 'Battery at 24:00 exceeds battery at 00:00.',
  },
  hydraulics: {
    title: 'Follow the water',
    brief: 'Plumb a complete path and irrigate without running the pump dry.',
    concept: 'hydraulics',
    successCondition: 'Soil moisture rises with zero dry-run strain accrued.',
  },
  water_efficiency: {
    title: 'Every litre counts',
    brief: 'Rescue the farm using under 60 litres of water.',
    concept: 'water_efficiency',
    successCondition: 'Crop health above 75% with tank usage under 60 L.',
  },
}

/** The challenge this student should attempt next. */
export function nextChallenge(): Challenge | undefined {
  const target = nextConcept()
  return target ? CHALLENGES[target.id] : undefined
}

/**
 * Record evidence from a circuit check. Called with the checker's output so
 * every diagnosed fault becomes a data point about a concept.
 */
export function observeFromIssues(issueSystems: { concept: ConceptId; ok: boolean; why: string }[]) {
  for (const e of issueSystems) observe(e.concept, e.ok, e.why)
}
