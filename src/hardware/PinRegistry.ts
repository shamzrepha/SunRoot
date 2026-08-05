// ---------------------------------------------------------------------------
// PinRegistry
//
// Every part a student can place needs terminals, not just the controllers.
// A relay has VCC/GND/IN plus its switched load side; a pump has two leads; an
// I2C display has SDA and SCL. Without this the bench could only ever wire the
// handful of parts someone hardcoded, which is exactly the bug this replaces.
//
// Terminals are derived from the catalogue entry wherever possible — an I2C
// sensor gets SDA/SCL because its signalType says so — with explicit overrides
// only where a part's real pinout does not follow from its category.
// ---------------------------------------------------------------------------

import { CATALOG_BY_ID } from './ComponentCatalog'
import type { CatalogPart, PinDef } from './ComponentCatalog'

export type TerminalRole =
  | 'supplyIn'    // needs a power rail at the part's supply voltage
  | 'groundIn'    // needs ground
  | 'signalOut'   // the part drives this line
  | 'signalIn'    // the part listens on this line
  | 'loadOut'     // switched output on a driver, feeds an actuator
  | 'powerOut'    // a source or store supplying the bus
  | 'passive'     // a lead with no polarity requirement
  // Hydraulic domain. Water is not electricity and must not share terminals
  // with it: a tank has an outlet, not a VCC pin. Keeping the two domains
  // separate is what lets the twin model a pump that is powered but plumbed
  // to nothing, which is a real and instructive failure.
  | 'fluidIn'     // water enters here
  | 'fluidOut'    // water leaves here

export interface Terminal {
  name: string
  role: TerminalRole
  /** Voltage the terminal presents or expects, where it matters. */
  volts?: number
  colour: string
  note: string
}

const RED = '#d94b3c'
const BLACK = '#2b2f38'
const BLUE = '#3f8fd6'
const AMBER = '#e6a13a'
const GREEN = '#4fd67a'
const GREY = '#8b939b'
const WATER = '#4d92cd'

function supply(volts: number): Terminal {
  return { name: 'VCC', role: 'supplyIn', volts, colour: RED, note: `Power input, expects ${volts} V.` }
}
const GND: Terminal = { name: 'GND', role: 'groundIn', colour: BLACK, note: 'Ground. Every device shares one.' }

/** A hydraulic port pair, for anything water passes through. */
function fluidPorts(inNote: string, outNote: string): Terminal[] {
  return [
    { name: 'IN', role: 'fluidIn', colour: WATER, note: inNote },
    { name: 'OUT', role: 'fluidOut', colour: WATER, note: outNote },
  ]
}

