// ---------------------------------------------------------------------------
// HardwareValidator
//
// Pure validation engine. It knows nothing about rendering, nothing about the
// running simulation, and holds no state of its own — it takes a description of
// what the student assembled and returns what is wrong with it. That isolation
// is deliberate: the same validator runs in the tool shed preview, in the
// circuit lab, and in automated tests, with no wiring in between.
//
// Two classes of problem are reported. Electrical conflicts are absolute — a
// 5 V signal on a 3.3 V ADC damages the part regardless of how the system is
// used. Energy conflicts are cumulative — a system can be electrically perfect
// and still fail on day three because the daily yield never covered the daily
// demand. Students consistently miss the second kind, so it is modelled with
// the same rigour as the first.
// ---------------------------------------------------------------------------

import { CONFIG } from './FarmState'

// --- component taxonomy ----------------------------------------------------

export type ComponentKind = 'source' | 'storage' | 'controller' | 'sensor' | 'actuator'

/** How an actuator is driven from the controller. */
export type DriveMethod = 'direct' | 'relay' | 'motorDriver'

export interface MechanicalEnvelope {
  /** Cartesian systems only. Travel limits in millimetres. */
  travelXmm: number
  travelYmm: number
  maxFeedMmPerMin: number
  maxPayloadKg: number
  /** Coordinate-grid movement only — no multi-jointed kinematics. */
  axes: 2
}

export interface ComponentSpec {
  id: string
  kind: ComponentKind
  label: string

  /** Voltage the part needs on its supply pins. */
  supplyVoltage?: number
  /** Voltage a sensor actually presents on its signal line. */
  signalVoltage?: number
  /** Highest voltage a controller input can tolerate. */
  inputToleranceVolts?: number
  /** Current a single controller I/O pin can source, in milliamps. */
  pinCurrentLimitMa?: number

  /** Sources: peak generation under full irradiance. */
  peakWatts?: number
  /** Storage: usable capacity. */
  capacityWh?: number

  /** Actuators: continuous draw while running. */
  ratedWatts?: number
  /** Actuators: current drawn from whatever drives them, in milliamps. */
  drawMa?: number
  /** Actuators: expected run time across a 24 hour cycle. */
  dutyHoursPerDay?: number
  driveMethod?: DriveMethod

  mechanical?: MechanicalEnvelope
}

/** A single wire in the assembled system. */
export interface ConnectionNode {
  fromId: string
  /** Terminal on the source component, e.g. 'AOUT', 'VCC', 'IN'. */
  fromTerminal: string
  toId: string
  /** Pin or rail on the destination, e.g. 'GPIO32', '3V3', 'GND'. */
  toTerminal: string
  /** Whether this run carries power or a signal. Affects which checks apply. */
  role: 'power' | 'ground' | 'signal'
}

/** What the student is trying to irrigate. Bounds the mechanical checks. */
export interface FieldGeometry {
  widthMm: number
  depthMm: number
  /** Mass the gantry must carry: nozzle, hose, sensor head. */
  toolPayloadKg: number
  /** How many full passes of the bed are wanted per day. */
  passesPerDay: number
}

// --- conflict reporting ----------------------------------------------------

export type ConflictCode =
  | 'VOLTAGE_OVER_TOLERANCE'
  | 'SUPPLY_VOLTAGE_MISMATCH'
  | 'PIN_CURRENT_EXCEEDED'
  | 'MISSING_DRIVER'
  | 'FLOATING_SIGNAL'
  | 'NO_CONTROLLER'
  | 'NO_STORAGE'
  | 'NO_SOURCE'
  | 'DAILY_ENERGY_DEFICIT'
  | 'OVERNIGHT_AUTONOMY_SHORTFALL'
  | 'STORAGE_UNDERSIZED'
  | 'TRAVEL_ENVELOPE_EXCEEDED'
  | 'PAYLOAD_EXCEEDED'
  | 'FEED_RATE_INSUFFICIENT'

export type Severity = 'blocking' | 'warning'

export interface Conflict {
  code: ConflictCode
  severity: Severity
  /** Components implicated, so the UI can highlight them. */
  componentIds: string[]
  /** Plain-language statement of what is wrong. */
  message: string
  /**
   * A question rather than a fix. The validator never tells the student what to
   * change; it tells them what it observed and asks what follows from it.
   */
  prompt: string
  /** Supporting numbers, so the UI can show the arithmetic. */
  detail?: Record<string, number>
}

