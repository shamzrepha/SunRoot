'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  UserProfile,
  Classroom,
  StudyRoom,
  ClassStudentProgress,
  LeaderboardEntry,
  StudyMaterial,
  Flashcard,
  QuizQuestion,
  KnowledgeComponent,
} from '@/lib/types';
import {
  MOCK_USERS,
  MOCK_CLASSROOM,
  MOCK_STUDY_ROOM,
  MOCK_STUDENT_PROGRESS,
  MOCK_CLASS_LEADERBOARD,
  MOCK_GLOBAL_LEADERBOARD,
  MOCK_KCS,
  MOCK_STUDY_MATERIALS,
  MOCK_FLASHCARDS,
  MOCK_QUIZZES,
} from '@/lib/mockData';
import { updateBKT, DEFAULT_BKT_PARAMS, StudentKCMastery } from '@/lib/bkt';

interface AppContextType {
  currentUser: UserProfile;
  switchUser: (userId: string) => void;
  classroom: Classroom;
  studyRoom: StudyRoom;
  studentProgress: Record<string, ClassStudentProgress>;
  classLeaderboard: LeaderboardEntry[];
  globalLeaderboard: LeaderboardEntry[];
  recordBKTInteraction: (
    kcId: string,
    isCorrect: boolean,
    activityType: 'flashcard' | 'quiz' | 'simulation_lab' | 'concept_review',
    xpReward?: number,
    details?: string
  ) => { newP_L: number; newlyMastered: boolean };
  uploadStudyMaterial: (title: string, rawText: string) => Promise<StudyMaterial>;
  createClassroom: (name: string, subject: string, isPublic: boolean) => Classroom;
  joinClassroomByCode: (code: string) => boolean;
  createStudyRoom: (name: string, description: string) => StudyRoom;
  updateSharedNotes: (notes: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  // Current user (defaults to Leo Chen - Student)
  const [currentUser, setCurrentUser] = useState<UserProfile>(MOCK_USERS.student_leo);
  const [classroom, setClassroom] = useState<Classroom>(MOCK_CLASSROOM);
  const [studyRoom, setStudyRoom] = useState<StudyRoom>(MOCK_STUDY_ROOM);
  const [studentProgress, setStudentProgress] = useState<Record<string, ClassStudentProgress>>(MOCK_STUDENT_PROGRESS);
  const [classLeaderboard, setClassLeaderboard] = useState<LeaderboardEntry[]>(MOCK_CLASS_LEADERBOARD);
  const [globalLeaderboard, setGlobalLeaderboard] = useState<LeaderboardEntry[]>(MOCK_GLOBAL_LEADERBOARD);

  // Initialize or load from LocalStorage if browser available
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('cognitwin_user_id');
      if (savedUser && MOCK_USERS[savedUser]) {
        setCurrentUser(MOCK_USERS[savedUser]);
      }
    } catch {
      // Fallback
    }
  }, []);

  const switchUser = (userId: string) => {
    if (MOCK_USERS[userId]) {
      setCurrentUser(MOCK_USERS[userId]);
      try {
        localStorage.setItem('cognitwin_user_id', userId);
      } catch {
        // Fallback
      }
    }
  };

  /**
   * Core Bayesian Knowledge Tracing Engine Hook
   */
  const recordBKTInteraction = (
    kcId: string,
    isCorrect: boolean,
    activityType: 'flashcard' | 'quiz' | 'simulation_lab' | 'concept_review',
    xpReward = 50,
    details = ''
  ): { newP_L: number; newlyMastered: boolean } => {
    const studentId = currentUser.id;
    const currentProgress = studentProgress[studentId] || {
      studentId,
      studentName: currentUser.name,
      studentAvatar: currentUser.avatar,
      overallMasteryPct: 20,
      streakDays: currentUser.streakDays,
      totalXP: currentUser.totalXP,
      lastActive: 'Just now',
      struggleRisk: { level: 'low', flaggedKCs: [] },
      masteryByKC: {},
    };

    const targetKC = classroom.knowledgeComponents.find(k => k.id === kcId) || MOCK_KCS.find(k => k.id === kcId);
    const bktParams = targetKC?.bktParams || DEFAULT_BKT_PARAMS;

    const existingMastery: StudentKCMastery = currentProgress.masteryByKC[kcId] || {
      kcId,
      kcTitle: targetKC?.title || 'Concept ' + kcId,
      probabilityMastery: bktParams.pL0,
      history: [],
      totalAttempts: 0,
      correctAttempts: 0,
      lastPracticed: Date.now(),
      isMastered: false,
    };

    // Calculate BKT posterior and next state
    const { nextP_L } = updateBKT(existingMastery.probabilityMastery, isCorrect, bktParams);
    const previouslyMastered = existingMastery.isMastered;
    const isNowMastered = nextP_L >= bktParams.masteryThreshold;
    const newlyMastered = !previouslyMastered && isNowMastered;

    // Trigger celebration if newly mastered!
    if (newlyMastered) {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6'],
        });
      } catch {
        // ignore in non-browser
      }
    }

    const updatedMastery: StudentKCMastery = {
      ...existingMastery,
      probabilityMastery: nextP_L,
      isMastered: isNowMastered,
      totalAttempts: existingMastery.totalAttempts + 1,
      correctAttempts: existingMastery.correctAttempts + (isCorrect ? 1 : 0),
      lastPracticed: Date.now(),
      history: [
        ...existingMastery.history,
        {
          step: existingMastery.history.length + 1,
          probability: nextP_L,
          correct: isCorrect,
          activityType,
          timestamp: Date.now(),
        },
      ],
    };

    // Calculate new overall mastery average
    const updatedMasteryByKC = {
      ...currentProgress.masteryByKC,
      [kcId]: updatedMastery,
    };

    const kcValues = Object.values(updatedMasteryByKC);
    const avgMastery = Math.round(
      (kcValues.reduce((acc, curr) => acc + curr.probabilityMastery, 0) / Math.max(1, kcValues.length)) * 100
    );

    const earnedXP = isCorrect ? xpReward : Math.round(xpReward * 0.2);

    const updatedStudentProgress: ClassStudentProgress = {
      ...currentProgress,
      overallMasteryPct: avgMastery,
      totalXP: currentProgress.totalXP + earnedXP,
      lastActive: 'Just now',
      masteryByKC: updatedMasteryByKC,
    };

    setStudentProgress(prev => ({
      ...prev,
      [studentId]: updatedStudentProgress,
    }));

    // Update currentUser XP
    setCurrentUser(prev => ({
      ...prev,
      totalXP: prev.totalXP + earnedXP,
    }));

    // Update Leaderboard dynamically
    setClassLeaderboard(prev =>
      prev
        .map(entry =>
          entry.userId === studentId
            ? {
                ...entry,
                xp: entry.xp + earnedXP,
                masteredCount: kcValues.filter(k => k.isMastered).length,
              }
            : entry
        )
        .sort((a, b) => b.xp - a.xp)
        .map((entry, idx) => ({ ...entry, rank: idx + 1 }))
    );

    return { newP_L: nextP_L, newlyMastered };
  };

  /**
   * NotebookLM Document Ingestion: AI parsing & auto-synthesis simulation
   */
  const uploadStudyMaterial = async (title: string, rawText: string): Promise<StudyMaterial> => {
    // Simulate AI chunking and generation
    const newDocId = `mat-${Date.now()}`;
    const newMaterial: StudyMaterial = {
      id: newDocId,
      title: title || 'Custom Uploaded Lecture Notes',
      fileName: `${(title || 'Document').replace(/\s+/g, '_')}.pdf`,
      fileType: 'pdf',
      uploadedAt: new Date().toISOString().split('T')[0],
      authorId: currentUser.id,
      summary: `Automated cognitive synthesis for "${title}": Covers core electronic components, potential gradients, circuit protection topologies, and mathematical modeling.`,
      keyInsights: [
        'Component safety thresholds must be respected to prevent thermal diode degradation.',
        'Dynamic resistance characteristics dictate series protection requirements.',
        'BKT cognitive tracking guarantees mastery before advanced node analysis.',
      ],
      extractedKCs: ['kc-voltage', 'kc-current', 'kc-ohms-law', 'kc-led-resistors'],
      contentSnippet: rawText || 'Extracted document corpus for AI grounding and Socratic dialogue...',
    };

    // Auto-generate a new flashcard based on material
    const autoCard: Flashcard = {
      id: `fc-auto-${Date.now()}`,
      kcId: 'kc-led-resistors',
      front: `[AI Generated from "${title}"]: What is the formula for sizing an LED current-limiting resistor?`,
      back: 'R = (V_supply - V_forward) / I_target, where V_forward is the LED diode drop.',
      hint: 'Remember to subtract the diode forward voltage drop from the source rail.',
      citation: `${newMaterial.fileName}, §AI-Extracted`,
    };

    // Auto-generate a diagnostic quiz question
    const autoQuiz: QuizQuestion = {
      id: `q-auto-${Date.now()}`,
      kcId: 'kc-ohms-law',
      prompt: `[AI Quiz from "${title}"]: If source voltage is 12V and total circuit resistance is 600Ω, what is the current in mA?`,
      options: ['20 mA', '50 mA', '2 mA', '72 mA'],
      correctIndex: 0,
      explanation: 'I = V / R = 12 / 600 = 0.020 A = 20 mA.',
      citation: `${newMaterial.fileName}, §AI-Extracted`,
    };

    setClassroom(prev => ({
      ...prev,
      materials: [newMaterial, ...prev.materials],
      flashcards: [autoCard, ...prev.flashcards],
      quizzes: [autoQuiz, ...prev.quizzes],
    }));

    return newMaterial;
  };

  const createClassroom = (name: string, subject: string, isPublic: boolean): Classroom => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newClass: Classroom = {
      id: `class-${Date.now()}`,
      name,
      subject,
      code,
      isPublic,
      teacherId: currentUser.id,
      teacherName: currentUser.name,
      description: `Interactive digital twin classroom for ${name}.`,
      materials: MOCK_STUDY_MATERIALS,
      knowledgeComponents: MOCK_KCS,
      flashcards: MOCK_FLASHCARDS,
      quizzes: MOCK_QUIZZES,
      enrolledStudentIds: [currentUser.id],
      createdAt: new Date().toISOString().split('T')[0],
    };
    setClassroom(newClass);
    return newClass;
  };

  const joinClassroomByCode = (code: string): boolean => {
    if (code.toUpperCase() === classroom.code.toUpperCase() || code.toUpperCase() === 'OHM-402') {
      if (!classroom.enrolledStudentIds.includes(currentUser.id)) {
        setClassroom(prev => ({
          ...prev,
          enrolledStudentIds: [...prev.enrolledStudentIds, currentUser.id],
        }));
      }
      return true;
    }
    return false;
  };

  const createStudyRoom = (name: string, description: string): StudyRoom => {
    const code = 'LOU-' + Math.floor(100 + Math.random() * 900);
    const newRoom: StudyRoom = {
      id: `room-${Date.now()}`,
      name,
      code,
      hostId: currentUser.id,
      hostName: currentUser.name,
      description,
      isLive: true,
      activeMembers: [
        {
          id: currentUser.id,
          name: currentUser.name,
          avatar: currentUser.avatar,
          role: 'Host',
          currentAction: 'Hosting Study Lounge',
        },
      ],
      materials: classroom.materials,
      sharedNotes: 'Welcome to our collaborative study session! Upload materials or test circuits together.',
      createdAt: new Date().toISOString().split('T')[0],
    };
    setStudyRoom(newRoom);
    return newRoom;
  };

  const updateSharedNotes = (notes: string) => {
    setStudyRoom(prev => ({
      ...prev,
      sharedNotes: notes,
    }));
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        switchUser,
        classroom,
        studyRoom,
        studentProgress,
        classLeaderboard,
        globalLeaderboard,
        recordBKTInteraction,
        uploadStudyMaterial,
        createClassroom,
        joinClassroomByCode,
        createStudyRoom,
        updateSharedNotes,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
