// ---------------------------------------------------------------------------
// EnvironmentController
//
// Injects the chaos. A control system that only ever meets clear skies and a
// constant evaporation rate is not being tested — the student's thresholds will
// look correct because nothing ever challenged them. This controller supplies
// the disturbances that separate a working design from a lucky one.
//
// It communicates exclusively through FarmState: it writes irradianceFactor,
// evaporationMultiplier, ambientTempC and actuator wear, and reads pump state
// and battery level. It never touches the DOM and never calls another engine.
// ---------------------------------------------------------------------------

import { CONFIG, farm } from './FarmState'
import type { FarmState } from './FarmState'

export type EventKind = 'cloudBank' | 'heatwave' | 'stillNight'

export interface EnvironmentEvent {
  kind: EventKind
  label: string
  /** Farm-hours remaining before the event clears. */
  hoursRemaining: number
  /** Total duration, used to shape the fade in and out. */
  totalHours: number
  /** 0-1. How hard the event bites at its peak. */
  intensity: number
}

export interface EnvironmentTuning {
  /** Mean farm-hours between the onset of one event and the next. */
  meanHoursBetweenEvents: number
  cloudMinHours: number
  cloudMaxHours: number
  heatwaveMinHours: number
  heatwaveMaxHours: number
  /** Floor on irradiance during the thickest cloud. Overcast is not darkness. */
  minIrradianceFactor: number
  /** Evaporation multiplier at peak heatwave intensity. */
  maxEvaporationMultiplier: number
  baselineTempC: number
  heatwavePeakTempC: number
}

export const DEFAULT_TUNING: EnvironmentTuning = {
  meanHoursBetweenEvents: 7,
  cloudMinHours: 1.5,
  cloudMaxHours: 5,
  heatwaveMinHours: 3,
  heatwaveMaxHours: 8,
  minIrradianceFactor: 0.18,
  maxEvaporationMultiplier: 3.2,
  baselineTempC: 24,
  heatwavePeakTempC: 41,
}

export class EnvironmentController {
  private active: EnvironmentEvent[] = []
  private hoursUntilNextEvent: number
  private enabled = true
  /** Continuous seconds the pump has spent running on a sagging bus. */
  private underVoltageSeconds = 0

  private readonly state: FarmState
  private readonly tuning: EnvironmentTuning
  private readonly random: () => number

  constructor(
    state: FarmState = farm,
    tuning: EnvironmentTuning = DEFAULT_TUNING,
    random: () => number = Math.random,
  ) {
    this.state = state
    this.tuning = tuning
    this.random = random
    // Stagger the first event so it never lands during the opening seconds,
    // when the student is still reading the screen.
    this.hoursUntilNextEvent = tuning.meanHoursBetweenEvents * (0.7 + this.random() * 0.6)
  }

  setEnabled(on: boolean) {
    this.enabled = on
    if (!on) this.clear()
  }

  isEnabled() {
    return this.enabled
  }

  getActiveEvents(): readonly EnvironmentEvent[] {
    return this.active
  }

  /** Drop every event and return the world to baseline. */
  clear() {
    this.active = []
    this.state.environment.irradianceFactor = 1
    this.state.environment.evaporationMultiplier = 1
    this.state.environment.ambientTempC = this.tuning.baselineTempC
    this.state.environment.activeEvents = []
  }

  /**
   * Force a specific event. Used by the demo script and by tests, so a
   * scenario can be shown on cue rather than waited for.
   */
  trigger(kind: EventKind, hours?: number, intensity?: number) {
    this.active.push(this.build(kind, hours, intensity))
  }

  /**
   * Advance the weather. Called once per simulation tick with the same delta
   * the physics uses, so events keep pace with the speed multiplier.
   */
  update(deltaSeconds: number) {
    const deltaHours = deltaSeconds * CONFIG.hoursPerRealSecond * 60

    // Only the random scheduler is gated. Events already in flight must keep
    // ageing, otherwise a manually triggered scenario freezes at zero intensity
    // and never fades in — its envelope depends on elapsed time.
    if (this.enabled) this.scheduleEvents(deltaHours)
    this.expireEvents(deltaHours)

    this.applyEnvironment()
    this.applyDegradation(deltaSeconds)
  }

  // --- scheduling ----------------------------------------------------------

  private scheduleEvents(deltaHours: number) {
    this.hoursUntilNextEvent -= deltaHours
    if (this.hoursUntilNextEvent > 0) return

    // Exponential-ish spacing so events feel irregular rather than metronomic.
    this.hoursUntilNextEvent =
      this.tuning.meanHoursBetweenEvents * (0.45 + this.random() * 1.4)

    // Heatwaves belong to the middle of the day; cloud can arrive at any hour.
    const midday = this.state.hour > 9 && this.state.hour < 16
    const roll = this.random()
    if (midday && roll < 0.45) this.active.push(this.build('heatwave'))
    else if (roll < 0.85) this.active.push(this.build('cloudBank'))
    else this.active.push(this.build('stillNight'))
  }

