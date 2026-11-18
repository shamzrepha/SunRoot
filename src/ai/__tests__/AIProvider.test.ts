import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearLocalUsageLogs, getRecentUsageLogs, getUsageSummary } from '../../accounts/CostTelemetryService'
import { assess } from '../../learning/AIAssessor'
import { ask, callAICompletionWithMeta, resetAIAvailability, saveConfig } from '../AIProvider'
import { promptCache } from '../PromptCache'
import {
  askSourceNotes,
  generateBaseProblemFromTopic,
  generateCourseFromOutline,
  generateStudySet,
} from '../StudySetGenerator'
import { generateStudentRecommendation, generateTeachingRecommendations } from '../TeachingInsights'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('AIProvider gateway, callers & CostTelemetryService', () => {
  beforeEach(() => {
    localStorage.clear()
    clearLocalUsageLogs()
    promptCache.clear()
    resetAIAvailability()
    saveConfig({ apiKey: 'AIzaSyTestUserKey123', proxyUrl: '/api/ask', model: 'gemini-2.5-flash' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('forwards x-gemini-key, tier, and model, hits PromptCache on repeat, and logs cost telemetry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: 'Connect LDR to pin A0 and ground.' } }],
        usage: { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 },
        sunrootMeta: {
          tier: 'nano',
          model: 'gemini-2.5-flash-lite',
          promptTokens: 120,
          completionTokens: 40,
          totalTokens: 160,
          estimatedUsd: 0.000028,
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const messages = [{ role: 'user' as const, content: 'Give me a quick hint about LDR wiring.' }]
    const first = await callAICompletionWithMeta(messages, { task: 'hint' })
    expect(first.text).toBe('Connect LDR to pin A0 and ground.')
    expect(first.usage.cached).toBe(false)
    expect(first.usage.tier).toBe('nano')
    expect(first.usage.estimatedUsd).toBeCloseTo(0.000028, 9)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/ask')
    const headers = init?.headers as Record<string, string>
    expect(headers['x-gemini-key']).toBe('AIzaSyTestUserKey123')
    const sentBody = JSON.parse(String(init?.body))
    expect(sentBody.tier).toBe('nano')
    expect(sentBody.model).toBe('gemini-2.5-flash-lite')

    // Second identical call hits PromptCache without calling fetch again
    const second = await callAICompletionWithMeta(messages, { task: 'hint' })
    expect(second.text).toBe('Connect LDR to pin A0 and ground.')
    expect(second.usage.cached).toBe(true)
    expect(second.usage.estimatedUsd).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const logs = await getRecentUsageLogs()
    expect(logs).toHaveLength(2)

    const summary = await getUsageSummary()
    expect(summary.totalCalls).toBe(2)
    expect(summary.liveCalls).toBe(1)
    expect(summary.cachedCalls).toBe(1)
    expect(summary.cacheHitRate).toBeCloseTo(0.5)
    expect(summary.totalUsd).toBeCloseTo(0.000028, 9)
    expect(summary.estimatedSavedUsd).toBeCloseTo(0.000028, 9)
  })

  it('routes StudySetGenerator, TeachingInsights, and AIAssessor through AIProvider with x-gemini-key', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      const sys = body.messages?.[0]?.content ?? ''
      if (body.messages?.[0]?.role === 'system' && sys.includes('Personal Study Lab')) {
        return jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  notes: '# Solar Notes',
                  briefingDoc: 'Briefing',
                  faq: [{ question: 'Q?', answer: 'A.' }],
                  audioOverview: [{ speaker: 'Host (Alex)', text: 'Hi', pitch: 1, rate: 1 }],
                  flashcards: [{ question: 'F?', answer: 'FA.' }],
                  quiz: [{ question: 'QZ?', options: ['A', 'B', 'C', 'D'], correctIndex: 0, explanation: 'Because' }],
                }),
              },
            },
          ],
        })
      }
      if (sys.includes('curriculum designer')) {
        return jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: 'Solar Course',
                  description: 'Course desc',
                  topic: 'Solar',
                  hasWorkshop: true,
                  twinType: 'agritech',
                  modules: [{ id: 'm1', title: 'M1', description: 'D1', durationMinutes: 30 }],
                  studySet: {
                    notes: 'Notes',
                    briefingDoc: 'Doc',
                    faq: [],
                    audioOverview: [],
                    flashcards: [{ question: 'Q', answer: 'A' }],
                    quiz: [{ question: 'Q', options: ['1', '2', '3', '4'], correctIndex: 0, explanation: 'E' }],
                  },
                }),
              },
            },
          ],
        })
      }
      if (sys.includes('assessor for SunRoot')) {
        return jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  rank: 'Technician',
                  xp: 180,
                  headline: 'Solid baseline circuit',
                  summary: 'Verified wiring and control.',
                  strengths: ['Clean ground'],
                  gaps: ['Add hysteresis'],
                  nextStep: 'Test overnight battery drain',
                }),
              },
            },
          ],
        })
      }
      const userContent = body.messages?.[body.messages.length - 1]?.content ?? ''
      if (userContent.includes('isomorphic homework')) {
        return jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  promptTemplate: 'Compute {V} * {I}',
                  variables: { V: { min: 5, max: 12, unit: 'V', step: 1 }, I: { min: 1, max: 3, unit: 'A', step: 1 } },
                  solutionFormula: 'V * I',
                  rubric: ['Multiply V and I'],
                }),
              },
            },
          ],
        })
      }
      return jsonResponse({
        choices: [{ message: { content: '- Actionable engineering feedback bullet.' } }],
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const studySet = await generateStudySet('Solar PV generates DC current.')
    expect(studySet.notes).toBe('# Solar Notes')

    const course = await generateCourseFromOutline('Week 1: Solar Energy\nWeek 2: Pumps')
    expect(course.title).toBe('Solar Course')

    const notesAnswer = await askSourceNotes('Panels produce DC.', 'What do panels produce?')
    expect(notesAnswer.answer).toContain('Actionable')

    const hwProblem = await generateBaseProblemFromTopic('Ohm Law')
    expect(hwProblem.solutionFormula).toBe('V * I')

    const classRec = await generateTeachingRecommendations('Class mastery summary')
    expect(classRec.text).toContain('Actionable')

    const studentRec = await generateStudentRecommendation('Student bottleneck summary')
    expect(studentRec.text).toContain('Actionable')

    const assessment = await assess()
    expect(assessment.source).toBe('model')
    expect(assessment.rank).toBe('Technician')

    expect(fetchMock).toHaveBeenCalledTimes(7)
    for (const call of fetchMock.mock.calls) {
      const headers = call[1]?.headers as Record<string, string>
      expect(headers['x-gemini-key']).toBe('AIzaSyTestUserKey123')
    }
  })

  it('has zero direct fetch() calls outside src/ai/AIProvider.ts', () => {
    const srcDir = path.resolve(process.cwd(), 'src')
    const filesWithFetch: string[] = []

    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name === '__tests__') continue
          walk(full)
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          const content = fs.readFileSync(full, 'utf8')
          if (/\bfetch\s*\(/.test(content)) {
            filesWithFetch.push(path.relative(srcDir, full).replace(/\\/g, '/'))
          }
        }
      }
    }

    walk(srcDir)
    expect(filesWithFetch).toEqual(['ai/AIProvider.ts'])
  })

  it('separates prompt cache entries by maxTokens and reports the routed model on HTTP 400 in ask()', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: 'Short truncated' } }],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: 'Full detailed explanation of solar sizing.' } }],
          usage: { prompt_tokens: 10, completion_tokens: 80, total_tokens: 90 },
        }),
      )
      .mockResolvedValueOnce(new Response('Bad model parameter', { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)

    const msgs = [{ role: 'user' as const, content: 'Explain solar sizing' }]
    const first = await callAICompletionWithMeta(msgs, { task: 'hint', maxTokens: 10 })
    const second = await callAICompletionWithMeta(msgs, { task: 'hint', maxTokens: 3800 })
    expect(first.text).toBe('Short truncated')
    expect(second.text).toBe('Full detailed explanation of solar sizing.')
    expect(second.usage.cached).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    saveConfig({ apiKey: 'AIzaSyTestUserKey123', proxyUrl: '/api/ask', model: 'stale-custom-model' })
    const res400 = await ask('Quick test question', [], { task: 'chat' })
    expect(res400.source).toBe('local')
    expect(res400.reason).toContain('gemini-2.5-flash-lite')
    expect(res400.reason).not.toContain('stale-custom-model')
  })
})
