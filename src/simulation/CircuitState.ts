// ---------------------------------------------------------------------------
// CircuitState — the wiring layer of the digital twin.
//
// The student physically wires an ESP32 to a soil-moisture sensor and a relay
// that switches the pump. Which pins they choose is up to them; the rules below
// only enforce what real hardware enforces. The pin they pick here becomes the
// pin their Blockly program must address, so a wiring mistake shows up as a
// behavioural failure in the farm, not just a red cross in the lab.
// ---------------------------------------------------------------------------

export type PinKind = 'power3v3' | 'power5v' | 'ground' | 'adc' | 'digital' | 'inputOnly'

export interface EspPin {
  id: string
  label: string
  kind: PinKind
  /** GPIO number, absent for power/ground rails. */
  gpio?: number
  side: 'left' | 'right'
  /** Explanation surfaced when the pin is misused. */
  note: string
}

// Physical pin header of a 30-pin ESP32 devkit, trimmed to the pins this
// mission needs. GPIO34/35 are deliberately included: they are input-only on
// real silicon, which makes them a genuine trap when wiring the relay.
export const ESP_PINS: EspPin[] = [
  { id: 'p3v3', label: '3V3', kind: 'power3v3', side: 'left', note: '3.3 V regulated output.' },
  { id: 'pgnd1', label: 'GND', kind: 'ground', side: 'left', note: 'Ground rail.' },
  { id: 'g34', label: 'D34', kind: 'inputOnly', gpio: 34, side: 'left', note: 'GPIO34 is input-only — it can read an analog signal but cannot drive anything.' },
  { id: 'g35', label: 'D35', kind: 'inputOnly', gpio: 35, side: 'left', note: 'GPIO35 is input-only — it can read an analog signal but cannot drive anything.' },
  { id: 'g32', label: 'D32', kind: 'adc', gpio: 32, side: 'left', note: 'GPIO32 has an ADC and can also be used as a digital output.' },
  { id: 'g33', label: 'D33', kind: 'adc', gpio: 33, side: 'left', note: 'GPIO33 has an ADC and can also be used as a digital output.' },
  { id: 'g25', label: 'D25', kind: 'digital', gpio: 25, side: 'left', note: 'GPIO25 is a general-purpose digital pin.' },
  { id: 'g26', label: 'D26', kind: 'digital', gpio: 26, side: 'left', note: 'GPIO26 is a general-purpose digital pin.' },

  { id: 'p5v', label: '5V', kind: 'power5v', side: 'right', note: '5 V rail taken straight from USB / VIN.' },
  { id: 'pgnd2', label: 'GND', kind: 'ground', side: 'right', note: 'Ground rail.' },
  { id: 'g4', label: 'D4', kind: 'digital', gpio: 4, side: 'right', note: 'GPIO4 is a general-purpose digital pin.' },
  { id: 'g5', label: 'D5', kind: 'digital', gpio: 5, side: 'right', note: 'GPIO5 is a general-purpose digital pin.' },
  { id: 'g18', label: 'D18', kind: 'digital', gpio: 18, side: 'right', note: 'GPIO18 is a general-purpose digital pin.' },
  { id: 'g19', label: 'D19', kind: 'digital', gpio: 19, side: 'right', note: 'GPIO19 is a general-purpose digital pin.' },
  { id: 'g21', label: 'D21', kind: 'digital', gpio: 21, side: 'right', note: 'GPIO21 is a general-purpose digital pin.' },
  { id: 'g22', label: 'D22', kind: 'digital', gpio: 22, side: 'right', note: 'GPIO22 is a general-purpose digital pin.' },
]

export function pinById(id: string): EspPin | undefined {
  return ESP_PINS.find((p) => p.id === id)
}

export type TerminalNeed = 'needs3v3' | 'needs5v' | 'needsGround' | 'needsAnalogIn' | 'needsDigitalOut'

export interface Terminal {
  id: string
  /** Which board this terminal belongs to. */
  device: 'sensor' | 'relay'
  label: string
  need: TerminalNeed
  colour: string
  hint: string
}

export const TERMINALS: Terminal[] = [
  { id: 'sensorVcc', device: 'sensor', label: 'VCC', need: 'needs3v3', colour: '#e0483c', hint: 'Sensor power. The capacitive soil probe runs on 3.3 V.' },
  { id: 'sensorGnd', device: 'sensor', label: 'GND', need: 'needsGround', colour: '#2b2f38', hint: 'Sensor ground. Every device shares a common ground.' },
  { id: 'sensorOut', device: 'sensor', label: 'AOUT', need: 'needsAnalogIn', colour: '#3f8fd6', hint: 'Analog moisture reading. Needs a pin with an ADC.' },
  { id: 'relayVcc', device: 'relay', label: 'VCC', need: 'needs5v', colour: '#e0483c', hint: 'Relay coil power. This module needs the 5 V rail.' },
  { id: 'relayGnd', device: 'relay', label: 'GND', need: 'needsGround', colour: '#2b2f38', hint: 'Relay ground.' },
  { id: 'relayIn', device: 'relay', label: 'IN', need: 'needsDigitalOut', colour: '#e6a13a', hint: 'Control signal. Needs a pin that can be driven as an output.' },
]

export function terminalById(id: string): Terminal | undefined {
  return TERMINALS.find((t) => t.id === id)
}

export interface Wire {
  id: string
  terminalId: string
  pinId: string
  colour: string
}

export interface CircuitState {
  wires: Wire[]
  /** Set by a passing validation. Consumed by the coding lab + farm. */
  valid: boolean
  sensorPin: number | null
  relayPin: number | null
  /** Number of times CHECK was pressed — feeds the engineer report. */
  checks: number
}

