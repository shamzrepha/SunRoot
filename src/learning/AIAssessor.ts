// ---------------------------------------------------------------------------
// AIAssessor
//
// The examiner. It reads everything the student has actually done and returns a
// rank, an XP award, and a written assessment.
//
// One rule shapes the whole design: **the model judges, it does not measure.**
// Every fact in the dossier below — runs completed, litres used, relay
// operations, mastery estimates, faults hit — is computed by the simulation and
// passed in. The model's job is the part a rubric is bad at: weighing those
// facts against each other, recognising a lean design versus a lucky one, and
// saying something useful about what to do next.
//
// That split is deliberate. A model asked to invent numbers will invent them,
// and a judge testing this would find it immediately. A model asked to
// interpret real numbers cannot fabricate a run that never happened.
//
// With no key configured, a deterministic assessor produces the same shape from
// the same evidence. The screen is identical; only the prose is poorer.
// ---------------------------------------------------------------------------

import { ask, isLiveAI } from '../ai/AIProvider'
import { CONCEPTS, learner, masteryOf, overallMastery } from './LearnerModel'
import { score, ratingFor } from '../simulation/Scoreboard'
import { graph, partOf, wiredOutputs, wiredSensors } from '../hardware/CircuitGraph'
import { checkGraph } from '../hardware/GraphChecker'
import { alwaysOnLoads, topology } from '../simulation/PowerSystem'
import { farm } from '../simulation/FarmState'
import { recentActions } from './ContextBuilder'
import { describeCircuit, describeProgram } from './DesignDossier'

export type Rank =
  | 'Explorer'
  | 'Apprentice'
  | 'Technician'
  | 'Engineer'
  | 'Systems Engineer'
  | 'Innovation Master'

export const RANK_ORDER: Rank[] = [
  'Explorer',
  'Apprentice',
  'Technician',
  'Engineer',
  'Systems Engineer',
  'Innovation Master',
]

export interface Assessment {
  rank: Rank
  /** Experience awarded for this assessment, 0–500. */
  xp: number
  /** One-line verdict. */
  headline: string
  /** Two or three sentences of reasoning, citing their actual work. */
  summary: string
  strengths: string[]
  gaps: string[]
  /** What to attempt next, specific to them. */
  nextStep: string
  /** Whether a language model produced this, or the local rubric did. */
  source: 'model' | 'local'
  /** The measured facts the assessment was based on, shown alongside it. */
  evidence: EvidenceLine[]
}

export interface EvidenceLine {
  label: string
  value: string
}

/**
 * The measured record. Nothing here is estimated by a model — these are the
 * numbers the simulation recorded, and they are displayed next to the
 * assessment so a reader can check the reasoning against the facts.
 */
export function buildEvidence(): EvidenceLine[] {
  const runs = score.runs
  const best = runs[0]
  const check = checkGraph()
  const topo = topology()
  const parts = graph.placed.map((p) => partOf(p.instanceId)).filter(Boolean)
  const cost = parts.reduce((sum, p) => sum + (p?.cost ?? 0), 0)

  const lines: EvidenceLine[] = [
    { label: 'Deployments', value: String(learner.attempts) },
    { label: 'Successful rescues', value: String(runs.length) },
  ]

  if (best) {
    lines.push(
      { label: 'Best rescue time', value: `${best.farmHours.toFixed(1)} farm hours` },
      { label: 'Water used on that run', value: `${Math.round(best.litresUsed)} L` },
      { label: 'Switch operations', value: String(best.relayCycles) },
      { label: 'Lowest battery reached', value: `${Math.round(best.lowestBattery)}%` },
      { label: 'Run rating', value: `${ratingFor(best)}/100` },
    )
  }

  lines.push(
    { label: 'Components used', value: `${parts.length} parts, ${cost} credits` },
    { label: 'Sensors wired', value: String(wiredSensors().length) },
    { label: 'Outputs under control', value: String(wiredOutputs().length) },
    { label: 'Outstanding circuit faults', value: String(check.errors) },
    {
      label: 'Generation reaching storage',
      value: `${topo.arrayPeakWatts} W of ${topo.installedPeakWatts} W installed`,
    },
    { label: 'Overall mastery', value: `${Math.round(overallMastery() * 100)}%` },
    { label: 'Current crop health', value: `${farm.cropHealth.toFixed(0)}%` },
  )

  return lines
}

