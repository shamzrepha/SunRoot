import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPromptCacheKey, normalizeMessages, PromptCache } from '../PromptCache'

describe('PromptCache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-18T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('normalizes whitespace and role casing deterministically', () => {
    const a = [
      { role: ' System ', content: 'Hello\r\n  world\t\there  ' },
      { role: 'USER', content: '  Explain   solar   panels ' },
    ]
    const b = [
      { role: 'system', content: 'Hello\n world here' },
      { role: 'user', content: 'Explain solar panels' },
    ]

    expect(normalizeMessages(a)).toEqual(normalizeMessages(b))
    expect(buildPromptCacheKey('flash', 'gemini-2.5-flash', a, 0.3)).toBe(
      buildPromptCacheKey('flash', 'gemini-2.5-flash', b, 0.3),
    )
  })

  it('separates cache keys across tier, model, temperature, maxTokens, and content', () => {
    const msgs = [{ role: 'user', content: 'What is hysteresis?' }]
    const k1 = buildPromptCacheKey('nano', 'gemini-2.5-flash-lite', msgs, 0.3)
    const k2 = buildPromptCacheKey('flash', 'gemini-2.5-flash-lite', msgs, 0.3)
    const k3 = buildPromptCacheKey('nano', 'gemini-2.5-flash', msgs, 0.3)
    const k4 = buildPromptCacheKey('nano', 'gemini-2.5-flash-lite', msgs, 0.7)
    const k5 = buildPromptCacheKey('nano', 'gemini-2.5-flash-lite', [{ role: 'user', content: 'What is voltage?' }], 0.3)
    const k6 = buildPromptCacheKey('nano', 'gemini-2.5-flash-lite', msgs, 0.3, 10)
    const k7 = buildPromptCacheKey('nano', 'gemini-2.5-flash-lite', msgs, 0.3, 3800)

    expect(new Set([k1, k2, k3, k4, k5, k6, k7]).size).toBe(7)
  })

  it('guards maxEntries and ttlMs against NaN and non-finite numbers', () => {
    const cache = new PromptCache({ maxEntries: Number.NaN, ttlMs: Number.NaN })
    const entry = {
      text: 'ok',
      model: 'gemini-2.5-flash',
      tier: 'flash' as const,
      promptTokens: 5,
      completionTokens: 5,
      totalTokens: 10,
      estimatedUsd: 0.00001,
    }

    for (let i = 0; i < 105; i++) {
      cache.set(`k-${i}`, entry)
    }
    expect(cache.getStats().size).toBe(100)
    expect(cache.get('k-0')).toBeNull()
    expect(cache.get('k-104')?.text).toBe('ok')
  })

  it('tracks hits, misses, hitRate, and estimatedSavedUsd', () => {
    const cache = new PromptCache({ ttlMs: 60_000, maxEntries: 10 })
    const key = buildPromptCacheKey('flash', 'gemini-2.5-flash', [{ role: 'user', content: 'Hi' }], 0.3)

    expect(cache.get(key)).toBeNull()
    cache.set(key, {
      text: 'Hello learner!',
      model: 'gemini-2.5-flash',
      tier: 'flash',
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      estimatedUsd: 0.000155,
    })

    const hit1 = cache.get(key)
    const hit2 = cache.get(key)
    expect(hit1?.text).toBe('Hello learner!')
    expect(hit2?.text).toBe('Hello learner!')

    const stats = cache.getStats()
    expect(stats.hits).toBe(2)
    expect(stats.misses).toBe(1)
    expect(stats.size).toBe(1)
    expect(stats.hitRate).toBeCloseTo(2 / 3)
    expect(stats.estimatedSavedUsd).toBeCloseTo(0.00031, 9)
  })

  it('expires entries after TTL', () => {
    const cache = new PromptCache({ ttlMs: 5_000, maxEntries: 10 })
    const key = 'ttl-test'
    cache.set(key, {
      text: 'Fresh',
      model: 'gemini-2.5-flash',
      tier: 'flash',
      promptTokens: 10,
      completionTokens: 10,
      totalTokens: 20,
      estimatedUsd: 0.00002,
    })

    vi.advanceTimersByTime(4_999)
    expect(cache.get(key)?.text).toBe('Fresh')

    vi.advanceTimersByTime(5_001)
    expect(cache.get(key)).toBeNull()
    expect(cache.getStats().size).toBe(0)
  })

  it('evicts least-recently-used entry when exceeding maxEntries', () => {
    const cache = new PromptCache({ ttlMs: 60_000, maxEntries: 2 })
    const entry = {
      text: 'ok',
      model: 'gemini-2.5-flash-lite',
      tier: 'nano' as const,
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      estimatedUsd: 0.00001,
    }

    cache.set('k1', { ...entry, text: 'one' })
    cache.set('k2', { ...entry, text: 'two' })
    // Touch k1 so k2 becomes the LRU entry
    expect(cache.get('k1')?.text).toBe('one')

    cache.set('k3', { ...entry, text: 'three' })
    expect(cache.get('k2')).toBeNull()
    expect(cache.get('k1')?.text).toBe('one')
    expect(cache.get('k3')?.text).toBe('three')

    cache.clear()
    expect(cache.getStats()).toEqual({
      hits: 0,
      misses: 0,
      size: 0,
      hitRate: 0,
      estimatedSavedUsd: 0,
    })
  })
})
