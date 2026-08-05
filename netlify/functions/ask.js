// ---------------------------------------------------------------------------
// Netlify function: /.netlify/functions/ask
//
// Holds the API key server-side so it never reaches the browser. Point the
// assistant's "proxy URL" field at this path and leave the key field blank.
//
// Set the key once, in the Netlify dashboard:
//   Site settings -> Environment variables -> Add
//     GROQ_API_KEY = gsk_your_key_here
//
// It is never committed, never bundled, and never visible to a visitor.
// ---------------------------------------------------------------------------

const ENDPOINT = process.env.AI_ENDPOINT || 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = process.env.AI_MODEL || 'llama-3.3-70b-versatile'

export default async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const key = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY
  if (!key) {
    return new Response(
      JSON.stringify({ error: 'No API key configured on the server.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  let body
  try {
    body = await request.json()
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  // Only the fields we expect are forwarded, so a caller cannot smuggle
  // arbitrary parameters through to the upstream provider.
  const payload = {
    model: body.model || MODEL,
    messages: Array.isArray(body.messages) ? body.messages.slice(-12) : [],
    temperature: 0.4,
    max_tokens: 320,
  }

  try {
    const upstream = await fetch(ENDPOINT, {
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
