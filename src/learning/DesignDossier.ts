// ---------------------------------------------------------------------------
// DesignDossier
//
// The student's actual work, written out so a language model can read it: the
// full netlist of what they wired, and the program they wrote, block by block.
//
// Statistics tell you whether a design worked. They do not tell you whether it
// was a *good* design — whether the thresholds are sensible, whether the parts
// were well chosen for the load, whether the logic would survive a cloudy week.
// Those are judgements about the artefact, and the model cannot make them
// without seeing the artefact.
// ---------------------------------------------------------------------------

import { graph, netOf, partOf, terminalsOf, wiredOutputs, wiredSensors } from '../hardware/CircuitGraph'
import { isBreadboard } from '../hardware/CircuitGraph'
import { checkGraph } from '../hardware/GraphChecker'
import { topology, alwaysOnLoads, hydraulicPath } from '../simulation/PowerSystem'

/** The compiled program, captured at deploy so it can be assessed later. */
let programSource = ''
let programStats: ProgramStats | null = null

export interface ProgramStats {
  blockCount: number
  blockTypes: Record<string, number>
  /** Numeric literals in the program — the thresholds they chose. */
  numbers: number[]
  hasLoop: boolean
  hasWait: boolean
  hasConditional: boolean
  /** Distinct comparison thresholds, which is how hysteresis shows up. */
  distinctThresholds: number[]
}

export function captureProgram(source: string, stats: ProgramStats) {
  programSource = source
  programStats = stats
}

export function hasProgram(): boolean {
  return programSource.trim().length > 0
}

/**
 * The netlist. Components, then every electrical node with everything on it —
 * which is the form an engineer would actually read a circuit in.
 */
export function describeCircuit(): string {
  if (!graph.placed.length) return 'Nothing has been placed on the workbench.'

  const lines: string[] = []

  lines.push('COMPONENTS PLACED:')
  for (const inst of graph.placed) {
    const part = partOf(inst.instanceId)
    if (!part) continue
    const spec = [
      part.supplyVoltage ? `${part.supplyVoltage} V` : '',
      part.currentMa ? `${part.currentMa} mA` : '',
      part.ratedWatts ? `${part.ratedWatts} W` : '',
      part.peakWatts ? `${part.peakWatts} W peak` : '',
      part.capacityWh ? `${part.capacityWh} Wh` : '',
      part.pinCurrentLimitMa ? `${part.pinCurrentLimitMa} mA per pin` : '',
    ]
      .filter(Boolean)
      .join(', ')
    lines.push(`- ${part.name} [${inst.instanceId}] ${spec ? `(${spec})` : ''} — ${part.cost} credits`)
  }

  // Group terminals by the node they sit on. A net with one thing on it is a
  // dangling connection and worth the model seeing as such.
  const nets = new Map<string, string[]>()
  for (const inst of graph.placed) {
    if (isBreadboard(inst.instanceId)) continue
    const part = partOf(inst.instanceId)
    if (!part) continue
    for (const t of terminalsOf(inst.instanceId)) {
      const net = netOf(inst.instanceId, t.name)
      const label = `${part.name}.${t.name}`
      if (!nets.has(net)) nets.set(net, [])
      nets.get(net)!.push(label)
    }
  }

  lines.push('', 'ELECTRICAL NODES (everything on the same line is connected):')
  let n = 1
  for (const [, members] of nets) {
    if (members.length < 2) continue
    lines.push(`  Node ${n++}: ${members.join('  ==  ')}`)
  }

  const dangling: string[] = []
  for (const [, members] of nets) {
    if (members.length === 1) dangling.push(members[0])
  }
  if (dangling.length) {
    lines.push('', `UNCONNECTED TERMINALS: ${dangling.join(', ')}`)
  }

  // What the wiring adds up to.
  const topo = topology()
  const hard = alwaysOnLoads()
  const water = hydraulicPath()
  const check = checkGraph()

  lines.push(
    '',
    'WHAT THIS CIRCUIT ADDS UP TO:',
    `- Sensors reaching the controller: ${wiredSensors().map((s) => `${s.part.name} on ${s.pinName}${s.readable ? '' : ' (pin CANNOT read it)'}`).join(', ') || 'none'}`,
    `- Under program control: ${wiredOutputs().map((o) => `${o.part.name} on ${o.pinName}${o.loadInstance ? ` switching ${partOf(o.loadInstance)?.name}` : ' (switching nothing)'}`).join(', ') || 'none'}`,
    `- Generation: ${topo.installedPeakWatts} W installed, ${topo.arrayPeakWatts} W reaching storage, controller: ${topo.controllerName}`,
    `- Storage: ${topo.capacityWh} Wh`,
    `- Continuous load: ${topo.activeLoadWatts.toFixed(0)} W plus ${topo.standbyWatts.toFixed(1)} W standby`,
    hard.length
      ? `- WIRED DIRECTLY ACROSS SUPPLY (runs with no program): ${hard.map((h) => h.part.name).join(', ')}`
      : '- No load is hard-wired across the supply',
    `- Water path: ${water.complete ? 'complete' : `incomplete — ${water.reason}`}`,
    `- Outstanding faults: ${check.errors} error(s), ${check.warnings} warning(s)`,
  )

  if (check.issues.length) {
    lines.push('', 'FAULTS THE CHECKER FOUND:')
    for (const i of check.issues.slice(0, 8)) {
      lines.push(`  [${i.severity}] ${i.message}`)
    }
  }

  return lines.join('\n')
}

/** The program, as written and as compiled. */
export function describeProgram(): string {
  if (!programSource.trim()) {
    return 'No program has been written — the Blockly workspace is empty.'
  }

  const s = programStats
  const lines = ['THE PROGRAM THEY WROTE (compiled from their blocks):', '', programSource.trim()]

  if (s) {
    lines.push(
      '',
      'PROGRAM STRUCTURE:',
      `- ${s.blockCount} blocks: ${Object.entries(s.blockTypes).map(([t, c]) => `${t}×${c}`).join(', ')}`,
      `- Conditionals: ${s.hasConditional ? 'yes' : 'NO — the logic never branches'}`,
      `- Loops: ${s.hasLoop ? 'yes' : 'no'}`,
      `- Delays: ${s.hasWait ? 'yes' : 'no'}`,
      `- Thresholds used: ${s.distinctThresholds.length ? s.distinctThresholds.join(', ') : 'none'}`,
      s.distinctThresholds.length === 1
        ? '- NOTE: a single threshold for both switching on and off produces chatter. Separate on/off points would be hysteresis.'
        : s.distinctThresholds.length >= 2
          ? '- NOTE: multiple distinct thresholds present, which may indicate deliberate hysteresis.'
          : '',
    )
  }

  return lines.filter(Boolean).join('\n')
}