/** The dossier sent to the model. Facts only. */
function dossier(): string {
  const evidence = buildEvidence()
    .map((e) => `${e.label}: ${e.value}`)
    .join('\n')

  const concepts = CONCEPTS.map((c) => {
    const st = learner.concepts[c.id]
    const seen = st.correct + st.incorrect
    return seen
      ? `${c.label}: ${Math.round(masteryOf(c.id) * 100)}% (${st.correct} correct, ${st.incorrect} incorrect). Last: ${st.evidence[0] ?? '—'}`
      : `${c.label}: no evidence yet`
  }).join('\n')

  const runs = score.runs.length
    ? score.runs
        .map(
          (r, i) =>
            `Run ${i + 1}: rescued in ${r.farmHours.toFixed(1)} farm hours, ${Math.round(r.litresUsed)} L, ${r.relayCycles} switch ops, lowest battery ${Math.round(r.lowestBattery)}%, ${r.parts} parts costing ${r.cost}c`,
        )
        .join('\n')
    : 'No completed rescues.'

  return [
    'THE CIRCUIT THEY BUILT',
    describeCircuit(),
    '',
    describeProgram(),
    '',
    'MEASURED RECORD',
    evidence,
    '',
    'CONCEPT MASTERY (Bayesian estimates from their build behaviour)',
    concepts,
    '',
    'RUN HISTORY',
    runs,
    '',
    'RECENT ACTIONS',
    recentActions().join(' | ') || 'none recorded',
  ].join('\n')
}

const SYSTEM = `You are the assessor for SunRoot, an engineering simulation where students design a solar-powered irrigation system.

You will be given THE CIRCUIT THEY BUILT (a netlist), THE PROGRAM THEY WROTE (compiled from their blocks), and a MEASURED RECORD. Every number in the record was recorded by the simulation.

Your task is to assess the engineering — the design choices and the logic, not only the outcome. Read the netlist and the program and form a view on them. Return ONLY a JSON object, no prose around it, no markdown fences:

{
  "rank": one of "Explorer" | "Apprentice" | "Technician" | "Engineer" | "Systems Engineer" | "Innovation Master",
  "xp": integer 0-500,
  "headline": string, under 12 words,
  "summary": string, 2-3 sentences citing their actual numbers,
  "strengths": array of 1-3 short strings,
  "gaps": array of 1-3 short strings,
  "nextStep": string, one concrete thing to attempt next
}

ASSESS THESE THINGS:
- Component choice: are the parts sensibly matched to the load and to each other? Is the array sized for the daily demand? Is the controller's logic voltage compatible with the sensors chosen?
- Circuit design: is there a proper switching stage, a shared ground, a complete charging path, a complete water path? Is anything hard-wired that should be switched?
- Logic style: does the program branch on a sensor reading, or act blindly? Are the thresholds sensible for a 30-70% optimal band? Is there hysteresis, or one threshold that will chatter? Is there a delay where one is needed?
- Economy: did they achieve the result with a lean build, or an expensive one?

RULES:
- Cite specifics from their circuit and program. Name the actual pins, parts and threshold values you can see.
- Never state a number that is not in the material given. If they have no completed runs, say so rather than inventing one.
- Judge the design even when it worked: a system that succeeds by brute force is not good engineering, and should be told so.
- Rank on demonstrated competence, not effort. Explorer means barely started. Innovation Master requires efficient, stable, low-cost success across multiple runs.
- Weigh quality over speed: a rescue using little water with few switch operations beats a faster one that thrashed the hardware.
- Outstanding circuit faults should hold a rank back.
- Be direct. If the work is weak, say so plainly and without cushioning.
- Address the student as "you".`

/** Ask the model to assess. Falls back to the local rubric on any failure. */
export async function assess(): Promise<Assessment> {
  const evidence = buildEvidence()

  if (!isLiveAI()) return { ...localAssess(), evidence, source: 'local' }

  try {
    const res = await ask(
      `${SYSTEM}\n\n---\n\n${dossier()}`,
      [],
    )
    if (res.source !== 'model') return { ...localAssess(), evidence, source: 'local' }

    const parsed = parseAssessment(res.text)
    if (!parsed) return { ...localAssess(), evidence, source: 'local' }

    return { ...parsed, evidence, source: 'model' }
  } catch {
    return { ...localAssess(), evidence, source: 'local' }
  }
}