export interface EnergyBudget {
  /** Effective full-sun hours after the daylight curve is integrated. */
  effectiveSunHours: number
  dailyYieldWh: number
  dailyDemandWh: number
  /** Positive means surplus, negative means the bank drains a little each day. */
  marginWh: number
  /** Demand between dusk and dawn, which storage alone must cover. */
  overnightDemandWh: number
  usableStorageWh: number
}

export interface ValidationReport {
  conflicts: Conflict[]
  budget: EnergyBudget
  /** True when nothing blocking remains. Warnings do not stop deployment. */
  deployable: boolean
}

// --- catalogue -------------------------------------------------------------

/**
 * Parts available in the tool shed. Values are representative of the real
 * modules a student would buy, because the whole point is that the constraints
 * are not invented.
 */
export const CATALOGUE: Record<string, ComponentSpec> = {
  solarPanel: {
    id: 'solarPanel',
    kind: 'source',
    label: 'Solar array',
    peakWatts: CONFIG.panelPeakWatts,
    supplyVoltage: CONFIG.busVoltage,
  },
  battery: {
    id: 'battery',
    kind: 'storage',
    label: 'Battery bank',
    capacityWh: CONFIG.batteryCapacityWh,
    supplyVoltage: CONFIG.busVoltage,
  },
  esp32: {
    id: 'esp32',
    kind: 'controller',
    label: 'ESP32 controller',
    supplyVoltage: 3.3,
    inputToleranceVolts: 3.3,
    pinCurrentLimitMa: 12,
  },
  soilSensorCapacitive: {
    id: 'soilSensorCapacitive',
    kind: 'sensor',
    label: 'Capacitive soil sensor (3.3 V)',
    supplyVoltage: 3.3,
    signalVoltage: 3.0,
  },
  soilSensorResistive5v: {
    id: 'soilSensorResistive5v',
    kind: 'sensor',
    label: 'Resistive soil sensor (5 V)',
    supplyVoltage: 5,
    signalVoltage: 5,
  },
  pump: {
    id: 'pump',
    kind: 'actuator',
    label: 'Stationary pump',
    supplyVoltage: 12,
    ratedWatts: 30,
    drawMa: 2500,
    dutyHoursPerDay: 2.5,
    driveMethod: 'relay',
  },
  pumpDirect: {
    id: 'pumpDirect',
    kind: 'actuator',
    label: 'Stationary pump (no relay)',
    supplyVoltage: 12,
    ratedWatts: 30,
    drawMa: 2500,
    dutyHoursPerDay: 2.5,
    driveMethod: 'direct',
  },
  panelCompact: {
    id: 'panelCompact',
    kind: 'source',
    label: 'Compact solar panel (100 W)',
    peakWatts: 100,
    supplyVoltage: CONFIG.busVoltage,
  },
  batterySmall: {
    id: 'batterySmall',
    kind: 'storage',
    label: 'Compact battery (120 Wh)',
    capacityWh: 120,
    supplyVoltage: CONFIG.busVoltage,
  },
  relayModule: {
    id: 'relayModule',
    kind: 'controller',
    label: 'Relay module',
    supplyVoltage: 5,
    inputToleranceVolts: 5,
    pinCurrentLimitMa: 10000,
  },
  stepperDriver: {
    id: 'stepperDriver',
    kind: 'controller',
    label: 'Stepper motor driver',
    supplyVoltage: 12,
    inputToleranceVolts: 5,
    pinCurrentLimitMa: 4000,
  },
  gantry: {
    id: 'gantry',
    kind: 'actuator',
    label: 'Cartesian linear gantry',
    supplyVoltage: 12,
    ratedWatts: 45,
    drawMa: 3800,
    dutyHoursPerDay: 3,
    driveMethod: 'motorDriver',
    // Coordinate-grid movement over the bed. Two axes only: reliable, cheap to
    // calibrate, and it keeps the maths in a space students can reason about.
    mechanical: {
      axes: 2,
      travelXmm: 2400,
      travelYmm: 1200,
      maxFeedMmPerMin: 3000,
      maxPayloadKg: 2.5,
    },
  },
}

// --- the validator ---------------------------------------------------------

