// ---------------------------------------------------------------------------
// AIProvider
//
// The assistant's brain. Two paths, in this order:
//
//   1. A real language model, if one is configured. Any OpenAI-compatible chat
//      endpoint works — Groq, OpenAI, a local Ollama, or a serverless function
//      of your own. Every request carries a live snapshot of the student's
//      bench and farm, so answers are about their circuit, not about circuits
//      in general.
//
//   2. A local answerer that reads the same snapshot and responds from rules.
//      It has no key, no network and no cost, and it is what runs in a
//      classroom with no internet. It is genuinely useful rather than a stub.
//
// On keys: anything stored in the browser is visible to anyone who opens the
// devtools on that machine. That is acceptable for a personal key on your own
// laptop and unacceptable for a shared deployment, so `proxyUrl` exists — point
// it at a serverless function that holds the key server-side and this file
// never sees a secret at all.
// ---------------------------------------------------------------------------

import { fullContext } from '../learning/ContextBuilder'

import { currentMode } from '../learning/LearningModes'
import { answerLocally } from './LocalAnswerer'

const STORE_KEY = 'sunroot.ai.config'

export interface AIConfig {
  /** OpenAI-compatible endpoint. Groq's is the default. */
  endpoint: string
  /** Model name at that endpoint. */
  model: string
  /** API key. Left blank when a proxy is used. */
  apiKey: string
  /**
   * A serverless endpoint that holds the key. When set, the key never enters
   * the browser and `apiKey` is ignored.
   */
  proxyUrl: string
}

const DEFAULTS: AIConfig = {
  endpoint: 'https://api.groq.com/openai/v1/chat/completions',
  model: 'llama-3.3-70b-versatile',
  apiKey: '',
 proxyUrl: '/.netlify/functions/ask',
}

export function loadConfig(): AIConfig {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveConfig(c: Partial<AIConfig>) {
  const next = { ...loadConfig(), ...c }
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(next))
  } catch {
    /* private browsing — the session still works, it just will not persist */
  }
}

export function isLiveAI(): boolean {
  const c = loadConfig()
  return !!(c.proxyUrl || c.apiKey)
}

export interface Turn {
  role: 'user' | 'assistant'
  content: string
}

/**
 * The system prompt. It carries the pedagogy, not just a persona: the model is
 * told the student's measured mastery and the current mode, and instructed to
 * match the depth the rest of the app would use. Without this the model would
 * hand out answers in Challenge mode and undo the whole design.
 */
function systemPrompt(): string {
  const mode = currentMode()
  return [
    'You are the field engineer in SunRoot, a browser simulation where a student designs a solar-powered irrigation system: choosing components, wiring them on a breadboard, programming control logic in Blockly, and deploying to a live farm digital twin.',
    '',
    'EVERYTHING YOU CAN SEE RIGHT NOW:',
    fullContext(),
    '',
    `TEACHING MODE: ${mode.label}. ${mode.blurb}`,
    modeInstruction(mode.id),
    '',
    'RULES:',
    '- Answer using the state above. Name their actual components, pins, prices and readings.',
    '- You can see which screen they are on. Advise for THAT screen: in the Tool Shed talk about what to buy and what it costs; on the bench talk about wires and pins; on the farm talk about what the telemetry is doing.',
    '- If they ask what to buy, give a concrete costed list from the catalogue above and total it against their budget.',
    '- Be brief. Two or three sentences unless they ask for detail.',
    '- Never invent readings, part names or pin numbers that are not in the state above.',
    '- If the state does not contain what you need, say so and tell them where to look.',
    '- Plain prose. No markdown headers, no bullet lists unless they ask for steps.',
  ]
    .filter(Boolean)
    .join('\n')
}

function modeInstruction(id: string): string {
  switch (id) {
    case 'learn':
      return 'Give direct, concrete instructions — name the exact pins to connect and explain why in one line.'
    case 'practice':
      return 'Point at the subsystem and the specific component at fault, but let them work out the fix.'
    case 'challenge':
      return 'Ask a Socratic question that leads them to the answer. Do not state the fix, however directly they ask.'
    case 'exam':
      return 'They are being assessed. Decline to help with the task itself; you may clarify what a control or term means, nothing more.'
    default:
      return ''
  }
}

export interface AskResult {
  text: string
  /** Whether a language model answered, or the offline rules did. */
  source: 'model' | 'local'
}

/** Ask the assistant a question. Never throws — it degrades to local rules. */
export async function ask(question: string, history: Turn[] = []): Promise<AskResult> {
  const cfg = loadConfig()

  if (!cfg.proxyUrl && !cfg.apiKey) {
    return { text: answerLocally(question), source: 'local' }
  }

  const messages = [
    { role: 'system', content: systemPrompt() },
    ...history.slice(-6),
    { role: 'user', content: question },
  ]

  try {
    const url = cfg.proxyUrl || cfg.endpoint
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    // A proxy holds its own credentials; only the direct path sends a key.
    if (!cfg.proxyUrl && cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: 0.4,
        max_tokens: 320,
      }),
    })

    if (!res.ok) {
      const detail = res.status === 401 ? 'the key was rejected' : `HTTP ${res.status}`
      return {
        text: `${answerLocally(question)}\n\n(Answered offline — ${detail}.)`,
        source: 'local',
      }
    }

    const data = await res.json()
    const text: string | undefined = data?.choices?.[0]?.message?.content
    if (!text) return { text: answerLocally(question), source: 'local' }

    return { text: text.trim(), source: 'model' }
  } catch {
    return {
      text: `${answerLocally(question)}\n\n(Answered offline — the model could not be reached.)`,
      source: 'local',
    }
  }
}
