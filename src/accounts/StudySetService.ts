import { collection, doc, addDoc, deleteDoc, getDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import type { StudySet } from './types'

export async function createStudySet(params: {
  classroomId: string
  teacherId: string
  teacherName: string
  title: string
  sourceText: string
  notes: string
  flashcards: StudySet['flashcards']
  quiz: StudySet['quiz']
}): Promise<string> {
  const ref = await addDoc(collection(db, 'studySets'), {
    classroomId: params.classroomId,
    teacherId: params.teacherId,
    teacherName: params.teacherName,
    title: params.title,
    sourceText: params.sourceText,
    notes: params.notes,
    flashcards: params.flashcards,
    quiz: params.quiz,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function listStudySetsForClassroom(classroomId: string): Promise<StudySet[]> {
  const snap = await getDocs(query(collection(db, 'studySets'), where('classroomId', '==', classroomId)))
  return snap.docs
    .map((d) => {
      const data = d.data()
      return { id: d.id, ...(data as Omit<StudySet, 'id' | 'createdAt'>), createdAt: data.createdAt?.toMillis?.() ?? Date.now() }
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}

export async function getStudySet(id: string): Promise<StudySet | null> {
  const snap = await getDoc(doc(db, 'studySets', id))
  if (!snap.exists()) return null
  const data = snap.data()
  return { id: snap.id, ...(data as Omit<StudySet, 'id' | 'createdAt'>), createdAt: data.createdAt?.toMillis?.() ?? Date.now() }
}

export async function deleteStudySet(id: string): Promise<void> {
  await deleteDoc(doc(db, 'studySets', id))
}
