// ---------------------------------------------------------------------------
// GraphChecker
//
// Reads the bench and reports what is wrong with it. It has no authority to
// stop anything: a student may deploy a half-wired mess and watch it fail on
// the farm, which is a better teacher than a disabled button. Severity exists
// to sort the list, not to gate progress.
//
// Every issue names the physical constraint and asks a question. None of them
// state the fix.
// ---------------------------------------------------------------------------

import { CATALOG_BY_ID } from './ComponentCatalog'
import {
  graph,
  controllers,
  isBreadboard,
  partOf,
  peersOf,
  wiredOutputs,
  wiredSensors,
} from './CircuitGraph'
import { terminalsFor } from './PinRegistry'

export type Severity = 'error' | 'warning' | 'info'
export type System = 'POWER' | 'ELECTRICAL' | 'MECHANICAL' | 'SOFTWARE'

export interface Issue {
  severity: Severity
  system: System
  instanceIds: string[]
  /** What is physically wrong, with real numbers. */
  message: string
  /** Why that constraint exists. */
  why: string
  /** A question, never an instruction. */
  prompt: string
}

export interface CheckSummary {
  issues: Issue[]
  errors: number
  warnings: number
  /** Always true. Deployment is never blocked — failure is the lesson. */
  deployable: true
  /** Plain sentence for the header. */
  headline: string
}

export function checkGraph(): CheckSummary {
  const issues: Issue[] = []

  issues.push(...checkStructure())
  issues.push(...checkPower())
  issues.push(...checkLogicLevels())
  issues.push(...checkDriveStages())
  issues.push(...checkSignalPaths())

  const errors = issues.filter((i) => i.severity === 'error').length
  const warnings = issues.filter((i) => i.severity === 'warning').length

  let headline: string
  if (!graph.placed.length) headline = 'The bench is empty. Drag parts from your tray to begin.'
  else if (!issues.length) headline = 'No problems found. This circuit should behave as wired.'
  else if (errors) headline = `${errors} problem${errors === 1 ? '' : 's'} that will stop this working, and ${warnings} worth a look.`
  else headline = `${warnings} thing${warnings === 1 ? '' : 's'} worth a look. Nothing here prevents you deploying.`

  graph.lastCheckedAt = Date.now()
  return { issues, errors, warnings, deployable: true, headline }
}

// --- structural ------------------------------------------------------------

function checkStructure(): Issue[] {
  const out: Issue[] = []
  if (!graph.placed.length) return out

  if (!controllers().length) {
    out.push({
      severity: 'error',
      system: 'ELECTRICAL',
      instanceIds: [],
      message: 'There is no controller on the bench.',
      why: 'Sensors report to something and actuators are switched by something. Without a controller nothing executes a decision.',
      prompt: 'What part of this circuit is supposed to run your program?',
    })
  }

  // Anything placed but entirely unwired is almost always an oversight.
  for (const inst of graph.placed) {
    const part = CATALOG_BY_ID.get(inst.partId)!
    if (part.category === 'prototyping' || part.category === 'passives') continue
    if (isBreadboard(inst.instanceId)) continue
    const anyWire = graph.wires.some(
      (w) => w.fromInstance === inst.instanceId || w.toInstance === inst.instanceId,
    )
    if (!anyWire) {
      out.push({
        severity: 'warning',
        system: 'ELECTRICAL',
        instanceIds: [inst.instanceId],
        message: `${part.name} is on the bench with nothing connected to it.`,
        why: 'An unwired component draws no power, reports nothing and switches nothing.',
        prompt: 'Is this part meant to be in the design, or was it placed and forgotten?',
      })
    }
  }
  return out
}

// --- power and ground ------------------------------------------------------

