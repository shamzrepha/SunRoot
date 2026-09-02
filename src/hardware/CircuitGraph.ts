// ---------------------------------------------------------------------------
// CircuitGraph
//
// The bench. Everything on it came from the student's cart — there are no
// pre-placed boards, no assumed ESP32, no implied sensor. If they did not buy
// it, it does not exist here, and if they wire it wrongly it stays wrongly
// wired: nothing in this file corrects anyone.
//
// The graph is also what the coding lab reads to decide which blocks exist, so
// a sensor that was bought but never wired produces no block. Hardware choice
// therefore constrains software capability, which is the whole lesson.
// ---------------------------------------------------------------------------

import { CATALOG_BY_ID } from './ComponentCatalog'
import type { CatalogPart } from './ComponentCatalog'
import { gpioOf, isAdcPin, isOutputPin, terminalsFor } from './PinRegistry'
import type { Terminal } from './PinRegistry'
import { allHoles, continuityGroups, describeHole } from './Breadboard'

export interface PlacedComponent {
  /** Unique per placement — two identical resistors are two instances. */
  instanceId: string
  partId: string
  /** Position on the bench, as a percentage of bench size. */
  x: number
  y: number
}

export interface GraphWire {
  id: string
  fromInstance: string
  fromPin: string
  toInstance: string
  toPin: string
  colour: string
}

export interface CircuitGraphState {
  placed: PlacedComponent[]
  wires: GraphWire[]
  /** Set once the student has run a check, purely so the UI can show results. */
  lastCheckedAt: number
}

export const graph: CircuitGraphState = {
  placed: [],
  wires: [],
  lastCheckedAt: 0,
}

let seq = 0

export function partOf(instanceId: string): CatalogPart | undefined {
  const inst = graph.placed.find((p) => p.instanceId === instanceId)
  return inst ? CATALOG_BY_ID.get(inst.partId) : undefined
}

export function isBreadboard(instanceId: string): boolean {
  const part = partOf(instanceId)
  return part?.id === 'breadboardFull' || part?.id === 'breadboardHalf'
}

export function terminalsOf(instanceId: string): Terminal[] {
  const part = partOf(instanceId)
  if (!part) return []
  // A breadboard's terminals are its holes. Treating them as ordinary pins
  // means everything else — wiring, nets, checking — works unchanged.
  if (isBreadboard(instanceId)) {
    return allHoles().map((h) => ({
      name: h,
      role: 'passive' as const,
      colour: '#b8b2a2',
      note: describeHole(h),
    }))
  }
  return terminalsFor(part)
}

export function placeComponent(partId: string, x: number, y: number): PlacedComponent | null {
  if (!CATALOG_BY_ID.has(partId)) return null
  const inst: PlacedComponent = { instanceId: `i${++seq}`, partId, x, y }
  graph.placed.push(inst)
  return inst
}

export function moveComponent(instanceId: string, x: number, y: number) {
  const inst = graph.placed.find((p) => p.instanceId === instanceId)
  if (inst) {
    inst.x = x
    inst.y = y
  }
}

/** Removing a component takes its wires with it, as unplugging a board would. */
export function removeComponent(instanceId: string) {
  graph.placed = graph.placed.filter((p) => p.instanceId !== instanceId)
  graph.wires = graph.wires.filter(
    (w) => w.fromInstance !== instanceId && w.toInstance !== instanceId,
  )
}

export function placedCountOf(partId: string): number {
  return graph.placed.filter((p) => p.partId === partId).length
}

export function wiresOnPin(instanceId: string, pin: string): GraphWire[] {
  return graph.wires.filter(
    (w) =>
      (w.fromInstance === instanceId && w.fromPin === pin) ||
      (w.toInstance === instanceId && w.toPin === pin),
  )
}

export type ConnectOutcome = { ok: true; wire: GraphWire } | { ok: false; reason: string }

