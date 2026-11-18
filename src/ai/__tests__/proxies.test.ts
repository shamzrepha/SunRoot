// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error JS edge handler without .d.ts
import vercelHandler from '../../../api/ask.js'
// @ts-expect-error JS netlify handler without .d.ts
import netlifyHandler from '../../../netlify/functions/ask.js'

const ORIGINAL_ENV = { ...process.env }

function makeReq(body: unknown, headers: Record<string, string> = {}, method = 'POST'): Request {
  return new Request('https://sunroot.local/api/ask', {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  })
}

describe('AI Serverless Proxies (api/ask.js & netlify/functions/ask.js)', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    delete process.env.GEMINI_API_KEY
    delete process.env.GOOGLE_API_KEY
    delete process.env.GROQ_API_KEY
    delete process.env.OPENAI_API_KEY
    delete process.env.AI_ENDPOINT
    delete process.env.AI_MODEL
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
  })

  it.each([
    ['Vercel', vercelHandler],
    ['Netlify', netlifyHandler],
  ])('%s rejects non-POST, missing keys, invalid JSON, and null/non-object JSON bodies', async (_name, handler) => {
    const methodRes = await handler(makeReq({}, {}, 'GET'))
    expect(methodRes.status).toBe(405)

    const noKeyRes = await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }))
    expect(noKeyRes.status).toBe(500)

    const badJsonRes = await handler(makeReq('{invalid', { 'x-gemini-key': 'AIzaSyTest' }))
    expect(badJsonRes.status).toBe(400)

    for (const rawBody of ['null', '123', '"str"', 'true', '[]']) {
      const nonObjRes = await handler(makeReq(rawBody, { 'x-gemini-key': 'AIzaSyTest' }))
      expect(nonObjRes.status).toBe(400)
      const errJson = await nonObjRes.json()
      expect(errJson.error).toBe('Request body must be a JSON object')
    }
  })

  it.each([
    ['Vercel', vercelHandler],
    ['Netlify', netlifyHandler],
  ])('%s maps openai/gpt-oss-120b without tier to flash on Gemini and uses GROQ_API_KEY when AI_ENDPOINT is Groq', async (_name, handler) => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'ok' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    // 1. Cross-provider inferTier: openai/gpt-oss-120b -> flash -> gemini-2.5-flash
    const geminiRes = await handler(
      makeReq(
        { model: 'openai/gpt-oss-120b', messages: [{ role: 'user', content: 'hi' }] },
        { 'x-gemini-key': 'AIzaSyClientKey' },
      ),
    )
    expect(geminiRes.status).toBe(200)
    const geminiForwarded = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(geminiForwarded.model).toBe('gemini-2.5-flash')
    const geminiJson = await geminiRes.json()
    expect(geminiJson.sunrootMeta.tier).toBe('flash')

    // 2. Groq AI_ENDPOINT with both GEMINI_API_KEY and GROQ_API_KEY in env sends GROQ_API_KEY
    process.env.AI_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
    process.env.GEMINI_API_KEY = 'gemini_secret'
    process.env.GROQ_API_KEY = 'groq_secret'
    const groqRes = await handler(
      makeReq({ tier: 'flash', messages: [{ role: 'user', content: 'hi' }] }),
    )
    expect(groqRes.status).toBe(200)
    const [groqEndpoint, groqInit] = fetchMock.mock.calls[1]
    expect(String(groqEndpoint)).toContain('api.groq.com')
    const groqHeaders = groqInit?.headers as Record<string, string>
    expect(groqHeaders.Authorization).toBe('Bearer groq_secret')
    const groqJson = await groqRes.json()
    expect(groqJson.sunrootMeta.provider).toBe('groq')
    expect(groqJson.sunrootMeta.model).toBe('openai/gpt-oss-120b')

    // 3. Custom AI_ENDPOINT aligns fallback tierMap and honors AI_MODEL / explicit body.model
    process.env.AI_ENDPOINT = 'https://custom-llm.local/v1/chat/completions'
    process.env.OPENAI_API_KEY = 'custom_secret'
    const customTierRes = await handler(
      makeReq({ tier: 'nano', messages: [{ role: 'user', content: 'hi' }] }),
    )
    expect(customTierRes.status).toBe(200)
    const customTierJson = await customTierRes.json()
    expect(customTierJson.sunrootMeta.provider).toBe('custom')
    expect(customTierJson.sunrootMeta.model).toBe('gemini-2.5-flash-lite')

    process.env.AI_MODEL = 'custom-env-model'
    const customEnvModelRes = await handler(
      makeReq({ messages: [{ role: 'user', content: 'hi' }] }),
    )
    const customEnvModelJson = await customEnvModelRes.json()
    expect(customEnvModelJson.sunrootMeta.model).toBe('custom-env-model')
  })

  it.each([
    ['Vercel', vercelHandler],
    ['Netlify', netlifyHandler],
  ])('%s forwards Gemini model/tier, honors max_tokens > 320, and returns usage + sunrootMeta', async (_name, handler) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Generated study package response' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const res = await handler(
      makeReq(
        {
          tier: 'pro',
          model: 'gemini-2.5-pro',
          messages: [{ role: 'user', content: 'Generate a detailed solar engineering curriculum.' }],
          max_tokens: 3800,
          temperature: 0.3,
        },
        { 'x-gemini-key': 'AIzaSyClientKey' },
      ),
    )

    expect(res.status).toBe(200)
    const [endpoint, init] = fetchMock.mock.calls[0]
    expect(String(endpoint)).toContain('generativelanguage.googleapis.com')
    const forwarded = JSON.parse(String(init?.body))
    expect(forwarded.model).toBe('gemini-2.5-pro')
    expect(forwarded.max_tokens).toBe(3800)

    const json = await res.json()
    expect(json.choices[0].message.content).toBe('Generated study package response')
    expect(json.usage.prompt_tokens).toBeGreaterThan(0)
    expect(json.usage.completion_tokens).toBeGreaterThan(0)
    expect(json.usage.total_tokens).toBe(json.usage.prompt_tokens + json.usage.completion_tokens)
    expect(json.sunrootMeta.tier).toBe('pro')
    expect(json.sunrootMeta.model).toBe('gemini-2.5-pro')
    expect(json.sunrootMeta.usageEstimated).toBe(true)
    expect(json.sunrootMeta.estimatedUsd).toBeGreaterThan(0)
  })

  it.each([
    ['Vercel', vercelHandler],
    ['Netlify', netlifyHandler],
  ])('%s adapts cross-provider models cleanly and preserves native upstream usage', async (_name, handler) => {
    process.env.GROQ_API_KEY = 'gsk_test_key'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Groq reply' } }],
          usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const res = await handler(
      makeReq({
        tier: 'nano',
        model: 'gemini-2.5-flash-lite',
        messages: [{ role: 'user', content: 'Quick hint' }],
        max_tokens: 4000,
      }),
    )

    expect(res.status).toBe(200)
    const [endpoint, init] = fetchMock.mock.calls[0]
    expect(String(endpoint)).toContain('api.groq.com')
    const forwarded = JSON.parse(String(init?.body))
    expect(forwarded.model).toBe('llama-3.1-8b-instant')
    expect(forwarded.max_tokens).toBe(4000)

    const json = await res.json()
    expect(json.sunrootMeta.provider).toBe('groq')
    expect(json.sunrootMeta.usageEstimated).toBe(false)
    expect(json.sunrootMeta.promptTokens).toBe(200)
    expect(json.sunrootMeta.completionTokens).toBe(100)
    expect(json.sunrootMeta.estimatedUsd).toBeCloseTo(0.000018, 9)
  })
})
