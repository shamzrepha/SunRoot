import * as Blockly from 'blockly'
import { javascriptGenerator, Order } from 'blockly/javascript'
import { wiredOutputs, wiredSensors } from '../hardware/CircuitGraph'
import type { WiredOutput, WiredSensor } from '../hardware/CircuitGraph'

/**
 * Blocks are generated from the bench, not from a fixed list. Wire a soil
 * sensor to D32 and a "read soil moisture (D32)" block appears; wire nothing
 * and the Hardware category is empty. The pin is baked in from the physical
 * wiring, so a student cannot address a pin they never connected — the block
 * exists only because the wire does.
 */

export interface GeneratedIo {
  sensors: WiredSensor[]
  outputs: WiredOutput[]
  blockTypes: string[]
}

const defined = new Set<string>()

function readingLabel(s: WiredSensor): string {
  const id = s.part.id
  if (id.startsWith('soil')) return 'soil moisture'
  if (id === 'ldr') return 'light level'
  if (id.startsWith('dht') || id === 'ds18b20') return 'temperature'
  if (id === 'rainSensor') return 'rainfall'
  if (id === 'waterLevel' || id === 'ultrasonic') return 'water level'
  if (id === 'floatSwitch') return 'float switch'
  if (id === 'flowMeter') return 'flow rate'
  if (id === 'bmp280') return 'pressure'
  return s.part.name.toLowerCase()
}

function outputLabel(o: WiredOutput): string {
  return o.part.category === 'drivers' ? o.part.name.replace(/ module.*/i, '') : o.part.name
}

export function buildIo(): GeneratedIo {
  const sensors = wiredSensors()
  const outputs = wiredOutputs()
  const blockTypes: string[] = []

  for (const s of sensors) {
    const type = `read_${s.instanceId}`
    blockTypes.push(type)
    if (defined.has(type)) continue
    defined.add(type)

    const label = `${readingLabel(s)} (${s.pinName})`
    Blockly.Blocks[type] = {
      init(this: Blockly.Block) {
        this.appendDummyInput().appendField(`read ${label}`)
        this.setOutput(true, 'Number')
        this.setColour(210)
        this.setTooltip(
          s.readable
            ? `${s.part.name} wired to ${s.pinName}. Returns 0 to 100.`
            : `${s.part.name} is on ${s.pinName}, which cannot read it. This returns 0.`,
        )
      },
    }
    // A sensor on a pin that cannot read it returns a floating zero, exactly as
    // the real hardware would. The block exists; it simply never reports.
    const expr = s.readable ? `readPin(${JSON.stringify(s.instanceId)})` : '0'
    javascriptGenerator.forBlock[type] = () => [expr, Order.FUNCTION_CALL]
  }

  for (const o of outputs) {
    const type = `set_${o.instanceId}`
    blockTypes.push(type)
    if (defined.has(type)) continue
    defined.add(type)

    const label = `${outputLabel(o)} (${o.pinName})`
    Blockly.Blocks[type] = {
      init(this: Blockly.Block) {
        this.appendDummyInput()
          .appendField(`set ${label}`)
          .appendField(new Blockly.FieldDropdown([['ON', 'ON'], ['OFF', 'OFF']]), 'STATE')
        this.setPreviousStatement(true, null)
        this.setNextStatement(true, null)
        this.setColour(160)
        this.setTooltip(
          o.drivable ? `Drives ${o.pinName}.` : `${o.pinName} is input-only; this has no effect.`,
        )
      },
    }
    javascriptGenerator.forBlock[type] = (block: Blockly.Block) => {
      const on = block.getFieldValue('STATE') === 'ON'
      return o.drivable
        ? `writePin(${JSON.stringify(o.instanceId)}, ${on});\n`
        : `/* ${o.pinName} is input-only */\n`
    }
  }

  return { sensors, outputs, blockTypes }
}

/** Blocks that exist regardless of hardware: timing and the controller clock. */
export function defineCoreBlocks() {
  if (defined.has('sunroot_wait')) return
  defined.add('sunroot_wait')

  Blockly.Blocks['sunroot_wait'] = {
    init(this: Blockly.Block) {
      this.appendValueInput('SECONDS').setCheck('Number').appendField('wait')
      this.appendDummyInput().appendField('seconds')
      this.setPreviousStatement(true, null)
      this.setNextStatement(true, null)
      this.setColour(50)
      this.setTooltip('Pauses before the next instruction. Lets you build hysteresis.')
    },
  }
  javascriptGenerator.forBlock['sunroot_wait'] = (block, gen) => {
    const secs = gen.valueToCode(block, 'SECONDS', Order.NONE) || '1'
    return `if (waitFor(${secs})) return;\n`
  }

  Blockly.Blocks['farm_clock'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('hour of day')
      this.setOutput(true, 'Number')
      this.setColour(210)
      this.setTooltip('Farm clock, 0 to 24, kept by the controller itself.')
    },
  }
  javascriptGenerator.forBlock['farm_clock'] = () => ['hourOfDay', Order.ATOMIC]
}

export function buildToolbox(io: GeneratedIo) {
  const hardware: { kind: string; type: string }[] = io.blockTypes.map((t) => ({
    kind: 'block',
    type: t,
  }))
  hardware.push({ kind: 'block', type: 'farm_clock' })

  return {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category',
        name: io.blockTypes.length ? 'Hardware' : 'Hardware (nothing wired)',
        colour: '210',
        contents: hardware,
      },
      {
        kind: 'category',
        name: 'Logic',
        colour: '#5C6BC0',
        contents: [
          { kind: 'block', type: 'controls_if' },
          { kind: 'block', type: 'logic_compare' },
          { kind: 'block', type: 'logic_operation' },
          { kind: 'block', type: 'logic_negate' },
          { kind: 'block', type: 'logic_boolean' },
        ],
      },
      {
        kind: 'category',
        name: 'Loops',
        colour: '#4CAF50',
        contents: [
          { kind: 'block', type: 'controls_repeat_ext' },
          { kind: 'block', type: 'controls_whileUntil' },
          { kind: 'block', type: 'controls_for' },
          { kind: 'block', type: 'controls_flow_statements' },
        ],
      },
      {
        kind: 'category',
        name: 'Time',
        colour: '50',
        contents: [
          { kind: 'block', type: 'sunroot_wait' },
          { kind: 'block', type: 'math_number' },
        ],
      },
      {
        kind: 'category',
        name: 'Math',
        colour: '#26A69A',
        contents: [
          { kind: 'block', type: 'math_number' },
          { kind: 'block', type: 'math_arithmetic' },
          { kind: 'block', type: 'math_single' },
          { kind: 'block', type: 'math_round' },
          { kind: 'block', type: 'math_modulo' },
          { kind: 'block', type: 'math_constrain' },
        ],
      },
      {
        kind: 'category',
        name: 'Text',
        colour: '#EF6C00',
        contents: [
          { kind: 'block', type: 'text' },
          { kind: 'block', type: 'text_join' },
          { kind: 'block', type: 'text_print' },
        ],
      },
      { kind: 'sep' },
      { kind: 'category', name: 'Variables', colour: '#B39DDB', custom: 'VARIABLE' },
      { kind: 'category', name: 'Functions', colour: '#F06292', custom: 'PROCEDURE' },
    ],
  }
}