/** Models sometimes wrap JSON in prose or fences; recover it either way. */
function parseAssessment(raw: string): Omit<Assessment, 'evidence' | 'source'> | null {
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start < 0 || end < 0) return null

    const obj = JSON.parse(cleaned.slice(start, end + 1))
    const rank: Rank = RANK_ORDER.includes(obj.rank) ? obj.rank : 'Explorer'
    const xp = Math.max(0, Math.min(500, Number(obj.xp) || 0))

    return {
      rank,
      xp,
      headline: String(obj.headline ?? 'Assessment complete'),
      summary: String(obj.summary ?? ''),
      strengths: Array.isArray(obj.strengths) ? obj.strengths.slice(0, 3).map(String) : [],
      gaps: Array.isArray(obj.gaps) ? obj.gaps.slice(0, 3).map(String) : [],
      nextStep: String(obj.nextStep ?? ''),
    }
  } catch {
    return null
  }
}

/**
 * The offline rubric. Deterministic, and deliberately harder to satisfy than a
 * participation trophy — rank tracks demonstrated competence.
 */
function localAssess(): Omit<Assessment, 'evidence' | 'source'> {
  const runs = score.runs
  const best = runs[0]
  const mastery = overallMastery()
  const faults = checkGraph().errors
  const rating = best ? ratingFor(best) : 0

  let rank: Rank = 'Explorer'
  if (learner.attempts > 0) rank = 'Apprentice'
  if (runs.length >= 1 && faults === 0) rank = 'Technician'
  if (runs.length >= 1 && mastery > 0.55 && rating >= 55) rank = 'Engineer'
  if (runs.length >= 2 && mastery > 0.72 && rating >= 70) rank = 'Systems Engineer'
  if (runs.length >= 3 && mastery > 0.85 && rating >= 82 && faults === 0) rank = 'Innovation Master'

  // Faults cost progress but cannot erase it entirely: a student who built and
  // deployed something has done work, and zeroing that out teaches nothing.
  const earned = mastery * 180 + runs.length * 45 + rating * 1.2 - faults * 15
  const floor = learner.attempts * 20 + graph.placed.length * 4
  const xp = Math.round(Math.max(floor, earned))

  const strengths: string[] = []
  const gaps: string[] = []

  // Design-level observations the offline rubric can make without a model.
  const topo = topology()
  const hard = alwaysOnLoads()
  if (topo.controllerName.startsWith('none') && topo.installedPeakWatts > 0) {
    gaps.push('No charge controller — harvesting about 55% of the array')
  } else if (!topo.controllerName.startsWith('none')) {
    strengths.push(`Charge controller fitted (${topo.controllerName})`)
  }
  if (hard.length) gaps.push(`${hard[0].part.name} hard-wired across the supply`)
  if (best && best.relayCycles > 0 && best.relayCycles < 12) {
    strengths.push('Stable control loop, few switch operations')
  }
  if (best && best.parts <= 8) strengths.push(`Lean build — ${best.parts} parts`)

  for (const c of CONCEPTS) {
    const m = masteryOf(c.id)
    const seen = learner.concepts[c.id].correct + learner.concepts[c.id].incorrect
    if (!seen) continue
    if (m >= 0.8 && strengths.length < 3) strengths.push(c.label)
    if (m < 0.45 && gaps.length < 3) gaps.push(c.label)
  }

  const summary = best
    ? `You rescued the farm in ${best.farmHours.toFixed(1)} farm hours using ${Math.round(best.litresUsed)} litres and ${best.relayCycles} switch operations, on a build of ${best.parts} parts. Overall mastery sits at ${Math.round(mastery * 100)}%.${faults ? ` ${faults} circuit fault${faults === 1 ? ' remains' : 's remain'} outstanding.` : ''}`
    : learner.attempts
      ? `You have deployed ${learner.attempts} time${learner.attempts === 1 ? '' : 's'} without bringing crop health back above 75%. Mastery is at ${Math.round(mastery * 100)}%.${faults ? ` ${faults} circuit fault${faults === 1 ? '' : 's'} still outstanding.` : ''}`
      : 'No system has been deployed yet, so there is nothing to assess.'

  return {
    rank,
    xp: Math.max(0, Math.min(500, xp)),
    headline: best
      ? `Farm rescued, rated ${rating} out of 100`
      : learner.attempts
        ? `${faults} fault${faults === 1 ? '' : 's'} between you and a working system`
        : 'Nothing deployed yet',
    summary,
    strengths: strengths.length ? strengths : ['Nothing measured yet'],
    gaps: gaps.length ? gaps : faults ? ['Outstanding circuit faults'] : ['No clear weakness recorded'],
    nextStep: best
      ? rating < 70
        ? 'Rescue the farm again using less water and fewer switch operations.'
        : 'Try the same rescue on a leaner, cheaper build.'
      : 'Deploy a system and bring crop health above 75%.',
  }
}
