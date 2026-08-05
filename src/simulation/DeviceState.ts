// ---------------------------------------------------------------------------
// DeviceState
//
// Live state of every individual component the student placed, keyed by the
// instance id from the circuit graph. This is what lets the farm stop being
// scenery: an LED appears in the field only because one was placed, and it
// blinks only because the running program drove its pin high.
//
// The simulation writes here; the farm reads. Nothing in the field is drawn
// from anything else.
// ---------------------------------------------------------------------------

export interface DeviceRuntime {
  /** Digital output state, for anything the program switches. */
  on: boolean
  /** Last value a sensor reported, or the duty of an output. */
  value: number
  /** Real-time timestamp of the last change, used for blink and pulse art. */
  lastChanged: number
  /** How many times this device has been switched. */
  transitions: number
}

export interface DeviceStateMap {
  outputs: Record<string, DeviceRuntime>
  readings: Record<string, DeviceRuntime>
}

export const devices: DeviceStateMap = {
  outputs: {},
  readings: {},
}

function slot(map: Record<string, DeviceRuntime>, id: string): DeviceRuntime {
  if (!map[id]) map[id] = { on: false, value: 0, lastChanged: 0, transitions: 0 }
  return map[id]
}

export function setOutput(instanceId: string, on: boolean) {
  const d = slot(devices.outputs, instanceId)
  if (d.on !== on) {
    d.on = on
    d.lastChanged = performance.now()
    d.transitions++
  }
}

export function recordReading(instanceId: string, value: number) {
  const d = slot(devices.readings, instanceId)
  d.value = value
  d.lastChanged = performance.now()
}

export function outputOf(instanceId: string): DeviceRuntime {
  return devices.outputs[instanceId] ?? { on: false, value: 0, lastChanged: 0, transitions: 0 }
}

export function readingOf(instanceId: string): DeviceRuntime {
  return devices.readings[instanceId] ?? { on: false, value: 0, lastChanged: 0, transitions: 0 }
}

/** Cleared when a new circuit is deployed, so stale devices do not linger. */
export function resetDevices() {
  devices.outputs = {}
  devices.readings = {}
}