  private build(kind: EventKind, hours?: number, intensity?: number): EnvironmentEvent {
    const t = this.tuning
    const span = (min: number, max: number) => min + this.random() * (max - min)

    if (kind === 'heatwave') {
      const total = hours ?? span(t.heatwaveMinHours, t.heatwaveMaxHours)
      return {
        kind,
        label: 'Heatwave',
        hoursRemaining: total,
        totalHours: total,
        intensity: intensity ?? span(0.55, 1),
      }
    }
    if (kind === 'stillNight') {
      const total = hours ?? span(2, 5)
      return {
        kind,
        label: 'Still, humid night',
        hoursRemaining: total,
        totalHours: total,
        intensity: intensity ?? span(0.4, 0.8),
      }
    }
    const total = hours ?? span(t.cloudMinHours, t.cloudMaxHours)
    return {
      kind,
      label: 'Cloud bank',
      hoursRemaining: total,
      totalHours: total,
      intensity: intensity ?? span(0.4, 1),
    }
  }

  private expireEvents(deltaHours: number) {
    for (const e of this.active) e.hoursRemaining -= deltaHours
    this.active = this.active.filter((e) => e.hoursRemaining > 0)
  }

  // --- effects -------------------------------------------------------------

  /**
   * Events fade in and out rather than switching, so a cloud bank rolling
   * through produces a smooth dip in generation that a student can actually
   * watch happen on the telemetry.
   */
  private envelope(e: EnvironmentEvent): number {
    const elapsed = e.totalHours - e.hoursRemaining
    const ramp = Math.min(e.totalHours * 0.3, 1.2)
    if (ramp <= 0) return e.intensity
    const rising = Math.min(1, elapsed / ramp)
    const falling = Math.min(1, e.hoursRemaining / ramp)
    return e.intensity * Math.min(rising, falling)
  }

  private applyEnvironment() {
    const env = this.state.environment
    let irradiance = 1
    let evaporation = 1
    let temp = this.tuning.baselineTempC

    for (const e of this.active) {
      const strength = this.envelope(e)

      if (e.kind === 'cloudBank') {
        // Multiplicative, so two overlapping banks are darker than one.
        irradiance *= 1 - strength * (1 - this.tuning.minIrradianceFactor)
        evaporation *= 1 - strength * 0.35
        temp -= strength * 4
      }

      if (e.kind === 'heatwave') {
        evaporation *= 1 + strength * (this.tuning.maxEvaporationMultiplier - 1)
        temp += strength * (this.tuning.heatwavePeakTempC - this.tuning.baselineTempC)
        // Panels lose efficiency as they get hot — a detail worth teaching,
        // because it is counter-intuitive that the hottest day is not the best.
        irradiance *= 1 - strength * 0.12
      }

      if (e.kind === 'stillNight') {
        evaporation *= 1 - strength * 0.55
        temp -= strength * 2
      }
    }

    env.irradianceFactor = clamp(irradiance, 0, 1)
    env.evaporationMultiplier = clamp(evaporation, 0.2, this.tuning.maxEvaporationMultiplier)
    env.ambientTempC = Math.round(temp * 10) / 10
    env.activeEvents = this.active.map((e) => e.label)
  }

  // --- degradation ---------------------------------------------------------

  /**
   * Running a motor on a sagging bus is how real irrigation hardware dies: the
   * motor draws more current to hold torque, heats up, and the windings suffer.
   * Strain accumulates only while the pump runs under-voltage, and recovers
   * slowly while it rests, so a student who never lets the bank recharge will
   * watch their equipment degrade for reasons entirely of their own making.
   */
  private applyDegradation(deltaSeconds: number) {
    const a = this.state.actuator
    const underVoltage = this.state.battery < CONFIG.lowVoltageBelow

    if (this.state.pumpOn && underVoltage) {
      this.underVoltageSeconds += deltaSeconds
      // Strain accrues faster the deeper the sag goes.
      const depth = 1 - this.state.battery / CONFIG.lowVoltageBelow
      a.strain += CONFIG.strainPerSecondUnderVoltage * (0.5 + depth) * deltaSeconds
    } else {
      this.underVoltageSeconds = 0
      a.strain -= CONFIG.strainRecoveryPerSecond * deltaSeconds
    }
    a.strain = clamp(a.strain, 0, 100)

    // Thermal model: heat while running, shed heat toward ambient while idle.
    const ambient = this.state.environment.ambientTempC + CONFIG.actuatorAmbientOffsetC
    if (this.state.pumpOn) {
      const loadFactor = underVoltage ? 1.6 : 1
      a.temperatureC += CONFIG.actuatorHeatPerSecond * loadFactor * deltaSeconds
    } else {
      const gap = a.temperatureC - ambient
      a.temperatureC -= Math.min(gap, CONFIG.actuatorCoolPerSecond * deltaSeconds)
    }
    a.temperatureC = clamp(a.temperatureC, ambient, 140)
    a.thermalWarning = a.temperatureC > CONFIG.thermalWarningAboveC || a.strain > 60
  }

  /** Seconds the pump has been running continuously on a sagging bus. */
  getUnderVoltageSeconds() {
    return this.underVoltageSeconds
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max)
}

export const environmentController = new EnvironmentController()
