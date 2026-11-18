import { describe, expect, it } from 'vitest'
import {
  estimateCostUsd,
  estimateTokensFromChars,
  routeModel,
  TIER_MODELS,
  type AITaskKind,
} from '../ModelRouter'

describe('ModelRouter', () => {
  it('routes tasks to appropriate tiers and escalates by prompt length', () => {
    expect(routeModel('hint', 200)).toEqual({ tier: 'nano', model: TIER_MODELS.nano })
    expect(routeModel('hint', 7000)).toEqual({ tier: 'flash', model: TIER_MODELS.flash })

    expect(routeModel('chat', 500)).toEqual({ tier: 'nano', model: TIER_MODELS.nano })
    expect(routeModel('chat', 3000)).toEqual({ tier: 'flash', model: TIER_MODELS.flash })
    expect(routeModel('chat', 12000)).toEqual({ tier: 'pro', model: TIER_MODELS.pro })

    expect(routeModel('stuck-help', 800)).toEqual({ tier: 'nano', model: TIER_MODELS.nano })
    expect(routeModel('stuck-help', 4000)).toEqual({ tier: 'flash', model: TIER_MODELS.flash })
    expect(routeModel('stuck-help', 11000)).toEqual({ tier: 'pro', model: TIER_MODELS.pro })

    expect(routeModel('quiz', 1200)).toEqual({ tier: 'flash', model: TIER_MODELS.flash })
    expect(routeModel('quiz', 11000)).toEqual({ tier: 'pro', model: TIER_MODELS.pro })

    expect(routeModel('lab-coach', 1500)).toEqual({ tier: 'flash', model: TIER_MODELS.flash })
    expect(routeModel('lab-coach', 12000)).toEqual({ tier: 'pro', model: TIER_MODELS.pro })

    expect(routeModel('study-set', 4000)).toEqual({ tier: 'flash', model: TIER_MODELS.flash })
    expect(routeModel('study-set', 9000)).toEqual({ tier: 'pro', model: TIER_MODELS.pro })

    expect(routeModel('course-outline', 300)).toEqual({ tier: 'pro', model: TIER_MODELS.pro })
    expect(routeModel('assessment', 300)).toEqual({ tier: 'pro', model: TIER_MODELS.pro })
  })

  it('honors explicit tierOverride for any task', () => {
    const tasks: AITaskKind[] = [
      'chat',
      'hint',
      'stuck-help',
      'quiz',
      'study-set',
      'course-outline',
      'assessment',
      'lab-coach',
    ]

    for (const task of tasks) {
      expect(routeModel(task, 5000, 'nano')).toEqual({ tier: 'nano', model: TIER_MODELS.nano })
      expect(routeModel(task, 5000, 'flash')).toEqual({ tier: 'flash', model: TIER_MODELS.flash })
      expect(routeModel(task, 5000, 'pro')).toEqual({ tier: 'pro', model: TIER_MODELS.pro })
    }
  })

  it('estimates USD cost accurately for known and unknown models', () => {
    // gemini-2.5-flash: $0.30/1M input, $2.50/1M output
    expect(estimateCostUsd('gemini-2.5-flash', 1_000_000, 1_000_000)).toBeCloseTo(2.8, 6)
    expect(estimateCostUsd('gemini-2.5-flash-lite', 1_000_000, 1_000_000)).toBeCloseTo(0.5, 6)
    expect(estimateCostUsd('gemini-2.5-pro', 1_000_000, 1_000_000)).toBeCloseTo(11.25, 6)
    expect(estimateCostUsd('llama-3.1-8b-instant', 500_000, 500_000)).toBeCloseTo(0.065, 6)

    // Unknown model infers tier from name and clamps negatives to 0
    expect(estimateCostUsd('custom-mini-nano-v1', 1_000_000, 0)).toBeCloseTo(0.1, 6)
    expect(estimateCostUsd('custom-pro-v2', 1_000_000, 0)).toBeCloseTo(1.25, 6)
    expect(estimateCostUsd('gemini-2.5-flash', -500, -100)).toBe(0)
  })

  it('estimates tokens from character counts safely', () => {
    expect(estimateTokensFromChars(0)).toBe(0)
    expect(estimateTokensFromChars(-10)).toBe(0)
    expect(estimateTokensFromChars(1)).toBe(1)
    expect(estimateTokensFromChars(100)).toBe(25)
  })
})
