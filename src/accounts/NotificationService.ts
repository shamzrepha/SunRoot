import { collection, doc, addDoc, updateDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import type { ClassNotification } from './types'

const LOCAL_STORAGE_NOTIFS_KEY = 'sunroot:notifications:local'

function getLocalNotifs(): ClassNotification[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_NOTIFS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocalNotifs(notifs: ClassNotification[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_NOTIFS_KEY, JSON.stringify(notifs.slice(0, 50)))
  } catch {}
}

export async function createNotification(params: {
  recipientUid: string
  type: ClassNotification['type']
  title: string
  body: string
  linkScreen?: string
  linkId?: string
}): Promise<string> {
  const localNotif: ClassNotification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ...params,
    read: false,
    createdAt: Date.now(),
  }

  // Always store locally so UI is immediately reactive
  const locals = getLocalNotifs()
  locals.unshift(localNotif)
  saveLocalNotifs(locals)

  try {
    const ref = await addDoc(collection(db, 'notifications'), {
      ...params,
      read: false,
      createdAt: serverTimestamp(),
    })
    return ref.id
  } catch {
    return localNotif.id
  }
}

export async function listNotificationsForUser(uid: string): Promise<ClassNotification[]> {
  const locals = getLocalNotifs().filter((n) => n.recipientUid === uid)
  try {
    const snap = await getDocs(query(collection(db, 'notifications'), where('recipientUid', '==', uid)))
    const remote = snap.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        ...(data as Omit<ClassNotification, 'id' | 'createdAt'>),
        createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
      }
    })
    // Merge remote and local without duplicate IDs
    const mergedMap = new Map<string, ClassNotification>()
    locals.forEach((n) => mergedMap.set(n.id, n))
    remote.forEach((n) => mergedMap.set(n.id, n))
    return Array.from(mergedMap.values()).sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return locals
  }
}

export async function markNotificationAsRead(id: string): Promise<void> {
  const locals = getLocalNotifs()
  const found = locals.find((n) => n.id === id)
  if (found) {
    found.read = true
    saveLocalNotifs(locals)
  }
  try {
    await updateDoc(doc(db, 'notifications', id), { read: true })
  } catch {}
}
