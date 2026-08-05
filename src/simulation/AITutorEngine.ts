// ---------------------------------------------------------------------------
// AITutorEngine
//
// A responsive evaluator, not a hint dispenser. The rule it never breaks: it
// states what it observed and asks a question that makes the next step
// thinkable. It does not name the block to change, the threshold to use, or the
// component to buy. A student who is told the answer has learned the answer; a
// student who is asked the right question has learned the method.
//
// Escalation is the other half of the design. The first time a misconception
// appears the prompt is open. If the same pattern recurs the questions narrow,
// because a student stuck in a loop is no longer served by an open question.
// The engine reads FarmState and nothing else.
// ---------------------------------------------------------------------------

import { CONFIG, farm } from './FarmState'
import type { FarmState } from './FarmState'

export type MisconceptionId =
  | 'controlInstability'
  | 'energyDeficit'
  | 'overWatering'
  | 'thermalNeglect'
  | 'droughtBlindness'

export type InterventionTone = 'observation' | 'question' | 'challenge'

export interface Intervention {
  id: MisconceptionId
  tone: InterventionTone
  /** What the engine noticed. Always factual, drawn from live state. */
  observation: string
  /** The Socratic move. Never contains a solution. */
  question: string
  /** How many times this misconception has now been seen. */
  occurrence: number
  severity: 'info' | 'warn' | 'critical'
}

interface PatternRecord {
  occurrences: number
  /** Farm-hours at which this pattern last fired, for cooldown. */
  lastFiredHour: number
  lastFiredDay: number
}

export interface TutorTuning {
  /** Relay transitions per farm-hour above which control is judged unstable. */
  chatterCyclesPerHour: number
  /** Farm-hours a pattern must wait before it may fire again. */
  cooldownHours: number
  /** Battery percentage below which the overnight projection is run. */
  projectionTriggerBattery: number
  saturationAbove: number
  droughtBelow: number
  droughtSustainedSeconds: number
}

export const DEFAULT_TUTOR_TUNING: TutorTuning = {
  chatterCyclesPerHour: 14,
  cooldownHours: 2.5,
  projectionTriggerBattery: 45,
  saturationAbove: 90,
  droughtBelow: 20,
  droughtSustainedSeconds: 25,
}

export class AITutorEngine {
  private records = new Map<MisconceptionId, PatternRecord>()
  private cycleWindow: { hour: number; day: number }[] = []
  private lastCycleCount = 0
  private droughtSeconds = 0
  private enabled = true

  private readonly state: FarmState
  private readonly tuning: TutorTuning

  constructor(state: FarmState = farm, tuning: TutorTuning = DEFAULT_TUTOR_TUNING) {
    this.state = state
    this.tuning = tuning
  }

  setEnabled(on: boolean) {
    this.enabled = on
  }

  reset() {
    this.records.clear()
    this.cycleWindow = []
    this.lastCycleCount = 0
    this.droughtSeconds = 0
  }

  /** How many distinct misconceptions the student has hit. Feeds the report. */
  getMisconceptionSummary(): { id: MisconceptionId; occurrences: number }[] {
    return [...this.records.entries()].map(([id, r]) => ({ id, occurrences: r.occurrences }))
  }

  /**
   * Called once per simulation tick. Returns an intervention only when a
   * pattern genuinely fires and is off cooldown, so the assistant stays quiet
   * while the student is doing well — silence is information too.
   */
  evaluate(deltaSeconds: number): Intervention | null {
    if (!this.enabled) return null

    this.trackCycles()
    this.trackDrought(deltaSeconds)

    // Ordered by urgency. Only one intervention per tick: a student facing
    // three problems at once needs the most pressing one, not a wall of text.
    return (
      this.checkControlInstability() ??
      this.checkThermalNeglect() ??
      this.checkEnergyDeficit() ??
      this.checkOverWatering() ??
      this.checkDroughtBlindness() ??
      null
    )
  }

  // --- bookkeeping ---------------------------------------------------------

  /** Records the farm-time of every relay transition inside a one-hour window. */
  private trackCycles() {
    const cycles = this.state.actuator.cycles
    const newCycles = cycles - this.lastCycleCount
    this.lastCycleCount = cycles

    for (let i = 0; i < newCycles; i++) {
      this.cycleWindow.push({ hour: this.state.hour, day: this.state.day })
    }

    const now = this.absoluteHour()
    this.cycleWindow = this.cycleWindow.filter(
      (c) => now - (c.day * 24 + c.hour) <= 1 && now - (c.day * 24 + c.hour) >= 0,
    )
  }