/** Explicit pinouts where the real part does not follow from its category. */
const OVERRIDES: Record<string, Terminal[]> = {
  relay1ch: [
    supply(5), GND,
    { name: 'IN', role: 'signalIn', volts: 5, colour: AMBER, note: 'Control input. A logic HIGH energises the coil.' },
    { name: 'COM', role: 'loadOut', colour: GREY, note: 'Common pole of the switched contact.' },
    { name: 'NO', role: 'loadOut', colour: GREY, note: 'Normally-open contact. Closes to COM when energised.' },
  ],
  relay2ch: [
    supply(5), GND,
    { name: 'IN1', role: 'signalIn', volts: 5, colour: AMBER, note: 'Control input for channel 1.' },
    { name: 'IN2', role: 'signalIn', volts: 5, colour: AMBER, note: 'Control input for channel 2.' },
    { name: 'COM', role: 'loadOut', colour: GREY, note: 'Common pole.' },
    { name: 'NO', role: 'loadOut', colour: GREY, note: 'Normally-open contact.' },
  ],
  mosfetIRF520: [
    { name: 'VIN+', role: 'supplyIn', volts: 12, colour: RED, note: 'Load supply in.' },
    { name: 'VIN-', role: 'groundIn', colour: BLACK, note: 'Load supply ground.' },
    { name: 'SIG', role: 'signalIn', volts: 5, colour: AMBER, note: 'Gate drive. PWM capable.' },
    { name: 'GND', role: 'groundIn', colour: BLACK, note: 'Logic ground, must be common with the controller.' },
    { name: 'OUT+', role: 'loadOut', colour: GREY, note: 'Switched positive to the load.' },
    { name: 'OUT-', role: 'loadOut', colour: GREY, note: 'Load return.' },
  ],
  transistor2N2222: [
    { name: 'B', role: 'signalIn', colour: AMBER, note: 'Base. Needs a series resistor from the control pin.' },
    { name: 'C', role: 'loadOut', colour: GREY, note: 'Collector, wired to the load.' },
    { name: 'E', role: 'groundIn', colour: BLACK, note: 'Emitter, normally to ground.' },
  ],
  l298n: [
    supply(12), GND,
    { name: 'IN1', role: 'signalIn', volts: 5, colour: AMBER, note: 'Direction input A.' },
    { name: 'IN2', role: 'signalIn', volts: 5, colour: AMBER, note: 'Direction input B.' },
    { name: 'ENA', role: 'signalIn', volts: 5, colour: AMBER, note: 'Enable / PWM speed input.' },
    { name: 'OUT1', role: 'loadOut', colour: GREY, note: 'Motor terminal 1.' },
    { name: 'OUT2', role: 'loadOut', colour: GREY, note: 'Motor terminal 2.' },
  ],
  a4988: [
    supply(12), GND,
    { name: 'STEP', role: 'signalIn', volts: 5, colour: AMBER, note: 'One pulse advances the motor one step.' },
    { name: 'DIR', role: 'signalIn', volts: 5, colour: AMBER, note: 'Direction of travel.' },
    { name: 'ENA', role: 'signalIn', volts: 5, colour: AMBER, note: 'Active-low enable.' },
    { name: 'A1', role: 'loadOut', colour: GREY, note: 'Coil A.' },
    { name: 'B1', role: 'loadOut', colour: GREY, note: 'Coil B.' },
  ],
  ldr: [
    { name: 'A', role: 'passive', colour: GREY, note: 'One leg. Resistance falls as light rises.' },
    { name: 'B', role: 'passive', colour: GREY, note: 'Other leg. Pair with a fixed resistor to form a divider.' },
  ],
  ultrasonic: [
    supply(5), GND,
    { name: 'TRIG', role: 'signalIn', volts: 5, colour: AMBER, note: 'Pulse here to start a measurement.' },
    { name: 'ECHO', role: 'signalOut', volts: 5, colour: BLUE, note: 'Pulse width is proportional to distance.' },
  ],
  floatSwitch: [
    { name: 'A', role: 'passive', colour: GREY, note: 'One contact.' },
    { name: 'B', role: 'passive', colour: GREY, note: 'Other contact. Closes when the float rises.' },
  ],
  pushButton: [
    { name: 'A', role: 'passive', colour: GREY, note: 'One contact.' },
    { name: 'B', role: 'passive', colour: GREY, note: 'Other contact. Closes while pressed.' },
  ],
  ledRed: [
    { name: 'A', role: 'signalIn', colour: RED, note: 'Anode, the longer leg. Needs a series resistor.' },
    { name: 'K', role: 'groundIn', colour: BLACK, note: 'Cathode, the flat side.' },
  ],
  ledGreen: [
    { name: 'A', role: 'signalIn', colour: GREEN, note: 'Anode, the longer leg. Needs a series resistor.' },
    { name: 'K', role: 'groundIn', colour: BLACK, note: 'Cathode, the flat side.' },
  ],
  ledRGB: [
    { name: 'R', role: 'signalIn', colour: RED, note: 'Red channel anode.' },
    { name: 'G', role: 'signalIn', colour: GREEN, note: 'Green channel anode.' },
    { name: 'B', role: 'signalIn', colour: BLUE, note: 'Blue channel anode.' },
    { name: 'K', role: 'groundIn', colour: BLACK, note: 'Common cathode.' },
  ],
  potentiometer: [
    { name: 'VCC', role: 'supplyIn', volts: 3.3, colour: RED, note: 'One end of the track.' },
    { name: 'WIPER', role: 'signalOut', volts: 3.3, colour: BLUE, note: 'Voltage varies with knob position.' },
    { name: 'GND', role: 'groundIn', colour: BLACK, note: 'Other end of the track.' },
  ],
  buck: [
    { name: 'IN+', role: 'supplyIn', colour: RED, note: 'Higher voltage in.' },
    { name: 'IN-', role: 'groundIn', colour: BLACK, note: 'Input ground.' },
    { name: 'OUT+', role: 'powerOut', colour: RED, note: 'Adjustable lower voltage out.' },
    { name: 'OUT-', role: 'groundIn', colour: BLACK, note: 'Output ground.' },
  ],
  pwmController: [
    { name: 'PV+', role: 'signalIn', colour: RED, note: 'From the solar array.' },
    { name: 'PV-', role: 'groundIn', colour: BLACK, note: 'Array negative.' },
    { name: 'BAT+', role: 'powerOut', volts: 12, colour: RED, note: 'To the battery positive.' },
    { name: 'BAT-', role: 'groundIn', colour: BLACK, note: 'To the battery negative.' },
    { name: 'LOAD+', role: 'powerOut', volts: 12, colour: RED, note: 'Regulated output to the load.' },
    { name: 'LOAD-', role: 'groundIn', colour: BLACK, note: 'Load return.' },
  ],
}
OVERRIDES.waterTank = [
  { name: 'OUT', role: 'fluidOut', colour: WATER, note: 'Gravity-fed outlet. Water leaves the tank here.' },
  { name: 'FILL', role: 'fluidIn', colour: WATER, note: 'Fill port. Water returning to the tank enters here.' },
]
OVERRIDES.tubing = fluidPorts(
  'Water enters this length of tubing.',
  'Water leaves for whatever is downstream.',
)
OVERRIDES.sprinklerHead = [
  { name: 'IN', role: 'fluidIn', colour: WATER, note: 'Feed line. Water arrives here and is sprayed over the bed.' },
]
OVERRIDES.dripEmitter = [
  { name: 'IN', role: 'fluidIn', colour: WATER, note: 'Feed line. Water arrives and is released slowly at the root zone.' },
]

