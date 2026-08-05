// ---------------------------------------------------------------------------
// LearnerModel
//
// A per-concept estimate of what this student actually understands, inferred
// from what they build rather than from what they answer.
//
// The estimator is Bayesian Knowledge Tracing, the standard model behind
// intelligent tutoring systems. Each concept carries a probability of mastery
// that is revised every time the student produces evidence: wiring a drive
// stage correctly is evidence for `drive_stage`; flattening the battery
// overnight is evidence against `energy_budget`.
//
// Two properties matter for an educational claim to be honest here. First, the
// evidence is behavioural — nothing is inferred from a quiz the student could
// guess. Second, the model is inspectable: every probability can be traced to
// the events that produced it, which is what the learning dashboard shows.
// ---------------------------------------------------------------------------

export type ConceptId =
  | 'energy_budget'
  | 'renewable_variability'
  | 'feedback_control'
  | 'hysteresis'
  | 'logic_levels'
  | 'drive_stage'
  | 'pin_capability'
  | 'grounding'
  | 'hydraulics'
  | 'water_efficiency'

export interface Concept {
  id: ConceptId
  label: string
  /** One sentence a student would recognise. Shown on the dashboard. */
  statement: string
  /** Concepts that should be understood before this one is taught. */
  prerequisites: ConceptId[]
}

export const CONCEPTS: Concept[] = [
  {
    id: 'grounding',
    label: 'Common ground',
    statement: 'Every device in a circuit must share a ground reference for its signals to mean anything.',
    prerequisites: [],
  },
  {
    id: 'logic_levels',
    label: 'Logic levels',
    statement: 'A 5 V signal into a 3.3 V input exceeds what the pin can tolerate.',
    prerequisites: ['grounding'],
  },
  {
    id: 'pin_capability',
    label: 'Pin capability',
    statement: 'Pins differ: some read analog voltages, some are input-only and can never drive a load.',
    prerequisites: ['grounding'],
  },
  {
    id: 'drive_stage',
    label: 'Switching stage',
    statement: 'A control pin carries a decision, not the current to act on it. Loads need a relay or MOSFET.',
    prerequisites: ['grounding'],
  },
  {
    id: 'feedback_control',
    label: 'Feedback control',
    statement: 'A sensor reading drives a decision that drives an actuator, and the result changes the reading.',
    prerequisites: ['pin_capability'],
  },
  {
    id: 'hysteresis',
    label: 'Hysteresis',
    statement: 'One threshold makes an actuator chatter. Separate on and off points give stable control.',
    prerequisites: ['feedback_control'],
  },
  {
    id: 'renewable_variability',
    label: 'Renewable variability',
    statement: 'Solar output varies with sun angle, cloud and time of day. It is not a constant supply.',
    prerequisites: [],
  },
  {
    id: 'energy_budget',
    label: 'Energy budgeting',
    statement: 'A battery stores energy, it does not create it. Generation must exceed consumption over a day.',
    prerequisites: ['renewable_variability'],
  },
  {
    id: 'hydraulics',
    label: 'Hydraulic path',
    statement: 'A powered pump with no plumbed path moves no water, however correct the code is.',
    prerequisites: [],
  },
  {
    id: 'water_efficiency',
    label: 'Water efficiency',
    statement: 'More water is not better. Saturated soil starves roots of oxygen and wastes a finite supply.',
    prerequisites: ['feedback_control'],
  },
]

export const CONCEPT_BY_ID = new Map(CONCEPTS.map((c) => [c.id, c]))

/**
 * Bayesian Knowledge Tracing parameters.
 *
 * pInit  — prior probability a student already knows the concept.
 * pLearn — probability of acquiring it from one instructive event.
 * pSlip  — probability of erring despite understanding (a typo, a misclick).
 * pGuess — probability of succeeding without understanding (luck, copying).
 *
 * pSlip and pGuess are what keep the model honest: one lucky success does not
 * declare mastery, and one careless mistake does not erase it.
 */
const BKT = {
  pInit: 0.15,
  pLearn: 0.22,
  pSlip: 0.12,
  pGuess: 0.18,
}