function checkPower(): Issue[] {
  const out: Issue[] = []

  for (const inst of graph.placed) {
    const part = CATALOG_BY_ID.get(inst.partId)!
    if (part.category === 'prototyping' || part.category === 'passives') continue
    if (isBreadboard(inst.instanceId)) continue

    const terms = terminalsFor(part)
    const needsSupply = terms.filter((t) => t.role === 'supplyIn')
    const needsGround = terms.filter((t) => t.role === 'groundIn')

    for (const t of needsSupply) {
      // Peers, not wires: a pin in a rail is powered if anything else on that
      // rail supplies it, however many holes away that source sits.
      const peers = peersOf(inst.instanceId, t.name)
      const sources = peers.filter((pr) => {
        const other = partOf(pr.instanceId)
        if (!other) return false
        return terminalsFor(other).some((x) => x.name === pr.pin && x.role === 'powerOut')
      })

      if (!peers.length) {
        out.push({
          severity: 'error',
          system: 'POWER',
          instanceIds: [inst.instanceId],
          message: `${part.name} ${t.name} has no power connection.`,
          why: `This part expects ${t.volts ?? part.supplyVoltage ?? '?'} V on that pin to operate at all.`,
          prompt: 'Where is this component getting its power from?',
        })
        continue
      }

      if (!sources.length) {
        out.push({
          severity: 'error',
          system: 'POWER',
          instanceIds: [inst.instanceId],
          message: `${part.name} ${t.name} is connected, but nothing on that node supplies power.`,
          why: 'Being joined to other pins is not the same as being fed. Something on the node has to be a source.',
          prompt: 'Trace this node back. Does it reach a supply anywhere along the way?',
        })
      }

      // Voltage agreement across the node.
      for (const src of sources) {
        const otherPart = partOf(src.instanceId)!
        const otherTerm = terminalsFor(otherPart).find((x) => x.name === src.pin)
        if (!otherTerm || otherTerm.volts === undefined || t.volts === undefined) continue
        const otherId = src.instanceId
        const otherPin = src.pin

        if (Math.abs(otherTerm.volts - t.volts) > 0.4) {
          const under = otherTerm.volts < t.volts
          out.push({
            severity: under ? 'warning' : 'error',
            system: 'POWER',
            instanceIds: [inst.instanceId, otherId],
            message: `${part.name} expects ${t.volts} V but ${otherPart.name} ${otherPin} supplies ${otherTerm.volts} V.`,
            why: under
              ? 'Under-voltage parts behave unpredictably: sensors drift and coils fail to pull in.'
              : 'Over-voltage damages the part, often permanently and often silently.',
            prompt: 'Compare the rail you connected against the voltage on the datasheet. Do they agree?',
          })
        }
      }
    }

    // Ground continuity check:
    // A component is grounded if any of its ground terminals shares an electrical node
    // with any other component's ground terminal or power return.
    const isGndTerm = (name: string, role?: string) =>
      role === 'groundIn' ||
      role === 'groundOut' ||
      name.toUpperCase().startsWith('GND') ||
      name === '-' ||
      name === 'IN-' ||
      name === 'OUT-' ||
      name === 'BAT-' ||
      name === 'PV-' ||
      name === 'LOAD-' ||
      name === 'VIN-' ||
      name === 'K' ||
      name === 'E'

    const groundedSomewhere = needsGround.some((g) =>
      peersOf(inst.instanceId, g.name).some((pr) => {
        const other = partOf(pr.instanceId)
        return !!other && terminalsFor(other).some((x) => x.name === pr.pin && isGndTerm(x.name, x.role))
      }),
    )

    for (const t of needsGround) {
      if (groundedSomewhere) break
      const groundPeers = peersOf(inst.instanceId, t.name).filter((pr) => {
        const other = partOf(pr.instanceId)
        if (!other) return false
        return terminalsFor(other).some((x) => x.name === pr.pin && isGndTerm(x.name, x.role))
      })
      if (!groundPeers.length) {
        out.push({
          severity: 'error',
          system: 'POWER',
          instanceIds: [inst.instanceId],
          message: `${part.name} ${t.name} is not connected to ground.`,
          why: 'Voltage is a difference between two points. Without a shared ground there is no reference, and signals become meaningless.',
          prompt: 'Every device in a circuit shares one thing. What is it?',
        })
      }
    }
  }
  return out
}

// --- logic levels ----------------------------------------------------------

function checkLogicLevels(): Issue[] {
  const out: Issue[] = []

  for (const s of wiredSensors()) {
    const ctrl = partOf(s.controllerInstance)
    if (!ctrl?.inputToleranceVolts) continue
    const sensorVolts = s.part.signalVoltage
    if (sensorVolts === undefined) continue

    if (sensorVolts > ctrl.inputToleranceVolts + 0.05) {
      out.push({
        severity: 'error',
        system: 'ELECTRICAL',
        instanceIds: [s.instanceId, s.controllerInstance],
        message: `${s.part.name} presents ${sensorVolts.toFixed(1)} V into ${ctrl.name} ${s.pinName}, which tolerates ${ctrl.inputToleranceVolts.toFixed(1)} V.`,
        why: 'Input pins clamp above their rated voltage. The excess flows through the protection diodes and eventually destroys them.',
        prompt: 'One side speaks louder than the other can listen. What goes between two circuits in that situation?',
      })
    }
  }

  for (const s of wiredSensors()) {
    if (!s.readable) {
      out.push({
        severity: 'error',
        system: 'ELECTRICAL',
        instanceIds: [s.instanceId, s.controllerInstance],
        message: `${s.part.name} outputs an analog voltage into ${s.pinName}. ${s.reason}`,
        why: 'A digital pin only reports high or low. A moisture level between the two is lost entirely.',
        prompt: 'Which pins on your board can measure a voltage rather than just detect one?',
      })
    }
  }
  return out
}