/**
 * Join two terminals. Deliberately permissive: it refuses only what is
 * physically impossible (a pin to itself, a duplicate run). Electrically
 * unwise connections are allowed through and reported later by the checker,
 * because being able to build the wrong thing is the point of a sandbox.
 */
export function connectPins(
  fromInstance: string,
  fromPin: string,
  toInstance: string,
  toPin: string,
): ConnectOutcome {
  if (fromInstance === toInstance && fromPin === toPin) {
    return { ok: false, reason: 'A pin cannot connect to itself.' }
  }

  const duplicate = graph.wires.some(
    (w) =>
      (w.fromInstance === fromInstance && w.fromPin === fromPin &&
        w.toInstance === toInstance && w.toPin === toPin) ||
      (w.fromInstance === toInstance && w.fromPin === toPin &&
        w.toInstance === fromInstance && w.toPin === fromPin),
  )
  if (duplicate) return { ok: false, reason: 'Those two pins are already joined.' }

  const term = terminalsOf(fromInstance).find((t) => t.name === fromPin)
  const wire: GraphWire = {
    id: `w${++seq}`,
    fromInstance,
    fromPin,
    toInstance,
    toPin,
    colour: term?.colour ?? '#8b939b',
  }
  graph.wires.push(wire)
  return { ok: true, wire }
}

export function removeWire(id: string) {
  graph.wires = graph.wires.filter((w) => w.id !== id)
}

export function clearGraph() {
  graph.placed = []
  graph.wires = []
}

// ---------------------------------------------------------------------------
// History
//
// Snapshot-based rather than command-based. The graph is small, snapshots are
// cheap, and a snapshot cannot drift out of sync with the state the way an
// inverse-command stack can once several kinds of edit are in play.
// ---------------------------------------------------------------------------

interface Snapshot {
  placed: PlacedComponent[]
  wires: GraphWire[]
}

const undoStack: Snapshot[] = []
const redoStack: Snapshot[] = []
const HISTORY_LIMIT = 60

function snapshot(): Snapshot {
  return {
    placed: graph.placed.map((p) => ({ ...p })),
    wires: graph.wires.map((w) => ({ ...w })),
  }
}

function restore(s: Snapshot) {
  graph.placed = s.placed.map((p) => ({ ...p }))
  graph.wires = s.wires.map((w) => ({ ...w }))
}

/** Call immediately before any mutation that should be undoable. */
export function pushHistory() {
  undoStack.push(snapshot())
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift()
  redoStack.length = 0
}

export function undo(): boolean {
  const prev = undoStack.pop()
  if (!prev) return false
  redoStack.push(snapshot())
  restore(prev)
  return true
}

export function redo(): boolean {
  const next = redoStack.pop()
  if (!next) return false
  undoStack.push(snapshot())
  restore(next)
  return true
}

export function canUndo() {
  return undoStack.length > 0
}
export function canRedo() {
  return redoStack.length > 0
}

// ---------------------------------------------------------------------------
// Net solving
//
// Connectivity is not wire adjacency. A sensor plugged into column 7 and a
// controller jumpered to a different hole in the same column are connected,
// because those holes are one node on the physical board. Everything that asks
// "is A joined to B" therefore asks the net solver, never the wire list.
// ---------------------------------------------------------------------------

export type NodeKey = string // `${instanceId}:${pin}`

export function nodeKey(instanceId: string, pin: string): NodeKey {
  return `${instanceId}:${pin}`
}

class UnionFind {
  private parent = new Map<string, string>()

  find(a: string): string {
    if (!this.parent.has(a)) this.parent.set(a, a)
    let root = this.parent.get(a)!
    while (root !== this.parent.get(root)!) root = this.parent.get(root)!
    // Path compression keeps repeated queries cheap during a render loop.
    let cur = a
    while (cur !== root) {
      const next = this.parent.get(cur)!
      this.parent.set(cur, root)
      cur = next
    }
    return root
  }

  union(a: string, b: string) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }
}

let netCache: { stamp: string; uf: UnionFind } | null = null