// A pump lives in both domains at once: two electrical leads and two ports.
// It can therefore be powered but plumbed to nothing, or plumbed correctly and
// never energised, and the farm shows the difference.
OVERRIDES.pump12v = [
  { name: '+', role: 'signalIn', volts: 12, colour: RED, note: 'Positive lead, 12 V.' },
  { name: '-', role: 'groundIn', colour: BLACK, note: 'Negative lead.' },
  { name: 'IN', role: 'fluidIn', colour: WATER, note: 'Suction side. Draws from the tank.' },
  { name: 'OUT', role: 'fluidOut', colour: WATER, note: 'Discharge side. Pushes water downstream.' },
]
OVERRIDES.pump5v = [
  { name: '+', role: 'signalIn', volts: 5, colour: RED, note: 'Positive lead, 5 V.' },
  { name: '-', role: 'groundIn', colour: BLACK, note: 'Negative lead.' },
  { name: 'IN', role: 'fluidIn', colour: WATER, note: 'Suction side.' },
  { name: 'OUT', role: 'fluidOut', colour: WATER, note: 'Discharge side.' },
]
OVERRIDES.solenoidValve = [
  { name: '+', role: 'signalIn', volts: 12, colour: RED, note: 'Coil positive.' },
  { name: '-', role: 'groundIn', colour: BLACK, note: 'Coil negative.' },
  { name: 'IN', role: 'fluidIn', colour: WATER, note: 'Upstream side.' },
  { name: 'OUT', role: 'fluidOut', colour: WATER, note: 'Downstream side. Open only while energised.' },
]
OVERRIDES.flowMeter = [
  supply(5), GND,
  { name: 'OUT', role: 'signalOut', volts: 5, colour: BLUE, note: 'Pulse output, one pulse per unit of volume.' },
  { name: 'FIN', role: 'fluidIn', colour: WATER, note: 'Water enters the turbine here.' },
  { name: 'FOUT', role: 'fluidOut', colour: WATER, note: 'Water leaves the turbine here.' },
]

OVERRIDES.mpptController = OVERRIDES.pwmController
OVERRIDES.reg7805 = OVERRIDES.buck

/** A two-lead passive with no polarity. */
function twoLead(noteA: string): Terminal[] {
  return [
    { name: 'A', role: 'passive', colour: GREY, note: noteA },
    { name: 'B', role: 'passive', colour: GREY, note: noteA },
  ]
}