// --- drive stages ----------------------------------------------------------

function checkDriveStages(): Issue[] {
  const out: Issue[] = []
  const ctrls = controllers()
  if (!ctrls.length) return out

  const pinLimit = Math.min(
    ...ctrls.map((c) => CATALOG_BY_ID.get(c.partId)?.pinCurrentLimitMa ?? Infinity),
  )

  for (const inst of graph.placed) {
    const part = CATALOG_BY_ID.get(inst.partId)!
    if (part.category !== 'actuators') continue

    // Is this actuator wired straight to a controller pin?
    const directToController = graph.wires.some((w) => {
      const a = w.fromInstance === inst.instanceId ? w.toInstance : w.fromInstance
      return w.fromInstance === inst.instanceId || w.toInstance === inst.instanceId
        ? ctrls.some((c) => c.instanceId === a)
        : false
    })

    const draw = part.currentMa ?? 0
    if (directToController && draw > pinLimit) {
      out.push({
        severity: 'error',
        system: 'ELECTRICAL',
        instanceIds: [inst.instanceId],
        message: `${part.name} draws about ${draw} mA and is wired straight to a controller pin rated for roughly ${pinLimit} mA.`,
        why: 'The pin cannot source that current. The rail collapses, the board browns out and resets, and the driver transistor inside the chip fails.',
        prompt: 'A control pin carries a decision, not the power to carry it out. What sits between the two?',
      })
    }

    // Placed, wired to something, but nothing that can switch it.
    const anyWire = graph.wires.some(
      (w) => w.fromInstance === inst.instanceId || w.toInstance === inst.instanceId,
    )
    const switched = wiredOutputs().some((o) => o.loadInstance === inst.instanceId)
    if (anyWire && !switched && !directToController) {
      out.push({
        severity: 'warning',
        system: 'ELECTRICAL',
        instanceIds: [inst.instanceId],
        message: `${part.name} is wired, but nothing your program controls can switch it on or off.`,
        why: 'Without a switching stage under program control the load is either always on or always off.',
        prompt: 'How would a line of your code reach this component?',
      })
    }
  }

  for (const o of wiredOutputs()) {
    if (!o.drivable) {
      out.push({
        severity: 'error',
        system: 'ELECTRICAL',
        instanceIds: [o.instanceId, o.controllerInstance],
        message: `${o.part.name} is controlled from ${o.pinName}. ${o.reason}`,
        why: 'Some pins on this board are physically wired as inputs only inside the silicon. No amount of code changes that.',
        prompt: 'Check the pin notes on your board. Which of them can be driven as outputs?',
      })
    }
    if (o.part.category === 'drivers' && !o.loadInstance) {
      out.push({
        severity: 'warning',
        system: 'ELECTRICAL',
        instanceIds: [o.instanceId],
        message: `${o.part.name} is under program control but has nothing on its switched output.`,
        why: 'A switch with no load connected does nothing observable when it closes.',
        prompt: 'What is this switching stage meant to be turning on?',
      })
    }
  }
  return out
}

// --- signal paths ----------------------------------------------------------

function checkSignalPaths(): Issue[] {
  const out: Issue[] = []
  if (!controllers().length) return out

  const sensorsPlaced = graph.placed.filter(
    (p) => CATALOG_BY_ID.get(p.partId)?.category === 'sensors',
  )
  const sensorsWired = new Set(wiredSensors().map((s) => s.instanceId))

  for (const inst of sensorsPlaced) {
    if (sensorsWired.has(inst.instanceId)) continue
    const part = CATALOG_BY_ID.get(inst.partId)!
    const anyWire = graph.wires.some(
      (w) => w.fromInstance === inst.instanceId || w.toInstance === inst.instanceId,
    )
    if (!anyWire) continue

    out.push({
      severity: 'warning',
      system: 'SOFTWARE',
      instanceIds: [inst.instanceId],
      message: `${part.name} has power but its signal line does not reach a controller.`,
      why: 'A sensor that is powered still reports nowhere. Your program will have no block for it.',
      prompt: 'The reading has to physically travel somewhere. Where is it going?',
    })
  }
  return out
}
