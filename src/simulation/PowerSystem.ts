// ---------------------------------------------------------------------------
// PowerSystem
//
// Energy accounting driven by the circuit the student actually built. Every
// number here is derived from placed components and the nets between them:
// buy a 50 W panel and 50 W is the ceiling, disconnect the panel from the bank
// and charging stops, leave out a charge controller and the harvest suffers.
//
// The previous model read a fixed 600 W constant and charged the battery
// regardless of wiring, which meant the twin was reporting a system nobody had
// built. Nothing in this file is allowed to know a value the bench does not.
// ---------------------------------------------------------------------------

import { graph, partOf, peersOf } from '../hardware/CircuitGraph'
import type { CatalogPart } from '../hardware/ComponentCatalog'
import { terminalsFor } from '../hardware/PinRegistry'
import { outputOf } from './DeviceState'
import { wiredOutputs } from '../hardware/CircuitGraph'

export interface PowerTopology {
  /** Total peak watts of sources that reach the bank, directly or via a controller. */
  arrayPeakWatts: number
  /** Peak watts of every source placed, connected or not. Used for diagnostics. */
  installedPeakWatts: number
  /** Usable storage in watt-hours. Zero when no battery is wired in. */
  capacityWh: number
  /** Harvest efficiency implied by the charge controller in the path. */
  harvestEfficiency: number
  /** Name of the controller found, for the telemetry readout. */
  controllerName: string
  /** True when a source is electrically joined to storage. */
  chargePathComplete: boolean
  /** Continuous draw of everything currently switched on, in watts. */
  activeLoadWatts: number
  /** Standby draw of controllers and sensors that are powered. */
  standbyWatts: number
}

const EFFICIENCY = {
  mppt: 0.95,
  pwm: 0.75,
  /** A panel bolted straight to a bank harvests poorly and abuses the cells. */
  none: 0.55,
}

function placedParts(): { instanceId: string; part: CatalogPart }[] {
  return graph.placed
    .map((p) => ({ instanceId: p.instanceId, part: partOf(p.instanceId)! }))
    .filter((x) => !!x.part)
}

/**
 * True when two components share any electrical node. Power flows through the
 * same nets as signals, so a panel joined to the bank through a breadboard rail
 * counts exactly as a direct wire does.
 */
function componentsJoined(aId: string, bId: string): boolean {
  const aPart = partOf(aId)
  if (!aPart) return false
  for (const t of terminalsFor(aPart)) {
    for (const peer of peersOf(aId, t.name)) {
      if (peer.instanceId === bId) return true
    }
  }
  return false
}

/** Charge controller sitting on the bench, if any. */
function chargeController(): { instanceId: string; part: CatalogPart } | undefined {
  return placedParts().find((p) => p.part.id === 'mpptController' || p.part.id === 'pwmController')
}

export function topology(): PowerTopology {
  const parts = placedParts()
  const sources = parts.filter((p) => p.part.peakWatts !== undefined)
  const stores = parts.filter((p) => p.part.capacityWh !== undefined)

  const installedPeakWatts = sources.reduce((sum, s) => sum + (s.part.peakWatts ?? 0), 0)
  const capacityWh = stores.reduce((sum, s) => sum + (s.part.capacityWh ?? 0), 0)

  const cc = chargeController()

  // A source counts toward generation only if it can actually reach storage —
  // straight to the bank, or through a charge controller wired to both.
  let arrayPeakWatts = 0
  let chargePathComplete = false

  for (const src of sources) {
    const direct = stores.some((st) => componentsJoined(src.instanceId, st.instanceId))
    const viaController =
      !!cc &&
      componentsJoined(src.instanceId, cc.instanceId) &&
      stores.some((st) => componentsJoined(cc.instanceId, st.instanceId))

    if (direct || viaController) {
      arrayPeakWatts += src.part.peakWatts ?? 0
      chargePathComplete = true
    }
  }

  const harvestEfficiency = cc
    ? cc.part.id === 'mpptController'
      ? EFFICIENCY.mppt
      : EFFICIENCY.pwm
    : EFFICIENCY.none

  const controllerName = cc ? cc.part.name : 'none — panel wired straight to the bank'

  // Loads: anything currently drawing, plus the standby of live electronics.
  // A hard-wired load counts even though no program switched it, otherwise the
  // energy ledger silently ignores the very thing flattening the battery.
  const hardWired = new Set(alwaysOnLoads().map((l) => l.instanceId))
  let activeLoadWatts = 0
  for (const { instanceId, part } of parts) {
    if (part.category !== 'actuators') continue
    const driver = wiredOutputs().find((o) => o.loadInstance === instanceId)
    const switched = driver ? outputOf(driver.instanceId).on : outputOf(instanceId).on
    if (switched || hardWired.has(instanceId)) activeLoadWatts += part.ratedWatts ?? 0
  }

  const standbyWatts = parts
    .filter((p) => p.part.category === 'controllers' || p.part.category === 'sensors')
    .reduce((sum, p) => sum + (p.part.ratedWatts ?? 0.3), 0)

  return {
    arrayPeakWatts,
    installedPeakWatts,
    capacityWh,
    harvestEfficiency,
    controllerName,
    chargePathComplete,
    activeLoadWatts,
    standbyWatts,
  }
}

