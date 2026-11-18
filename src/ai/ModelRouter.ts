export type ModelTier = 'nano' | 'flash' | 'pro'

export type AITaskKind =
  | 'chat'
  | 'hint'
  | 'stuck-help'
  | 'quiz'
  | 'study-set'
  | 'course-outline'
  | 'assessment'
  | 'lab-coach'

export interface ModelPricing {
  inputPer1M: number
  outputPer1M: number
  tier: ModelTier
}

export const TIER_MODELS: Record<ModelTier, string> = {
  nano: 'gemini-2.5-flash-lite',
  flash: 'gemini-2.5-flash',
  pro: 'gemini-2.5-pro',
}

export const MODEL_PRICING_USD_PER_1M: Record<string, ModelPricing> = {
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

export function inferModelTier(model: string): ModelTier {
  const lower = model.trim().toLowerCase()
  const known = MODEL_PRICING_USD_PER_1M[lower]
  if (known) return known.tier
  if (lower.includes('lite') || lower.includes('8b') || lower.includes('nano')) return 'nano'
  if (lower.includes('pro') || lower.includes('70b') || lower.includes('120b')) return 'pro'
  return 'flash'
}

export function getModelPricing(model: string): ModelPricing {
  const key = model.trim().toLowerCase()
  const exact = MODEL_PRICING_USD_PER_1M[key]
  if (exact) return exact
  const tier = inferModelTier(key)
  return MODEL_PRICING_USD_PER_1M[TIER_MODELS[tier]]
}

export function routeModel(
  task: AITaskKind,
  promptChars: number,
  override?: ModelTier,
): { tier: ModelTier; model: string } {
  if (override) {
    return { tier: override, model: TIER_MODELS[override] }
  }

  let tier: ModelTier = 'flash'
  switch (task) {
    case 'hint':
      tier = promptChars > 6000 ? 'flash' : 'nano'
      break
    case 'chat':
    case 'stuck-help':
      tier = promptChars > 10000 ? 'pro' : promptChars > 2500 ? 'flash' : 'nano'
      break
    case 'quiz':
    case 'lab-coach':
      tier = promptChars > 10000 ? 'pro' : 'flash'
      break
    case 'study-set':
      tier = promptChars > 8000 ? 'pro' : 'flash'
      break
    case 'course-outline':
    case 'assessment':
      tier = 'pro'
      break
  }

  return { tier, model: TIER_MODELS[tier] }
}

export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = getModelPricing(model)
  const inTokens = Number.isFinite(promptTokens) ? Math.max(0, promptTokens) : 0
  const outTokens = Number.isFinite(completionTokens) ? Math.max(0, completionTokens) : 0
  const usd = (inTokens * pricing.inputPer1M + outTokens * pricing.outputPer1M) / 1_000_000
  return Math.round(usd * 1_000_000_000) / 1_000_000_000
}

export function estimateTokensFromChars(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0
  return Math.max(1, Math.ceil(chars / 4))
}
