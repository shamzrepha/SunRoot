import { doc, updateDoc } from 'firebase/firestore'
import { db } from './firebase'
import { session, refreshProfile } from './Session'
import type { UserProfile } from './types'

function getLocalDateString(d = new Date()): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getYesterdayDateString(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return getLocalDateString(d)
}

export interface StreakState {
  currentStreak: number
  longestStreak: number
  hasClockedInToday: boolean
  displayStreak: number
  statusText: string
  canClockIn: boolean
}

/**
 * Calculates genuine daily streak (Duolingo style):
 * The streak is strictly ZERO until the user clocks in / checks in each day.
 */
export function getStreakState(profile: UserProfile | null): StreakState {
  if (!profile) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      hasClockedInToday: false,
      displayStreak: 0,
      statusText: 'Log in to start your streak',
      canClockIn: false,
    }
  }

  const today = getLocalDateString()
  const yesterday = getYesterdayDateString()
  const s = profile.streak

  const lastDate = s?.lastClockInDate ?? ''
  const storedCurrent = s?.current ?? 0
  const storedLongest = s?.longest ?? 0

  if (lastDate === today) {
    // Already checked in today
    return {
      currentStreak: storedCurrent,
      longestStreak: Math.max(storedLongest, storedCurrent),
      hasClockedInToday: true,
      displayStreak: storedCurrent,
      statusText: `${storedCurrent}-day streak active today!`,
      canClockIn: false,
    }
  }

  // Not checked in today yet
  // If they checked in yesterday, their streak is pending continuation
  const potentialStreak = lastDate === yesterday ? storedCurrent + 1 : 1

  return {
    currentStreak: 0, // Stays at 0 until user clocks in today!
    longestStreak: storedLongest,
    hasClockedInToday: false,
    displayStreak: 0,
    statusText: lastDate === yesterday ? `Clock in today to reach ${potentialStreak} days!` : 'Clock in today to start a 1-day streak!',
    canClockIn: true,
  }
}

export async function clockInToday(): Promise<{ success: boolean; newStreak: number; bonusXp: number; message: string }> {
  const profile = session.profile
  if (!profile) return { success: false, newStreak: 0, bonusXp: 0, message: 'Please sign in first.' }

  const today = getLocalDateString()
  const yesterday = getYesterdayDateString()
  const s = profile.streak
  const lastDate = s?.lastClockInDate ?? ''

  if (lastDate === today) {
    return {
      success: true,
      newStreak: s?.current ?? 1,
      bonusXp: 0,
      message: `You are already clocked in for today! (${s?.current ?? 1}-day streak)`,
    }
  }

  const prevStreak = lastDate === yesterday ? s?.current ?? 0 : 0
  const newStreak = prevStreak + 1
  const longest = Math.max(newStreak, s?.longest ?? 0)
  const bonusXp = 25 + Math.min(100, newStreak * 5)

  try {
    const userRef = doc(db, 'users', profile.uid)
    await updateDoc(userRef, {
      streak: {
        current: newStreak,
        longest,
        lastClockInDate: today,
        lastClockInTimestamp: Date.now(),
      },
    })

    // Also update local session
    if (session.profile) {
      session.profile.streak = {
        current: newStreak,
        longest,
        lastClockInDate: today,
        lastClockInTimestamp: Date.now(),
      }
    }

    // Refresh profile in background
    refreshProfile().catch(() => {})

    // Dispatch custom event for immediate UI reaction
    window.dispatchEvent(new CustomEvent('sunroot:streak-updated', { detail: { newStreak, bonusXp } }))

    return {
      success: true,
      newStreak,
      bonusXp,
      message: `🔥 Clocked in! ${newStreak}-Day streak active! +${bonusXp} XP awarded.`,
    }
  } catch (err: any) {
    console.warn('Failed to persist streak to Firestore:', err)
    // Fallback to local session update
    if (session.profile) {
      session.profile.streak = {
        current: newStreak,
        longest,
        lastClockInDate: today,
        lastClockInTimestamp: Date.now(),
      }
    }
    window.dispatchEvent(new CustomEvent('sunroot:streak-updated', { detail: { newStreak, bonusXp } }))
    return {
      success: true,
      newStreak,
      bonusXp,
      message: `🔥 Clocked in! ${newStreak}-Day streak active!`,
    }
  }
}