const DEFAULT_FIELD: FieldGeometry = {
  widthMm: 2000,
  depthMm: 900,
  toolPayloadKg: 1.4,
  passesPerDay: 4,
}

export class HardwareValidator {
  private readonly field: FieldGeometry

  constructor(field: FieldGeometry = DEFAULT_FIELD) {
    this.field = field
  }

  /**
   * Full assessment of an assembled system.
   *
   * @param components every part the student installed
   * @param nodes every wire between them
   * @param dutyOverride run hours per day, keyed by component id. This is the
   *        student's irrigation schedule rather than a property of the part, so
   *        the same hardware can be budgeted as viable or doomed depending on
   *        how hard they decide to work it.
   */
  validate(
    components: ComponentSpec[],
    nodes: ConnectionNode[],
    dutyOverride: Record<string, number> = {},
  ): ValidationReport {
    components = components.map((c) =>
      dutyOverride[c.id] !== undefined ? { ...c, dutyHoursPerDay: dutyOverride[c.id] } : c,
    )

    const conflicts: Conflict[] = [
      ...this.checkCompleteness(components),
      ...this.checkSignalIntegrity(components, nodes),
      ...this.checkDriveCapability(components, nodes),
      ...this.checkMechanics(components),
    ]

    const budget = this.computeEnergyBudget(components)
    conflicts.push(...this.checkEnergyBudget(components, budget))

    return {
      conflicts,
      budget,
      deployable: !conflicts.some((c) => c.severity === 'blocking'),
    }
  }

  // --- structural ----------------------------------------------------------

  private checkCompleteness(components: ComponentSpec[]): Conflict[] {
    const out: Conflict[] = []
    const isBrain = (id: string) => id !== 'relayModule' && id !== 'stepperDriver'
    const has = (k: ComponentKind) =>
      components.some((c) => c.kind === k && (k !== 'controller' || isBrain(c.id)))

    if (!has('controller')) {
      out.push({
        code: 'NO_CONTROLLER',
        severity: 'blocking',
        componentIds: [],
        message: 'No controller is present, so nothing can execute your logic.',
        prompt: 'What part of this system is supposed to make decisions?',
      })
    }
    if (!has('source')) {
      out.push({
        code: 'NO_SOURCE',
        severity: 'blocking',
        componentIds: [],
        message: 'No generation source is present.',
        prompt: 'Where is the energy for this system going to come from?',
      })
    }
    if (!has('storage')) {
      out.push({
        code: 'NO_STORAGE',
        severity: 'blocking',
        componentIds: [],
        message: 'No storage is present, so the system stops the moment the sun goes down.',
        prompt: 'What happens to your crops between dusk and dawn?',
      })
    }
    return out
  }

  // --- electrical ----------------------------------------------------------

  /**
   * Logic-level and supply-rail checking. A 5 V sensor feeding a 3.3 V ADC is
   * the classic destroyer of student microcontrollers, so it is called out
   * explicitly with the actual numbers.
   */
  private checkSignalIntegrity(components: ComponentSpec[], nodes: ConnectionNode[]): Conflict[] {
    const out: Conflict[] = []
    const byId = new Map(components.map((c) => [c.id, c]))
    const controllers = components.filter((c) => c.kind === 'controller')

    for (const node of nodes) {
      const from = byId.get(node.fromId)
      const to = byId.get(node.toId)
      if (!from || !to) continue

      if (node.role === 'signal' && from.signalVoltage && to.inputToleranceVolts) {
        if (from.signalVoltage > to.inputToleranceVolts + 0.05) {
          out.push({
            code: 'VOLTAGE_OVER_TOLERANCE',
            severity: 'blocking',
            componentIds: [from.id, to.id],
            message:
              `${from.label} presents ${from.signalVoltage.toFixed(1)} V on ${node.fromTerminal}, ` +
              `but ${to.label} tolerates only ${to.inputToleranceVolts.toFixed(1)} V on ${node.toTerminal}. ` +
              'The ADC input would be over-driven.',
            prompt:
              'This sensor swings higher than the input can survive. What sits between two circuits ' +
              'when one speaks louder than the other can listen?',
            detail: { presented: from.signalVoltage, tolerated: to.inputToleranceVolts },
          })
        }
      }

      if (node.role === 'power' && from.supplyVoltage && to.supplyVoltage) {
        if (Math.abs(from.supplyVoltage - to.supplyVoltage) > 0.4) {
          out.push({
            code: 'SUPPLY_VOLTAGE_MISMATCH',
            severity: 'blocking',
            componentIds: [from.id, to.id],
            message:
              `${to.label} expects ${to.supplyVoltage} V but is fed from a ${from.supplyVoltage} V rail.`,
            prompt: 'Check the datasheet voltage for this part against the rail you connected it to.',
            detail: { expected: to.supplyVoltage, supplied: from.supplyVoltage },
          })
        }
      }
    }

    // A sensor with no signal path is invisible to the program, which is a far
    // more confusing failure than a wiring error if it is not named.
    for (const sensor of components.filter((c) => c.kind === 'sensor')) {
      const wired = nodes.some(
        (n) => n.role === 'signal' && n.fromId === sensor.id && controllers.some((c) => c.id === n.toId),
      )
      if (!wired) {
        out.push({
          code: 'FLOATING_SIGNAL',
          severity: 'blocking',
          componentIds: [sensor.id],
          message: `${sensor.label} has no signal path to a controller. Any reading will float.`,
          prompt: 'Your program asks this sensor for a value. How does that value physically reach it?',
        })
      }
    }

    return out
  }

