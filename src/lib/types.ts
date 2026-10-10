import { BKTParameters, StudentKCMastery } from './bkt';

export type UserRole = 'teacher' | 'student' | 'individual';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: UserRole;
  schoolName?: string;
  streakDays: number;
  streakFrozen: boolean;
  totalXP: number;
  level: number;
  badges: Badge[];
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt?: string;
  category: 'mastery' | 'streak' | 'lab' | 'social';
}

export interface KnowledgeComponent {
  id: string;
  code: string;
  title: string;
  description: string;
  prerequisites: string[]; // IDs of prerequisite KCs
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  unit: string;
  bktParams: BKTParameters;
  labSimulationType?: 'electronics' | 'general';
}

export interface Flashcard {
  id: string;
  kcId: string;
  front: string;
  back: string;
  hint?: string;
  sourceDocId?: string;
  citation?: string;
}

export interface QuizQuestion {
  id: string;
  kcId: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  citation?: string;
}

export interface AudioOverviewDialog {
  id: string;
  speaker: 'Host (Alex)' | 'Expert (Dr. Sam)';
  text: string;
  pitch: number;
  rate: number;
}

export interface StudyMaterial {
  id: string;
  title: string;
  fileName: string;
  fileType: 'pdf' | 'doc' | 'text' | 'notes';
  uploadedAt: string;
  authorId: string;
  summary: string;
  briefingDoc?: string;
  keyInsights: string[];
  audioOverview?: AudioOverviewDialog[];
  extractedKCs: string[]; // KC IDs
  contentSnippet: string;
}

export interface LabChallenge {
  id: string;
  title: string;
  kcId: string;
  targetGoal: string;
  sourceVoltage: number; // e.g. 9V
  targetCurrentMinMa: number; // e.g. 18mA
  targetCurrentMaxMa: number; // e.g. 24mA
  ledForwardDrop: number; // e.g. 2.0V
  maxSafeCurrentMa: number; // e.g. 30mA (anything above pops LED)
  hintFormula: string; // "R = (V_source - V_led) / I_target"
  expectedResistanceRange: [number, number]; // [300, 390]
  xpReward: number;
}

export interface Classroom {
  id: string;
  name: string;
  subject: string;
  code: string; // 6-digit join code
  isPublic: boolean;
  teacherId: string;
  teacherName: string;
  description: string;
  materials: StudyMaterial[];
  knowledgeComponents: KnowledgeComponent[];
  flashcards: Flashcard[];
  quizzes: QuizQuestion[];
  enrolledStudentIds: string[];
  createdAt: string;
}

export interface StudyRoom {
  id: string;
  name: string;
  code: string; // join code
  hostId: string;
  hostName: string;
  description: string;
  isLive: boolean;
  activeMembers: {
    id: string;
    name: string;
    avatar: string;
    role: string;
    currentAction: string;
  }[];
  materials: StudyMaterial[];
  sharedNotes: string;
  createdAt: string;
}

export interface ClassStudentProgress {
  studentId: string;
  studentName: string;
  studentAvatar: string;
  overallMasteryPct: number;
  masteryByKC: Record<string, StudentKCMastery>;
  streakDays: number;
  totalXP: number;
  lastActive: string;
  struggleRisk: {
    level: 'low' | 'medium' | 'high';
    flaggedKCs: string[];
  };
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  userAvatar: string;
  schoolOrClass: string;
  xp: number;
  masteredCount: number;
  streakDays: number;
}
