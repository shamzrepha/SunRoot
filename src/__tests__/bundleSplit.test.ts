// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { build } from 'vite'
import { beforeAll, describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const DIST_DIR = path.join(ROOT, 'dist')
const ASSETS_DIR = path.join(DIST_DIR, 'assets')

describe('Production bundle splitting, Firestore rules & indexes', () => {
  beforeAll(async () => {
    if (!fs.existsSync(path.join(DIST_DIR, 'index.html')) || !fs.existsSync(ASSETS_DIR)) {
      await build({ logLevel: 'silent' })
    }
  }, 60_000)

  it('emits blockly, vendor-react, and lazy screen routes outside the entry bundle', () => {
    const files = fs.readdirSync(ASSETS_DIR)
    const indexChunk = files.find((f) => /^index-.*\.js$/.test(f))
    const blocklyChunk = files.find((f) => /^blockly-.*\.js$/.test(f))
    const reactChunk = files.find((f) => /^vendor-react-.*\.js$/.test(f))
    const codingChunk = files.find((f) => /^codingLab-.*\.js$/.test(f))
    const onboardChunk = files.find((f) => /^onboard-.*\.js$/.test(f))
    const guidedLabsChunk = files.find((f) => /^guidedLabs-.*\.js$/.test(f))
    const metricsChunk = files.find((f) => /^metrics-.*\.js$/.test(f))

    expect(indexChunk).toBeDefined()
    expect(blocklyChunk).toBeDefined()
    expect(reactChunk).toBeDefined()
    expect(codingChunk).toBeDefined()
    expect(onboardChunk).toBeDefined()
    expect(guidedLabsChunk).toBeDefined()
    expect(metricsChunk).toBeDefined()

    const indexHtml = fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf8')
    expect(indexHtml).not.toMatch(/blockly-/i)
    expect(indexHtml).not.toMatch(/codingLab-/i)
    expect(indexHtml).not.toMatch(/three-/i)

    const entryCode = fs.readFileSync(path.join(ASSETS_DIR, indexChunk!), 'utf8')
    expect(entryCode).not.toContain('Blockly.inject')
    expect(entryCode).not.toContain('javascriptGenerator')
  })

  it('defines rules for all 11 existing and 6 new Firestore collections', () => {
    const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8')
    const collections = [
      'users',
      'classrooms',
      'invites',
      'teams',
      'classSuggestions',
      'progressSnapshots',
      'friendRequests',
      'blocks',
      'messages',
      'messageReports',
      'studySets',
      'homework',
      'notifications',
      'aiUsageLogs',
      'learningEvents',
      'sessionLogs',
      'labCompletions',
    ]
    for (const col of collections) {
      expect(rules).toContain(`match /${col}/`)
    }
  })

  it('parses firestore.indexes.json cleanly with existing 6 and new telemetry/KPI indexes', () => {
    const raw = fs.readFileSync(path.join(ROOT, 'firestore.indexes.json'), 'utf8')
    const parsed = JSON.parse(raw) as { indexes: Array<{ collectionGroup: string }> }
    expect(Array.isArray(parsed.indexes)).toBe(true)
    expect(parsed.indexes.length).toBeGreaterThanOrEqual(20)

    const groups = new Set(parsed.indexes.map((i) => i.collectionGroup))
    for (const expected of [
      'friendRequests',
      'messages',
      'invites',
      'aiUsageLogs',
      'learningEvents',
      'sessionLogs',
      'labCompletions',
    ]) {
      expect(groups.has(expected)).toBe(true)
    }
  })
})
