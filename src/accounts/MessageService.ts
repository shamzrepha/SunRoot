import { collection, doc, addDoc, deleteDoc, updateDoc, getDocs, getDoc, setDoc, query, where, orderBy, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import type { ChatMessage, MessageReport } from './types'

function blockDocId(blockerUid: string, blockedUid: string): string {
  return `${blockerUid}_${blockedUid}`
}

export async function blockUser(blockerUid: string, blockedUid: string): Promise<void> {
  await setDoc(doc(db, 'blocks', blockDocId(blockerUid, blockedUid)), {
    blockerUid,
    blockedUid,
    createdAt: serverTimestamp(),
  })
}

export async function unblockUser(blockerUid: string, blockedUid: string): Promise<void> {
  await deleteDoc(doc(db, 'blocks', blockDocId(blockerUid, blockedUid)))
}

/** True if EITHER person has blocked the other — a mutual, symmetric check. */
export async function isBlockedEitherWay(uidA: string, uidB: string): Promise<boolean> {
  const [aBlockedB, bBlockedA] = await Promise.all([
    getDoc(doc(db, 'blocks', blockDocId(uidA, uidB))),
    getDoc(doc(db, 'blocks', blockDocId(uidB, uidA))),
  ])
  return aBlockedB.exists() || bBlockedA.exists()
}

export async function sendMessage(from: { uid: string; displayName: string }, to: { uid: string; displayName: string }, text: string): Promise<'sent' | 'blocked' | 'empty'> {
  const trimmed = text.trim().slice(0, 2000) // hard cap — this is chat, not a document
  if (!trimmed) return 'empty'

  if (await isBlockedEitherWay(from.uid, to.uid)) return 'blocked'

  await addDoc(collection(db, 'messages'), {
    fromUid: from.uid,
    fromName: from.displayName,
    toUid: to.uid,
    toName: to.displayName,
    text: trimmed,
    createdAt: serverTimestamp(),
  })
  return 'sent'
}

/**
 * Two narrowly-scoped queries merged client-side, same pattern as the
 * friend-request fix — a single query spanning both directions isn't
 * provable against the read rule, so it gets rejected outright rather than
 * silently filtered. Each query here pins either fromUid or toUid to the
 * caller's own uid, which the rule CAN verify.
 */
export async function listConversation(myUid: string, otherUid: string): Promise<ChatMessage[]> {
  const [sentByMe, sentToMe] = await Promise.all([
    getDocs(query(collection(db, 'messages'), where('fromUid', '==', myUid), where('toUid', '==', otherUid), orderBy('createdAt'))),
    getDocs(query(collection(db, 'messages'), where('fromUid', '==', otherUid), where('toUid', '==', myUid), orderBy('createdAt'))),
  ])
  const all = [...sentByMe.docs, ...sentToMe.docs].map((d) => {
    const data = d.data()
    return { id: d.id, ...(data as Omit<ChatMessage, 'id' | 'createdAt'>), createdAt: data.createdAt?.toMillis?.() ?? Date.now() }
  })
  return all.sort((a, b) => a.createdAt - b.createdAt)
}

export async function reportMessage(message: ChatMessage, reporter: { uid: string; displayName: string }, reason: string): Promise<void> {
  await addDoc(collection(db, 'messageReports'), {
    messageId: message.id,
    messageText: message.text,
    messageFrom: message.fromName,
    reporterUid: reporter.uid,
    reporterName: reporter.displayName,
    reason: reason.trim() || 'No reason given',
    status: 'new',
    createdAt: serverTimestamp(),
  })
}

// ---------------------------------------------------------------------------
// Admin moderation
// ---------------------------------------------------------------------------

export async function listMessageReports(): Promise<MessageReport[]> {
  const snap = await getDocs(collection(db, 'messageReports'))
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<MessageReport, 'id'>) }))
    .sort((a, b) => b.createdAt - a.createdAt)
}

export async function dismissReport(reportId: string): Promise<void> {
  await updateDoc(doc(db, 'messageReports', reportId), { status: 'reviewed' })
}

export async function removeReportedMessage(reportId: string, messageId: string): Promise<void> {
  await deleteDoc(doc(db, 'messages', messageId))
  await deleteDoc(doc(db, 'messageReports', reportId))
}
