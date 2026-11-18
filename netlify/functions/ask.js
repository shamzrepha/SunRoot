// ---------------------------------------------------------------------------
// Netlify function: /.netlify/functions/ask
//
// Holds the API key server-side so it never reaches the browser.
// Supports Google Gemini (via x-gemini-key / GEMINI_API_KEY) and Groq / OpenAI.
// ---------------------------------------------------------------------------

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'

const PROVIDER_TIERS = {
  gemini: {
    nano: 'gemini-2.5-flash-lite',
    flash: 'gemini-2.5-flash',
    pro: 'gemini-2.5-pro',
  },
  groq: {
    nano: 'llama-3.1-8b-instant',
    flash: 'openai/gpt-oss-120b',
    pro: 'llama-3.3-70b-versatile',
  },
}

const MODEL_PRICING = {
  'gemini-2.5-flash-lite': { inputPer1M: 0.1, outputPer1M: 0.4, tier: 'nano' },
  'gemini-2.5-flash': { inputPer1M: 0.3, outputPer1M: 2.5, tier: 'flash' },
  'gemini-2.5-pro': { inputPer1M: 1.25, outputPer1M: 10.0, tier: 'pro' },
  'gemini-1.5-flash-8b': { inputPer1M: 0.0375, outputPer1M: 0.15, tier: 'nano' },
  'gemini-1.5-flash': { inputPer1M: 0.075, outputPer1M: 0.3, tier: 'flash' },
  'gemini-1.5-pro': { inputPer1M: 1.25, outputPer1M: 5.0, tier: 'pro' },
  'gemini-2.0-flash-lite': { inputPer1M: 0.075, outputPer1M: 0.3, tier: 'nano' },
  'gemini-2.0-flash': { inputPer1M: 0.1, outputPer1M: 0.4, tier: 'flash' },
  'gemini-3.5-flash-lite': { inputPer1M: 0.25, outputPer1M: 1.5, tier: 'nano' },
  'gemini-3.8-flash': { inputPer1M: 0.75, outputPer1M: 3.75, tier: 'flash' },
  'llama-3.1-8b-instant': { inputPer1M: 0.05, outputPer1M: 0.08, tier: 'nano' },
  'openai/gpt-oss-120b': { inputPer1M: 0.15, outputPer1M: 0.6, tier: 'flash' },
  'llama-3.3-70b-versatile': { inputPer1M: 0.59, outputPer1M: 0.79, tier: 'pro' },
}

function inferTier(tierInput, modelInput) {
  if (tierInput === 'nano' || tierInput === 'flash' || tierInput === 'pro') {
    return tierInput
  }
  const lower = String(modelInput || '').trim().toLowerCase()
  const known = MODEL_PRICING[lower]
  if (known) return known.tier
  if (lower.includes('lite') || lower.includes('8b') || lower.includes('nano')) return 'nano'
  if (lower.includes('pro') || lower.includes('70b') || lower.includes('120b')) return 'pro'
  return 'flash'
}

function resolveModel(provider, bodyTier, bodyModel) {
  const tier = inferTier(bodyTier, bodyModel)
  const tierMap = PROVIDER_TIERS[provider] || PROVIDER_TIERS.gemini

  if (typeof bodyModel === 'string' && bodyModel.trim()) {
    const model = bodyModel.trim()
    if (provider === 'gemini') {
      if (model.startsWith('gemini-')) return { tier, model }
      if (/^(openai\/|llama-|mixtral-|gemma2-)/i.test(model)) {
        return { tier, model: tierMap[tier] }
      }
      return { tier, model }
    }
    if (provider === 'groq') {
      if (model.startsWith('gemini-')) {
        return { tier, model: tierMap[tier] }
      }
      return { tier, model }
    }
    return { tier, model }
  }

  if (bodyTier === 'nano' || bodyTier === 'flash' || bodyTier === 'pro') {
    return { tier, model: tierMap[tier] }
  }

  return { tier, model: process.env.AI_MODEL || tierMap.flash }
}

