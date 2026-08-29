import { loadConfig } from './AIProvider'

export interface InsightResult {
  text: string
  error?: string
}

const SYSTEM_PROMPT =
  'You are an instructional coach helping a teacher interpret classroom performance data from a hands-on engineering-simulation course (students wire circuits, write control code, and keep a simulated solar-powered farm running). ' +
  'You will be given a summary of class-wide concept mastery and which students are struggling. ' +
  'Suggest 3-5 concrete, actionable teaching techniques or interventions, specific to the named concepts — not generic advice. ' +
  'Format as a short bullet list. Keep the whole reply under 200 words. No preamble, just the bullets.'

/**
 * Calls the same proxy/model the student tutor uses, but with a completely
 * different system prompt and no offline-rules fallback — a wrong answer
 * here should be visibly an error, not a plausible-looking guess.
 */
export async function generateTeachingRecommendations(summary: string): Promise<InsightResult> {
  const cfg = loadConfig()
  const url = cfg.proxyUrl || cfg.endpoint
  if (!url) return { text: '', error: 'No AI route configured.' }

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
          { role: 'user', content: summary },
        ],
        temperature: 0.4,
        max_tokens: 400,
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { text: '', error: `HTTP ${res.status}: ${body.slice(0, 160)}` }
    }

    const data = await res.json()
    const text: string | undefined = data?.choices?.[0]?.message?.content
    return text?.trim() ? { text: text.trim() } : { text: '', error: 'Empty response from the model.' }
  } catch (err: any) {
    return { text: '', error: err?.message ?? 'Request failed.' }
  }
}

const STUDENT_SYSTEM_PROMPT =
  'You are a supportive 1:1 tutor-coach advising a teacher about ONE specific student in a hands-on engineering-simulation course (students wire circuits, write control code, and keep a simulated solar-powered farm running). ' +
  'You will be given that student\u2019s per-concept mastery, recent right/wrong attempts, and how long they\u2019ve been stuck on things. ' +
  'Suggest 2-4 specific next steps the teacher could use with this individual student — what to reteach, what question to ask them, or what small task to assign next. Be concrete, referencing the actual concepts named. ' +
  'Keep the whole reply under 150 words. No preamble, just the suggestions as a short bullet list.'

/** Same idea as generateTeachingRecommendations, but focused on one student rather than the whole class. */
export async function generateStudentRecommendation(summary: string): Promise<InsightResult> {
  const cfg = loadConfig()
  const url = cfg.proxyUrl || cfg.endpoint
  if (!url) return { text: '', error: 'No AI route configured.' }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (!cfg.proxyUrl && cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: STUDENT_SYSTEM_PROMPT },
          { role: 'user', content: summary },
        ],
        temperature: 0.4,
        max_tokens: 320,
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { text: '', error: `HTTP ${res.status}: ${body.slice(0, 160)}` }
    }

    const data = await res.json()
    const text: string | undefined = data?.choices?.[0]?.message?.content
    return text?.trim() ? { text: text.trim() } : { text: '', error: 'Empty response from the model.' }
  } catch (err: any) {
    return { text: '', error: err?.message ?? 'Request failed.' }
  }
}
