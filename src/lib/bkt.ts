/**
 * Bayesian Knowledge Tracing (BKT) Cognitive Engine
 *
 * Implements the canonical Hidden Markov Model for estimating latent student mastery.
 *
 * Parameters per Knowledge Component (KC):
 * - pL0: Prior probability of knowledge (before practice)
 * - pT:  Transition / learning rate per opportunity
 * - pG:  Guess probability (answering correctly despite not knowing)
 * - pS:  Slip probability (answering incorrectly despite knowing)
 */

export interface BKTParameters {
  pL0: number; // P(L_0)
  pT: number;  // P(T)
  pG: number;  // P(G)
  pS: number;  // P(S)
  masteryThreshold: number; // e.g. 0.85 or 0.90
}

export const DEFAULT_BKT_PARAMS: BKTParameters = {
  pL0: 0.20,
  pT: 0.18,
  pG: 0.20,
  pS: 0.10,
  masteryThreshold: 0.85,
};

export interface BKTObservation {
  correct: boolean;
  timestamp: number;
  activityType: 'flashcard' | 'quiz' | 'simulation_lab' | 'concept_review';
  metadata?: {
    details?: string;
    score?: number;
    latencyMs?: number;
  };
}

export interface StudentKCMastery {
  kcId: string;
  kcTitle: string;
  probabilityMastery: number; // Current P(L_t)
  history: {
    step: number;
    probability: number;
    correct: boolean;
    activityType: string;
    timestamp: number;
  }[];
  totalAttempts: number;
  correctAttempts: number;
  lastPracticed: number;
  isMastered: boolean;
}

/**
 * Updates belief state P(L_t) after observing an outcome (correct or incorrect),
 * then transitions to P(L_{t+1}) accounting for the probability of learning during the opportunity.
 */
export function updateBKT(
  currentP_L: number,
  isCorrect: boolean,
  params: BKTParameters = DEFAULT_BKT_PARAMS
): { posteriorP_L: number; nextP_L: number } {
  const { pT, pG, pS } = params;

  // 1. Evidence update: P(L_t | Observation)
  let posteriorP_L = 0;

  if (isCorrect) {
    // P(L | correct) = [P(L) * (1 - pS)] / [P(L) * (1 - pS) + (1 - P(L)) * pG]
    const numerator = currentP_L * (1 - pS);
    const denominator = numerator + (1 - currentP_L) * pG;
    posteriorP_L = denominator > 0 ? numerator / denominator : currentP_L;
  } else {
    // P(L | incorrect) = [P(L) * pS] / [P(L) * pS + (1 - P(L)) * (1 - pG)]
    const numerator = currentP_L * pS;
    const denominator = numerator + (1 - currentP_L) * (1 - pG);
    posteriorP_L = denominator > 0 ? numerator / denominator : currentP_L;
  }

  // Bound to numerical sanity [0.001, 0.999]
  posteriorP_L = Math.max(0.001, Math.min(0.999, posteriorP_L));

  // 2. Transition update for next opportunity: P(L_{t+1}) = P(L_t|obs) + (1 - P(L_t|obs)) * pT
  const nextP_L = posteriorP_L + (1 - posteriorP_L) * pT;
  const boundedNextP_L = Math.max(0.001, Math.min(0.999, nextP_L));

  return {
    posteriorP_L: Number(posteriorP_L.toFixed(4)),
    nextP_L: Number(boundedNextP_L.toFixed(4)),
  };
}

/**
 * Categorizes probability into cognitive mastery tiers.
 */
export function getCognitiveTier(pL: number, threshold = 0.85): {
  tier: 'Novice' | 'Developing' | 'Proficient' | 'Mastered';
  color: string;
  badgeClass: string;
} {
  if (pL >= threshold) {
    return {
      tier: 'Mastered',
      color: '#10b981', // green-500
      badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    };
  }
  if (pL >= 0.65) {
    return {
      tier: 'Proficient',
      color: '#3b82f6', // blue-500
      badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    };
  }
  if (pL >= 0.35) {
    return {
      tier: 'Developing',
      color: '#f59e0b', // amber-500
      badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    };
  }
  return {
    tier: 'Novice',
    color: '#ef4444', // red-500
    badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  };
}

/**
 * Calculates student learning velocity and struggle risk score (0 to 1).
 */
export function calculateStruggleRisk(mastery: StudentKCMastery): {
  riskScore: number;
  reason?: string;
} {
  if (mastery.totalAttempts < 3) {
    return { riskScore: 0.1 };
  }

  const successRate = mastery.correctAttempts / mastery.totalAttempts;
  const recentSteps = mastery.history.slice(-3);
  const recentFailures = recentSteps.filter(s => !s.correct).length;

  if (mastery.probabilityMastery < 0.40 && recentFailures >= 2) {
    return {
      riskScore: 0.85,
      reason: 'Repeated misconceptions detected in recent opportunities.',
    };
  }

  if (successRate < 0.45 && mastery.totalAttempts >= 5) {
    return {
      riskScore: 0.70,
      reason: 'Low overall transition rate despite multiple attempts.',
    };
  }

  return { riskScore: 0.15 };
}
