import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { getSavedWorkspace, setSavedWorkspace } from '../workspaceState'

describe('workspaceState', () => {
  beforeEach(() => {
    setSavedWorkspace(null)
  })

  it('stores, retrieves, and clears Blockly workspace snapshots cleanly', () => {
    expect(getSavedWorkspace()).toBeNull()

    const snapshot = {
      blocks: {
        languageVersion: 0,
        blocks: [{ type: 'controls_if', id: 'b1' }],
      },
    }
    setSavedWorkspace(snapshot)
    expect(getSavedWorkspace()).toEqual(snapshot)

    setSavedWorkspace(null)
    expect(getSavedWorkspace()).toBeNull()
  })

  it('does not import blockly or codingLab.ts', () => {
    const filePath = path.resolve(process.cwd(), 'src/coding/workspaceState.ts')
    const source = fs.readFileSync(filePath, 'utf8')
    expect(source).not.toMatch(/blockly/i)
    expect(source).not.toMatch(/codingLab/i)
  })
})
