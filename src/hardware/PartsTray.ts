// ---------------------------------------------------------------------------
// PartsTray
//
// What the student actually owns. The circuit lab may only place parts that
// appear here, and the coding lab may only generate I/O blocks for parts that
// were subsequently wired — so this list is the first link in the chain that
// makes hardware choices bind software capability.
//
// A budget exists so that choosing is a real decision. Without one, the optimal
// strategy is to buy everything, and every tradeoff in the catalogue evaporates.
// ---------------------------------------------------------------------------

import { CATALOG_BY_ID } from './ComponentCatalog'
import type { CatalogPart } from './ComponentCatalog'

export interface TrayLine {
  partId: string
  quantity: number
}

export interface PartsTrayState {
  lines: TrayLine[]
  budget: number
}

export const tray: PartsTrayState = {
  lines: [],
  /** Enough for several viable architectures, not enough for all of them. */
  budget: 260,
}

export function spent(): number {
  return tray.lines.reduce((sum, l) => {
    const part = CATALOG_BY_ID.get(l.partId)
    return sum + (part ? part.cost * l.quantity : 0)
  }, 0)
}

export function remaining(): number {
  return tray.budget - spent()
}

export function quantityOf(partId: string): number {
  return tray.lines.find((l) => l.partId === partId)?.quantity ?? 0
}

export function canAfford(part: CatalogPart): boolean {
  return remaining() >= part.cost
}

/** Indefinite article by sound, so part names read naturally in messages. */
function article(name: string): string {
  return /^[aeiou]/i.test(name) ? 'an' : 'a'
}

export type AddResult = { ok: true } | { ok: false; reason: string }

export function addPart(partId: string): AddResult {
  const part = CATALOG_BY_ID.get(partId)
  if (!part) return { ok: false, reason: 'Unknown part.' }
  if (!canAfford(part)) {
    return { ok: false, reason: `Not enough credits — ${part.name} costs ${part.cost}.` }
  }

  const existing = tray.lines.find((l) => l.partId === partId)
  if (existing) {
    // Single-instance parts would only confuse the circuit lab if duplicated.
    if (!part.stackable) return { ok: false, reason: `You already have ${article(part.name)} ${part.name}.` }
    existing.quantity++
  } else {
    tray.lines.push({ partId, quantity: 1 })
  }
  return { ok: true }
}

export function removePart(partId: string) {
  const i = tray.lines.findIndex((l) => l.partId === partId)
  if (i < 0) return
  const line = tray.lines[i]
  line.quantity--
  if (line.quantity <= 0) tray.lines.splice(i, 1)
}

export function clearTray() {
  tray.lines.length = 0
}

/** Flattened list of owned parts, one entry per physical unit. */
export function ownedParts(): CatalogPart[] {
  const out: CatalogPart[] = []
  for (const line of tray.lines) {
    const part = CATALOG_BY_ID.get(line.partId)
    if (!part) continue
    for (let i = 0; i < line.quantity; i++) out.push(part)
  }
  return out
}

/** Distinct parts owned, for the circuit lab palette. */
export function distinctOwned(): { part: CatalogPart; quantity: number }[] {
  return tray.lines
    .map((l) => ({ part: CATALOG_BY_ID.get(l.partId)!, quantity: l.quantity }))
    .filter((x) => !!x.part)
}

export function hasCategory(category: CatalogPart['category']): boolean {
  return distinctOwned().some((x) => x.part.category === category)
}

/**
 * The only gate on leaving the shed. Deliberately minimal: a controller and
 * something to wire it with. Everything else — whether they bought a sensor,
 * a switching stage, or any way to move water at all — is left to them, and
 * the consequences surface in the circuit lab and on the farm rather than here.
 */
export function canProceed(): { ok: boolean; reason?: string } {
  if (!hasCategory('controllers')) {
    return { ok: false, reason: 'You need something to run your program.' }
  }
  const wiring = distinctOwned().some(
    (x) => x.part.category === 'prototyping' && x.part.id !== 'terminalBlock',
  )
  if (!wiring) {
    return { ok: false, reason: 'You need some way to make connections.' }
  }
  return { ok: true }
}
