import { loadConfig, callAICompletion } from './AIProvider'
import type { StudyFlashcard, StudyQuizQuestion, AudioOverviewDialog, HomeworkAssignment, CourseModule, DigitalTwinType } from '../accounts/types'

export interface StudySetGenerationResult {
  notes: string
  briefingDoc: string
  faq: Array<{ question: string; answer: string }>
  audioOverview: AudioOverviewDialog[]
  flashcards: StudyFlashcard[]
  quiz: StudyQuizQuestion[]
  error?: string
}

export interface CourseGenerationPackage {
  title: string
  description: string
  topic: string
  hasWorkshop: boolean
  twinType?: DigitalTwinType
  modules: CourseModule[]
  studySet: StudySetGenerationResult
}

const STUDY_SET_SYSTEM_PROMPT =
  'You are an expert educational AI and cognitive tutor in SunRoot Personal Study Lab. ' +
  'Given raw course notes, textbook excerpts, or lecture slides, you produce a comprehensive, grounded study package. ' +
  'Respond with ONLY a valid JSON object (no markdown code fences, no preamble) with exactly this structure:\n' +
  '{\n' +
  '  "notes": "structured markdown summary with headings, key takeaways, and bullet points",\n' +
  '  "briefingDoc": "a 2-3 paragraph executive briefing document highlighting the core principles and why they matter",\n' +
  '  "faq": [{"question": "...", "answer": "..."}] (4 to 6 most critical questions and answers grounded in the text),\n' +
  '  "audioOverview": [\n' +
  '    {"speaker": "Host (Alex)", "text": "...", "pitch": 1.1, "rate": 1.05},\n' +
  '    {"speaker": "Expert (Dr. Sam)", "text": "...", "pitch": 0.9, "rate": 0.95}\n' +
  '  ] (6 to 10 back-and-forth conversational dialog exchanges discussing and explaining the concepts engagingly),\n' +
  '  "flashcards": [{"question": "...", "answer": "..."}] (8 to 12 flashcards testing facts and terminology),\n' +
  '  "quiz": [{"question": "...", "options": ["...","...","...","..."], "correctIndex": 0, "explanation": "grounded explanation citing the source"}] (5 to 8 multiple-choice questions)\n' +
  '}\n' +
  'Rules: Everything must strictly ground in the provided text. Never hallucinate facts outside the material.'

const COURSE_OUTLINE_SYSTEM_PROMPT =
  'You are an expert university curriculum designer and AI professor in SunRoot. ' +
  'Given a course outline, syllabus, scheme of work, or topic notes, you synthesize a complete educational course and study package. ' +
  'Respond with ONLY a valid JSON object (no markdown code blocks, no preamble):\n' +
  '{\n' +
  '  "title": "Engaging course title",\n' +
  '  "description": "2-3 sentences explaining learning outcomes and real-world relevance",\n' +
  '  "topic": "Solar & Irrigation Systems",\n' +
  '  "hasWorkshop": true,\n' +
  '  "twinType": "agritech",\n' +
  '  "modules": [\n' +
  '    {"id": "mod-1", "title": "Module 1 Title", "description": "Scope and concepts", "durationMinutes": 45}\n' +
  '  ],\n' +
  '  "studySet": {\n' +
  '    "notes": "structured markdown study notes with headers and bullet points",\n' +
  '    "briefingDoc": "executive briefing summary",\n' +
  '    "faq": [{"question": "...", "answer": "..."}],\n' +
  '    "audioOverview": [\n' +
  '      {"speaker": "Host (Alex)", "text": "...", "pitch": 1.1, "rate": 1.05},\n' +
  '      {"speaker": "Expert (Dr. Sam)", "text": "...", "pitch": 0.9, "rate": 0.95}\n' +
  '    ],\n' +
  '    "flashcards": [{"question": "...", "answer": "..."}],\n' +
  '    "quiz": [{"question": "...", "options": ["...","...","...","..."], "correctIndex": 0, "explanation": "..."}]\n' +
  '  }\n' +
  '}'

