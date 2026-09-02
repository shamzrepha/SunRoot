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
import { session } from '../accounts/Session'

/**
 * Where the serverless function lives. Hardcoded on purpose: a student should
 * never configure anything, and the path is fixed by Netlify regardless of
 * where the file sits in the repository.
 *
 * The key is never here. It lives in the Netlify environment as GROQ_API_KEY
 * and is read by the function server-side, so nothing secret reaches the browser.
 */
export const PROXY_PATH = '/api/ask'

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
  model: 'openai/gpt-oss-120b',
  apiKey: '',
  // Always the deployed function. Overriding this is a developer action, not
  // something the interface asks anyone to do.
  proxyUrl: PROXY_PATH,
}

export function loadConfig(): AIConfig {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

/**
 * Accept the several things people reasonably type when they mean "the Netlify
 * function". The file path on disk and the URL Netlify serves it at are
 * different strings, and confusing them produces a 404 that looks like a
 * deployment failure rather than a typo.
 */
export function normaliseProxyUrl(raw: string): string {
  const v = raw.trim()
  if (!v) return ''

  // A full URL, or an explicitly absolute path the user clearly meant.
  if (/^https?:\/\//i.test(v)) return v

  // Anything that mentions a netlify function resolves to the canonical path.
  if (/netlify[\/\\]?functions?[\/\\]/i.test(v) || /^\/?\.?netlify/i.test(v)) {
    const name = v.replace(/\.js$/i, '').split(/[\/\\]/).filter(Boolean).pop() || 'ask'
    return `/.netlify/functions/${name}`
  }

  // A bare function name.
  if (!v.includes('/')) return `/.netlify/functions/${v.replace(/\.js$/i, '')}`

  // Some other path — make it root-relative so it is at least a valid request.
  return v.startsWith('/') ? v : `/${v}`
}

export function saveConfig(c: Partial<AIConfig>) {
  const next = { ...loadConfig(), ...c }
  if (typeof next.proxyUrl === 'string') next.proxyUrl = normaliseProxyUrl(next.proxyUrl)
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(next))
  } catch {
    /* private browsing — the session still works, it just will not persist */
  }
}

/**
 * Whether a model is reachable.
 *
 * Optimistic until proven otherwise: the proxy is assumed to exist, because on
 * the deployed site it does. One failed round trip flips this to false so the
 * assistant stops retrying a route that is not there — which is what happens on
 * a local dev server, where Netlify functions are not running.
 */
let proxyReachable: boolean | null = null

export function isLiveAI(): boolean {
  const c = loadConfig()
  if (c.apiKey) return true
  return proxyReachable !== false
}

/** Re-test a route that previously failed, e.g. after a deploy. */
export function resetAIAvailability() {
  proxyReachable = null
  lastFailure = ''
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
  const profile = session.profile
  const name = profile?.displayName ? profile.displayName.split(' ')[0] : 'student'
  const style = profile?.learningStyle
  let styleHint = ''
  if (style) {
    if (style.visual > 0.35) styleHint = 'Learner preference: VISUAL. Use spatial/layout mental models and describe diagrams.'
    else if (style.kinesthetic > 0.35) styleHint = 'Learner preference: KINESTHETIC. Encourage practical experimentation, dragging components, and tuning numbers.'
    else if (style.readingWriting > 0.35) styleHint = 'Learner preference: READING/WRITING. Reference concise datasheet facts and clear terminology.'
  }

  return [
    `You are the friendly, encouraging field engineer and AI tutor in SunRoot, speaking to ${name}. SunRoot is a gamified cyber-physical STEM learning platform where students design, wire, code, and simulate solar-powered irrigation digital twins in-browser.`,
    styleHint,
    '',
    'EVERYTHING YOU CAN SEE RIGHT NOW ON THE STUDENT BENCH AND SIMULATION:',
    fullContext(),
    '',
    `TEACHING MODE: ${mode.label}. ${mode.blurb}`,
    modeInstruction(mode.id),
    '',
    'RULES:',
    '- Answer using the state above. Name their actual components, pins, prices and live readings.',
    '- Advise for the screen they are on (Tool Shed: parts/budget; Circuit Lab: wires/common ground/logic levels; Coding: Blockly control loops; Farm: battery/soil moisture telemetry).',
    '- Be engaging, supportive, concise and pedagogically insightful. Two or three sentences unless they ask for detailed steps.',
    '- Never invent readings or pin numbers not in the state above.',
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

/**
 * The answer a student sees when the model is unreachable. It is the local
 * answer and nothing else — a child cannot act on "HTTP 404", and appending it
 * only makes a working assistant look broken. The reason is still returned for
 * the developer diagnostic.
 */
function quiet(question: string, reason: string): string {
  void reason
  return answerLocally(question)
}

export interface AskResult {
  text: string
  /** Whether a language model answered, or the offline rules did. */
  source: 'model' | 'local'
  /** Why the model was not used, when it was not. */
  reason?: string
}

/** The last failure, so the settings panel can explain itself. */
let lastFailure = ''
export function lastAIFailure(): string {
  return lastFailure
}

/** Ask the assistant a question. Never throws — it degrades to local rules. */
export async function ask(question: string, history: Turn[] = []): Promise<AskResult> {
  const cfg = loadConfig()

  // No route at all, or the only route is known to be missing.
  if ((!cfg.proxyUrl && !cfg.apiKey) || (!cfg.apiKey && proxyReachable === false)) {
    return { text: answerLocally(question), source: 'local', reason: lastFailure }
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

    lastFailure = ''
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
      const body = await res.text().catch(() => '')
      const detail =
        res.status === 401
          ? 'the API key was rejected (401). Check the key, or that it is set as GROQ_API_KEY on the server if you are using the proxy.'
          : res.status === 404
            ? `nothing is listening at ${url} (404). If this is the Netlify proxy, the function may not be deployed — check that netlify/functions/ask.js is committed and that netlify.toml has functions = "netlify/functions".`
            : res.status === 400
              ? `the request was rejected (400). The model name "${cfg.model}" may not exist at this endpoint. ${body.slice(0, 160)}`
              : res.status === 429
                ? 'rate limit reached (429). Wait a moment and try again.'
                : `HTTP ${res.status}. ${body.slice(0, 160)}`
      lastFailure = detail
      if (res.status === 404 && cfg.proxyUrl) proxyReachable = false
      return {
        text: quiet(question, detail),
        source: 'local',
        reason: detail,
      }
    }

    const data = await res.json()
    const text: string | undefined = data?.choices?.[0]?.message?.content
    if (!text) return { text: answerLocally(question), source: 'local' }

    proxyReachable = true
    return { text: text.trim(), source: 'model' }
  } catch (err) {
    // A browser fetch that fails outright is almost always CORS: most model
    // providers refuse requests sent straight from a web page, which is exactly
    // what the serverless proxy exists to avoid.
    const message = (err as Error)?.message ?? 'unknown error'
    const detail = cfg.proxyUrl
      ? `the proxy at ${cfg.proxyUrl} could not be reached (${message}). On a local dev server the Netlify function does not exist — it only works on the deployed site, or under "netlify dev".`
      : `the request never completed (${message}). This is usually CORS: browsers are blocked from calling model APIs directly. Use the proxy URL /.netlify/functions/ask instead of an API key.`
    lastFailure = detail
    if (cfg.proxyUrl && !cfg.apiKey) proxyReachable = false
    return { text: quiet(question, detail), source: 'local', reason: detail }
  }
}