  /**
   * Controller pins source only a few milliamps. Anything with a motor in it
   * needs an intermediary, and the validator says which kind rather than
   * silently accepting a design that would brown out the board.
   */
  private checkDriveCapability(components: ComponentSpec[], nodes: ConnectionNode[]): Conflict[] {
    const out: Conflict[] = []
    const controllers = components.filter(
      (c) => c.kind === 'controller' && c.id !== 'relayModule' && c.id !== 'stepperDriver',
    )
    const limit = Math.min(...controllers.map((c) => c.pinCurrentLimitMa ?? Infinity))

    // A declared drive method means nothing unless the part is actually in the
    // build. Students routinely select a gantry and forget it needs a driver.
    for (const actuator of components.filter((c) => c.kind === 'actuator')) {
      if (actuator.driveMethod === 'relay' && !components.some((c) => c.id === 'relayModule')) {
        out.push({
          code: 'MISSING_DRIVER',
          severity: 'blocking',
          componentIds: [actuator.id],
          message: `${actuator.label} is switched by a relay, but no relay module is in the build.`,
          prompt: 'A control pin decides; something else does the switching. What is missing here?',
        })
      }
      if (actuator.driveMethod === 'motorDriver' && !components.some((c) => c.id === 'stepperDriver')) {
        out.push({
          code: 'MISSING_DRIVER',
          severity: 'blocking',
          componentIds: [actuator.id],
          message:
            `${actuator.label} uses stepper motors and needs a motor driver, which is not in the build.`,
          prompt: 'Steppers need their coils energised in a precise sequence. What generates that sequence?',
        })
      }
    }

    for (const actuator of components.filter((c) => c.kind === 'actuator')) {
      if (actuator.driveMethod !== 'direct') continue
      const draw = actuator.drawMa ?? 0

      if (Number.isFinite(limit) && draw > limit) {
        out.push({
          code: 'PIN_CURRENT_EXCEEDED',
          severity: 'blocking',
          componentIds: [actuator.id, ...controllers.map((c) => c.id)],
          message:
            `${actuator.label} draws about ${draw} mA, but a controller pin can source roughly ` +
            `${limit} mA. Driving it directly would pull the rail down.`,
          prompt:
            'A control pin carries a decision, not the power to act on it. What component lets a small ' +
            'signal switch a large current?',
          detail: { draws: draw, pinLimit: limit },
        })
      }

      if (actuator.mechanical) {
        out.push({
          code: 'MISSING_DRIVER',
          severity: 'blocking',
          componentIds: [actuator.id],
          message: `${actuator.label} uses stepper motors and needs a motor driver, not a bare pin.`,
          prompt: 'Steppers need their coils energised in sequence. What generates that sequence?',
        })
      }
    }

    // An actuator wired to nothing is a common oversight once the shed has more
    // than a couple of parts in it.
    for (const actuator of components.filter((c) => c.kind === 'actuator')) {
      const controlled = nodes.some((n) => n.role === 'signal' && n.toId === actuator.id)
      const drivenViaModule = nodes.some((n) => n.fromId === actuator.id)
      if (!controlled && !drivenViaModule) {
        out.push({
          code: 'FLOATING_SIGNAL',
          severity: 'warning',
          componentIds: [actuator.id],
          message: `${actuator.label} has no control line, so your program cannot switch it.`,
          prompt: 'How does a decision made in code reach this piece of hardware?',
        })
      }
    }

    return out
  }