function stamp(): string {
  return (
    graph.placed.map((p) => p.instanceId + p.partId).join('|') +
    '#' +
    graph.wires.map((w) => `${w.fromInstance}.${w.fromPin}>${w.toInstance}.${w.toPin}`).join('|')
  )
}

function solver(): UnionFind {
  const current = stamp()
  if (netCache && netCache.stamp === current) return netCache.uf

  const uf = new UnionFind()

  // Pass-through plumbing. A length of tubing is one fluid node from end to
  // end, exactly as a breadboard column is one electrical node — which is what
  // makes a pipe run genuinely conduct rather than merely sit there. A valve is
  // continuous in the graph and gated at runtime by whether it is energised.
  const PASS_THROUGH = new Set(['tubing', 'flowMeter', 'solenoidValve'])
  for (const inst of graph.placed) {
    const part = CATALOG_BY_ID.get(inst.partId)
    if (!part || !PASS_THROUGH.has(part.id)) continue
    const ports = terminalsFor(part).filter((t) => t.role === 'fluidIn' || t.role === 'fluidOut')
    for (let i = 1; i < ports.length; i++) {
      uf.union(nodeKey(inst.instanceId, ports[0].name), nodeKey(inst.instanceId, ports[i].name))
    }
  }

  // Internal ground plane continuity for every component on the bench.
  // All GND pins on a single board (e.g. ESP32 GND 1, 2, 3, or Buck IN-/OUT-)
  // are connected on copper layer. Joining them here means connecting Battery GND
  // to ESP32 GND 1 automatically grounds ESP32 GND 2 and any sensor connected to it.
  for (const inst of graph.placed) {
    if (isBreadboard(inst.instanceId)) continue
    const terms = terminalsOf(inst.instanceId)
    const groundTerms = terms.filter(
      (t) =>
        t.role === 'groundIn' ||
        (t.role as string) === 'groundOut' ||
        t.name.toUpperCase().startsWith('GND') ||
        t.name === '-' ||
        t.name === 'IN-' ||
        t.name === 'OUT-' ||
        t.name === 'BAT-' ||
        t.name === 'PV-' ||
        t.name === 'LOAD-' ||
        t.name === 'VIN-' ||
        t.name === 'K' ||
        t.name === 'E',
    )
    for (let i = 1; i < groundTerms.length; i++) {
      uf.union(nodeKey(inst.instanceId, groundTerms[0].name), nodeKey(inst.instanceId, groundTerms[i].name))
    }
  }

  // Internal continuity of every breadboard on the bench.
  for (const inst of graph.placed) {
    if (!isBreadboard(inst.instanceId)) continue
    for (const group of continuityGroups()) {
      for (let i = 1; i < group.length; i++) {
        uf.union(nodeKey(inst.instanceId, group[0]), nodeKey(inst.instanceId, group[i]))
      }
    }
  }

  // Then every wire the student ran.
  for (const w of graph.wires) {
    uf.union(nodeKey(w.fromInstance, w.fromPin), nodeKey(w.toInstance, w.toPin))
  }

  netCache = { stamp: current, uf }
  return uf
}

/** Identifier of the electrical node a pin sits on. */
export function netOf(instanceId: string, pin: string): string {
  return solver().find(nodeKey(instanceId, pin))
}

/** True when two pins are electrically the same node. */
export function connected(aInst: string, aPin: string, bInst: string, bPin: string): boolean {
  return netOf(aInst, aPin) === netOf(bInst, bPin)
}

