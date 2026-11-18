// ---------------------------------------------------------------------------
// AIProvider
//
// Unified AI gateway with model-tier routing, deterministic prompt caching,
// token/cost telemetry, and offline local-rule degradation.
// ---------------------------------------------------------------------------

import { fullContext } from '../learning/ContextBuilder'
import { currentMode } from '../learning/LearningModes'
import { answerLocally } from './LocalAnswerer'
import { session } from '../accounts/Session'
import {
  routeModel,
  estimateCostUsd,
  estimateTokensFromChars,
  TIER_MODELS,
  type ModelTier,
  type AITaskKind,
} from './ModelRouter'
import { buildPromptCacheKey, promptCache } from './PromptCache'
import { recordAIUsage } from '../accounts/CostTelemetryService'

export type { ModelTier, AITaskKind }

export const PROXY_PATH = '/api/ask'

const STORE_KEY = 'sunroot.ai.config'

export interface AIConfig {
  endpoint: string
  model: string
  apiKey: string
  proxyUrl: string
}

const DEFAULTS: AIConfig = {
  endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  model: TIER_MODELS.flash,
  apiKey: '',
  proxyUrl: PROXY_PATH,
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AICompletionOptions {
  task?: AITaskKind
  tierOverride?: ModelTier
  maxTokens?: number
  temperature?: number
  bypassCache?: boolean
  labId?: string
}

export interface AIUsageRecord {
  uid: string | null
  task: AITaskKind
  tier: ModelTier
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedUsd: number
  cached: boolean
  latencyMs: number
  timestamp: string
}

export class AIHttpError extends Error {
  status: number
  body: string
  url: string
  model?: string

  constructor(status: number, body: string, url: string, model?: string) {
    super(`AI request failed (HTTP ${status}): ${body.slice(0, 150)}`)
    this.name = 'AIHttpError'
    this.status = status
    this.body = body
    this.url = url
    this.model = model
  }
}

export function loadConfig(): AIConfig {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export function normaliseProxyUrl(raw: string): string {
  const v = raw.trim()
  if (!v) return ''
  if (/^https?:\/\//i.test(v)) return v

  if (/netlify[\/\\]?functions?[\/\\]/i.test(v) || /^\/?\.?netlify/i.test(v)) {
    const name = v.replace(/\.js$/i, '').split(/[\/\\]/).filter(Boolean).pop() || 'ask'
    return `/.netlify/functions/${name}`
  }

  if (!v.includes('/')) return `/.netlify/functions/${v.replace(/\.js$/i, '')}`
  return v.startsWith('/') ? v : `/${v}`
}

export function saveConfig(c: Partial<AIConfig>) {
  const next = { ...loadConfig(), ...c }
  if (typeof next.proxyUrl === 'string') next.proxyUrl = normaliseProxyUrl(next.proxyUrl)
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(next))
  } catch {
    /* private browsing */
  }
}

let proxyReachable: boolean | null = null

export function isLiveAI(): boolean {
  const c = loadConfig()
  if (c.apiKey) return true
  return proxyReachable !== false
}

export function resetAIAvailability() {
  proxyReachable = null
  lastFailure = ''
}

export interface Turn {
  role: 'user' | 'assistant'
  content: string
}

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

function quiet(question: string, reason: string): string {
  void reason
  return answerLocally(question)
}

export interface AskResult {
  text: string
  source: 'model' | 'local'
  reason?: string
}

let lastFailure = ''
export function lastAIFailure(): string {
  return lastFailure
}

export async function callAICompletionWithMeta(
  messages: ChatMessage[],
  options: AICompletionOptions = {},
): Promise<{ text: string; usage: AIUsageRecord }> {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const cfg = loadConfig()
  const url = cfg.proxyUrl || cfg.endpoint
  if (!url) throw new Error('No AI endpoint configured.')

  const task: AITaskKind = options.task ?? 'chat'
  const temperature = options.temperature ?? 0.3
  const maxTokens =
    typeof options.maxTokens === 'number' && Number.isFinite(options.maxTokens)
      ? Math.max(1, Math.round(options.maxTokens))
      : 1200
  const promptChars = messages.reduce((sum, m) => sum + m.content.length, 0)
  const routed = routeModel(task, promptChars, options.tierOverride)
  const effectiveModel = routed.model
  const cacheKey = buildPromptCacheKey(routed.tier, effectiveModel, messages, temperature, maxTokens)

  if (!options.bypassCache) {
    const cached = promptCache.get(cacheKey)
    if (cached) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const usage: AIUsageRecord = {
        uid: session.user?.uid ?? null,
        task,
        tier: cached.tier,
        model: cached.model,
        promptTokens: cached.promptTokens,
        completionTokens: cached.completionTokens,
        totalTokens: cached.totalTokens,
        estimatedUsd: 0,
        cached: true,
        latencyMs: Math.max(0, Math.round(now - t0)),
        timestamp: new Date().toISOString(),
      }
      void recordAIUsage(usage).catch(() => {})
      return { text: cached.text, usage }
    }
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cfg.apiKey) {
    headers['x-gemini-key'] = cfg.apiKey
    if (!cfg.proxyUrl) headers.Authorization = `Bearer ${cfg.apiKey}`
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      tier: routed.tier,
      model: effectiveModel,
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(options.labId ? { labId: options.labId } : {}),
    }),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new AIHttpError(res.status, errBody, url, effectiveModel)
  }

  const data = await res.json()
  const rawContent: unknown = data?.choices?.[0]?.message?.content
  if (typeof rawContent !== 'string' || !rawContent.trim()) {
    throw new Error('Model returned empty response content.')
  }
  const text = rawContent.trim()

  const usedModel: string = data?.sunrootMeta?.model || data?.model || effectiveModel
  const promptTokens: number =
    data?.sunrootMeta?.promptTokens ??
    data?.usage?.prompt_tokens ??
    data?.usage?.promptTokenCount ??
    estimateTokensFromChars(promptChars)
  const completionTokens: number =
    data?.sunrootMeta?.completionTokens ??
    data?.usage?.completion_tokens ??
    data?.usage?.candidatesTokenCount ??
    estimateTokensFromChars(text.length)
  const totalTokens: number =
    data?.sunrootMeta?.totalTokens ??
    data?.usage?.total_tokens ??
    data?.usage?.totalTokenCount ??
    promptTokens + completionTokens
  const estimatedUsd: number =
    typeof data?.sunrootMeta?.estimatedUsd === 'number'
      ? data.sunrootMeta.estimatedUsd
      : estimateCostUsd(usedModel, promptTokens, completionTokens)

  if (!options.bypassCache) {
    promptCache.set(cacheKey, {
      text,
      model: usedModel,
      tier: routed.tier,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedUsd,
    })
  }

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const usage: AIUsageRecord = {
    uid: session.user?.uid ?? null,
    task,
    tier: routed.tier,
    model: usedModel,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedUsd,
    cached: false,
    latencyMs: Math.max(0, Math.round(now - t0)),
    timestamp: new Date().toISOString(),
  }

  void recordAIUsage(usage).catch(() => {})
  return { text, usage }
}

