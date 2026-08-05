import * as Blockly from 'blockly'
import { javascriptGenerator } from 'blockly/javascript'
import { appState } from '../appState'
import { buildIo, buildToolbox, defineCoreBlocks } from '../coding/DynamicBlockFactory'
import { partOf, wiredOutputs } from '../hardware/CircuitGraph'
import { farm, primeBattery } from '../simulation/FarmState'
import { beginRun } from '../simulation/Scoreboard'
import { noteAction } from '../learning/ContextBuilder'
import { learner } from '../learning/LearnerModel'
import { recordReading, resetDevices, setOutput } from '../simulation/DeviceState'
import { assistant } from '../ai/Assistant'
import { sfx } from '../game/sound'
import { completeObjective } from '../game/progress'
import { toast, updateRankUi } from '../game/shell'

/** Survives navigation. Never seeded — the workspace starts genuinely empty. */
let savedWorkspace: object | null = null

/**
 * Every loop body gets a guard injected. A student writing `while true` with no
 * exit is not making an exotic mistake — it is the single most common one in
 * block programming — and without this the generated JavaScript blocks the main
 * thread and the entire tab has to be killed. The guard turns a hung browser
 * into an error message they can act on.
 */
javascriptGenerator.INFINITE_LOOP_TRAP =
  'if (--__guard < 0) { throw new Error("LOOP_GUARD"); }\n'

/** Iterations one tick of the program may execute before it is stopped. */
const LOOP_BUDGET = 20000

