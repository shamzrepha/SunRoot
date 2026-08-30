import { loadConfig } from './AIProvider'
import type { StudyFlashcard, StudyQuizQuestion } from '../accounts/types'

export interface StudySetGenerationResult {
  notes: string
  flashcards: StudyFlashcard[]
  quiz: StudyQuizQuestion[]
  error?: string
}

const SYSTEM_PROMPT =
  'You turn a teacher\u2019s raw course notes into a structured study set for their students. ' +
  'Given the notes below, respond with ONLY a valid JSON object (no markdown fences, no preamble, no commentary) in exactly this shape:\n' +
  '{"notes": "a well-organized markdown summary with headings and bullet points, covering everything in the source material", ' +
  '"flashcards": [{"question": "...", "answer": "..."}] (8 to 12 cards, each testing one specific fact or concept from the source), ' +
  '"quiz": [{"question": "...", "options": ["...","...","...","..."], "correctIndex": 0, "explanation": "why this answer is correct, referencing the source material"}] (5 to 8 multiple-choice questions, exactly 4 options each)}\n' +
  'Everything you generate must come directly from the provided notes \u2014 never invent facts that aren\u2019t in the source material. If the notes are too thin for the requested count of flashcards or quiz questions, generate fewer rather than inventing content.'

function tryParse(raw: string): { notes: string; flashcards: StudyFlashcard[]; quiz: StudyQuizQuestion[] } | null {
  try {
    // Models sometimes wrap JSON in a fenced code block despite instructions — strip it defensively.
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    const parsed = JSON.parse(cleaned)
    if (typeof parsed.notes !== 'string' || !Array.isArray(parsed.flashcards) || !Array.isArray(parsed.quiz)) return null
    return { notes: parsed.notes, flashcards: parsed.flashcards, quiz: parsed.quiz }
  } catch {
    return null
  }
}

export async function generateStudySet(sourceText: string): Promise<StudySetGenerationResult> {
  const cfg = loadConfig()
  const url = cfg.proxyUrl || cfg.endpoint
  if (!url) return { notes: '', flashcards: [], quiz: [], error: 'No AI route configured.' }

  const trimmedSource = sourceText.trim().slice(0, 12000) // keep the request reasonable in size
  if (!trimmedSource) return { notes: '', flashcards: [], quiz: [], error: 'No notes provided.' }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (!cfg.proxyUrl && cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: trimmedSource },
        ],
        temperature: 0.3,
        max_tokens: 3000,
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { notes: '', flashcards: [], quiz: [], error: `HTTP ${res.status}: ${body.slice(0, 160)}` }
    }

    const data = await res.json()
    const raw: string | undefined = data?.choices?.[0]?.message?.content
    if (!raw) return { notes: '', flashcards: [], quiz: [], error: 'Empty response from the model.' }

    const parsed = tryParse(raw)
    if (!parsed) return { notes: '', flashcards: [], quiz: [], error: 'The model\u2019s response wasn\u2019t valid \u2014 try again.' }

    return parsed
  } catch (err: any) {
    return { notes: '', flashcards: [], quiz: [], error: err?.message ?? 'Request failed.' }
  }
}