/** Mastery at or above this is treated as understood. */
export const MASTERY_THRESHOLD = 0.8

export interface ConceptState {
  mastery: number
  /** Count of confirming and disconfirming events, for the dashboard. */
  correct: number
  incorrect: number
  /** Plain-language record of what produced the current estimate. */
  evidence: string[]
  lastSeen: number
}

export interface LearnerState {
  concepts: Record<ConceptId, ConceptState>
  /** Total deploys, used to distinguish a new student from a persistent one. */
  attempts: number
  /** Hints the student explicitly asked for, versus ones offered. */
  hintsRequested: number
  startedAt: number
}

function blank(): ConceptState {
  return { mastery: BKT.pInit, correct: 0, incorrect: 0, evidence: [], lastSeen: 0 }
}

export const learner: LearnerState = {
  concepts: Object.fromEntries(CONCEPTS.map((c) => [c.id, blank()])) as Record<
    ConceptId,
    ConceptState
  >,
  attempts: 0,
  hintsRequested: 0,
  startedAt: Date.now(),
}

/**
 * Revise a concept's mastery given one piece of evidence.
 *
 * The posterior is the standard BKT update: condition the prior on the observed
 * outcome, then allow for learning having occurred during the attempt.
 */
export function observe(concept: ConceptId, correct: boolean, why: string) {
  const c = learner.concepts[concept]
  if (!c) return

  const prior = c.mastery

  // P(mastery | evidence)
  const posterior = correct
    ? (prior * (1 - BKT.pSlip)) /
      (prior * (1 - BKT.pSlip) + (1 - prior) * BKT.pGuess)
    : (prior * BKT.pSlip) /
      (prior * BKT.pSlip + (1 - prior) * (1 - BKT.pGuess))

  // Allow for the student having learned something during this attempt.
  c.mastery = Math.min(0.99, posterior + (1 - posterior) * BKT.pLearn)

  if (correct) c.correct++
  else c.incorrect++

  c.lastSeen = Date.now()
  c.evidence.unshift(`${correct ? '✓' : '✗'} ${why}`)
  if (c.evidence.length > 6) c.evidence.pop()
}

export function masteryOf(concept: ConceptId): number {
  return learner.concepts[concept]?.mastery ?? BKT.pInit
}

export function isMastered(concept: ConceptId): boolean {
  return masteryOf(concept) >= MASTERY_THRESHOLD
}

/** Concepts the student has produced any evidence for. */
export function engagedConcepts(): ConceptId[] {
  return CONCEPTS.filter((c) => {
    const s = learner.concepts[c.id]
    return s.correct + s.incorrect > 0
  }).map((c) => c.id)
}

/** Overall progress, for a single headline figure. */
export function overallMastery(): number {
  const engaged = engagedConcepts()
  if (!engaged.length) return 0
  return engaged.reduce((sum, id) => sum + masteryOf(id), 0) / engaged.length
}

/**
 * The next concept worth teaching: the weakest one whose prerequisites are
 * already met. Teaching hysteresis to someone who has not yet built a feedback
 * loop would be noise, which is what the prerequisite gate prevents.
 */
export function nextConcept(): Concept | undefined {
  const ready = CONCEPTS.filter(
    (c) => !isMastered(c.id) && c.prerequisites.every((p) => isMastered(p)),
  )
  if (!ready.length) return undefined
  return ready.sort((a, b) => masteryOf(a.id) - masteryOf(b.id))[0]
}

/** Concepts blocked behind an unmet prerequisite, for the dashboard. */
export function blockedConcepts(): { concept: Concept; missing: ConceptId[] }[] {
  return CONCEPTS.filter((c) => !isMastered(c.id))
    .map((c) => ({ concept: c, missing: c.prerequisites.filter((p) => !isMastered(p)) }))
    .filter((x) => x.missing.length > 0)
}

export function resetLearner() {
  for (const c of CONCEPTS) learner.concepts[c.id] = blank()
  learner.attempts = 0
  learner.hintsRequested = 0
  learner.startedAt = Date.now()
}