  // --- mechanical ----------------------------------------------------------

  /**
   * Cartesian systems fail in ways students can measure with a tape, which
   * makes them excellent teaching hardware. All three checks compare a rated
   * envelope against the bed the student is actually trying to cover.
   */
  private checkMechanics(components: ComponentSpec[]): Conflict[] {
    const out: Conflict[] = []

    for (const part of components) {
      const m = part.mechanical
      if (!m) continue

      if (m.travelXmm < this.field.widthMm || m.travelYmm < this.field.depthMm) {
        out.push({
          code: 'TRAVEL_ENVELOPE_EXCEEDED',
          severity: 'warning',
          componentIds: [part.id],
          message:
            `${part.label} reaches ${m.travelXmm} × ${m.travelYmm} mm, but the bed is ` +
            `${this.field.widthMm} × ${this.field.depthMm} mm. Some rows cannot be reached.`,
          prompt: 'Trace the corners of your bed. Can the head physically arrive at every one of them?',
          detail: {
            travelX: m.travelXmm,
            travelY: m.travelYmm,
            bedWidth: this.field.widthMm,
            bedDepth: this.field.depthMm,
          },
        })
      }

      if (this.field.toolPayloadKg > m.maxPayloadKg) {
        out.push({
          code: 'PAYLOAD_EXCEEDED',
          severity: 'blocking',
          componentIds: [part.id],
          message:
            `The tool head weighs ${this.field.toolPayloadKg} kg but ${part.label} is rated to ` +
            `${m.maxPayloadKg} kg. The axes will skip steps under load.`,
          prompt: 'What happens to positional accuracy when a stepper is asked to move more than it can?',
          detail: { payload: this.field.toolPayloadKg, rated: m.maxPayloadKg },
        })
      }

      // Distance for one full raster of the bed, then the time it implies.
      const rows = Math.max(1, Math.ceil(this.field.depthMm / 200))
      const passDistanceMm = rows * this.field.widthMm + this.field.depthMm
      const minutesPerPass = passDistanceMm / m.maxFeedMmPerMin
      const dailyMinutes = minutesPerPass * this.field.passesPerDay
      const dutyMinutes = (part.dutyHoursPerDay ?? 0) * 60

      if (dutyMinutes > 0 && dailyMinutes > dutyMinutes) {
        out.push({
          code: 'FEED_RATE_INSUFFICIENT',
          severity: 'warning',
          componentIds: [part.id],
          message:
            `Covering the bed ${this.field.passesPerDay} times needs about ` +
            `${Math.round(dailyMinutes)} minutes of travel, but only ${Math.round(dutyMinutes)} ` +
            'minutes of run time are budgeted.',
          prompt:
            'Either the head moves faster, the passes get fewer, or the run time grows. Which of those ' +
            'costs you the least?',
          detail: { neededMinutes: dailyMinutes, budgetedMinutes: dutyMinutes },
        })
      }
    }

    return out
  }

  // --- energy --------------------------------------------------------------

  /**
   * Integrates the daylight curve to get effective full-sun hours, rather than
   * assuming a flat number. The sun follows a half-sine between 06:00 and
   * 18:00, so the mean of that curve over 24 hours gives the real yield factor.
   */
  private effectiveSunHours(): number {
    let sum = 0
    const stepHours = 0.25
    for (let h = 0; h < 24; h += stepHours) {
      sum += Math.max(0, Math.sin(((h - 6) / 12) * Math.PI)) * stepHours
    }
    return sum
  }