  private trackDrought(deltaSeconds: number) {
    if (this.state.soilMoisture < this.tuning.droughtBelow) {
      this.droughtSeconds += deltaSeconds
    } else {
      this.droughtSeconds = 0
    }
  }

  private absoluteHour() {
    return this.state.day * 24 + this.state.hour
  }

  /** True when the pattern is allowed to speak again. */
  private offCooldown(id: MisconceptionId): boolean {
    const r = this.records.get(id)
    if (!r) return true
    const elapsed = this.absoluteHour() - (r.lastFiredDay * 24 + r.lastFiredHour)
    return elapsed >= this.tuning.cooldownHours || elapsed < 0
  }

  /**
   * Registers a firing and picks the tone. Escalation is deliberate: an open
   * observation first, a direct question second, a challenge by the third.
   */
  private fire(
    id: MisconceptionId,
    severity: Intervention['severity'],
    lines: { observation: string; question: string }[],
  ): Intervention {
    const prev = this.records.get(id)
    const occurrence = (prev?.occurrences ?? 0) + 1
    this.records.set(id, {
      occurrences: occurrence,
      lastFiredHour: this.state.hour,
      lastFiredDay: this.state.day,
    })

    const index = Math.min(occurrence - 1, lines.length - 1)
    const tone: InterventionTone =
      occurrence === 1 ? 'observation' : occurrence === 2 ? 'question' : 'challenge'

    return { id, tone, occurrence, severity, ...lines[index] }
  }

  // --- Pattern 1: control system instability --------------------------------

  /**
   * Blockly logic with a single threshold and no hysteresis will toggle the
   * relay every tick once moisture sits on the boundary. In software that is
   * invisible; in hardware it destroys contacts within days.
   */
  private checkControlInstability(): Intervention | null {
    if (this.cycleWindow.length < this.tuning.chatterCyclesPerHour) return null
    if (!this.offCooldown('controlInstability')) return null

    const rate = this.cycleWindow.length

    return this.fire('controlInstability', 'critical', [
      {
        observation: `Control system instability. The relay has switched ${rate} times in the last farm-hour.`,
        question:
          'A mechanical relay has a finite number of operations in it. What is it about your condition ' +
          'that makes it change its mind so often?',
      },
      {
        observation: `The relay is still chattering — ${rate} switches this hour.`,
        question:
          'Your pump turns on at one moisture value and off at the same one. What happens at the exact ' +
          'moment the reading sits on that line?',
      },
      {
        observation: `Third occurrence of relay chatter. ${rate} switches this hour.`,
        question:
          'Consider a thermostat: it heats to a little above target and stops a little below it, rather ' +
          'than switching at one number. Why would that design survive longer than yours?',
      },
    ])
  }

  // --- Pattern 2: cumulative energy deficit ---------------------------------

  /**
   * Projects the bank forward to dawn rather than reporting the current level.
   * A battery at 40% reads healthy but is doomed if the pump is committed to
   * six more hours of darkness — that gap between instantaneous and cumulative
   * is exactly the misconception being targeted.
   */
  private checkEnergyDeficit(): Intervention | null {
    if (this.state.battery > this.tuning.projectionTriggerBattery) return null
    if (!this.offCooldown('energyDeficit')) return null

    const hoursToDawn = this.hoursUntilDawn()
    if (hoursToDawn <= 0) return null

    // Real seconds of darkness remaining, then the drain the pump would cause.
    const realSecondsToDawn = hoursToDawn / (CONFIG.hoursPerRealSecond * 60)
    const dutyFraction = this.state.pumpOn ? 0.5 : 0.25
    const projectedDrain = CONFIG.pumpDrainPerSecond * realSecondsToDawn * dutyFraction
    const projectedBattery = this.state.battery - projectedDrain

    if (projectedBattery > 5) return null

    return this.fire('energyDeficit', projectedBattery <= 0 ? 'critical' : 'warn', [
      {
        observation:
          `Our energy reserves are depleting faster than our solar yield. At the current rate the bank ` +
          `reaches ${Math.max(0, Math.round(projectedBattery))}% before sunrise, ` +
          `${hoursToDawn.toFixed(1)} hours from now.`,
        question:
          'Are there environmental sensors we could use to limit operation during non-critical hours?',
      },
      {
        observation:
          `The projection is short again — ${Math.max(0, Math.round(projectedBattery))}% at dawn.`,
        question:
          'Generation is zero for twelve hours a day and you cannot change that. So what is the only ' +
          'other side of the equation left to you?',
      },
      {
        observation: 'A third night heading for a flat bank.',
        question:
          'Soil loses water more slowly in the cool hours. If that is true, what is the pump actually ' +
          'buying you at three in the morning?',
      },
    ])
  }