export const circuit: CircuitState = {
  wires: [],
  valid: false,
  sensorPin: null,
  relayPin: null,
  checks: 0,
}

let wireSeq = 0

export function wireFor(terminalId: string): Wire | undefined {
  return circuit.wires.find((w) => w.terminalId === terminalId)
}

export function wireOnPin(pinId: string): Wire | undefined {
  return circuit.wires.find((w) => w.pinId === pinId)
}

/**
 * Connect a terminal to a pin. A terminal carries exactly one wire, so
 * re-connecting silently replaces the old run. Ground pins accept more than
 * one wire because a real ground rail is shared; every other pin is exclusive.
 */
export function connect(terminalId: string, pinId: string): { ok: boolean; reason?: string } {
  const terminal = terminalById(terminalId)
  const pin = pinById(pinId)
  if (!terminal || !pin) return { ok: false, reason: 'Unknown connection point.' }

  const shared = pin.kind === 'ground' || pin.kind === 'power3v3' || pin.kind === 'power5v'
  const occupant = wireOnPin(pinId)
  if (occupant && occupant.terminalId !== terminalId && !shared) {
    const other = terminalById(occupant.terminalId)
    return { ok: false, reason: `${pin.label} is already taken by ${other?.device} ${other?.label}.` }
  }

  disconnectTerminal(terminalId)
  circuit.wires.push({ id: `w${++wireSeq}`, terminalId, pinId, colour: terminal.colour })
  invalidate()
  return { ok: true }
}

export function disconnectTerminal(terminalId: string) {
  const i = circuit.wires.findIndex((w) => w.terminalId === terminalId)
  if (i >= 0) {
    circuit.wires.splice(i, 1)
    invalidate()
  }
}

export function clearCircuit() {
  circuit.wires.length = 0
  invalidate()
}

/** Any edit after a successful CHECK forces the student to re-verify. */
function invalidate() {
  circuit.valid = false
  circuit.sensorPin = null
  circuit.relayPin = null
}

export interface CheckLine {
  terminalId: string
  ok: boolean
  message: string
}

export interface CheckResult {
  passed: boolean
  lines: CheckLine[]
  summary: string
}

function pinSatisfies(need: TerminalNeed, pin: EspPin): boolean {
  switch (need) {
    case 'needs3v3':
      return pin.kind === 'power3v3'
    case 'needs5v':
      return pin.kind === 'power5v'
    case 'needsGround':
      return pin.kind === 'ground'
    case 'needsAnalogIn':
      return pin.kind === 'adc' || pin.kind === 'inputOnly'
    case 'needsDigitalOut':
      return pin.kind === 'digital' || pin.kind === 'adc'
  }
}

function failureReason(terminal: Terminal, pin: EspPin): string {
  if (terminal.need === 'needsDigitalOut' && pin.kind === 'inputOnly') {
    return `${terminal.device} ${terminal.label} → ${pin.label}: ${pin.note}`
  }
  if (terminal.need === 'needs5v' && pin.kind === 'power3v3') {
    return `${terminal.device} ${terminal.label} → 3V3: the relay coil will not pull in reliably at 3.3 V. Use the 5V rail.`
  }
  if (terminal.need === 'needs3v3' && pin.kind === 'power5v') {
    return `${terminal.device} ${terminal.label} → 5V: 5 V would over-drive the probe. Use the 3V3 rail.`
  }
  if (terminal.need === 'needsGround') {
    return `${terminal.device} ${terminal.label} → ${pin.label}: this must go to a GND pin, not a signal or power pin.`
  }
  if (terminal.need === 'needsAnalogIn') {
    return `${terminal.device} ${terminal.label} → ${pin.label}: this pin has no ADC, so it cannot read a moisture voltage. Use D32, D33, D34 or D35.`
  }
  if (terminal.need === 'needs3v3' || terminal.need === 'needs5v') {
    return `${terminal.device} ${terminal.label} → ${pin.label}: a power lead must go to a power rail.`
  }
  return `${terminal.device} ${terminal.label} → ${pin.label}: wrong pin type.`
}

export function checkCircuit(): CheckResult {
  circuit.checks++
  const lines: CheckLine[] = []

  for (const terminal of TERMINALS) {
    const wire = wireFor(terminal.id)
    if (!wire) {
      lines.push({
        terminalId: terminal.id,
        ok: false,
        message: `${terminal.device} ${terminal.label} is not connected. ${terminal.hint}`,
      })
      continue
    }
    const pin = pinById(wire.pinId)!
    if (pinSatisfies(terminal.need, pin)) {
      lines.push({
        terminalId: terminal.id,
        ok: true,
        message: `${terminal.device} ${terminal.label} → ${pin.label}. Correct.`,
      })
    } else {
      lines.push({ terminalId: terminal.id, ok: false, message: failureReason(terminal, pin) })
    }
  }

  const passed = lines.every((l) => l.ok)
  if (passed) {
    circuit.valid = true
    circuit.sensorPin = pinById(wireFor('sensorOut')!.pinId)!.gpio ?? null
    circuit.relayPin = pinById(wireFor('relayIn')!.pinId)!.gpio ?? null
  } else {
    invalidate()
  }

  const failed = lines.filter((l) => !l.ok).length
  const summary = passed
    ? `Circuit verified. Sensor on GPIO${circuit.sensorPin}, relay on GPIO${circuit.relayPin}. Use those pin numbers in your program.`
    : `${failed} connection${failed === 1 ? '' : 's'} still wrong. Fix them and check again.`

  return { passed, lines, summary }
}