/** Every non-breadboard terminal sharing a node with the given pin. */
export function peersOf(instanceId: string, pin: string): { instanceId: string; pin: string }[] {
  const target = netOf(instanceId, pin)
  const out: { instanceId: string; pin: string }[] = []
  for (const inst of graph.placed) {
    if (isBreadboard(inst.instanceId)) continue
    for (const t of terminalsOf(inst.instanceId)) {
      if (inst.instanceId === instanceId && t.name === pin) continue
      if (netOf(inst.instanceId, t.name) === target) {
        out.push({ instanceId: inst.instanceId, pin: t.name })
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Derived reading of the bench. This is what the coding lab and the farm ask.
// ---------------------------------------------------------------------------

export interface WiredSensor {
  instanceId: string
  part: CatalogPart
  /** Controller instance it reports to. */
  controllerInstance: string
  pinName: string
  gpio?: number
  /** False when the signal landed somewhere that cannot read it. */
  readable: boolean
  reason?: string
}

export interface WiredOutput {
  instanceId: string
  part: CatalogPart
  controllerInstance: string
  pinName: string
  gpio?: number
  drivable: boolean
  reason?: string
  /** The actuator this driver ultimately switches, if one is wired to it. */
  loadInstance?: string
}

export function controllers(): PlacedComponent[] {
  return graph.placed.filter((p) => CATALOG_BY_ID.get(p.partId)?.category === 'controllers')
}

/** Every sensor whose signal line shares a node with a controller pin. */
export function wiredSensors(): WiredSensor[] {
  const out: WiredSensor[] = []

  for (const inst of graph.placed) {
    const part = CATALOG_BY_ID.get(inst.partId)
    if (!part || part.category !== 'sensors') continue

    for (const term of terminalsFor(part).filter((t) => t.role === 'signalOut')) {
      for (const peer of peersOf(inst.instanceId, term.name)) {
        const ctrlPart = partOf(peer.instanceId)
        if (!ctrlPart || ctrlPart.category !== 'controllers') continue

        const analog = part.signalType === 'analog'
        const readable = analog ? isAdcPin(ctrlPart, peer.pin) : true

        out.push({
          instanceId: inst.instanceId,
          part,
          controllerInstance: peer.instanceId,
          pinName: peer.pin,
          gpio: gpioOf(ctrlPart.id, peer.pin),
          readable,
          reason: readable
            ? undefined
            : `${peer.pin} has no ADC, so an analog reading cannot be taken there.`,
        })
      }
    }
  }
  return out
}

/**
 * Every switching stage whose control input shares a node with a controller
 * pin. These become the "set X" blocks, each carrying whatever it switches.
 */
export function wiredOutputs(): WiredOutput[] {
  const out: WiredOutput[] = []

  for (const inst of graph.placed) {
    const part = CATALOG_BY_ID.get(inst.partId)
    if (!part) continue

    const isDriver = part.category === 'drivers'
    const isDirectLoad = part.category === 'actuators' || part.category === 'output'
    if (!isDriver && !isDirectLoad) continue

    for (const term of terminalsFor(part).filter((t) => t.role === 'signalIn')) {
      for (const peer of peersOf(inst.instanceId, term.name)) {
        const ctrlPart = partOf(peer.instanceId)
        if (!ctrlPart || ctrlPart.category !== 'controllers') continue

        const drivable = isOutputPin(ctrlPart, peer.pin)
        out.push({
          instanceId: inst.instanceId,
          part,
          controllerInstance: peer.instanceId,
          pinName: peer.pin,
          gpio: gpioOf(ctrlPart.id, peer.pin),
          drivable,
          reason: drivable ? undefined : `${peer.pin} is input-only and cannot drive anything.`,
          loadInstance: isDriver ? loadSwitchedBy(inst.instanceId) : inst.instanceId,
        })
      }
    }
  }
  return out
}

/** Whatever actuator shares a node with a driver's switched terminals. */
function loadSwitchedBy(driverInstance: string): string | undefined {
  const part = partOf(driverInstance)
  if (!part) return undefined

  for (const term of terminalsFor(part).filter((t) => t.role === 'loadOut')) {
    for (const peer of peersOf(driverInstance, term.name)) {
      if (partOf(peer.instanceId)?.category === 'actuators') return peer.instanceId
    }
  }
  return undefined
}

/** True where the bench has a complete, working path to move water. */
export function irrigationPathComplete(): boolean {
  return wiredOutputs().some(
    (o) => o.drivable && o.loadInstance && partOf(o.loadInstance)?.category === 'actuators',
  )
}