function tryParseNotebook(raw: string): Omit<StudySetGenerationResult, 'error'> | null {
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    const parsed = JSON.parse(cleaned)
    if (typeof parsed.notes !== 'string' || !Array.isArray(parsed.flashcards) || !Array.isArray(parsed.quiz)) return null
    return {
      notes: parsed.notes,
      briefingDoc: typeof parsed.briefingDoc === 'string' ? parsed.briefingDoc : 'Executive summary of course material.',
      faq: Array.isArray(parsed.faq) ? parsed.faq : [],
      audioOverview: Array.isArray(parsed.audioOverview) ? parsed.audioOverview : [
        { speaker: 'Host (Alex)', text: 'Welcome to our deep dive on this topic!', pitch: 1.1, rate: 1.05 },
        { speaker: 'Expert (Dr. Sam)', text: 'Let us examine the core engineering principles covered in these notes.', pitch: 0.9, rate: 0.95 },
      ],
      flashcards: parsed.flashcards,
      quiz: parsed.quiz,
    }
  } catch {
    return null
  }
}

export async function generateStudySet(sourceText: string): Promise<StudySetGenerationResult> {
  const cfg = loadConfig()
  const url = cfg.proxyUrl || cfg.endpoint
  if (!url) return fallbackStudySet(sourceText, 'No AI route configured.')

  const trimmedSource = sourceText.trim().slice(0, 15000)
  if (!trimmedSource) return fallbackStudySet(sourceText, 'No notes provided.')

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (cfg.apiKey) {
      headers['x-gemini-key'] = cfg.apiKey
      if (!cfg.proxyUrl) headers.Authorization = `Bearer ${cfg.apiKey}`
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: STUDY_SET_SYSTEM_PROMPT },
          { role: 'user', content: trimmedSource },
        ],
        temperature: 0.3,
        max_tokens: 3800,
      }),
    })

    if (!res.ok) {
      return fallbackStudySet(trimmedSource, `HTTP ${res.status}`)
    }

    const data = await res.json()
    const raw: string | undefined = data?.choices?.[0]?.message?.content
    if (!raw) return fallbackStudySet(trimmedSource, 'Empty response from model.')

    const parsed = tryParseNotebook(raw)
    if (!parsed) return fallbackStudySet(trimmedSource, 'Invalid model JSON.')

    return parsed
  } catch (err: any) {
    return fallbackStudySet(trimmedSource, err?.message ?? 'Request failed.')
  }
}

export async function generateCourseFromOutline(outlineText: string): Promise<CourseGenerationPackage> {
  const trimmed = outlineText.trim().slice(0, 16000)
  if (!trimmed) {
    return fallbackCoursePackage('Untitled Course', 'No course outline provided.')
  }

  try {
    const raw = await callAICompletion(
      [
        { role: 'system', content: COURSE_OUTLINE_SYSTEM_PROMPT },
        { role: 'user', content: trimmed },
      ],
      4000,
      0.3,
    )

    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    const parsed = JSON.parse(cleaned)

    const title = typeof parsed.title === 'string' && parsed.title ? parsed.title : 'Custom Personal Course'
    const description = typeof parsed.description === 'string' ? parsed.description : 'Personal study curriculum generated from uploaded scheme of work.'
    const topic = typeof parsed.topic === 'string' ? parsed.topic : 'Solar & Irrigation Systems'
    const hasWorkshop = typeof parsed.hasWorkshop === 'boolean' ? parsed.hasWorkshop : false
    const twinType: DigitalTwinType | undefined = ['agritech', 'microgrid', 'robotics', 'hydraulics', 'iot_circuits'].includes(parsed.twinType) ? parsed.twinType : undefined

    const modules: CourseModule[] = Array.isArray(parsed.modules) && parsed.modules.length > 0
      ? parsed.modules.map((m: any, idx: number) => ({
          id: String(m.id || `mod-${idx + 1}`),
          title: String(m.title || `Module ${idx + 1}`),
          description: String(m.description || 'Module core content and objectives'),
          durationMinutes: typeof m.durationMinutes === 'number' ? m.durationMinutes : 45,
        }))
      : [
          { id: 'mod-1', title: 'Unit 1: Core Fundamentals & Principles', description: 'Foundations and primary theory', durationMinutes: 45 },
          { id: 'mod-2', title: 'Unit 2: Applied Analysis & Modeling', description: 'Parameter sizing and calculations', durationMinutes: 50 },
          { id: 'mod-3', title: 'Unit 3: Synthesis & Verification', description: 'Real-world problem solving and verification', durationMinutes: 60 },
        ]

    let studySet: StudySetGenerationResult
    if (parsed.studySet && Array.isArray(parsed.studySet.flashcards) && Array.isArray(parsed.studySet.quiz)) {
      studySet = {
        notes: String(parsed.studySet.notes || 'Curriculum notes generated by SunRoot AI.'),
        briefingDoc: String(parsed.studySet.briefingDoc || description),
        faq: Array.isArray(parsed.studySet.faq) ? parsed.studySet.faq : [],
        audioOverview: Array.isArray(parsed.studySet.audioOverview) ? parsed.studySet.audioOverview : [
          { speaker: 'Host (Alex)', text: `Welcome to our review of ${title}!`, pitch: 1.1, rate: 1.05 },
          { speaker: 'Expert (Dr. Sam)', text: 'Let us walk through the key concepts covered in this curriculum.', pitch: 0.9, rate: 0.95 },
        ],
        flashcards: parsed.studySet.flashcards,
        quiz: parsed.studySet.quiz,
      }
    } else {
      studySet = fallbackStudySet(trimmed, 'Generated from syllabus')
    }

    return {
      title,
      description,
      topic,
      hasWorkshop,
      twinType,
      modules,
      studySet,
    }
  } catch (err) {
    console.warn('AI course outline generation failed, falling back:', err)
    return fallbackCoursePackage(trimmed)
  }
}

