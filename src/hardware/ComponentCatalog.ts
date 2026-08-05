// ---------------------------------------------------------------------------
// ComponentCatalog
//
// Every part a student can buy. The rule governing the copy in this file: each
// entry states what the component *is* and what it *does*, never what it is
// for in this mission. An LDR says "measures light intensity" — it does not say
// "use this to stop watering at night". Deciding relevance is the student's
// job, and spoiling it would collapse the sandbox into a guided tour.
//
// Specs are real. Where a number matters to validation (logic voltage, stall
// current, ADC resolution) it is drawn from the actual datasheet, because the
// HardwareValidator enforces them and a student who looks up the part should
// find the simulation agrees with reality.
// ---------------------------------------------------------------------------

export type Category =
  | 'controllers'
  | 'prototyping'
  | 'power'
  | 'sensors'
  | 'actuators'
  | 'drivers'
  | 'output'
  | 'passives'
  | 'plumbing'

export const CATEGORY_LABELS: Record<Category, string> = {
  controllers: 'Microcontrollers',
  prototyping: 'Prototyping',
  power: 'Power & charging',
  sensors: 'Sensors',
  actuators: 'Actuators & motors',
  drivers: 'Switching & drivers',
  output: 'Displays & indicators',
  passives: 'Passives & discrete',
  plumbing: 'Water & mechanical',
}

export type SignalType = 'digital' | 'analog' | 'i2c' | 'spi' | 'onewire' | 'pwm' | 'power' | 'none'

export interface PinDef {
  name: string
  kind: 'power' | 'ground' | 'digital' | 'analog' | 'adc' | 'inputOnly' | 'pwm' | 'i2c' | 'signal'
  /** GPIO number where the part is a controller. */
  gpio?: number
  note?: string
}

export interface CatalogPart {
  id: string
  category: Category
  name: string
  /** Neutral description of behaviour. Never states relevance to the mission. */
  description: string

  /** Supply rail the part expects, in volts. */
  supplyVoltage?: number
  /** Highest voltage an input can tolerate. Controllers and driver inputs. */
  inputToleranceVolts?: number
  /** Voltage a sensor presents on its signal line. */
  signalVoltage?: number
  signalType: SignalType

  /** Typical running current in milliamps. */
  currentMa?: number
  /** Peak or stall current, where it differs sharply from typical. */
  peakCurrentMa?: number
  /** Continuous power draw in watts, for the energy ledger. */
  ratedWatts?: number
  /** Generation capacity in watts, for sources. */
  peakWatts?: number
  /** Storage capacity in watt-hours. */
  capacityWh?: number
  /** Current a single I/O pin can source, milliamps. Controllers only. */
  pinCurrentLimitMa?: number
  /** Current a switching stage can pass, milliamps. */
  switchingCurrentMa?: number

  /** Pin header, where the part exposes one. */
  pins?: PinDef[]

  /** Relative cost in credits. Budget pressure creates real tradeoffs. */
  cost: number
  /** 1 = beginner, 3 = requires care. Shown, never enforced. */
  complexity: 1 | 2 | 3
  /** Short spec bullets rendered on the card. */
  specs: string[]
  /** Multiple units are often wanted. */
  stackable?: boolean
}

const ESP32_PINS: PinDef[] = [
  { name: '3V3', kind: 'power', note: '3.3 V regulated output, roughly 600 mA available.' },
  { name: '5V', kind: 'power', note: '5 V passed through from USB or VIN.' },
  { name: 'GND', kind: 'ground', note: 'Ground rail.' },
  { name: 'GND2', kind: 'ground', note: 'Second ground pin, same rail.' },
  { name: 'D34', kind: 'inputOnly', gpio: 34, note: 'ADC1 channel. Input only — cannot drive a load.' },
  { name: 'D35', kind: 'inputOnly', gpio: 35, note: 'ADC1 channel. Input only — cannot drive a load.' },
  { name: 'D32', kind: 'adc', gpio: 32, note: 'ADC1 channel, also usable as digital output.' },
  { name: 'D33', kind: 'adc', gpio: 33, note: 'ADC1 channel, also usable as digital output.' },
  { name: 'D25', kind: 'digital', gpio: 25, note: 'Digital I/O with DAC.' },
  { name: 'D26', kind: 'digital', gpio: 26, note: 'Digital I/O with DAC.' },
  { name: 'D4', kind: 'digital', gpio: 4, note: 'General-purpose digital I/O.' },
  { name: 'D5', kind: 'digital', gpio: 5, note: 'General-purpose digital I/O.' },
  { name: 'D18', kind: 'digital', gpio: 18, note: 'General-purpose digital I/O.' },
  { name: 'D19', kind: 'digital', gpio: 19, note: 'General-purpose digital I/O.' },
  { name: 'D21', kind: 'i2c', gpio: 21, note: 'Default I2C SDA.' },
  { name: 'D22', kind: 'i2c', gpio: 22, note: 'Default I2C SCL.' },
]

