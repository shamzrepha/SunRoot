import { collection, doc, addDoc, updateDoc, getDocs, query, where, orderBy, limit, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import type { FriendRequest, UserProfile } from './types'

export async function sendFriendRequest(from: { uid: string; displayName: string }, to: { uid: string; displayName: string }): Promise<'sent' | 'already_pending' | 'already_friends' | 'self'> {
  if (from.uid === to.uid) return 'self'

  // Two separate, narrowly-scoped queries instead of one `fromUid in [a, b]`
  // query — that single query wasn't provable against the read rule (it
  // could match a request the other person sent to some third party
  // entirely, which the rule correctly refuses to reveal), so Firestore
  // rejected the whole read with a permission error. Each query below only
  // ever matches documents where the current user is a legitimate party.
  const [sentByMe, sentToMe] = await Promise.all([
    getDocs(query(collection(db, 'friendRequests'), where('fromUid', '==', from.uid), where('toUid', '==', to.uid))),
    getDocs(query(collection(db, 'friendRequests'), where('fromUid', '==', to.uid), where('toUid', '==', from.uid))),
  ])
  const between = [...sentByMe.docs, ...sentToMe.docs].map((d) => ({ id: d.id, ...(d.data() as Omit<FriendRequest, 'id'>) }))

  if (between.some((r) => r.status === 'accepted')) return 'already_friends'
  if (between.some((r) => r.status === 'pending')) return 'already_pending'

  await addDoc(collection(db, 'friendRequests'), {
    fromUid: from.uid,
    fromName: from.displayName,
    toUid: to.uid,
    toName: to.displayName,
    status: 'pending',
    createdAt: serverTimestamp(),
  })
  return 'sent'
}

export async function respondToFriendRequest(requestId: string, accept: boolean): Promise<void> {
  await updateDoc(doc(db, 'friendRequests', requestId), {
    status: accept ? 'accepted' : 'declined',
    respondedAt: serverTimestamp(),
  })
}

export async function listIncomingRequests(uid: string): Promise<FriendRequest[]> {
  const snap = await getDocs(
    query(collection(db, 'friendRequests'), where('toUid', '==', uid), where('status', '==', 'pending')),
  )
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FriendRequest, 'id'>) }))
}

export async function listOutgoingRequests(uid: string): Promise<FriendRequest[]> {
  const snap = await getDocs(
    query(collection(db, 'friendRequests'), where('fromUid', '==', uid), where('status', '==', 'pending')),
  )
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FriendRequest, 'id'>) }))
}

/** Every uid this person is friends with — an accepted request in either direction counts. */
export async function listFriendUids(uid: string): Promise<string[]> {
  const [asFrom, asTo] = await Promise.all([
    getDocs(query(collection(db, 'friendRequests'), where('fromUid', '==', uid), where('status', '==', 'accepted'))),
    getDocs(query(collection(db, 'friendRequests'), where('toUid', '==', uid), where('status', '==', 'accepted'))),
  ])
  return [
    ...asFrom.docs.map((d) => (d.data() as FriendRequest).toUid),
    ...asTo.docs.map((d) => (d.data() as FriendRequest).fromUid),
  ]
}

/**
 * Prefix search on display name — Firestore has no full-text search, so this
 * is a range query, not a substring match. Good enough for "start typing a
 * name and find them," not a general search engine.
 */
export async function searchUsersByName(prefix: string, excludeUid: string): Promise<UserProfile[]> {
  const q = prefix.trim()
  if (!q) return []
  const snap = await getDocs(
    query(collection(db, 'users'), orderBy('displayName'), where('displayName', '>=', q), where('displayName', '<=', q + '\uf8ff'), limit(10)),
  )
  return snap.docs.map((d) => d.data() as UserProfile).filter((u) => u.uid !== excludeUid)
}