function fallbackCoursePackage(sourceText: string, reason = ''): CourseGenerationPackage {
  const lines = sourceText.split('\n').map((l) => l.trim()).filter(Boolean)
  const title = lines[0]?.slice(0, 60) || 'Personal Study Course'
  const description = lines.length > 1 ? lines.slice(1, 3).join(' ') : 'Personal study curriculum generated from course outline.'

  // Heuristic topic detection
  const lower = sourceText.toLowerCase()
  let topic = 'General Engineering'
  let hasWorkshop = false
  let twinType: DigitalTwinType | undefined = undefined

  if (lower.includes('solar') || lower.includes('irrigation') || lower.includes('farm') || lower.includes('soil')) {
    topic = 'Solar & Irrigation Systems'
    hasWorkshop = true
    twinType = 'agritech'
  } else if (lower.includes('circuit') || lower.includes('breadboard') || lower.includes('logic') || lower.includes('arduino')) {
    topic = 'Virtual Breadboard & Circuitry'
    hasWorkshop = true
    twinType = 'iot_circuits'
  } else if (lower.includes('robot') || lower.includes('motor') || lower.includes('actuator')) {
    topic = 'Mechatronics & Robotics'
    hasWorkshop = true
    twinType = 'robotics'
  }

  const modules: CourseModule[] = lines.length >= 3
    ? lines.slice(0, 5).map((l, i) => ({
        id: `mod-${i + 1}`,
        title: l.length > 50 ? `${l.slice(0, 47)}...` : l,
        description: `Covers ${l} and associated engineering methods.`,
        durationMinutes: 45,
      }))
    : [
        { id: 'mod-1', title: 'Module 1: Principles and Theory', description: 'Core principles and definitions', durationMinutes: 40 },
        { id: 'mod-2', title: 'Module 2: Practical Analysis', description: 'Calculations and problem solving', durationMinutes: 50 },
        { id: 'mod-3', title: 'Module 3: Verification & Assessment', description: 'Flashcard mastery and quiz evaluation', durationMinutes: 45 },
      ]

  return {
    title,
    description,
    topic,
    hasWorkshop,
    twinType,
    modules,
    studySet: fallbackStudySet(sourceText, reason || 'Local synthesis'),
  }
}


/** Personal Study Lab Grounded Chat: Answers queries grounded strictly in provided notes */
export async function askSourceNotes(sourceText: string, query: string): Promise<{ answer: string; citations: string[] }> {
  const cfg = loadConfig()
  const url = cfg.proxyUrl || cfg.endpoint
  if (!url) {
    return {
      answer: `Based on your course notes: ${sourceText.slice(0, 180)}...`,
      citations: ['Source notes section 1'],
    }
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (!cfg.proxyUrl && cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`

    const prompt = `You are a Personal Study Lab grounded tutor. Answer the user's question using ONLY the provided course notes.\n\nCOURSE NOTES:\n${sourceText.slice(0, 10000)}\n\nUSER QUESTION: ${query}\n\nProvide a clear, pedagogical answer followed by direct quotes/citations from the notes.`
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 800,
      }),
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content ?? 'Unable to process query.'
    return {
      answer: content,
      citations: ['Uploaded Course Material'],
    }
  } catch {
    return {
      answer: `Direct lookup in notes regarding "${query}": The provided syllabus emphasizes core principles and practical verification.`,
      citations: ['Source Notes'],
    }
  }
}

