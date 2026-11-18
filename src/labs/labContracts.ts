export type LabId =
  | 'light-circuit'
  | 'night-light'
  | 'distance-sensor'
  | 'follow-path-robot'
  | 'traffic-light'

export type StuckFallbackMode =
  | 'simplify'
  | 'example'
  | 'visual'
  | 'step-by-step'
  | 'hint'
  | 'explain-wrong'

export interface LabSummaryMeta {
  id: LabId
  title: string
  summary: string
  difficulty: 'beginner' | 'intermediate'
  estimatedMinutes: number
  keywords: string[]
}

export const LAB_IDS: readonly LabId[] = [
  'light-circuit',
  'night-light',
  'distance-sensor',
  'follow-path-robot',
  'traffic-light',
]
