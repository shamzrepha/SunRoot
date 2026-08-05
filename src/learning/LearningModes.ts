// ---------------------------------------------------------------------------
// LearningModes
//
// The same simulation used for instruction, practice, assessment and
// collaboration — the difference is how much the tutor gives away.
//
// This is the lever that makes the platform usable across a whole lesson: a
// teacher introduces a concept in Learn, sets Practice for the working period,
// and switches to Exam for assessment without changing tool or losing the
// learner model. Mode changes what is shown, never what is simulated.
// ---------------------------------------------------------------------------

import type { Depth } from './ContextualTutor'

export type ModeId = 'learn' | 'practice' | 'challenge' | 'exam'

export interface LearningMode {
  id: ModeId
  label: string
  blurb: string
  /** Deepest guidance the tutor may offer in this mode. */
  ceiling: Depth
  /** Whether the guided step checklist is visible. */
  showChecklist: boolean
  /** Whether circuit diagnostics name the fault or only flag that one exists. */
  detailedDiagnostics: boolean
  /** Whether the run is timed and recorded for assessment. */
  assessed: boolean
}

export const MODES: LearningMode[] = [
  {
    id: 'learn',
    label: 'Learn',
    blurb: 'Step-by-step instruction. The tutor names the exact wire to run and explains why.',
    ceiling: 'instruction',
    showChecklist: true,
    detailedDiagnostics: true,
    assessed: false,
  },
  {
    id: 'practice',
    label: 'Practice',
    blurb: 'Guidance on request, pitched to what you already know. Diagnostics still name faults.',
    ceiling: 'pointer',
    showChecklist: false,
    detailedDiagnostics: true,
    assessed: false,
  },
  {
    id: 'challenge',
    label: 'Challenge',
    blurb: 'Socratic questions only. Diagnostics tell you a fault exists, not what it is.',
    ceiling: 'question',
    showChecklist: false,
    detailedDiagnostics: false,
    assessed: false,
  },
  {
    id: 'exam',
    label: 'Exam',
    blurb: 'No guidance at all. Your build and its outcome are recorded for assessment.',
    ceiling: 'silent',
    showChecklist: false,
    detailedDiagnostics: false,
    assessed: true,
  },
]

export const MODE_BY_ID = new Map(MODES.map((m) => [m.id, m]))

let active: ModeId = 'learn'

export function currentMode(): LearningMode {
  return MODE_BY_ID.get(active)!
}

export function setMode(id: ModeId) {
  active = id
}

const ORDER: Depth[] = ['silent', 'hint', 'question', 'pointer', 'instruction']

/**
 * How explicit the next piece of guidance may be.
 *
 * Two things constrain it. The mode sets a ceiling — Challenge never instructs,
 * however lost the student is. Below that ceiling, mastery sets the depth, so a
 * student who already understands a concept gets a lighter touch than one who
 * does not. Support therefore fades with competence *and* with mode.
 */
export function guidanceDepthFor(mastery: number): Depth {
  const mode = currentMode()
  if (mode.ceiling === 'silent') return 'silent'

  const wanted: Depth =
    mastery >= 0.8 ? 'hint'
    : mastery >= 0.55 ? 'question'
    : mastery >= 0.3 ? 'pointer'
    : 'instruction'

  // Clamp to the mode's ceiling.
  return ORDER.indexOf(wanted) > ORDER.indexOf(mode.ceiling) ? mode.ceiling : wanted
}
