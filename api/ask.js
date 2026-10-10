// ---------------------------------------------------------------------------
// Vercel serverless function: /api/ask
//
// Powered by Google Gemini (with fallbacks for Groq / OpenAI).
// Holds the API key server-side so it never reaches the browser.
//
// Set your key in the Vercel dashboard:
//   Project -> Settings -> Environment Variables -> Add
//     GEMINI_API_KEY = AIzaSy... (or GROQ_API_KEY = gsk_...)
// ---------------------------------------------------------------------------

export const config = { runtime: 'edge' }

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
const GEMINI_MODEL = 'gemini-1.5-flash'

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'openai/gpt-oss-120b'

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  const groqKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY
  const key = geminiKey || groqKey

  if (!key) {
    return new Response(
      JSON.stringify({
        error: 'No API key configured on the server. Please set GEMINI_API_KEY or GROQ_API_KEY in Vercel settings.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  let body
  try {
    body = await request.json()
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  // Determine endpoint and model
  let endpoint = process.env.AI_ENDPOINT
  let defaultModel = GEMINI_MODEL

  if (!endpoint) {
    if (geminiKey) {
      endpoint = GEMINI_ENDPOINT
      defaultModel = GEMINI_MODEL
    } else {
      endpoint = GROQ_ENDPOINT
      defaultModel = GROQ_MODEL
    }
  }

  // If user/caller passed a model that starts with openai/ but we are using Gemini, adapt to gemini-1.5-flash
  let requestedModel = body.model || process.env.AI_MODEL || defaultModel
  if (endpoint.includes('generativelanguage.googleapis.com') && requestedModel.startsWith('openai/')) {
    requestedModel = GEMINI_MODEL
  }

  const payload = {
    model: requestedModel,
    messages: Array.isArray(body.messages) ? body.messages.slice(-16) : [],
    temperature: typeof body.temperature === 'number' ? body.temperature : 0.4,
    max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : 1024,
  }

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    })

    const text = await upstream.text()
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Upstream request failed: ${err.message}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    )
  }
}

