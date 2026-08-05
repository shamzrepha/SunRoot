// ---------------------------------------------------------------------------
// AdaptiveQuiz
//
// Questions built from this student's own session. A learner who never used a
// MOSFET is not asked about one; a learner whose battery died at 03:00 is asked
// about exactly that, with their own numbers in the stem.
//
// The check therefore assesses what they did rather than what a question bank
// happens to contain, and every answer feeds back into the learner model — so
// the quiz is another source of evidence, not a separate scoring system bolted
// on the side.
// ---------------------------------------------------------------------------

import { CONCEPTS, learner, masteryOf, observe } from '../learning/LearnerModel'
import type { ConceptId } from '../learning/LearnerModel'
import { score } from '../simulation/Scoreboard'
import { graph, partOf, wiredOutputs, wiredSensors } from '../hardware/CircuitGraph'
import { topology } from '../simulation/PowerSystem'

export interface QuizOption {
  text: string
  correct: boolean
  /** Shown after answering, whether right or wrong. */
  why: string
}

export interface QuizQuestion {
  id: string
  concept: ConceptId
  /** Why this student is being asked this. */
  provenance: string
  stem: string
  options: QuizOption[]
}

/** Fisher-Yates, seeded per question so option order is stable within a sitting. */
function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const r = Math.abs(Math.sin(seed * 97 + i * 31)) % 1
    const j = Math.floor(r * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Build the check. Questions are drawn only from concepts the student has
 * produced evidence for, weakest first, with their own figures substituted in.
 */
export function buildQuiz(max = 8): QuizQuestion[] {
  const engaged = CONCEPTS.filter((c) => {
    const s = learner.concepts[c.id]
    return s.correct + s.incorrect > 0
  }).sort((a, b) => masteryOf(a.id) - masteryOf(b.id))

  const pool = engaged.length ? engaged : CONCEPTS.slice(0, 4)
  const out: QuizQuestion[] = []

  for (const c of pool) {
    const q = questionFor(c.id)
    if (q) out.push(q)
    if (out.length >= max) break
  }
  return out
}

function questionFor(id: ConceptId): QuizQuestion | null {
  const parts = graph.placed.map((p) => partOf(p.instanceId)!).filter(Boolean)
  const ctrl = parts.find((p) => p.category === 'controllers')
  const sensor = parts.find((p) => p.category === 'sensors')
  const pump = parts.find((p) => p.category === 'actuators')
  const topo = topology()
  const lastRun = score.runs[score.runs.length - 1]
  const evidence = learner.concepts[id].evidence[0] ?? ''

  const mk = (
    stem: string,
    provenance: string,
    options: QuizOption[],
  ): QuizQuestion => ({
    id: `q_${id}`,
    concept: id,
    provenance,
    stem,
    options: shuffle(options, id.length),
  })

  switch (id) {
    case 'grounding':
      return mk(
        `Your ${sensor?.name ?? 'sensor'} is powered and its signal wire reaches the controller, but its ground is not connected. What does the controller read?`,
        evidence ? `You hit this: ${evidence}` : 'Drawn from your wiring history.',
        [
          { text: 'A meaningless, drifting value', correct: true, why: 'Voltage is a difference between two points. With no shared reference the reading has nothing to be measured against.' },
          { text: 'Exactly zero, every time', correct: false, why: 'A floating input drifts with nearby electrical noise rather than sitting cleanly at zero.' },
          { text: 'The correct value, slightly delayed', correct: false, why: 'There is no path for the measurement to be correct — ground is not optional.' },
          { text: 'The correct value — ground is only for power', correct: false, why: 'Ground is the reference every signal is measured against, not merely a return path for current.' },
        ],
      )

    case 'logic_levels':
      return mk(
        `A 5 V sensor output is wired to an input rated for 3.3 V. What happens over time?`,
        evidence ? `You hit this: ${evidence}` : 'Drawn from your component choices.',
        [
          { text: "The pin's protection diodes conduct and eventually fail", correct: true, why: 'The excess is clamped through internal diodes. They are not rated for sustained conduction, and the failure is often silent.' },
          { text: 'Nothing — the pin simply reads its maximum', correct: false, why: 'It may appear to work at first, which is exactly what makes this failure dangerous.' },
          { text: 'The sensor is damaged instead of the controller', correct: false, why: 'The sensor is driving the line; the receiving input is what is over-driven.' },
          { text: 'The controller automatically limits the input', correct: false, why: 'Clamping is not regulation — the diodes conduct the excess rather than managing it.' },
        ],
      )

    case 'pin_capability':
      return mk(
        `On the ${ctrl?.name ?? 'ESP32'}, why can an analog sensor not be read on every pin?`,
        evidence ? `You hit this: ${evidence}` : 'Drawn from where you wired your sensor.',
        [
          { text: 'Only some pins have an analog-to-digital converter behind them', correct: true, why: 'A digital pin reports only high or low. Everything between those two states is lost.' },
          { text: 'Any pin works if the code calls analogRead', correct: false, why: 'Code cannot create hardware that is not there.' },
          { text: 'Analog pins are simply faster', correct: false, why: 'It is a difference in what the pin can measure, not how quickly.' },
          { text: 'Only pins numbered above 30 are analog', correct: false, why: 'Pin numbering does not indicate capability — the datasheet does.' },
        ],
      )

    case 'drive_stage':
      return mk(
        `Your ${pump?.name ?? 'pump'} draws about ${pump?.currentMa ?? 2500} mA. A ${ctrl?.name ?? 'controller'} pin can source roughly ${ctrl?.pinCurrentLimitMa ?? 12} mA. What is the consequence of connecting them directly?`,
        evidence ? `You hit this: ${evidence}` : 'Drawn from the parts on your bench.',
        [
          { text: 'The rail collapses, the board resets, and the pin driver fails', correct: true, why: 'The pin physically cannot supply that current. The supply sags, the controller browns out, and the internal transistor is destroyed.' },
          { text: 'The pump runs slowly but safely', correct: false, why: 'There is no safe partial operation here — the controller is damaged.' },
          { text: 'Nothing, because the pump has its own supply', correct: false, why: 'If it did, the pin would not be the thing carrying the current.' },
          { text: 'The pump runs at full speed', correct: false, why: `${ctrl?.pinCurrentLimitMa ?? 12} mA cannot move a load that needs hundreds.` },
        ],
      )

    case 'feedback_control':
      return mk(
        `What makes a moisture-driven pump a feedback loop rather than a timer?`,
        'Drawn from the control logic you deployed.',
        [
          { text: 'The action changes the very quantity being measured', correct: true, why: 'Water raises the moisture the sensor reads, which changes the next decision. That circularity is the loop.' },
          { text: 'It uses a sensor instead of a clock', correct: false, why: 'Close, but a sensor alone is not a loop — an open-loop system can read a sensor and ignore the result.' },
          { text: 'It runs continuously rather than at intervals', correct: false, why: 'Continuous operation is the opposite of control.' },
          { text: 'It is written in blocks rather than text', correct: false, why: 'The representation of the code is unrelated.' },
        ],
      )

    case 'hysteresis': {
      const cycles = lastRun?.relayCycles
      return mk(
        cycles !== undefined
          ? `Your last run recorded ${cycles} switch operations. What causes an actuator to switch far more often than the situation warrants?`
          : `What causes an actuator to switch repeatedly when the reading sits near the threshold?`,
        cycles !== undefined ? `Measured on your run: ${cycles} operations.` : 'Drawn from your control logic.',
        [
          { text: 'A single threshold for both on and off', correct: true, why: 'The reading crosses back and forth over one point and the actuator follows every crossing. Separate on and off points create a dead band.' },
          { text: 'The pump being too powerful', correct: false, why: 'A stronger pump changes how fast moisture moves, not whether the controller oscillates.' },
          { text: 'Reading the sensor too slowly', correct: false, why: 'Reading less often hides the symptom without addressing it.' },
          { text: 'Insufficient battery capacity', correct: false, why: 'Energy affects whether it can run, not how often it is commanded.' },
        ],
      )
    }

    case 'renewable_variability':
      return mk(
        `Your array is rated ${topo.installedPeakWatts || 50} W. When does it actually deliver that figure?`,
        'Drawn from the panel you installed.',
        [
          { text: 'Only near solar noon, in clear conditions', correct: true, why: 'Output follows sun elevation and cloud. The rated figure is a peak under test conditions, not an average.' },
          { text: 'Continuously through daylight hours', correct: false, why: 'Morning and evening output is a fraction of peak because the sun is low.' },
          { text: 'Whenever the battery is not full', correct: false, why: 'The panel does not know the state of charge; the controller regulates what is accepted.' },
          { text: 'All the time, including at night at reduced output', correct: false, why: 'Photovoltaic output at night is zero.' },
        ],
      )

    case 'energy_budget': {
      const low = lastRun?.lowestBattery
      return mk(
        low !== undefined
          ? `On your last run the bank fell to ${Math.round(low)}%. If a system consumes more energy per day than it generates, what does a larger battery achieve?`
          : `If a system consumes more energy per day than it generates, what does a larger battery achieve?`,
        low !== undefined ? `Measured on your run: lowest battery ${Math.round(low)}%.` : 'Drawn from your power system.',
        [
          { text: 'It delays the failure without preventing it', correct: true, why: 'Capacity buys nights of autonomy. It cannot fix a negative daily balance — the trend is still downward.' },
          { text: 'It fixes the shortage entirely', correct: false, why: 'A battery stores energy; it does not create any.' },
          { text: 'It increases how much the panel generates', correct: false, why: 'Generation depends on the array and the sun, not on storage.' },
          { text: 'It reduces what the pump consumes', correct: false, why: 'The load is set by the pump, not by what is supplying it.' },
        ],
      )
    }

    case 'hydraulics':
      return mk(
        `A pump is powered and running, but its discharge port is not connected to anything. What happens?`,
        evidence ? `You hit this: ${evidence}` : 'Drawn from your plumbing.',
        [
          { text: 'It draws full current, delivers nothing, and overheats', correct: true, why: 'The water it moves is also what cools and lubricates it. Running dry is the fastest way to destroy an impeller pump.' },
          { text: 'It stops automatically to protect itself', correct: false, why: 'Nothing in a basic DC pump detects this condition.' },
          { text: 'It draws less current because there is no load', correct: false, why: 'The motor still turns against its own losses and keeps drawing.' },
          { text: 'The soil still gets wet, more slowly', correct: false, why: 'With no path, no water reaches the bed at all.' },
        ],
      )

    case 'water_efficiency':
      return mk(
        `Soil moisture is held above 90%. What happens to crop health, and why?`,
        evidence ? `You hit this: ${evidence}` : 'Drawn from your irrigation runs.',
        [
          { text: 'It falls, because saturated soil starves roots of oxygen', correct: true, why: 'Water displaces the air in the pore spaces. Roots need that oxygen, so past the optimal band more water actively harms the crop.' },
          { text: 'It rises — more water is always better', correct: false, why: 'This is the most common intuition and it is wrong past about 85%.' },
          { text: 'It stays flat; excess water simply drains away', correct: false, why: 'Some drains, but saturation persists long enough to do damage.' },
          { text: 'It falls, because the crop is washed away', correct: false, why: 'The mechanism is oxygen starvation at the roots, not physical damage.' },
        ],
      )

    default:
      return null
  }
}

/** Record an answer as evidence, exactly as a build event would be. */
export function recordAnswer(q: QuizQuestion, chosen: QuizOption) {
  observe(
    q.concept,
    chosen.correct,
    chosen.correct
      ? `Answered correctly on the learning check: ${q.stem.slice(0, 60)}…`
      : `Chose "${chosen.text}" on the learning check.`,
  )
}

/** Concepts the student engaged with but that the quiz could not cover. */
export function uncovered(): string[] {
  const asked = new Set(buildQuiz(99).map((q) => q.concept))
  return CONCEPTS.filter((c) => {
    const s = learner.concepts[c.id]
    return s.correct + s.incorrect > 0 && !asked.has(c.id)
  }).map((c) => c.label)
}

/** Live summary used by the report. */
export function quizCoverage(): { asked: number; concepts: number } {
  const qs = buildQuiz(99)
  return { asked: qs.length, concepts: new Set(qs.map((q) => q.concept)).size }
}

/** Whether any sensor or output exists, used to decide if a quiz is meaningful. */
export function hasBuildEvidence(): boolean {
  return wiredSensors().length > 0 || wiredOutputs().length > 0 || score.runs.length > 0
}