  private hoursUntilDawn(): number {
    const h = this.state.hour
    if (h >= 6 && h < 18) return 0
    return h >= 18 ? 24 - h + 6 : 6 - h
  }

  // --- Pattern 3: over-engineering / saturation -----------------------------

  private checkOverWatering(): Intervention | null {
    if (this.state.soilMoisture <= this.tuning.saturationAbove) return null
    if (!this.offCooldown('overWatering')) return null

    return this.fire('overWatering', 'warn', [
      {
        observation:
          `The soil is fully saturated at ${Math.round(this.state.soilMoisture)}% and crop health is ` +
          'falling rather than rising.',
        question: 'Have we checked the optimal moisture range for this specific crop?',
      },
      {
        observation: `Saturation again — ${Math.round(this.state.soilMoisture)}%.`,
        question:
          'Roots need air as much as water. If that is so, is the goal of your logic to maximise ' +
          'moisture, or to hold it somewhere?',
      },
      {
        observation: 'The crops have now been drowned three times.',
        question:
          'Your condition says when to start watering. What is missing is the sentence that says when ' +
          'to stop. Where would that sentence go?',
      },
    ])
  }

  // --- Pattern 4: thermal and mechanical neglect ----------------------------

  private checkThermalNeglect(): Intervention | null {
    const a = this.state.actuator
    if (!a.thermalWarning) return null
    if (!this.offCooldown('thermalNeglect')) return null

    return this.fire('thermalNeglect', a.strain > 80 ? 'critical' : 'warn', [
      {
        observation:
          `The pump is running at ${Math.round(a.temperatureC)}°C with ${Math.round(a.strain)}% ` +
          'accumulated strain, because it keeps operating while the bus voltage is sagging.',
        question:
          'A motor asked to hold torque on a falling supply draws more current, not less. What does that ' +
          'do to the windings over a season?',
      },
      {
        observation: `Strain is climbing again — ${Math.round(a.strain)}%.`,
        question:
          'Your logic checks whether the soil is dry. Does it check whether the system is in any fit ' +
          'state to do something about it?',
      },
      {
        observation: 'The hardware has now been run into the ground three times.',
        question:
          'If you were paying for these motors yourself, what condition would you add before the pump is ' +
          'allowed to start?',
      },
    ])
  }

  // --- Pattern 5: sustained drought without response ------------------------

  private checkDroughtBlindness(): Intervention | null {
    if (this.droughtSeconds < this.tuning.droughtSustainedSeconds) return null
    if (this.state.pumpOn) return null
    if (!this.offCooldown('droughtBlindness')) return null

    const canRun = this.state.battery > 5

    return this.fire('droughtBlindness', 'critical', [
      {
        observation:
          `Soil moisture has sat at ${Math.round(this.state.soilMoisture)}% for a sustained period and ` +
          `the pump has not responded${canRun ? ', though there is charge available' : ''}.`,
        question: canRun
          ? 'The energy is there and the soil is dry. So what is standing between the reading and the pump?'
          : 'The pump cannot run without charge. When should this system have been storing it?',
      },
      {
        observation: `The crops are drying out again with the pump idle at ${Math.round(this.state.soilMoisture)}%.`,
        question:
          'Trace one reading from the sensor to the relay. At which step does it stop being acted on?',
      },
      {
        observation: 'A third drought with no irrigation response.',
        question:
          'Two things must agree for this to work: the pin your sensor is on, and the pin your program ' +
          'reads. Have you confirmed they are the same number?',
      },
    ])
  }
}

export const aiTutorEngine = new AITutorEngine()