function estimateTextTokens(text) {
  if (!text || typeof text !== 'string') return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

function estimateMessagesTokens(messages) {
  if (!Array.isArray(messages)) return 0
  let chars = 0
  for (const m of messages) {
    if (m && typeof m.content === 'string') chars += m.content.length
  }
  return chars > 0 ? Math.max(1, Math.ceil(chars / 4)) : 0
}

function estimateUsd(model, tier, promptTokens, completionTokens) {
  const pricing =
    MODEL_PRICING[String(model || '').toLowerCase()] ||
    MODEL_PRICING[PROVIDER_TIERS.gemini[tier]] ||
    MODEL_PRICING['gemini-2.5-flash']
  const usd =
    (Math.max(0, promptTokens) * pricing.inputPer1M +
      Math.max(0, completionTokens) * pricing.outputPer1M) /
    1_000_000
  return Math.round(usd * 1_000_000_000) / 1_000_000_000
}

export default async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const authHeader = request.headers.get('authorization')
  const clientKey =
    request.headers.get('x-gemini-key') ||
    (authHeader?.startsWith('Bearer ') ? authHeader.replace(/^Bearer\s+/i, '').trim() : null)
  const geminiKey = clientKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  const groqKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY

  let endpoint = process.env.AI_ENDPOINT
  let provider = 'custom'
  if (endpoint) {
    if (endpoint.includes('generativelanguage.googleapis.com')) provider = 'gemini'
    else if (endpoint.includes('api.groq.com')) provider = 'groq'
  } else if (geminiKey) {
    endpoint = GEMINI_ENDPOINT
    provider = 'gemini'
  } else {
    endpoint = GROQ_ENDPOINT
    provider = 'groq'
  }

  const key =
    provider === 'groq'
      ? groqKey || geminiKey
      : provider === 'gemini'
        ? geminiKey || groqKey
        : clientKey || process.env.OPENAI_API_KEY || groqKey || geminiKey

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
    return new Response(JSON.stringify({ error: 'Invalid JSON request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return new Response(JSON.stringify({ error: 'Request body must be a JSON object' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { tier, model: requestedModel } = resolveModel(provider, body.tier, body.model)

  const payload = {
    model: requestedModel,
    messages: Array.isArray(body.messages) ? body.messages.slice(-16) : [],
    temperature:
      typeof body.temperature === 'number' ? Math.max(0, Math.min(2, body.temperature)) : 0.4,
    max_tokens:
      typeof body.max_tokens === 'number'
        ? Math.max(1, Math.min(8192, Math.round(body.max_tokens)))
        : 1024,
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
    if (!upstream.ok) {
      return new Response(text, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    let data
    try {
      data = JSON.parse(text)
    } catch {
      return new Response(text, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const replyContent = data?.choices?.[0]?.message?.content ?? ''
    const hasNativeUsage =
      data?.usage?.prompt_tokens != null || data?.usage?.promptTokenCount != null
    const prompt_tokens =
      data?.usage?.prompt_tokens ??
      data?.usage?.promptTokenCount ??
      estimateMessagesTokens(payload.messages)
    const completion_tokens =
      data?.usage?.completion_tokens ??
      data?.usage?.candidatesTokenCount ??
      estimateTextTokens(replyContent)
    const total_tokens =
      data?.usage?.total_tokens ?? data?.usage?.totalTokenCount ?? prompt_tokens + completion_tokens
    const estimatedUsd = estimateUsd(requestedModel, tier, prompt_tokens, completion_tokens)

    const enriched = {
      ...data,
      usage: {
        ...(data.usage || {}),
        prompt_tokens,
        completion_tokens,
        total_tokens,
      },
      sunrootMeta: {
        tier,
        model: requestedModel,
        provider,
        promptTokens: prompt_tokens,
        completionTokens: completion_tokens,
        totalTokens: total_tokens,
        estimatedUsd,
        usageEstimated: !hasNativeUsage,
      },
    }

    return new Response(JSON.stringify(enriched), {
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
