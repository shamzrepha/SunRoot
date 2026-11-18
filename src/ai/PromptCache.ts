import type { ModelTier } from './ModelRouter'

export interface PromptCacheEntry {
  text: string
  model: string
  tier: ModelTier
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedUsd: number
  createdAt: number
  ttlMs: number
}

export interface PromptCacheStats {
  hits: number
  misses: number
  size: number
  hitRate: number
  estimatedSavedUsd: number
}

export interface PromptCacheOptions {
  ttlMs?: number
  maxEntries?: number
}

const DEFAULT_TTL_MS = 5 * 60 * 1000
const DEFAULT_MAX_ENTRIES = 100

export function normalizeMessages(
  messages: ReadonlyArray<{ role: string; content: string }>,
): Array<{ role: string; content: string }> {
  return messages.map((m) => ({
    role: m.role.trim().toLowerCase(),
    content: m.content.replace(/\r\n/g, '\n').trim().replace(/[ \t]+/g, ' '),
  }))
}

function fnv1a32(input: string, seed: number): string {
  let hash = seed >>> 0
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function buildPromptCacheKey(
  tier: ModelTier,
  model: string,
  messages: ReadonlyArray<{ role: string; content: string }>,
  temperature = 0.3,
  maxTokens?: number,
): string {
  const normalized = normalizeMessages(messages)
  const temp = Number.isFinite(temperature) ? Number(temperature.toFixed(3)) : 0.3
  const maxTok =
    typeof maxTokens === 'number' && Number.isFinite(maxTokens)
      ? Math.max(1, Math.round(maxTokens))
      : 'default'
  const canonical = `${tier}|${model}|${temp}|${maxTok}|${JSON.stringify(normalized)}`
  const h1 = fnv1a32(canonical, 0x811c9dc5)
  const h2 = fnv1a32(canonical, 0x9e3779b9)
  return `${tier}:${model}:${h1}${h2}`
}

export class PromptCache {
  private entries = new Map<string, PromptCacheEntry>()
  private defaultTtlMs: number
  private maxEntries: number
  private hits = 0
  private misses = 0
  private estimatedSavedUsd = 0

  constructor(options: PromptCacheOptions = {}) {
    this.defaultTtlMs =
      typeof options?.ttlMs === 'number' && Number.isFinite(options.ttlMs)
        ? Math.max(0, options.ttlMs)
        : DEFAULT_TTL_MS
    this.maxEntries =
      typeof options?.maxEntries === 'number' && Number.isFinite(options.maxEntries)
        ? Math.floor(options.maxEntries)
        : DEFAULT_MAX_ENTRIES
  }

  private pruneExpired(now = Date.now()): void {
    for (const [key, entry] of this.entries.entries()) {
      if (now - entry.createdAt > entry.ttlMs) {
        this.entries.delete(key)
      }
    }
  }

  get(key: string): PromptCacheEntry | null {
    const entry = this.entries.get(key)
    if (!entry) {
      this.misses++
      return null
    }
    if (Date.now() - entry.createdAt > entry.ttlMs) {
      this.entries.delete(key)
      this.misses++
      return null
    }
    this.entries.delete(key)
    this.entries.set(key, entry)
    this.hits++
    this.estimatedSavedUsd += entry.estimatedUsd
    return entry
  }

  set(
    key: string,
    value: Omit<PromptCacheEntry, 'createdAt' | 'ttlMs'>,
    ttlMsOverride?: number,
  ): void {
    if (this.maxEntries <= 0) return
    if (this.entries.has(key)) {
      this.entries.delete(key)
    }
    while (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value
      if (oldestKey === undefined) break
      this.entries.delete(oldestKey)
    }
    this.entries.set(key, {
      ...value,
      createdAt: Date.now(),
      ttlMs:
        typeof ttlMsOverride === 'number' && Number.isFinite(ttlMsOverride)
          ? Math.max(0, ttlMsOverride)
          : this.defaultTtlMs,
    })
  }

  delete(key: string): boolean {
    return this.entries.delete(key)
  }

  clear(): void {
    this.entries.clear()
    this.hits = 0
    this.misses = 0
    this.estimatedSavedUsd = 0
  }

  getStats(): PromptCacheStats {
    this.pruneExpired()
    const total = this.hits + this.misses
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.entries.size,
      hitRate: total > 0 ? this.hits / total : 0,
      estimatedSavedUsd: Math.round(this.estimatedSavedUsd * 1_000_000_000) / 1_000_000_000,
    }
  }
}

export const promptCache = new PromptCache()
