// ---------------------------------------------------------------------------
// Breadboard
//
// A real solderless breadboard, modelled as it is actually built rather than
// drawn as scenery. Two things are true of the physical object and are true
// here: the four rail strips run the length of the board, and each column of
// five holes on one side of the centre channel is a single connected node.
//
// That geometry is the whole point. A student who plugs a sensor into column 7
// row A and runs a jumper from column 7 row C to the controller has made a
// connection, because those holes are one node — exactly as they would be on a
// bench. Nothing about that is simulated loosely; it is the same continuity.
// ---------------------------------------------------------------------------

export const BB_COLUMNS = 20
export const UPPER_ROWS = ['A', 'B', 'C', 'D', 'E'] as const
export const LOWER_ROWS = ['F', 'G', 'H', 'I', 'J'] as const

export type RailId = 'T+' | 'T-' | 'B+' | 'B-'
export const RAILS: RailId[] = ['T+', 'T-', 'B+', 'B-']

/**
 * A hole identifier, unique within one board. Rails are `T+:4`; terminal strip
 * holes are `C:7`. The column index is zero-based.
 */
export type HoleId = string

export function railHole(rail: RailId, col: number): HoleId {
  return `${rail}:${col}`
}
export function stripHole(row: string, col: number): HoleId {
  return `${row}:${col}`
}

export function parseHole(id: HoleId): { row: string; col: number } | null {
  const [row, col] = id.split(':')
  if (row === undefined || col === undefined) return null
  return { row, col: Number(col) }
}

export function isRailHole(id: HoleId): boolean {
  return RAILS.includes(id.split(':')[0] as RailId)
}

/** Every hole on the board, in render order. */
export function allHoles(): HoleId[] {
  const out: HoleId[] = []
  for (const r of RAILS) for (let c = 0; c < BB_COLUMNS; c++) out.push(railHole(r, c))
  for (const r of [...UPPER_ROWS, ...LOWER_ROWS]) {
    for (let c = 0; c < BB_COLUMNS; c++) out.push(stripHole(r, c))
  }
  return out
}

/**
 * The continuity groups. Each returned array is a set of holes that are
 * electrically one node before any wire is added.
 *
 * A rail is one node across the whole board. A terminal column is one node of
 * five holes, and the two halves of a column are separate because the centre
 * channel physically breaks them — which is precisely why a DIP chip can
 * straddle it without shorting its own pins together.
 */
export function continuityGroups(): HoleId[][] {
  const groups: HoleId[][] = []

  for (const rail of RAILS) {
    groups.push(Array.from({ length: BB_COLUMNS }, (_, c) => railHole(rail, c)))
  }

  for (let c = 0; c < BB_COLUMNS; c++) {
    groups.push(UPPER_ROWS.map((r) => stripHole(r, c)))
    groups.push(LOWER_ROWS.map((r) => stripHole(r, c)))
  }

  return groups
}

/** Human description of what a hole is joined to, for tooltips. */
export function describeHole(id: HoleId): string {
  const p = parseHole(id)
  if (!p) return id
  if (isRailHole(id)) {
    const polarity = p.row.endsWith('+') ? 'positive' : 'negative'
    const side = p.row.startsWith('T') ? 'top' : 'bottom'
    return `${side} ${polarity} rail — joined to every other hole on this rail.`
  }
  const half = UPPER_ROWS.includes(p.row as (typeof UPPER_ROWS)[number]) ? 'A–E' : 'F–J'
  return `Column ${p.col + 1}, rows ${half} — these five holes are one node.`
}