export function renderCodingLab(root: HTMLElement, onDeploy: () => void, onBack: () => void) {
  defineCoreBlocks()
  const io = buildIo()

  const inventory = io.blockTypes.length
    ? `${io.sensors.length} input${io.sensors.length === 1 ? '' : 's'} and ` +
      `${io.outputs.length} output${io.outputs.length === 1 ? '' : 's'} came from your wiring.`
    : 'Nothing on your bench reaches a controller, so the Hardware category is empty. ' +
      'You can still write logic, it just has nothing to read or switch.'

  root.innerHTML = `
    <div class="screen coding-screen">
      <div class="coding-header">
        <div>
          <h1>Coding lab</h1>
          <p>Empty workspace. Build whatever control logic you think your hardware needs.</p>
        </div>
        <div class="coding-actions">
          <button id="backButton" class="ghost-button">Circuit lab</button>
          <button id="runButton" class="ghost-button">Run check</button>
          <button id="deployButton" class="primary-button">Deploy to farm</button>
        </div>
      </div>
      <p class="wiring-note ${io.blockTypes.length ? '' : 'unverified'}">${inventory}</p>
      <div id="blocklyDiv" class="blockly-host"></div>
      <p class="coding-status" id="codingStatus">
        You can deploy at any time, working or not. Watching it fail is a legitimate way to find out why.
      </p>
    </div>
  `

  const status = root.querySelector<HTMLParagraphElement>('#codingStatus')!

  const workspace = Blockly.inject(root.querySelector<HTMLDivElement>('#blocklyDiv')!, {
    toolbox: buildToolbox(io),
    media: `${import.meta.env.BASE_URL}blockly-media/`,
    sounds: false,
    trashcan: true,
    zoom: { controls: true, wheel: true, startScale: 0.95, minScale: 0.5, maxScale: 1.8 },
    theme: Blockly.Theme.defineTheme('sunrootDark', {
      name: 'sunrootDark',
      base: Blockly.Themes.Classic,
      componentStyles: {
        workspaceBackgroundColour: '#151d18',
        toolboxBackgroundColour: '#101713',
        toolboxForegroundColour: '#dcebe0',
        flyoutBackgroundColour: '#1b2a20',
        flyoutForegroundColour: '#dcebe0',
        scrollbarColour: '#3a4a3f',
      },
    }),
  })

  // Restore prior work, but never seed an example. A blank canvas is the point.
  if (savedWorkspace) {
    try {
      Blockly.serialization.workspaces.load(savedWorkspace, workspace)
    } catch {
      /* blocks from a since-rewired bench may no longer exist */
    }
  }

  ;(window as unknown as Record<string, unknown>).sunrootWorkspace = workspace

  workspace.addChangeListener((e: Blockly.Events.Abstract) => {
    if (e.isUiEvent) return
    savedWorkspace = Blockly.serialization.workspaces.save(workspace)
  })

  requestAnimationFrame(() => Blockly.svgResize(workspace))
  window.addEventListener('resize', () => Blockly.svgResize(workspace))

  function compile(): boolean {
    const code = javascriptGenerator.workspaceToCode(workspace)
    if (!code.trim()) {
      appState.runProgram = null
      appState.codeReady = false
      status.className = 'coding-status warn'
      status.textContent =
        'The workspace is empty. You can still deploy — the farm will simply do nothing.'
      return false
    }

    try {
      // __guard is consumed by the trap injected into every loop above.
      const fn = new Function(
        '__guard',
        'readPin',
        'writePin',
        'hourOfDay',
        'waitFor',
        code,
      ) as (
        guard: number,
        readPin: (id: string) => number,
        writePin: (id: string, on: boolean) => void,
        hourOfDay: number,
        waitFor: (s: number) => boolean,
      ) => void

      fn(LOOP_BUDGET, () => 50, () => {}, 12, () => false)

      appState.runProgram = (moisture, setPump) => {
        fn(
          LOOP_BUDGET,
          (instanceId) => {
            const v = readValueFor(instanceId, moisture)
            recordReading(instanceId, v)
            return v
          },
          (instanceId, on) => {
            // Every driven pin is recorded, so an LED or buzzer shows up in the
            // field even though it moves no water. Only a stage that actually
            // switches an actuator affects irrigation.
            setOutput(instanceId, on)
            const out = wiredOutputs().find((o) => o.instanceId === instanceId)
            const load = out?.loadInstance ? partOf(out.loadInstance) : undefined
            if (load?.category === 'actuators') setPump(on)
          },
          farm.hour,
          (seconds) => waitGate(seconds),
        )
      }
      appState.codeReady = true

      status.className = 'coding-status good'
      status.textContent = 'Program compiles. Deploy it and watch what it actually does.'
      if (completeObjective('code', 60)) {
        toast('Objective complete: control logic written', 'success')
        updateRankUi()
      }
      return true
    } catch (err) {
      appState.runProgram = null
      status.className = 'coding-status bad'
      status.textContent =
        (err as Error).message === 'LOOP_GUARD'
          ? 'Your program never finishes. A loop with no way out runs forever, so the controller ' +
            'never gets to the next instruction. What would let it leave the loop?'
          : `Your program has an error: ${(err as Error).message}`
      sfx.error()
      return false
    }
  }

  /** Maps a sensor instance to whatever the simulation can tell it. */
  function readValueFor(instanceId: string, moisture: number): number {
    const part = partOf(instanceId)
    if (!part) return 0
    const id = part.id
    if (id.startsWith('soil')) return moisture
    if (id === 'ldr') return Math.max(0, Math.sin(((farm.hour - 6) / 12) * Math.PI)) * 100
    if (id.startsWith('dht') || id === 'ds18b20') return farm.environment.ambientTempC
    if (id === 'rainSensor') return farm.environment.activeEvents.length ? 40 : 0
    if (id === 'waterLevel' || id === 'ultrasonic') return 80
    return 0
  }

  // Simulation-time delay. Returns true while the wait is still running, which
  // makes the generated `return` abort the rest of this tick's program.
  let waitUntil = 0
  function waitGate(seconds: number): boolean {
    const now = farm.day * 24 + farm.hour
    if (waitUntil === 0) {
      waitUntil = now + seconds / 3600
      return true
    }
    if (now < waitUntil) return true
    waitUntil = 0
    return false
  }

  root.querySelector<HTMLButtonElement>('#runButton')!.addEventListener('click', () => {
    if (compile()) sfx.success()
  })

  root.querySelector<HTMLButtonElement>('#backButton')!.addEventListener('click', onBack)

  // Deploy is never blocked. Trial and error is the mechanic.
  root.querySelector<HTMLButtonElement>('#deployButton')!.addEventListener('click', () => {
    compile()
    resetDevices()
    primeBattery()
    beginRun()
    learner.attempts++
    noteAction('deployed the system to the farm')
    sfx.deploy()
    if (completeObjective('deploy', 70)) {
      toast('Objective complete: system deployed', 'success')
      updateRankUi()
    }
    assistant.onDeploy()
    onDeploy()
  })
}
