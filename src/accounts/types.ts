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
}

export interface Classroom {
  id: string
  teacherId: string
  name: string
  description?: string
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
