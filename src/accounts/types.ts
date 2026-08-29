export type Role = 'teacher' | 'student' | 'individual'

export interface LearningStyleProfile {
  visual: number
  auditory: number
  kinesthetic: number
  readingWriting: number
  lastUpdated: number
}

export interface UserProfile {
  uid: string
  email: string
  displayName: string
  role: Role
  createdAt: number
  /** Short unique code, e.g. "SR-7K2Q9F" — what a teacher searches to invite this student. */
  studentTag?: string
  classroomIds?: string[]
  classroomsTaughtIds?: string[]
  learningStyle: LearningStyleProfile
  /** Optional short bio shown on the profile page. */
  bio?: string
  /**
   * Set manually via the Firebase console (Admin SDK), never through the
   * app. Firestore rules reject any client write that changes this field,
   * including by an existing admin, so there is no self-serve path to it.
   */
  isAdmin?: boolean
}

export interface Classroom {
  id: string
  teacherId: string
  /** Denormalised at creation time so listings never need an extra read per row. */
  teacherName: string
  name: string
  description?: string
  topic: string
  visibility: 'public' | 'private'
  studentIds: string[]
  createdAt: number
  isDemo?: boolean
}

export type InviteStatus = 'pending' | 'accepted' | 'declined'

export interface ClassroomInvite {
  id: string
  classroomId: string
  classroomName: string
  teacherId: string
  studentUid: string
  status: InviteStatus
  createdAt: number
}

export interface Team {
  id: string
  classroomId: string
  name: string
  memberUids: string[]
  sharedState: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export type SuggestionStatus = 'new' | 'reviewed'

/** A teacher's request for a class topic that doesn't exist yet — surfaced to the admin. */
export interface ClassSuggestion {
  id: string
  teacherId: string
  teacherName: string
  title: string
  description: string
  status: SuggestionStatus
  createdAt: number
}

export const CLASS_TOPICS = [
  'Solar & Irrigation Systems',
  'Robotics & Automation',
  'Water Treatment & Hydraulics',
  'Structural & Bridge Engineering',
  'Gear Reduction & Mechanical Drives',
  'Other (not yet available)',
] as const

/**
 * A lightweight, periodically-synced summary of a student's simulation
 * progress — NOT the full farm/circuit save, which stays local-only. Includes
 * a per-concept breakdown so a teacher's view can show real strengths/gaps,
 * not just one aggregate number.
 */
export interface ProgressSnapshot {
  uid: string
  displayName: string
  xp: number
  rank: string
  conceptsMastered: number
  totalConcepts: number
  overallMastery: number // 0–1, engaged concepts only
  daysSurvived: number
  /** Per-concept mastery (0–1) and whether the student has actually attempted it. */
  conceptMastery: Record<string, { mastery: number; engaged: boolean }>
  updatedAt: number
}