const UNO_PINS: PinDef[] = [
  { name: '5V', kind: 'power', note: '5 V regulated output.' },
  { name: '3V3', kind: 'power', note: '3.3 V output, roughly 50 mA only.' },
  { name: 'GND', kind: 'ground', note: 'Ground rail.' },
  { name: 'GND2', kind: 'ground', note: 'Second ground pin, same rail.' },
  { name: 'A0', kind: 'adc', gpio: 14, note: '10-bit ADC input, 0–5 V range.' },
  { name: 'A1', kind: 'adc', gpio: 15, note: '10-bit ADC input, 0–5 V range.' },
  { name: 'A2', kind: 'adc', gpio: 16, note: '10-bit ADC input, 0–5 V range.' },
  { name: 'A3', kind: 'adc', gpio: 17, note: '10-bit ADC input, 0–5 V range.' },
  { name: 'D2', kind: 'digital', gpio: 2, note: 'Digital I/O, interrupt capable.' },
  { name: 'D3', kind: 'pwm', gpio: 3, note: 'Digital I/O with PWM.' },
  { name: 'D5', kind: 'pwm', gpio: 5, note: 'Digital I/O with PWM.' },
  { name: 'D6', kind: 'pwm', gpio: 6, note: 'Digital I/O with PWM.' },
  { name: 'D7', kind: 'digital', gpio: 7, note: 'Digital I/O.' },
  { name: 'D8', kind: 'digital', gpio: 8, note: 'Digital I/O.' },
  { name: 'D9', kind: 'pwm', gpio: 9, note: 'Digital I/O with PWM.' },
  { name: 'D10', kind: 'pwm', gpio: 10, note: 'Digital I/O with PWM.' },
]

const P = (p: CatalogPart) => p

