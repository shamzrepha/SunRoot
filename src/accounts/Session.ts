import type { User as FirebaseUser } from 'firebase/auth'
import type { UserProfile } from './types'
import { getUserProfile } from './AuthService'

export const session: { user: FirebaseUser | null; profile: UserProfile | null } = {
  user: null,
  profile: null,
}

export async function refreshProfile(): Promise<void> {
  if (!session.user) {
    session.profile = null
    return
  }
  session.profile = await getUserProfile(session.user.uid)
}