  computeEnergyBudget(
    components: ComponentSpec[],
    dutyOverride: Record<string, number> = {},
  ): EnergyBudget {
    components = components.map((c) =>
      dutyOverride[c.id] !== undefined ? { ...c, dutyHoursPerDay: dutyOverride[c.id] } : c,
    )
    const effectiveSunHours = this.effectiveSunHours()

    const peakWatts = components
      .filter((c) => c.kind === 'source')
      .reduce((sum, c) => sum + (c.peakWatts ?? 0), 0)

    const usableStorageWh = components
      .filter((c) => c.kind === 'storage')
      .reduce((sum, c) => sum + (c.capacityWh ?? 0), 0)

    const dailyYieldWh = peakWatts * effectiveSunHours * CONFIG.systemEfficiency

    const actuators = components.filter((c) => c.kind === 'actuator')
    const dailyDemandWh = actuators.reduce(
      (sum, c) => sum + (c.ratedWatts ?? 0) * (c.dutyHoursPerDay ?? 0),
      0,
    )

    // Controllers and sensors run continuously; small, but over 24 hours not
    // negligible, and students are always surprised by that.
    const standbyWatts = components
      .filter((c) => c.kind === 'controller' || c.kind === 'sensor')
      .reduce((sum) => sum + 0.9, 0)
    const standbyWh = standbyWatts * 24

    const totalDemandWh = dailyDemandWh + standbyWh

    // Dusk to dawn is twelve hours with no generation at all. Assume duty is
    // spread evenly, so half of it falls in darkness.
    const overnightDemandWh = totalDemandWh * 0.5

    return {
      effectiveSunHours,
      dailyYieldWh,
      dailyDemandWh: totalDemandWh,
      marginWh: dailyYieldWh - totalDemandWh,
      overnightDemandWh,
      usableStorageWh,
    }
  }

  /**
   * The cumulative check the brief calls for. A system passing every
   * instantaneous test can still be doomed, because a small daily deficit
   * compounds until the bank is flat and the crops die overnight.
   */
  private checkEnergyBudget(components: ComponentSpec[], b: EnergyBudget): Conflict[] {
    const out: Conflict[] = []
    if (!components.some((c) => c.kind === 'actuator')) return out

    if (b.marginWh < 0) {
      const daysToFlat = b.usableStorageWh > 0 ? b.usableStorageWh / Math.abs(b.marginWh) : 0
      out.push({
        code: 'DAILY_ENERGY_DEFICIT',
        severity: 'warning',
        componentIds: components.filter((c) => c.kind === 'actuator').map((c) => c.id),
        message:
          `Daily demand is ${Math.round(b.dailyDemandWh)} Wh against a yield of ` +
          `${Math.round(b.dailyYieldWh)} Wh. The bank loses ${Math.round(Math.abs(b.marginWh))} Wh ` +
          `each day and runs flat in roughly ${daysToFlat.toFixed(1)} days.`,
        prompt:
          'This system works today and fails next week. Which number would you rather change: how long ' +
          'the pump runs, or how much you generate?',
        detail: {
          yieldWh: b.dailyYieldWh,
          demandWh: b.dailyDemandWh,
          marginWh: b.marginWh,
          daysToFlat,
        },
      })
    }

    if (b.overnightDemandWh > b.usableStorageWh) {
      out.push({
        code: 'OVERNIGHT_AUTONOMY_SHORTFALL',
        severity: 'warning',
        componentIds: components.filter((c) => c.kind === 'storage').map((c) => c.id),
        message:
          `Overnight demand is about ${Math.round(b.overnightDemandWh)} Wh but storage holds ` +
          `${Math.round(b.usableStorageWh)} Wh. The system will stop before sunrise.`,
        prompt: 'Between dusk and dawn there is no generation at all. What is carrying the load?',
        detail: { overnightWh: b.overnightDemandWh, storageWh: b.usableStorageWh },
      })
    }

    // A bank with under a day of reserve leaves no headroom for a cloudy spell,
    // which the environment controller will eventually deliver.
    if (b.usableStorageWh > 0 && b.usableStorageWh < b.dailyDemandWh) {
      out.push({
        code: 'STORAGE_UNDERSIZED',
        severity: 'warning',
        componentIds: components.filter((c) => c.kind === 'storage').map((c) => c.id),
        message:
          `Storage holds ${Math.round(b.usableStorageWh)} Wh, less than a single day of demand ` +
          `(${Math.round(b.dailyDemandWh)} Wh). One overcast day empties it.`,
        prompt: 'How many days of bad weather can this design survive before the crops notice?',
        detail: { storageWh: b.usableStorageWh, demandWh: b.dailyDemandWh },
      })
    }

    return out
  }
}

export const hardwareValidator = new HardwareValidator()