/**
 * Loads sitting directly across a supply, with no switching stage between them.
 *
 * This is the rule that makes the twin behave like hardware rather than like a
 * program: a pump whose positive lead reaches a battery positive and whose
 * negative reaches the same battery's negative is energised continuously. No
 * code is consulted, because in reality none would be. Wiring a motor straight
 * to a bank is exactly how a student floods a field and flattens a battery
 * overnight, and the simulation has to let that happen.
 */
export function alwaysOnLoads(): { instanceId: string; part: CatalogPart; via: string }[] {
  const out: { instanceId: string; part: CatalogPart; via: string }[] = []
  const parts = placedParts()
  const supplies = parts.filter(
    (p) => p.part.capacityWh !== undefined || p.part.peakWatts !== undefined,
  )
  if (!supplies.length) return out

  for (const load of parts) {
    if (load.part.category !== 'actuators') continue

    const terms = terminalsFor(load.part)
    const pos = terms.find((t) => t.role === 'signalIn' && t.name === '+')
    const neg = terms.find((t) => t.role === 'groundIn' && t.name === '-')
    if (!pos || !neg) continue

    for (const sup of supplies) {
      const supTerms = terminalsFor(sup.part)
      const supPos = supTerms.find((t) => t.role === 'powerOut')
      const supNeg = supTerms.find((t) => t.role === 'groundIn')
      if (!supPos || !supNeg) continue

      const posJoined = peersOf(load.instanceId, pos.name).some(
        (pr) => pr.instanceId === sup.instanceId && pr.pin === supPos.name,
      )
      const negJoined = peersOf(load.instanceId, neg.name).some(
        (pr) => pr.instanceId === sup.instanceId && pr.pin === supNeg.name,
      )

      if (posJoined && negJoined) {
        out.push({ instanceId: load.instanceId, part: load.part, via: sup.part.name })
        break
      }
    }
  }
  return out
}

/**
 * Whether water can physically travel from a source of water, through a pump,
 * to something that delivers it to the soil. Being powered is not enough: a
 * pump with nothing on its discharge port moves nothing.
 */
export interface HydraulicPath {
  complete: boolean
  hasSource: boolean
  hasPump: boolean
  hasDelivery: boolean
  reason?: string
}

/**
 * Walk the water route hop by hop, the way the liquid would.
 *
 * Traversal enters a component at a fluidIn port and leaves by its fluidOut,
 * so a length of tubing genuinely carries the route rather than decorating it,
 * and a closed valve stops the walk dead. Adjacency alone is not a path.
 */
