import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HELPERS_DIR = path.dirname(fileURLToPath(import.meta.url))
const CANDIDATE_ROOT = path.resolve(HELPERS_DIR, '..', '..', '..')
const PROJECT_ROOT = fs.existsSync(path.join(CANDIDATE_ROOT, 'package.json'))
  ? CANDIDATE_ROOT
  : process.cwd()

const DEFAULT_AI_ENV_KEYS = [
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GROQ_API_KEY',
  'OPENAI_API_KEY',
  'AI_ENDPOINT',
  'AI_MODEL',
] as const

let importSeq = 0

export type ProxyMockFetch = (
  url: string | URL | Request,
  init?: RequestInit,
) => Response | Promise<Response>

export interface ProxyInvokeOptions {
  method?: string
  httpMethod?: string
  url?: string
  headers?: Record<string, string>
  body?: unknown
  rawBody?: string
  env?: Record<string, string | undefined>
  isolateEnv?: boolean
  mockFetch?: ProxyMockFetch
}

export interface ProxyFetchCall {
  url: string
  method: string
  headers: Record<string, string>
  bodyText: string
  bodyJson: unknown
}

export interface ProxyInvokeResult<T = unknown> {
  status: number
  headers: Record<string, string>
  bodyText: string
  json: T | null
  fetchCalls: ProxyFetchCall[]
  config?: Record<string, unknown>
}

function headersToRecord(initHeaders?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {}
  if (!initHeaders) return out
  const h = new Headers(initHeaders)
  h.forEach((value, key) => {
    out[key.toLowerCase()] = value
  })
  return out
}

function defaultMockFetch(): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: 'Mock AI response' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  )
}

function normalizeResponseHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value
  })
  return out
}

async function invokeAskHandler<T>(
  relHandlerPath: string,
  defaultUrl: string,
  options: ProxyInvokeOptions = {},
): Promise<ProxyInvokeResult<T>> {
  const absPath = path.resolve(PROJECT_ROOT, relHandlerPath)
  if (!fs.existsSync(absPath)) {
    throw new Error(`Proxy handler not found at "${absPath}"`)
  }

  const isolateEnv = options.isolateEnv ?? true
  const envOverrides = options.env ?? {}
  const trackedKeys = new Set<string>(Object.keys(envOverrides))
  if (isolateEnv) {
    for (const k of DEFAULT_AI_ENV_KEYS) trackedKeys.add(k)
  }

  const envSnapshot = new Map<string, { existed: boolean; value: string | undefined }>()
  for (const key of trackedKeys) {
    envSnapshot.set(key, {
      existed: Object.prototype.hasOwnProperty.call(process.env, key),
      value: process.env[key],
    })
  }

  const prevFetch = globalThis.fetch
  const fetchCalls: ProxyFetchCall[] = []

  try {
    if (isolateEnv) {
      for (const key of DEFAULT_AI_ENV_KEYS) {
        delete process.env[key]
      }
    }

    for (const [key, val] of Object.entries(envOverrides)) {
      if (val === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = val
      }
    }

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const reqUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      const reqMethod = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
      const reqHeaders = headersToRecord(init?.headers ?? (input instanceof Request ? input.headers : undefined))
      let bodyText = ''
      if (typeof init?.body === 'string') {
        bodyText = init.body
      } else if (init?.body != null) {
        bodyText = String(init.body)
      }
      let bodyJson: unknown = null
      if (bodyText) {
        try {
          bodyJson = JSON.parse(bodyText)
        } catch {
          bodyJson = null
        }
      }

      fetchCalls.push({
        url: reqUrl,
        method: reqMethod,
        headers: reqHeaders,
        bodyText,
        bodyJson,
      })

      if (options.mockFetch) {
        return await options.mockFetch(input, init)
      }
      return defaultMockFetch()
    }) as typeof fetch

    const moduleUrl = `${pathToFileURL(absPath).href}?bust=${++importSeq}`
    const mod = (await import(/* @vite-ignore */ moduleUrl)) as {
      default?: (req: Request) => Promise<Response>
      config?: Record<string, unknown>
    }

    if (typeof mod.default !== 'function') {
      throw new Error(`Proxy module "${relHandlerPath}" does not export a default handler function.`)
    }

    const method = (options.method ?? options.httpMethod ?? 'POST').toUpperCase()
    const requestUrl = options.url ?? defaultUrl
    const headers = new Headers(options.headers ?? {})

    let requestBody: string | undefined
    if ('rawBody' in options && options.rawBody !== undefined) {
      requestBody = options.rawBody
    } else if ('body' in options) {
      if (options.body !== undefined) {
        requestBody = JSON.stringify(options.body)
      }
    } else if (method !== 'GET' && method !== 'HEAD') {
      requestBody = JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] })
    }

    if (requestBody !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json')
    }

    const requestInit: RequestInit = {
      method,
      headers,
      ...(requestBody !== undefined && method !== 'GET' && method !== 'HEAD'
        ? { body: requestBody }
        : {}),
    }

    const request = new Request(requestUrl, requestInit)
    const response = await mod.default(request)
    const bodyText = await response.text()
    let json: T | null = null
    if (bodyText) {
      try {
        json = JSON.parse(bodyText) as T
      } catch {
        json = null
      }
    }

    return {
      status: response.status,
      headers: normalizeResponseHeaders(response.headers),
      bodyText,
      json,
      fetchCalls,
      ...(mod.config ? { config: mod.config } : {}),
    }
  } finally {
    globalThis.fetch = prevFetch
    for (const [key, prev] of envSnapshot.entries()) {
      if (prev.existed && prev.value !== undefined) {
        process.env[key] = prev.value
      } else {
        delete process.env[key]
      }
    }
  }
}

export async function invokeVercelAsk<T = unknown>(
  reqOptions?: ProxyInvokeOptions,
): Promise<ProxyInvokeResult<T>> {
  return invokeAskHandler<T>('api/ask.js', 'https://sunroot.test/api/ask', reqOptions)
}

export async function invokeNetlifyAsk<T = unknown>(
  eventOptions?: ProxyInvokeOptions,
): Promise<ProxyInvokeResult<T>> {
  return invokeAskHandler<T>(
    'netlify/functions/ask.js',
    'https://sunroot.test/.netlify/functions/ask',
    eventOptions,
  )
}