/** Generates base problem template for isomorphic anti-cheat homework */
export async function generateBaseProblemFromTopic(topic: string, notes?: string): Promise<HomeworkAssignment['baseProblem']> {
  const cfg = loadConfig()
  const url = cfg.proxyUrl || cfg.endpoint

  const defaultProblem: HomeworkAssignment['baseProblem'] = {
    promptTemplate: 'A DC irrigation pump rated at {WATTS} W operates for {HOURS} hours daily. If peak sunlight provides {IRRADIANCE} hours of equivalent full sun, calculate the required solar PV generation capacity in Watts.',
    variables: {
      WATTS: { min: 40, max: 120, unit: 'W', step: 10 },
      HOURS: { min: 3, max: 8, unit: 'hours', step: 1 },
      IRRADIANCE: { min: 4, max: 6, unit: 'peak sun hours', step: 1 },
    },
    solutionFormula: '(WATTS * HOURS) / IRRADIANCE',
    rubric: [
      'Calculate daily total energy required in Watt-hours: E = Power × Time',
      'Divide total energy by peak sun hours: Capacity = E / PeakHours',
      'Verify unit consistency and round to nearest whole Watt.',
    ],
  }

  if (!url) return defaultProblem

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (!cfg.proxyUrl && cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`

    const prompt =
      `Create an isomorphic homework engineering problem template for the topic "${topic}".\n` +
      `Notes excerpt: ${(notes || '').slice(0, 1000)}\n` +
      `Respond ONLY with a JSON object:\n` +
      `{\n` +
      `  "promptTemplate": "problem statement with {VARIABLE_NAME} placeholders",\n` +
      `  "variables": {"VARIABLE_NAME": {"min": 10, "max": 100, "unit": "...", "step": 5}},\n` +
      `  "solutionFormula": "math expression using the variable names e.g. (A * B) / C",\n` +
      `  "rubric": ["step 1...", "step 2..."]\n` +
      `}`

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1200,
      }),
    })

    if (!res.ok) return defaultProblem
    const data = await res.json()
    const raw = data?.choices?.[0]?.message?.content
    if (!raw) return defaultProblem
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    const parsed = JSON.parse(cleaned)
    if (parsed.promptTemplate && parsed.variables && parsed.solutionFormula) return parsed
    return defaultProblem
  } catch {
    return defaultProblem
  }
}

function fallbackStudySet(sourceText: string, reason: string): StudySetGenerationResult {
  const lines = sourceText.split('\n').filter((l) => l.trim().length > 0)
  const title = lines[0]?.slice(0, 60) || 'Course Topic Summary'
  return {
    notes: `### ${title}\n\n${sourceText.slice(0, 1500)}\n\n*Note: Structured AI synthesis unavailable (${reason}); raw material formatted above.*`,
    briefingDoc: `This briefing document outlines the primary engineering principles from: ${title}. Key takeaways include foundational concepts, hardware constraints, and practical design implications.`,
    faq: [
      { question: 'What is the primary objective of this topic?', answer: 'To understand the fundamental principles and physical constraints governing system operation.' },
      { question: 'How is this verified in simulation?', answer: 'Through cyber-physical breadboard testing and closed-loop feedback telemetry.' },
    ],
    audioOverview: [
      { speaker: 'Host (Alex)', text: `Welcome! Today Dr. Sam and I are breaking down ${title}. What stands out most here, Sam?`, pitch: 1.1, rate: 1.05 },
      { speaker: 'Expert (Dr. Sam)', text: 'What stands out is how the theoretical calculations connect directly to physical constraints like power and signal integrity.', pitch: 0.9, rate: 0.95 },
      { speaker: 'Host (Alex)', text: 'Exactly. Let us look at how students apply this in practical bench design.', pitch: 1.1, rate: 1.05 },
      { speaker: 'Expert (Dr. Sam)', text: 'When students build the circuit, testing tolerances before deploying code prevents costly failures.', pitch: 0.9, rate: 0.95 },
    ],
    flashcards: [
      { question: `Key concept in ${title}`, answer: 'Referenced directly in source notes section 1.' },
      { question: 'Why is common grounding critical?', answer: 'To provide a shared reference voltage for all sensors and microcontrollers.' },
    ],
    quiz: [
      {
        question: `Which fundamental principle is highlighted in ${title}?`,
        options: ['Energy balance and grounding references', 'Random voltage fluctuation', 'Unconstrained current draw', 'Open loop control without feedback'],
        correctIndex: 0,
        explanation: 'Energy balance and reference grounding are essential for reliable cyber-physical system operation.',
      },
    ],
    error: reason,
  }
}