/** Ask the assistant a question. Never throws — it degrades to local rules. */
export async function ask(
  question: string,
  history: Turn[] = [],
  options: AICompletionOptions = {},
): Promise<AskResult> {
  const cfg = loadConfig()

  if ((!cfg.proxyUrl && !cfg.apiKey) || (!cfg.apiKey && proxyReachable === false)) {
    return { text: answerLocally(question), source: 'local', reason: lastFailure }
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt() },
    ...history.slice(-6),
    { role: 'user', content: question },
  ]

  try {
    lastFailure = ''
    const { text } = await callAICompletionWithMeta(messages, {
      task: options.task ?? 'chat',
      tierOverride: options.tierOverride,
      maxTokens: options.maxTokens ?? 320,
      temperature: options.temperature ?? 0.4,
      bypassCache: options.bypassCache,
      labId: options.labId,
    })
    proxyReachable = true
    return { text, source: 'model' }
  } catch (err) {
    if (err instanceof AIHttpError) {
      const detail =
        err.status === 401
          ? 'the API key was rejected (401). Check the key, or that it is set as GEMINI_API_KEY on the server.'
          : err.status === 404
            ? `nothing is listening at ${err.url} (404). If this is the Vercel proxy, check that /api/ask is deployed and accessible.`
            : err.status === 400
              ? `the request was rejected (400). The model name "${err.model || cfg.model}" may not exist at this endpoint. ${err.body.slice(0, 160)}`
              : err.status === 429
                ? 'rate limit reached (429). Wait a moment and try again.'
                : `HTTP ${err.status}. ${err.body.slice(0, 160)}`
      lastFailure = detail
      if (err.status === 404 && cfg.proxyUrl) proxyReachable = false
      return {
        text: quiet(question, detail),
        source: 'local',
        reason: detail,
      }
    }

    const message = (err as Error)?.message ?? 'unknown error'
    const detail = cfg.proxyUrl
      ? `the proxy at ${cfg.proxyUrl} could not be reached (${message}).`
      : `the request never completed (${message}).`
    lastFailure = detail
    if (cfg.proxyUrl && !cfg.apiKey) proxyReachable = false
    return { text: quiet(question, detail), source: 'local', reason: detail }
  }
}

/** General-purpose AI completion runner using either user Gemini key or server proxy. */
export async function callAICompletion(
  messages: ChatMessage[],
  maxTokens = 1200,
  temperature = 0.3,
  options: Omit<AICompletionOptions, 'maxTokens' | 'temperature'> = {},
): Promise<string> {
  const { text } = await callAICompletionWithMeta(messages, {
    ...options,
    maxTokens,
    temperature,
  })
  return text
}

/** Quick verification check to test whether Gemini is accessible with key */
export async function testGeminiConnection(keyToTest?: string): Promise<{ success: boolean; message: string }> {
  const cfg = loadConfig()
  const activeKey = keyToTest !== undefined ? keyToTest.trim() : cfg.apiKey
  const url = cfg.proxyUrl || cfg.endpoint
  const model = cfg.model || TIER_MODELS.flash

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (activeKey) {
    headers['x-gemini-key'] = activeKey
    if (!cfg.proxyUrl) headers.Authorization = `Bearer ${activeKey}`
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tier: 'flash',
        model,
        messages: [{ role: 'user', content: 'Respond with exactly: SunRoot AI Online' }],
        max_tokens: 30,
        temperature: 0.1,
      }),
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      return {
        success: false,
        message: `HTTP ${res.status}: ${errBody.slice(0, 120) || `Check that your Gemini key has access to ${model}.`}`,
      }
    }

    const data = await res.json()
    const reply = data?.choices?.[0]?.message?.content || 'Ready'
    return {
      success: true,
      message: `Connection verified! Model (${model}) replied: "${reply.trim()}"`,
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Network error reaching ${url}: ${err?.message || 'Failed to connect'}`,
    }
  }
}