export const CATALOG: CatalogPart[] = [
  // ---------------------------------------------------------------- boards
  P({
    id: 'esp32s3', category: 'controllers', name: 'ESP32-S3 DevKit',
    description: 'Dual-core microcontroller with Wi-Fi and Bluetooth. Runs on 3.3 V logic and has multiple ADC channels.',
    supplyVoltage: 3.3, inputToleranceVolts: 3.3, signalType: 'digital',
    currentMa: 80, ratedWatts: 0.9, pinCurrentLimitMa: 12, pins: ESP32_PINS,
    cost: 12, complexity: 2,
    specs: ['3.3 V logic', '12-bit ADC', '~12 mA per pin', 'Wi-Fi + BLE'],
  }),
  P({
    id: 'esp32', category: 'controllers', name: 'ESP32 DevKit v1',
    description: 'Widely used 3.3 V microcontroller with 30 pins, two ADC banks and built-in Wi-Fi.',
    supplyVoltage: 3.3, inputToleranceVolts: 3.3, signalType: 'digital',
    currentMa: 70, ratedWatts: 0.8, pinCurrentLimitMa: 12, pins: ESP32_PINS,
    cost: 9, complexity: 2,
    specs: ['3.3 V logic', '12-bit ADC', 'GPIO34/35 input-only', 'Wi-Fi'],
  }),
  P({
    id: 'unoR3', category: 'controllers', name: 'Arduino Uno R3',
    description: 'Beginner-friendly 8-bit board. Runs 5 V logic throughout, with six analog inputs and fourteen digital pins.',
    supplyVoltage: 5, inputToleranceVolts: 5, signalType: 'digital',
    currentMa: 50, ratedWatts: 0.5, pinCurrentLimitMa: 20, pins: UNO_PINS,
    cost: 10, complexity: 1,
    specs: ['5 V logic', '10-bit ADC', '~20 mA per pin', 'No wireless'],
  }),
  P({
    id: 'nano', category: 'controllers', name: 'Arduino Nano',
    description: 'Compact 5 V board with the same core as the Uno in a breadboard-friendly footprint.',
    supplyVoltage: 5, inputToleranceVolts: 5, signalType: 'digital',
    currentMa: 40, ratedWatts: 0.4, pinCurrentLimitMa: 20, pins: UNO_PINS,
    cost: 7, complexity: 1,
    specs: ['5 V logic', '10-bit ADC', 'Breadboard footprint'],
  }),

  // ----------------------------------------------------------- prototyping
  P({
    id: 'breadboardFull', category: 'prototyping', name: 'Breadboard (830 point)',
    description: 'Solderless board with connected rows and two power rails down each side. Connections are temporary.',
    signalType: 'none', cost: 5, complexity: 1, stackable: true,
    specs: ['830 tie points', 'Two power rails', 'No soldering', 'Contacts can loosen'],
  }),
  P({
    id: 'breadboardHalf', category: 'prototyping', name: 'Breadboard (400 point)',
    description: 'Half-size solderless board with one pair of power rails.',
    signalType: 'none', cost: 3, complexity: 1, stackable: true,
    specs: ['400 tie points', 'One rail pair'],
  }),
  P({
    id: 'veroboard', category: 'prototyping', name: 'Veroboard / stripboard',
    description: 'Copper strips on perforated board. Joints are soldered, so connections are permanent and vibration-resistant.',
    signalType: 'none', cost: 4, complexity: 3, stackable: true,
    specs: ['Soldered joints', 'Permanent', 'Survives vibration', 'Hard to modify'],
  }),
  P({
    id: 'wireMM', category: 'prototyping', name: 'Jumper wires (male–male)',
    description: 'Pin-to-pin wires for board and breadboard connections.',
    signalType: 'none', cost: 1, complexity: 1, stackable: true,
    specs: ['40 pack', 'Pin to pin'],
  }),
  P({
    id: 'wireMF', category: 'prototyping', name: 'Jumper wires (male–female)',
    description: 'Wires with one pin and one socket, for connecting modules to headers.',
    signalType: 'none', cost: 1, complexity: 1, stackable: true,
    specs: ['40 pack', 'Pin to socket'],
  }),
  P({
    id: 'wireDirect', category: 'prototyping', name: 'Solid core hookup wire',
    description: 'Bare hookup wire for soldering components directly to each other with no board between them.',
    signalType: 'none', cost: 2, complexity: 3, stackable: true,
    specs: ['22 AWG', 'Direct soldering', 'No board needed'],
  }),
  P({
    id: 'terminalBlock', category: 'prototyping', name: 'Screw terminal block',
    description: 'Screw-clamped connections for thicker wire carrying higher current.',
    signalType: 'none', cost: 2, complexity: 1, stackable: true,
    specs: ['Up to 10 A', 'Screw clamped'],
  }),

  // ----------------------------------------------------------------- power
  P({
    id: 'solar10', category: 'power', name: 'Solar panel 10 W',
    description: 'Photovoltaic panel. Output falls with cloud cover, panel temperature and sun angle.',
    peakWatts: 10, supplyVoltage: 12, signalType: 'power', cost: 8, complexity: 1, stackable: true,
    specs: ['10 W peak', '12 V nominal', 'Output varies with sun'],
  }),
  P({
    id: 'solar20', category: 'power', name: 'Solar panel 20 W',
    description: 'Photovoltaic panel with double the collecting area of the 10 W unit.',
    peakWatts: 20, supplyVoltage: 12, signalType: 'power', cost: 14, complexity: 1, stackable: true,
    specs: ['20 W peak', '12 V nominal'],
  }),
  P({
    id: 'solar50', category: 'power', name: 'Solar panel 50 W',
    description: 'Larger photovoltaic panel. Needs a charge controller between it and any battery.',
    peakWatts: 50, supplyVoltage: 12, signalType: 'power', cost: 30, complexity: 2, stackable: true,
    specs: ['50 W peak', '12 V nominal', 'Needs a controller'],
  }),
  P({
    id: 'lifepo4_7', category: 'power', name: 'LiFePO4 pack 12 V 7 Ah',
    description: 'Lithium iron phosphate battery. Stores energy; it does not create any.',
    capacityWh: 84, supplyVoltage: 12, signalType: 'power', cost: 22, complexity: 2, stackable: true,
    specs: ['84 Wh', '12 V', 'Long cycle life'],
  }),
  P({
    id: 'lifepo4_20', category: 'power', name: 'LiFePO4 pack 12 V 20 Ah',
    description: 'Larger lithium iron phosphate pack for longer autonomy without generation.',
    capacityWh: 240, supplyVoltage: 12, signalType: 'power', cost: 52, complexity: 2, stackable: true,
    specs: ['240 Wh', '12 V'],
  }),
  P({
    id: 'lifepo4_40', category: 'power', name: 'LiFePO4 pack 12 V 40 Ah',
    description: 'High-capacity pack. Heavy, expensive, and slow to recharge from a small array.',
    capacityWh: 480, supplyVoltage: 12, signalType: 'power', cost: 95, complexity: 2, stackable: true,
    specs: ['480 Wh', '12 V', 'Slow to refill'],
  }),
  P({
    id: 'pwmController', category: 'power', name: 'PWM charge controller',
    description: 'Regulates panel output into a battery. Simple and cheap; harvests less than an MPPT unit.',
    supplyVoltage: 12, signalType: 'power', currentMa: 20, cost: 9, complexity: 2,
    specs: ['~75% harvest', '12 V', 'Protects the battery'],
  }),
  P({
    id: 'mpptController', category: 'power', name: 'MPPT charge controller',
    description: 'Tracks the panel maximum power point and converts the surplus voltage into extra current.',
    supplyVoltage: 12, signalType: 'power', currentMa: 30, cost: 26, complexity: 3,
    specs: ['~95% harvest', '12 V', 'Higher cost'],
  }),
  P({
    id: 'buck', category: 'power', name: 'Buck converter (LM2596)',
    description: 'Steps a higher DC voltage down to a lower one with an adjustable output.',
    signalType: 'power', currentMa: 10, cost: 3, complexity: 2, stackable: true,
    specs: ['4.5–35 V in', '1.25–30 V out', '3 A max'],
  }),
  P({
    id: 'reg7805', category: 'power', name: 'Linear regulator 7805',
    description: 'Fixed 5 V output. Dissipates the surplus voltage as heat rather than converting it.',
    supplyVoltage: 5, signalType: 'power', cost: 1, complexity: 2, stackable: true,
    specs: ['5 V out', '1 A max', 'Wastes energy as heat'],
  }),

  // --------------------------------------------------------------- sensors
  P({
    id: 'soilCapacitive', category: 'sensors', name: 'Capacitive soil moisture sensor',
    description: 'Measures soil moisture by capacitance. The probe is coated, so it does not corrode in wet soil.',
    supplyVoltage: 3.3, signalVoltage: 3.0, signalType: 'analog', currentMa: 5, cost: 4, complexity: 1,
    specs: ['3.3 V', 'Analog out', 'Corrosion resistant'],
  }),
  P({
    id: 'soilResistive', category: 'sensors', name: 'Resistive soil moisture sensor',
    description: 'Measures soil moisture by resistance between two exposed probes. Runs from 5 V.',
    supplyVoltage: 5, signalVoltage: 5, signalType: 'analog', currentMa: 20, cost: 2, complexity: 1,
    specs: ['5 V', 'Analog out', 'Probes corrode over time'],
  }),
  P({
    id: 'ldr', category: 'sensors', name: 'LDR photoresistor',
    description: 'Resistance falls as light increases. Needs a fixed resistor to form a divider.',
    supplyVoltage: 3.3, signalVoltage: 3.3, signalType: 'analog', currentMa: 1, cost: 1, complexity: 2,
    specs: ['Analog', 'Needs a divider resistor', 'Very cheap'],
  }),
  P({
    id: 'dht22', category: 'sensors', name: 'DHT22 temperature & humidity',
    description: 'Digital sensor reporting air temperature and relative humidity over a single data line.',
    supplyVoltage: 3.3, signalVoltage: 3.3, signalType: 'onewire', currentMa: 2, cost: 6, complexity: 2,
    specs: ['±0.5 °C', '0–100 % RH', 'One data pin', '2 s minimum interval'],
  }),
  P({
    id: 'dht11', category: 'sensors', name: 'DHT11 temperature & humidity',
    description: 'Cheaper single-wire temperature and humidity sensor with coarser resolution.',
    supplyVoltage: 5, signalVoltage: 5, signalType: 'onewire', currentMa: 2, cost: 2, complexity: 1,
    specs: ['±2 °C', '20–80 % RH', 'One data pin'],
  }),
  P({
    id: 'ds18b20', category: 'sensors', name: 'DS18B20 waterproof temp probe',
    description: 'Sealed digital temperature probe on a lead, suitable for burial or immersion.',
    supplyVoltage: 3.3, signalVoltage: 3.3, signalType: 'onewire', currentMa: 1, cost: 4, complexity: 2,
    specs: ['±0.5 °C', 'Waterproof', 'One-wire bus'],
  }),
  P({
    id: 'rainSensor', category: 'sensors', name: 'Rain / precipitation sensor',
    description: 'Conductive plate whose resistance drops when water lands on it. Gives analog and digital outputs.',
    supplyVoltage: 5, signalVoltage: 5, signalType: 'analog', currentMa: 15, cost: 3, complexity: 1,
    specs: ['5 V', 'Analog + digital out', 'Surface detection only'],
  }),
  P({
    id: 'waterLevel', category: 'sensors', name: 'Water level sensor',
    description: 'Reports depth of water across a set of parallel traces.',
    supplyVoltage: 5, signalVoltage: 5, signalType: 'analog', currentMa: 20, cost: 3, complexity: 1,
    specs: ['5 V', 'Analog out', '40 mm range'],
  }),
  P({
    id: 'floatSwitch', category: 'sensors', name: 'Float switch',
    description: 'Mechanical switch that opens or closes when a float rises past a set height.',
    supplyVoltage: 3.3, signalVoltage: 3.3, signalType: 'digital', currentMa: 1, cost: 2, complexity: 1,
    specs: ['Simple contact', 'No power needed to sense', 'Single threshold'],
  }),
  P({
    id: 'flowMeter', category: 'sensors', name: 'YF-S201 flow meter',
    description: 'Hall-effect turbine that emits pulses proportional to the volume of water passing through it.',
    supplyVoltage: 5, signalVoltage: 5, signalType: 'digital', currentMa: 15, cost: 7, complexity: 3,
    specs: ['1–30 L/min', 'Pulse output', 'Needs interrupt counting'],
  }),
  P({
    id: 'ultrasonic', category: 'sensors', name: 'HC-SR04 ultrasonic ranger',
    description: 'Measures distance by timing an ultrasonic echo. Commonly used to gauge tank contents.',
    supplyVoltage: 5, signalVoltage: 5, signalType: 'digital', currentMa: 15, cost: 3, complexity: 2,
    specs: ['2–400 cm', '5 V trigger and echo', 'Two pins'],
  }),
  P({
    id: 'bmp280', category: 'sensors', name: 'BMP280 pressure & temperature',
    description: 'I2C barometric pressure and temperature sensor.',
    supplyVoltage: 3.3, signalVoltage: 3.3, signalType: 'i2c', currentMa: 1, cost: 5, complexity: 2,
    specs: ['I2C', '3.3 V', 'Pressure + temp'],
  }),

  // ------------------------------------------------------------- actuators
  P({
    id: 'pump12v', category: 'actuators', name: '12 V submersible pump',
    description: 'Immersed DC pump. Draws far more current than any microcontroller pin can supply.',
    supplyVoltage: 12, signalType: 'none', currentMa: 2500, peakCurrentMa: 4000, ratedWatts: 30,
    cost: 14, complexity: 2,
    specs: ['12 V', '~2.5 A running', '~4 A on start', '30 W'],
  }),
  P({
    id: 'pump5v', category: 'actuators', name: '5 V mini pump',
    description: 'Small DC pump with lower flow and a lighter current demand.',
    supplyVoltage: 5, signalType: 'none', currentMa: 700, peakCurrentMa: 1100, ratedWatts: 3.5,
    cost: 6, complexity: 1,
    specs: ['5 V', '~0.7 A', '3.5 W', 'Low flow'],
  }),
  P({
    id: 'solenoidValve', category: 'actuators', name: '12 V solenoid valve',
    description: 'Electrically operated valve. Holds a line open only while energised.',
    supplyVoltage: 12, signalType: 'none', currentMa: 500, ratedWatts: 6, cost: 9, complexity: 2,
    specs: ['12 V', '~0.5 A', 'Normally closed', 'Needs a flyback diode'],
  }),
  P({
    id: 'servoSG90', category: 'actuators', name: 'SG90 micro servo',
    description: 'Positional servo taking a PWM pulse and holding an angle between 0 and 180 degrees.',
    supplyVoltage: 5, signalVoltage: 5, signalType: 'pwm', currentMa: 250, peakCurrentMa: 700,
    ratedWatts: 1.25, cost: 3, complexity: 2,
    specs: ['5 V', '0–180°', 'PWM control', 'Draws spikes when moving'],
  }),
  P({
    id: 'stepper28byj', category: 'actuators', name: '28BYJ-48 stepper + ULN2003',
    description: 'Geared stepper motor supplied with its own driver board. Slow, but positions precisely.',
    supplyVoltage: 5, signalType: 'digital', currentMa: 240, ratedWatts: 1.2, cost: 4, complexity: 2,
    specs: ['5 V', '4096 steps/rev', 'Driver included', 'Low torque'],
  }),
  P({
    id: 'nema17', category: 'actuators', name: 'NEMA 17 stepper motor',
    description: 'Standard-frame stepper used on linear motion systems. Requires a separate driver.',
    supplyVoltage: 12, signalType: 'digital', currentMa: 1500, ratedWatts: 12, cost: 15, complexity: 3,
    specs: ['12 V', '1.5 A per phase', '200 steps/rev', 'Driver sold separately'],
  }),
  P({
    id: 'gantryKit', category: 'actuators', name: 'Cartesian gantry kit (X-Y)',
    description: 'Two-axis linear rail system moving a head to any coordinate on a grid. Uses two stepper motors.',
    supplyVoltage: 12, signalType: 'digital', currentMa: 3000, ratedWatts: 45, cost: 68, complexity: 3,
    specs: ['2400 × 1200 mm travel', '2.5 kg payload', '3000 mm/min', 'Two NEMA 17 drivers needed'],
  }),
  P({
    id: 'dcFan', category: 'actuators', name: '12 V cooling fan',
    description: 'Axial fan for moving air across equipment.',
    supplyVoltage: 12, signalType: 'none', currentMa: 200, ratedWatts: 2.4, cost: 3, complexity: 1,
    specs: ['12 V', '0.2 A', '80 mm'],
  }),

  // --------------------------------------------------------------- drivers
  P({
    id: 'relay1ch', category: 'drivers', name: '5 V relay module (1 channel)',
    description: 'Mechanical relay on a carrier board with an opto-isolated input. Switches a high current load from a logic signal.',
    supplyVoltage: 5, inputToleranceVolts: 5, signalType: 'digital', currentMa: 70,
    switchingCurrentMa: 10000, cost: 3, complexity: 1,
    specs: ['5 V coil', 'Up to 10 A', 'Audible click', 'Finite contact life'],
  }),
  P({
    id: 'relay2ch', category: 'drivers', name: '5 V relay module (2 channel)',
    description: 'Two independent relays on one carrier board.',
    supplyVoltage: 5, inputToleranceVolts: 5, signalType: 'digital', currentMa: 140,
    switchingCurrentMa: 10000, cost: 5, complexity: 1,
    specs: ['5 V coil', 'Two channels', 'Up to 10 A each'],
  }),
  P({
    id: 'mosfetIRF520', category: 'drivers', name: 'IRF520 MOSFET module',
    description: 'Solid-state switch for DC loads. No moving parts, switches quickly, and can be driven with PWM.',
    supplyVoltage: 12, inputToleranceVolts: 5, signalType: 'pwm', currentMa: 5,
    switchingCurrentMa: 5000, cost: 3, complexity: 2,
    specs: ['Up to 5 A', 'DC only', 'Silent', 'PWM capable', 'Gate needs adequate voltage'],
  }),
  P({
    id: 'transistor2N2222', category: 'drivers', name: '2N2222 transistor',
    description: 'Small bipolar transistor. Switches modest currents and needs a base resistor.',
    supplyVoltage: 5, inputToleranceVolts: 5, signalType: 'digital', switchingCurrentMa: 800,
    cost: 1, complexity: 3, stackable: true,
    specs: ['800 mA max', 'Needs a base resistor', 'Discrete component'],
  }),
  P({
    id: 'l298n', category: 'drivers', name: 'L298N motor driver',
    description: 'Dual H-bridge able to run two DC motors in either direction.',
    supplyVoltage: 12, inputToleranceVolts: 5, signalType: 'pwm', currentMa: 40,
    switchingCurrentMa: 2000, cost: 5, complexity: 2,
    specs: ['2 A per channel', 'Bidirectional', 'Drops ~2 V'],
  }),
  P({
    id: 'a4988', category: 'drivers', name: 'A4988 stepper driver',
    description: 'Generates the coil sequence a stepper needs from step and direction signals.',
    supplyVoltage: 12, inputToleranceVolts: 5, signalType: 'digital', currentMa: 8,
    switchingCurrentMa: 2000, cost: 4, complexity: 3, stackable: true,
    specs: ['Up to 2 A', 'Microstepping', 'Step + direction inputs', 'Needs current limit set'],
  }),

  // ---------------------------------------------------------------- output
  P({
    id: 'ledRed', category: 'output', name: 'LED (red)',
    description: 'Indicator light. Needs a series resistor to limit current.',
    supplyVoltage: 3.3, signalType: 'digital', currentMa: 20, cost: 1, complexity: 1, stackable: true,
    specs: ['~2 V forward', '20 mA', 'Needs a resistor'],
  }),
  P({
    id: 'ledGreen', category: 'output', name: 'LED (green)',
    description: 'Indicator light in green. Needs a series resistor.',
    supplyVoltage: 3.3, signalType: 'digital', currentMa: 20, cost: 1, complexity: 1, stackable: true,
    specs: ['~2.1 V forward', '20 mA'],
  }),
  P({
    id: 'ledRGB', category: 'output', name: 'RGB LED',
    description: 'Three colour dies in one package, each needing its own resistor and pin.',
    supplyVoltage: 3.3, signalType: 'pwm', currentMa: 60, cost: 1, complexity: 2, stackable: true,
    specs: ['Three channels', 'PWM mixable', 'Three resistors'],
  }),
  P({
    id: 'buzzer', category: 'output', name: 'Active buzzer',
    description: 'Sounds a fixed tone whenever it is powered.',
    supplyVoltage: 5, signalType: 'digital', currentMa: 30, cost: 1, complexity: 1,
    specs: ['5 V', '~30 mA', 'Fixed pitch'],
  }),
  P({
    id: 'lcd1602', category: 'output', name: '16×2 LCD with I2C backpack',
    description: 'Two-line character display driven over the I2C bus.',
    supplyVoltage: 5, inputToleranceVolts: 5, signalType: 'i2c', currentMa: 25, cost: 5, complexity: 2,
    specs: ['16×2 characters', 'I2C, two pins', '5 V'],
  }),
  P({
    id: 'oledSSD1306', category: 'output', name: '0.96" OLED display',
    description: 'Small graphic display on the I2C bus. Draws very little current.',
    supplyVoltage: 3.3, inputToleranceVolts: 3.3, signalType: 'i2c', currentMa: 15, cost: 6, complexity: 2,
    specs: ['128×64 px', 'I2C', '3.3 V', 'Low power'],
  }),

  // -------------------------------------------------------------- passives
  P({
    id: 'res220', category: 'passives', name: 'Resistor 220 Ω',
    description: 'Limits current through a branch of a circuit.',
    signalType: 'none', cost: 1, complexity: 1, stackable: true, specs: ['220 Ω', '¼ W', 'Pack of 10'],
  }),
  P({
    id: 'res1k', category: 'passives', name: 'Resistor 1 kΩ',
    description: 'General-purpose resistor, often used on transistor bases.',
    signalType: 'none', cost: 1, complexity: 1, stackable: true, specs: ['1 kΩ', '¼ W', 'Pack of 10'],
  }),
  P({
    id: 'res10k', category: 'passives', name: 'Resistor 10 kΩ',
    description: 'Common value for pull-ups and voltage dividers.',
    signalType: 'none', cost: 1, complexity: 1, stackable: true, specs: ['10 kΩ', '¼ W', 'Pack of 10'],
  }),
  P({
    id: 'potentiometer', category: 'passives', name: 'Potentiometer 10 kΩ',
    description: 'Adjustable divider giving a variable voltage from a knob position.',
    supplyVoltage: 3.3, signalVoltage: 3.3, signalType: 'analog', cost: 2, complexity: 1,
    specs: ['10 kΩ', 'Three terminals', 'Analog out'],
  }),
  P({
    id: 'diode1N4007', category: 'passives', name: 'Diode 1N4007',
    description: 'Passes current one way only. Placed across a coil it absorbs the reverse spike when power is cut.',
    signalType: 'none', cost: 1, complexity: 2, stackable: true,
    specs: ['1 A', '1000 V', 'Flyback protection'],
  }),
  P({
    id: 'cap100uf', category: 'passives', name: 'Capacitor 100 µF',
    description: 'Stores a small charge and smooths brief dips on a supply rail.',
    signalType: 'none', cost: 1, complexity: 2, stackable: true,
    specs: ['100 µF', '25 V', 'Polarised'],
  }),
  P({
    id: 'pushButton', category: 'passives', name: 'Tactile push button',
    description: 'Momentary switch closing a contact while held.',
    signalType: 'digital', cost: 1, complexity: 1, stackable: true,
    specs: ['Momentary', 'Needs a pull-up or pull-down'],
  }),

  // -------------------------------------------------------------- plumbing
  P({
    id: 'waterTank', category: 'plumbing', name: 'Water tank (200 L)',
    description: 'Reservoir holding the water the system distributes.',
    signalType: 'none', cost: 18, complexity: 1, specs: ['200 L', 'Gravity fed outlet'],
  }),
  P({
    id: 'tubing', category: 'plumbing', name: 'Irrigation tubing (10 m)',
    description: 'Flexible line carrying water from the pump to the field.',
    signalType: 'none', cost: 4, complexity: 1, stackable: true, specs: ['10 m', '8 mm bore'],
  }),
  P({
    id: 'sprinklerHead', category: 'plumbing', name: 'Sprinkler head',
    description: 'Sprays water in an arc across a radius of ground.',
    signalType: 'none', cost: 3, complexity: 1, stackable: true, specs: ['~2 m radius', 'Arc spray'],
  }),
  P({
    id: 'dripEmitter', category: 'plumbing', name: 'Drip emitters (pack of 20)',
    description: 'Releases water slowly at a point rather than spraying it over an area.',
    signalType: 'none', cost: 4, complexity: 1, stackable: true,
    specs: ['2 L/hour each', 'Point delivery', 'Little evaporation loss'],
  }),
  P({
    id: 'gantryRail', category: 'plumbing', name: 'Linear rail (1.2 m)',
    description: 'Extruded rail and carriage forming one axis of a linear motion system.',
    signalType: 'none', cost: 22, complexity: 3, stackable: true,
    specs: ['1.2 m', 'Belt driven', 'One axis'],
  }),
]

export const CATALOG_BY_ID = new Map(CATALOG.map((p) => [p.id, p]))

export function partsInCategory(c: Category): CatalogPart[] {
  return CATALOG.filter((p) => p.category === c)
}

export const CATEGORY_ORDER: Category[] = [
  'controllers',
  'sensors',
  'drivers',
  'actuators',
  'power',
  'prototyping',
  'passives',
  'output',
  'plumbing',
]