/**
 * Terminals for any part. Controllers expose their real pin header; everything
 * else is derived from its supply voltage and signal type unless overridden.
 */
export function terminalsFor(part: CatalogPart): Terminal[] {
  if (OVERRIDES[part.id]) return OVERRIDES[part.id]

  // Controllers expose their published pin header.
  if (part.category === 'controllers' && part.pins) {
    return part.pins.map((p) => controllerPinToTerminal(p))
  }

  // Sources and stores present a two-wire DC output.
  if (part.category === 'power') {
    return [
      { name: '+', role: 'powerOut', volts: part.supplyVoltage, colour: RED, note: `Positive output, ${part.supplyVoltage ?? 12} V nominal.` },
      { name: '-', role: 'groundIn', colour: BLACK, note: 'Negative output.' },
    ]
  }

  // Motors, pumps and valves are dumb loads with two leads.
  if (part.category === 'actuators') {
    return [
      { name: '+', role: 'signalIn', volts: part.supplyVoltage, colour: RED, note: `Positive lead, ${part.supplyVoltage ?? 12} V. Must be switched by a driver.` },
      { name: '-', role: 'groundIn', colour: BLACK, note: 'Negative lead.' },
    ]
  }

  if (part.category === 'passives') return twoLead('Passive lead, either way round.')

  // Plumbing carries water, so it gets ports. It never gets VCC and GND.
  if (part.category === 'plumbing') {
    return fluidPorts('Water enters here.', 'Water leaves here.')
  }

  // Sensors and displays: power, ground, and whatever bus they speak.
  const out: Terminal[] = [supply(part.supplyVoltage ?? 3.3), GND]
  switch (part.signalType) {
    case 'analog':
      out.push({ name: 'AOUT', role: 'signalOut', volts: part.signalVoltage, colour: BLUE, note: `Analog output, up to ${part.signalVoltage ?? 3.3} V. Needs an ADC pin.` })
      break
    case 'onewire':
      out.push({ name: 'DATA', role: 'signalOut', volts: part.signalVoltage, colour: BLUE, note: 'Single-wire digital bus.' })
      break
    case 'i2c':
      out.push({ name: 'SDA', role: 'signalOut', volts: part.signalVoltage, colour: BLUE, note: 'I2C data line.' })
      out.push({ name: 'SCL', role: 'signalIn', volts: part.signalVoltage, colour: AMBER, note: 'I2C clock line.' })
      break
    case 'digital':
      out.push({ name: 'OUT', role: 'signalOut', volts: part.signalVoltage, colour: BLUE, note: 'Digital output, high or low.' })
      break
    case 'pwm':
      out.push({ name: 'SIG', role: 'signalIn', volts: part.signalVoltage, colour: AMBER, note: 'PWM control input.' })
      break
    default:
      break
  }
  return out
}

function controllerPinToTerminal(p: PinDef): Terminal {
  if (p.kind === 'power') {
    return { name: p.name, role: 'powerOut', volts: p.name.includes('5') ? 5 : 3.3, colour: RED, note: p.note ?? '' }
  }
  if (p.kind === 'ground') {
    return { name: p.name, role: 'groundIn', colour: BLACK, note: p.note ?? '' }
  }
  const colour = p.kind === 'adc' || p.kind === 'inputOnly' ? BLUE : p.kind === 'i2c' ? GREEN : AMBER
  return { name: p.name, role: 'signalIn', colour, note: p.note ?? '' }
}

/** True where a controller pin can read an analog voltage. */
export function isAdcPin(part: CatalogPart, pinName: string): boolean {
  const p = part.pins?.find((x) => x.name === pinName)
  return p?.kind === 'adc' || p?.kind === 'inputOnly'
}

/** True where a controller pin can be driven as an output. */
export function isOutputPin(part: CatalogPart, pinName: string): boolean {
  const p = part.pins?.find((x) => x.name === pinName)
  if (!p) return false
  return p.kind === 'digital' || p.kind === 'adc' || p.kind === 'pwm' || p.kind === 'i2c'
}

export function gpioOf(partId: string, pinName: string): number | undefined {
  return CATALOG_BY_ID.get(partId)?.pins?.find((p) => p.name === pinName)?.gpio
}
