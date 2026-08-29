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

export const TEAM_ROLES = [
  'Team Lead',
  'Circuit Engineer',
  'Software Engineer',
  'Systems Tester',
  'Contributor',
] as const
export type TeamRole = (typeof TEAM_ROLES)[number]

/** One saved-and-shipped snapshot of a team's shared work — the "commit" in the GitHub-style flow. */
export interface TeamCommit {
  uid: string
  displayName: string
  message: string
  timestamp: number
}

export interface TeamPurchase {
  uid: string
  displayName: string
  partName: string
  quantityAdded: number
  cost: number
  timestamp: number
}

export interface Team {
  id: string
  classroomId: string
  name: string
  memberUids: string[]
  /** Self-selected by each member; not everyone has to pick one. */
  memberRoles: Record<string, TeamRole>
  /** Shared credit pool — fixed at creation, persists across membership changes (unlike an individual's solo budget). */
  budget: number
  /** Who bought what, most recent first, capped at 30 — visible to any member even if they joined after the purchase. */
  purchaseLog: TeamPurchase[]
  /**
   * The team's actual shared farm/circuit/code state — what a member pulls
   * when they enter the team workshop, and what gets overwritten wholesale
   * on every "save & ship" (full-snapshot commits, not diffs — simple and
   * predictable, not real git).
   */
  sharedState: Record<string, unknown>
  /** Most recent commits first, capped at 20 — a full history isn't kept forever. */
  commits: TeamCommit[]
  lastSavedBy?: string
  lastSavedAt?: number
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
 * progress — NOT the full farm/circuit save, which stays local-only.
 *
 * Scoped to a single classroom (see WorkshopContext.ts) — a student in two
 * different classes gets two separate snapshots, keyed `{classroomId}_{uid}`
 * in Firestore, so a teacher's view of "this class" never bleeds in a
 * student's activity from a different class they happen to also be in.
 */
export interface ProgressSnapshot {
  uid: string
  classroomId: string
  displayName: string
  xp: number
  rank: string
  conceptsMastered: number
  totalConcepts: number
  overallMastery: number // 0–1, engaged concepts only
  daysSurvived: number
  badgesEarned: number
  totalBadges: number
  /** Per-concept detail — enough for a teacher to see not just mastery but where a student keeps getting stuck. */
  conceptMastery: Record<
    string,
    {
      mastery: number
      engaged: boolean
      correct: number
      incorrect: number
      lastSeen: number
      /** Most recent few attempts, plain-language, e.g. "✓ wired the pull-down resistor correctly". */
      evidence: string[]
    }
  >
  updatedAt: number
}
export type FriendRequestStatus = 'pending' | 'accepted' | 'declined'

/**
 * Both the invite AND the friendship record — an accepted request IS the
 * friendship, so there's no separate `friends` array to keep in sync on
 * two different user documents (which Firestore rules can't safely allow a
 * client to write to both sides of anyway without a backend function).
 */
export interface FriendRequest {
  id: string
  fromUid: string
  fromName: string
  toUid: string
  toName: string
  status: FriendRequestStatus
  createdAt: number
  respondedAt?: number
}

export type LeaderboardCategory = 'mastery' | 'xp' | 'concepts'

export interface LeaderboardEntry {
  uid: string
  displayName: string
  value: number
}

export interface TeamLeaderboardEntry {
  teamId: string
  name: string
  classroomId: string
  value: number
  memberCount: number
}
export interface ChatMessage {
  id: string
  fromUid: string
  fromName: string
  toUid: string
  toName: string
  text: string
  createdAt: number
}

export type ReportStatus = 'new' | 'reviewed'

export interface MessageReport {
  id: string
  messageId: string
  messageText: string
  messageFrom: string
  reporterUid: string
  reporterName: string
  reason: string
  status: ReportStatus
  createdAt: number
}
