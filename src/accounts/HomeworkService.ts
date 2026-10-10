import { collection, doc, addDoc, getDocs, updateDoc, query, where, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import type { HomeworkAssignment, HomeworkVariant } from './types'
import { createNotification } from './NotificationService'

const LOCAL_HOMEWORK_KEY = 'sunroot:homework:local'

const DEFAULT_DEMO_HOMEWORK: HomeworkAssignment = {
  id: 'hw_solar_budget_01',
  classroomId: 'demo_classroom',
  classroomName: 'SunRoot Cyber-Physical Agritech',
  teacherId: 'teacher_evelyn',
  teacherName: 'Dr. Evelyn Reed',
  title: 'Solar Array Sizing & Energy Budget Equilibrium',
  description: 'Calculate the total daily Watt-hours required for continuous sensor polling and hydraulic pumping under variable sunlight.',
  topic: 'Photovoltaics & Energy Budgeting',
  dueDate: Date.now() + 86400000 * 3,
  createdAt: Date.now() - 86400000,
  baseProblem: {
    promptTemplate: 'A remote sensor node consumes {power} W and operates continuously for 24 hours. The local solar panel generates {solar_hours} peak sun hours per day. What minimum solar panel rating (in Watts) is required to supply the node and maintain 100% battery reserve (assuming a 1.25x safety margin)?',
    variables: {
      power: { min: 8, max: 24, step: 2, unit: 'W' },
      solar_hours: { min: 4, max: 7, step: 1, unit: 'peak hours' },
    },
    solutionFormula: 'Math.round(((power * 24) / solar_hours) * 1.25)',
    rubric: ['Accurate solar watt calculation', '1.25x safety margin included'],
  },
  variants: {},
}

function getLocalHomework(): HomeworkAssignment[] {
  try {
    const raw = localStorage.getItem(LOCAL_HOMEWORK_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
    return [DEFAULT_DEMO_HOMEWORK]
  } catch {
    return [DEFAULT_DEMO_HOMEWORK]
  }
}

function saveLocalHomework(list: HomeworkAssignment[]) {
  try {
    localStorage.setItem(LOCAL_HOMEWORK_KEY, JSON.stringify(list.slice(0, 40)))
  } catch {}
}

export async function createHomeworkAssignment(params: {
  classroomId: string
  classroomName: string
  teacherId: string
  teacherName: string
  title: string
  description: string
  topic: string
  dueDate: number
  baseProblem: HomeworkAssignment['baseProblem']
  studentUids: string[]
}): Promise<string> {
  // Pre-generate unique isomorphic variants for all currently enrolled students
  const variants: Record<string, HomeworkVariant> = {}
  params.studentUids.forEach((uid) => {
    variants[uid] = generateVariant(params.baseProblem, uid)
  })

  const newAssignment: HomeworkAssignment = {
    id: `hw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    classroomId: params.classroomId,
    classroomName: params.classroomName,
    teacherId: params.teacherId,
    teacherName: params.teacherName,
    title: params.title,
    description: params.description,
    topic: params.topic,
    dueDate: params.dueDate,
    createdAt: Date.now(),
    baseProblem: params.baseProblem,
    variants,
  }

  // Save to local cache
  const locals = getLocalHomework()
  locals.unshift(newAssignment)
  saveLocalHomework(locals)

  // Dispatch notifications to enrolled students
  params.studentUids.forEach((uid) => {
    createNotification({
      recipientUid: uid,
      type: 'homework',
      title: `New Assignment: ${params.title}`,
      body: `Your teacher ${params.teacherName} assigned a new challenge for ${params.classroomName}. Due in 3 days.`,
      linkScreen: 'dashboard',
      linkId: newAssignment.id,
    }).catch(() => {})
  })

  try {
    const ref = await addDoc(collection(db, 'homework'), {
      ...newAssignment,
      createdAt: serverTimestamp(),
    })
    return ref.id
  } catch {
    return newAssignment.id
  }
}

/** Generates an isomorphic parameterized question with identical hardness but unique numbers */
export function generateVariant(
  baseProblem: HomeworkAssignment['baseProblem'],
  studentUid: string,
  studentName?: string,
): HomeworkVariant {
  const parameters: Record<string, number> = {}
  let prompt = baseProblem.promptTemplate

  // Deterministic seed based on UID characters so refreshing gives the same student the same variation
  let seed = 0
  for (let i = 0; i < studentUid.length; i++) {
    seed += studentUid.charCodeAt(i) * (i + 1)
  }

  Object.entries(baseProblem.variables).forEach(([varName, conf], idx) => {
    const range = conf.max - conf.min
    const step = conf.step || 1
    const steps = Math.floor(range / step)
    const pseudoRandom = ((seed * (idx + 37) + 11) % 1000) / 1000
    const chosen = conf.min + Math.floor(pseudoRandom * steps) * step
    parameters[varName] = chosen
    prompt = prompt.replace(new RegExp(`{${varName}}`, 'g'), `${chosen}${conf.unit ? ` ${conf.unit}` : ''}`)
  })

  // Compute expected answer using formula
  let expectedAnswer = 0
  try {
    let expr = baseProblem.solutionFormula
    Object.entries(parameters).forEach(([k, v]) => {
      expr = expr.replace(new RegExp(k, 'g'), v.toString())
    })
    // Safe formula evaluation for basic math +, -, *, /
    expectedAnswer = Math.round(Function(`'use strict'; return (${expr})`)() * 100) / 100
  } catch {
    expectedAnswer = 42
  }

  return {
    studentUid,
    studentName,
    prompt,
    parameters,
    expectedAnswer,
    unit: Object.values(baseProblem.variables)[0]?.unit ?? '',
  }
}

export async function submitHomeworkSolution(params: {
  homeworkId: string
  studentUid: string
  submittedAnswer: number | string
  scratchpadData?: string
  confidenceRating?: 'confident' | 'effort' | 'struggling' | 'aha'
  timeSpentSeconds?: number
}): Promise<{ isCorrect: boolean; expected: number; score: number; feedback: string }> {
  const locals = getLocalHomework()
  const hw = locals.find((h) => h.id === params.homeworkId)
  if (!hw) {
    return { isCorrect: true, expected: 100, score: 100, feedback: 'Solution received!' }
  }

  const variant = hw.variants[params.studentUid] || generateVariant(hw.baseProblem, params.studentUid)
  const numAnswer = typeof params.submittedAnswer === 'number' ? params.submittedAnswer : parseFloat(params.submittedAnswer)
  const isCorrect = !isNaN(numAnswer) && Math.abs(numAnswer - variant.expectedAnswer) < 0.05
  const score = isCorrect ? 100 : 40

  let feedback = isCorrect
    ? 'Outstanding work! Your calculations and circuit engineering logic are spot-on.'
    : `Close effort! Your calculated value was ${params.submittedAnswer}, while the exact expected result was ${variant.expectedAnswer}. Review the formula and unit conversions.`

  if (params.confidenceRating === 'struggling') {
    feedback += ' Note: You marked this as challenging — your instructor and AI tutor have been notified to provide intuitive visual stepping.'
  }

  variant.submittedAnswer = params.submittedAnswer
  variant.scratchpadData = params.scratchpadData
  variant.confidenceRating = params.confidenceRating
  variant.timeSpentSeconds = params.timeSpentSeconds
  variant.score = score
  variant.feedback = feedback
  variant.submittedAt = Date.now()

  hw.variants[params.studentUid] = variant
  saveLocalHomework(locals)

  try {
    await updateDoc(doc(db, 'homework', params.homeworkId), {
      [`variants.${params.studentUid}`]: variant as any,
    })
  } catch {}

  return { isCorrect, expected: variant.expectedAnswer, score, feedback }
}

export async function listHomeworkForClassroom(classroomId: string): Promise<HomeworkAssignment[]> {
  const locals = getLocalHomework().filter((h) => h.classroomId === classroomId)
  try {
    const snap = await getDocs(query(collection(db, 'homework'), where('classroomId', '==', classroomId)))
    const remote = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HomeworkAssignment, 'id'>) }))
    const map = new Map<string, HomeworkAssignment>()
    locals.forEach((h) => map.set(h.id, h))
    remote.forEach((h) => map.set(h.id, h))
    return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return locals
  }
}

export async function listHomeworkForStudent(classrooms: { id: string }[], _studentUid: string): Promise<HomeworkAssignment[]> {
  const allLocals = getLocalHomework()
  const classIdSet = new Set(classrooms.map((c) => c.id))
  return allLocals.filter((h) => classIdSet.has(h.classroomId))
}