function walkFluid(
  fromInstance: string,
  fromPort: string,
  targets: Set<string>,
  seen = new Set<string>(),
): { reached: boolean; blockedBy?: string } {
  const key = `${fromInstance}:${fromPort}`
  if (seen.has(key)) return { reached: false }
  seen.add(key)

  for (const peer of peersOf(fromInstance, fromPort)) {
    if (targets.has(peer.instanceId)) return { reached: true }

    const peerPart = partOf(peer.instanceId)
    if (!peerPart) continue

    const terms = terminalsFor(peerPart)
    const entered = terms.find((t) => t.name === peer.pin && t.role === 'fluidIn')
    if (!entered) continue

    // A solenoid only passes water while its coil is energised.
    if (peerPart.id === 'solenoidValve' && !outputOf(peer.instanceId).on) {
      return { reached: false, blockedBy: peerPart.name }
    }

    for (const exit of terms.filter((t) => t.role === 'fluidOut')) {
      const onward = walkFluid(peer.instanceId, exit.name, targets, seen)
      if (onward.reached) return onward
      if (onward.blockedBy) return onward
    }
  }
  return { reached: false }
}

export function hydraulicPath(): HydraulicPath {
  const parts = placedParts()
  const tanks = parts.filter((p) => p.part.id === 'waterTank')
  const pumps = parts.filter((p) => p.part.category === 'actuators' && p.part.id.startsWith('pump'))
  const delivery = parts.filter(
    (p) => p.part.id === 'sprinklerHead' || p.part.id === 'dripEmitter',
  )

  const hasSource = tanks.length > 0
  const hasPump = pumps.length > 0
  const hasDelivery = delivery.length > 0

  if (!hasPump) {
    return { complete: false, hasSource, hasPump, hasDelivery, reason: 'No pump is installed.' }
  }
  if (!hasSource) {
    return {
      complete: false, hasSource, hasPump, hasDelivery,
      reason: 'The pump has nothing to draw from — no tank is installed.',
    }
  }
  if (!hasDelivery) {
    return {
      complete: false, hasSource, hasPump, hasDelivery,
      reason: 'Water has nowhere to go — no sprinkler or emitter is installed.',
    }
  }

  const pump = pumps[0]
  const suction = walkFluid(pump.instanceId, 'IN', new Set(tanks.map((t) => t.instanceId)))
  const discharge = walkFluid(pump.instanceId, 'OUT', new Set(delivery.map((d) => d.instanceId)))

  if (discharge.blockedBy || suction.blockedBy) {
    return {
      complete: false, hasSource, hasPump, hasDelivery,
      reason: `${discharge.blockedBy ?? suction.blockedBy} is closed, so nothing can get past it.`,
    }
  }

  const drawsFromTank = suction.reached
  const reachesDelivery = discharge.reached

  if (!drawsFromTank) {
    return {
      complete: false, hasSource, hasPump, hasDelivery,
      reason: 'The pump inlet is not plumbed to the tank.',
    }
  }
  if (!reachesDelivery) {
    return {
      complete: false, hasSource, hasPump, hasDelivery,
      reason: 'The pump outlet is not plumbed to anything that waters the bed.',
    }
  }
  return { complete: true, hasSource, hasPump, hasDelivery }
}

/** Human-readable account of where the current numbers come from. */
export function explainPower(t: PowerTopology, solarWatts: number, hour: number): string[] {
  const lines: string[] = []
  const elevation = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI))

  if (!t.installedPeakWatts) {
    lines.push('No generation installed, so solar output is zero at every hour.')
  } else if (!t.chargePathComplete) {
    lines.push(
      `${t.installedPeakWatts} W of panel is installed but nothing reaches the battery, ` +
        'so none of it is being stored.',
    )
  } else {
    lines.push(
      `${t.arrayPeakWatts} W array × ${elevation.toFixed(2)} sun elevation ` +
        `× ${t.harvestEfficiency.toFixed(2)} harvest = ${Math.round(solarWatts)} W.`,
    )
    lines.push(`Charge controller: ${t.controllerName}.`)
  }

  if (!t.capacityWh) {
    lines.push('No battery is wired in, so nothing is stored and the system dies at dusk.')
  } else {
    lines.push(`Storage: ${t.capacityWh} Wh.`)
  }

  lines.push(
    `Load right now: ${t.activeLoadWatts.toFixed(1)} W switched on plus ` +
      `${t.standbyWatts.toFixed(1)} W standby.`,
  )
  return lines
}
