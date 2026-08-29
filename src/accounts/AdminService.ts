import { collection, doc, getDocs, deleteDoc, query, where, arrayRemove, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import type { Role, UserProfile } from './types'

export interface UserStats {
  total: number
  byRole: Record<Role, number>
  totalClassrooms: number
  totalTeams: number
}

/**
 * Reads the whole `users` collection client-side. Fine at the scale this
 * platform is at now; if the user base grows into the thousands this should
 * move to a scheduled Cloud Function that maintains a small counters doc
 * instead of counting on every admin page load.
 */
export async function fetchAllUsers(): Promise<UserProfile[]> {
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs.map((d) => d.data() as UserProfile)
}

export async function fetchStats(): Promise<UserStats> {
  const [usersSnap, classroomsSnap, teamsSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'classrooms')),
    getDocs(collection(db, 'teams')),
  ])

  const byRole: Record<Role, number> = { teacher: 0, student: 0, individual: 0 }
  usersSnap.forEach((d) => {
    const role = (d.data() as UserProfile).role
    if (role in byRole) byRole[role]++
  })

  return {
    total: usersSnap.size,
    byRole,
    totalClassrooms: classroomsSnap.size,
    totalTeams: teamsSnap.size,
  }
}

/**
 * Removes someone's access to the platform: pulls them out of every
 * classroom and team they're in, then deletes their Firestore profile.
 *
 * What this does NOT do — and cannot do from a browser, ever — is delete
 * their actual Firebase Auth login credential. That requires the Admin SDK
 * running server-side with a private service-account key, which is a
 * separate backend feature, not something this client app can safely hold.
 * After this runs, their account still technically "exists" for Firebase
 * Auth purposes, but the app will find no profile for them and treat them
 * as signed out of anything useful.
 *
 * Removing a teacher does NOT delete or reassign the classes they created —
 * those classes stay exactly as they are, just authored by a since-removed
 * account. Deleting a teacher's classes is a separate, more destructive
 * action and isn't bundled into this one on purpose.
 */
export async function removeUserAccess(target: UserProfile): Promise<void> {
  const batch = writeBatch(db)

  if (target.role !== 'teacher') {
    const [classroomsSnap, teamsSnap] = await Promise.all([
      getDocs(query(collection(db, 'classrooms'), where('studentIds', 'array-contains', target.uid))),
      getDocs(query(collection(db, 'teams'), where('memberUids', 'array-contains', target.uid))),
    ])
    classroomsSnap.forEach((d) => batch.update(d.ref, { studentIds: arrayRemove(target.uid) }))
    teamsSnap.forEach((d) => batch.update(d.ref, { memberUids: arrayRemove(target.uid) }))
  }

  await batch.commit()
  await deleteDoc(doc(db, 'users', target.uid))
}
