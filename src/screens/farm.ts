import { farm, updateFarm, tryTogglePump, daylightFactor, setPumpState } from '../simulation/FarmState'
import { environmentController } from '../simulation/EnvironmentController'
import { aiTutorEngine } from '../simulation/AITutorEngine'
import { assistant, hide as hideAssistant } from '../ai/Assistant'
import { pingAssistant } from '../ai/AssistantDock'
import { hasSeenOnboarding } from '../ui/Onboarding'
import { icon } from '../ui/icons'
import { elapsedFarmHours, formatFarmTime, ratingFor, score, tickScore } from '../simulation/Scoreboard'
import { observeRun } from '../learning/EvidenceCollector'
import { adaptiveObjectives } from '../learning/AdaptiveEngine'
import { graph, partOf } from '../hardware/CircuitGraph'

/** Category of a placed instance, or undefined. */
function partOfCat(instanceId: string): string | undefined {
  return partOf(instanceId)?.category
}
import { enclosurePanelHtml, renderFieldHtml, updateFieldState } from '../ui/FieldRenderer'
import { renderPlantSVG } from '../sprites/plant'
import { getSky, getCelestialPosition } from '../sprites/sky'
import { appState } from '../appState'
import { progress, completeObjective, earnBadge } from '../game/progress'
import { toast, updateRankUi } from '../game/shell'
import { sfx } from '../game/sound'

const PLANT_COUNT = 14
const plantJitter = Array.from({ length: PLANT_COUNT }, (_, i) => Math.sin(i * 12.9898) * 7)
const plantStageCache: number[] = new Array(PLANT_COUNT).fill(-1)

let rafId = 0

export function stopFarmLoop() {
  cancelAnimationFrame(rafId)
}

let briefSeen = false

export function renderFarm(
  root: HTMLElement,
  onEditCode: () => void,
  onWorkshop: () => void,
  onBench: () => void,
) {
  cancelAnimationFrame(rafId)

  root.innerHTML = `
    <div class="screen farm-screen">
      <div class="scene-wrap">
        <section class="farm-scene" id="farmScene">
          <div class="sky-layer" id="skyLayer"></div>
          <div class="stars" id="stars"></div>
          <div class="celestial sun" id="sunEl"><div class="glow"></div></div>
          <div class="celestial moon" id="moonEl"><div class="glow"></div></div>
          <div class="cloud cloud-a"></div>
          <div class="cloud cloud-b"></div>
          <div class="cloud cloud-c"></div>
          <div class="cloud cloud-d"></div>

          <div class="scene-controls">
            <button id="pauseButton" class="scene-button">&#10074;&#10074; PAUSE</button>
            <button id="speedButton" class="scene-button">SPEED 1&times;</button>
            <button id="editCodeButton" class="scene-button">EDIT CODE</button>
          </div>
          <div class="scene-clock" id="sceneClock">DAY 1 &bull; 08:00</div>

          <div class="terrain">
            <div class="hill hill-far"></div>
            <div class="hill hill-near"></div>
          </div>

          <div class="installation" id="installation"></div>

          <div class="crisis-overlay" id="crisisOverlay" hidden>
            <div class="crisis-card" role="dialog" aria-labelledby="crisisTitle">
              <h2 id="crisisTitle">Sunroot Farm — day 1</h2>
              <p>Soil moisture is critically low and crop health is falling. There is no irrigation
                 system here at all, and the farmer cannot watch the field around the clock.</p>
              <p><strong>Your mission:</strong> design an automated irrigation system powered by
                 renewable energy.</p>
              <div class="crisis-actions">
                <button id="crisisInspect" class="ghost-button">Inspect the farm</button>
                <button id="crisisWorkshop" class="primary-button">Enter the workshop</button>
              </div>
            </div>
          </div>

          <div class="pipe-run" id="pipeRun"><div class="pipe-flow" id="pipeFlow"></div></div>
          <div class="pipe-riser" id="pipeRiser"></div>

          <div class="sprinkler" id="sprinkler">
            <div class="sprinkler-head"></div>
            <div class="spray" id="spray"></div>
          </div>

          <div class="soil-bed" id="soilBed">
            <div class="soil-wet-overlay" id="soilWet"></div>
            <div class="crop-rows" id="cropRows"></div>
          </div>
        </section>

        <aside class="telemetry-panel">
          <h2>Live telemetry</h2>
          <div class="metric"><span>Farm time</span><strong id="farmTime">08:00</strong></div>
          <div class="metric"><span>Solar generation</span><strong id="solarWatts">0 W</strong></div>
          <div class="metric"><span>Battery level</span><strong id="batteryPct">0%</strong></div>
          <div class="metric"><span>Water flow</span><strong id="flowState">NONE</strong></div>
          <div class="metric"><span>Soil moisture</span><strong id="moisturePct">0%</strong></div>
          <div class="metric"><span>Crop health</span><strong id="healthPct">0%</strong></div>
          <div class="metric"><span>Rescue clock</span><strong id="rescueClock">—</strong></div>
          <div class="metric"><span>Tank</span><strong id="tankLevel">—</strong></div>
          <div class="metric"><span>Conditions</span><strong id="weatherState">Clear</strong></div>
          <div class="metric"><span>Pump temp</span><strong id="actuatorTemp">28°C</strong></div>
          <div class="metric"><span>Mech. strain</span><strong id="actuatorStrain">0%</strong></div>

          <button id="pumpButton" class="pump-button">TURN PUMP ON</button>
          <p class="hint" id="hintText">Your deployed logic is controlling the pump.</p>
          <div class="objectives-mini" id="objectivesMini"></div>
        </aside>
      </div>
    </div>
  `

  const el = {
    scene: root.querySelector<HTMLElement>('#farmScene')!,
    sky: root.querySelector<HTMLDivElement>('#skyLayer')!,
    stars: root.querySelector<HTMLDivElement>('#stars')!,
    sun: root.querySelector<HTMLDivElement>('#sunEl')!,
    moon: root.querySelector<HTMLDivElement>('#moonEl')!,
    solarFace: root.querySelector<HTMLDivElement>('#solarFace'),
    solarGlint: root.querySelector<HTMLDivElement>('#solarGlint'),
    batteryFill: root.querySelector<HTMLDivElement>('#batteryFill'),
    batteryLed: root.querySelector<HTMLDivElement>('#batteryLed'),
    pumpUnit: root.querySelector<HTMLDivElement>('#pumpUnit'),
    pumpRotor: root.querySelector<HTMLDivElement>('#pumpRotor'),
    pipeFlow: root.querySelector<HTMLDivElement>('#pipeFlow')!,
    pipeRiser: root.querySelector<HTMLDivElement>('#pipeRiser')!,
    spray: root.querySelector<HTMLDivElement>('#spray')!,
    sprinkler: root.querySelector<HTMLDivElement>('#sprinkler')!,
    soilWet: root.querySelector<HTMLDivElement>('#soilWet')!,
    cropRows: root.querySelector<HTMLDivElement>('#cropRows')!,
    clock: root.querySelector('#sceneClock')!,
    farmTime: root.querySelector('#farmTime')!,
    solarWatts: root.querySelector('#solarWatts')!,
    batteryPct: root.querySelector('#batteryPct')!,
    flowState: root.querySelector('#flowState')!,
    moisturePct: root.querySelector('#moisturePct')!,
    healthPct: root.querySelector('#healthPct')!,
    clouds: [...root.querySelectorAll<HTMLElement>('.cloud')],
    rescueClock: root.querySelector('#rescueClock')!,
    tankLevel: root.querySelector('#tankLevel')!,
    weatherState: root.querySelector('#weatherState')!,
    actuatorTemp: root.querySelector('#actuatorTemp')!,
    actuatorStrain: root.querySelector('#actuatorStrain')!,
    hint: root.querySelector<HTMLElement>('#hintText')!,
    objectives: root.querySelector<HTMLDivElement>('#objectivesMini')!,
    pumpButton: root.querySelector<HTMLButtonElement>('#pumpButton')!,
    pauseButton: root.querySelector<HTMLButtonElement>('#pauseButton')!,
    speedButton: root.querySelector<HTMLButtonElement>('#speedButton')!,
  }

  el.stars.innerHTML = Array.from({ length: 42 }, (_, i) => {
    const x = (Math.sin(i * 78.233) * 0.5 + 0.5) * 100
    const y = (Math.sin(i * 12.9898) * 0.5 + 0.5) * 52
    return `<span style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;animation-delay:${((i % 5) * 0.6).toFixed(1)}s"></span>`
  }).join('')

  // Varied angle / delay / speed / distance so the spray reads as real water.
  el.spray.innerHTML = Array.from({ length: 18 }, (_, i) => {
    const angle = -72 + (i / 17) * 144
    const dist = 44 + (i % 4) * 14
    const delay = ((i * 0.085) % 1.25).toFixed(2)
    const dur = (1.0 + (i % 3) * 0.22).toFixed(2)
    return `<span class="drop" style="--angle:${angle.toFixed(0)}deg;--dist:${dist}px;animation-delay:${delay}s;animation-duration:${dur}s"></span>`
  }).join('')

  const plantSlots: HTMLDivElement[] = []
  for (let i = 0; i < PLANT_COUNT; i++) {
    const slot = document.createElement('div')
    slot.className = 'plant-slot'
    el.cropRows.appendChild(slot)
    plantSlots.push(slot)
  }
  plantStageCache.fill(-1)

  let paused = false
  const SPEEDS = [1, 2, 4]
  let speedIndex = 0
  let lastPumpState = farm.pumpOn
  let moistureHeldSeconds = 0

  el.pauseButton.addEventListener('click', () => {
    paused = !paused
    el.pauseButton.innerHTML = paused ? '&#9654; RESUME' : '&#10074;&#10074; PAUSE'
    el.pauseButton.classList.toggle('is-paused', paused)
    el.scene.classList.toggle('sim-paused', paused)
    sfx.click()
  })

  el.speedButton.addEventListener('click', () => {
    speedIndex = (speedIndex + 1) % SPEEDS.length
    el.speedButton.innerHTML = `SPEED ${SPEEDS[speedIndex]}&times;`
    sfx.click()
  })

  root.querySelector<HTMLButtonElement>('#editCodeButton')!.addEventListener('click', () => {
    cancelAnimationFrame(rafId)
    sfx.click()
    onEditCode()
  })

  el.pumpButton.addEventListener('click', () => {
    const res = tryTogglePump()
    if (!res.ok) {
      sfx.error()
      el.hint.textContent = res.reason!
      el.hint.classList.add('warn')
      setTimeout(() => el.hint.classList.remove('warn'), 2200)
      return
    }
    sfx.click()
  })

  // ---------- render functions ----------

  function renderSky() {
    // §6: clouds are not decoration. Their density mirrors the irradiance loss
    // the environment controller is applying to generation this very tick.
    const cover = 1 - farm.environment.irradianceFactor
    for (const cloud of el.clouds) {
      cloud.style.opacity = String(0.35 + cover * 0.65)
      cloud.style.transform = `scale(${1 + cover * 0.55})`
    }

    const sky = getSky(farm.hour)
    el.sky.style.setProperty('--sky-top', sky.top)
    el.sky.style.setProperty('--sky-bottom', sky.bottom)

    const light = daylightFactor(farm.hour)
    el.stars.style.opacity = String(Math.max(0, 1 - light * 3.2))

    const { sun, moon } = getCelestialPosition(farm.hour)
    el.sun.style.opacity = sun.visible ? '1' : '0'
    el.sun.style.left = `${sun.x}%`
    el.sun.style.top = `${sun.y}%`
    el.moon.style.opacity = moon.visible ? '1' : '0'
    el.moon.style.left = `${moon.x}%`
    el.moon.style.top = `${moon.y}%`
  }

  // Solar, battery and pump visuals now live with the field units themselves,
  // which is the only way the field can show what was actually installed. What
  // remains here is the bookkeeping those renderers also happened to do.
  function renderPump() {
    const running = farm.pumpOn && farm.waterFlow > 0
    void running

    if (farm.pumpOn !== lastPumpState) {
      lastPumpState = farm.pumpOn
      if (farm.pumpOn) {
        progress.stats.pumpCycles++
        sfx.pump()
      }
    }
    el.pumpButton.textContent = farm.pumpOn ? 'TURN PUMP OFF' : 'TURN PUMP ON'
    el.pumpButton.classList.toggle('active', farm.pumpOn)
  }

  function renderWater() {
    const flowing = farm.waterFlow > 0
    el.pipeFlow.classList.toggle('flowing', flowing)
    el.pipeRiser.classList.toggle('flowing', flowing)
    el.sprinkler.classList.toggle('spraying', flowing)
    el.flowState.textContent = flowing ? 'ACTIVE' : 'NONE'
  }

  function renderSoil() {
    el.soilWet.style.opacity = String(Math.min(0.82, farm.soilMoisture / 105))
  }

  function renderPlants() {
    for (let i = 0; i < PLANT_COUNT; i++) {
      const h = Math.max(0, Math.min(100, farm.cropHealth + plantJitter[i]))
      const stage = h < 20 ? 0 : h < 45 ? 1 : h < 75 ? 2 : 3

      if (plantStageCache[i] !== stage) {
        plantSlots[i].innerHTML = renderPlantSVG(h)
        plantStageCache[i] = stage
      }

      // Continuous droop/scale so wilting and recovery are gradual, not stepped.
      plantSlots[i].style.setProperty('--droop', `${((1 - h / 100) * 15).toFixed(1)}deg`)
      plantSlots[i].style.setProperty('--pscale', (0.64 + (h / 100) * 0.36).toFixed(3))
    }
  }

  function renderTelemetry() {
    const hh = Math.floor(farm.hour)
    const mm = Math.floor((farm.hour % 1) * 60)
    const time = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`

    el.clock.textContent = `DAY ${farm.day} • ${time}`
    el.farmTime.textContent = time
    el.solarWatts.textContent = `${Math.round(farm.solarGeneration)} W`
    el.batteryPct.textContent = `${Math.round(farm.battery)}%`
    el.moisturePct.textContent = `${Math.round(farm.soilMoisture)}%`
    el.healthPct.textContent = `${Math.round(farm.cropHealth)}%`

    if (score.running) {
      el.rescueClock.textContent = formatFarmTime(elapsedFarmHours())
    } else if (score.rescued) {
      el.rescueClock.textContent = 'saved'
      ;(el.rescueClock as HTMLElement).classList.add('good')
    } else {
      el.rescueClock.textContent = 'not deployed'
    }

    if (farm.tankCapacityLitres > 0) {
      const pct = (farm.tankLitres / farm.tankCapacityLitres) * 100
      el.tankLevel.textContent = `${Math.round(farm.tankLitres)} L`
      ;(el.tankLevel as HTMLElement).classList.toggle('warn', pct < 15)
    } else {
      el.tankLevel.textContent = 'none installed'
    }

    // Weather and wear are owned by EnvironmentController; this only reports.
    const events = farm.environment.activeEvents
    el.weatherState.textContent = events.length
      ? [...new Set(events)].join(' + ')
      : `Clear · ${Math.round(farm.environment.ambientTempC)}°C`
    ;(el.weatherState as HTMLElement).classList.toggle('warn', events.length > 0)

    el.actuatorTemp.textContent = `${Math.round(farm.actuator.temperatureC)}°C`
    ;(el.actuatorTemp as HTMLElement).classList.toggle('warn', farm.actuator.thermalWarning)
    el.actuatorStrain.textContent = `${Math.round(farm.actuator.strain)}%`
    ;(el.actuatorStrain as HTMLElement).classList.toggle('warn', farm.actuator.strain > 60)
  }

  function renderMission() {
    // Generated from this student's mastery estimates, so the list is about
    // what they cannot yet do rather than a fixed checklist for everyone.
    el.objectives.innerHTML = adaptiveObjectives()
      .map((o) => `<div class="mini-obj ${o.done ? 'done' : ''}" title="${o.reason}"><span>${o.done ? icon('check', 13) : icon('dotOutline', 13)}</span>${o.label}</div>`)
      .join('')
  }

  function renderHint() {
    if (el.hint.classList.contains('warn')) return
    if (farm.battery <= 0) {
      el.hint.textContent = 'Battery empty — the pump cannot run until solar recharges it.'
    } else if (farm.soilMoisture < 20) {
      el.hint.textContent = 'Soil is critically dry. Crop health is falling.'
    } else if (farm.soilMoisture > 85) {
      el.hint.textContent = 'Soil is saturated — overwatering is stressing the crop.'
    } else if (farm.waterFlow > 0) {
      el.hint.textContent = 'Irrigating — moisture rising, battery draining.'
    } else if (farm.cropHealth > 70) {
      el.hint.textContent = 'Crop is healthy. Moisture is in the ideal band.'
    } else {
      el.hint.textContent = 'Your deployed logic is controlling the pump.'
    }
  }

  function updateObjectives(dt: number) {
    // Sustained condition, not an instant tick-off.
    if (farm.soilMoisture > 30) moistureHeldSeconds += dt
    else moistureHeldSeconds = 0

    if (moistureHeldSeconds > 5 && completeObjective('moisture')) {
      toast('Objective complete: moisture held above 30%', 'success')
      updateRankUi()
      renderMission()
    }
    if (farm.cropHealth > 80) {
      if (completeObjective('health')) {
        toast('Objective complete: crop health restored', 'success')
        updateRankUi()
        renderMission()
      }
      const b = earnBadge('guardian')
      if (b) { toast(`Badge earned: <strong>${b.name}</strong>`, 'badge'); updateRankUi() }
    }
    if (farm.battery > 40 && farm.hour > 18) {
      const b = earnBadge('energy')
      if (b) { toast(`Badge earned: <strong>${b.name}</strong>`, 'badge'); updateRankUi() }
    }
  }

  // ---------- loop ----------

  let lastTime = performance.now()
  let programFault = ''
  let peakMoisture = 0

  function loop(now: number) {
    const rawDelta = Math.min((now - lastTime) / 1000, 0.1)
    lastTime = now

    if (!paused) {
      const dt = rawDelta * SPEEDS[speedIndex]

      if (appState.runProgram) {
        try {
          appState.runProgram(farm.soilMoisture, (on) => {
            if (on && farm.battery <= 0) return // energy constraint always wins
            setPumpState(on) // single choke point, so relay cycles are counted
          })
        } catch (err) {
          // A program that throws is disconnected rather than retried, so one
          // bad tick cannot burn the frame budget on every subsequent tick.
          appState.runProgram = null
          programFault = (err as Error).message === 'LOOP_GUARD'
            ? 'Program stopped: a loop in it never ends.'
            : `Program stopped: ${(err as Error).message}`
        }
      }

      // Weather is applied before the physics reads it, so irradiance and
      // evaporation for this tick are already current.
      environmentController.update(dt)
      updateFarm(dt)
      updateObjectives(dt)

      // The tutor observes the result of the tick it did not influence.
      peakMoisture = Math.max(peakMoisture, farm.soilMoisture)
      const finished = tickScore()
      if (finished) {
        observeRun({
          rescued: true,
          lowestBattery: finished.lowestBattery,
          relayCycles: finished.relayCycles,
          farmHours: finished.farmHours,
          peakMoisture: peakMoisture,
          dryRunStrain: farm.actuator.strain,
        })
        showScoreboard(finished.farmHours)
        assistant.show(
          `The farm is out of danger — crop health back above 75% in ` +
            `${formatFarmTime(finished.farmHours)}. That is your design working.`,
          'impressed',
        )
      }

      // Advice about sensor pins is meaningless on an empty farm. The tutor
      // only speaks once there is a deployed system for it to comment on.
      const hasSystem = graph.placed.length > 0 && appState.codeReady
      const intervention = hasSystem ? aiTutorEngine.evaluate(dt) : null
      if (intervention && root.querySelector('#crisisOverlay')?.hasAttribute('hidden')) {
        pingAssistant(intervention.severity === 'critical' ? 'alarmed' : 'concerned')
        assistant.onFarmEvent(
          `${intervention.observation} ${intervention.question}`,
          intervention.severity === 'critical' ? 'alarmed' : 'concerned',
        )
      }

      progress.stats.peakHealth = Math.max(progress.stats.peakHealth, farm.cropHealth)
      progress.stats.lowestBattery = Math.min(progress.stats.lowestBattery, farm.battery)
    }

    renderSky()
    renderPump()
    renderWater()
    renderSoil()
    renderPlants()
    renderTelemetry()
    renderHint()
    renderInstallation()
    if (openController && document.getElementById('controllerPanel')) {
      const fresh = enclosurePanelHtml()
      const body = document.querySelector('#controllerPanel .io-table tbody')
      const parsed = new DOMParser().parseFromString(fresh, 'text/html')
      const newBody = parsed.querySelector('.io-table tbody')
      if (body && newBody) body.innerHTML = newBody.innerHTML
    }
    if (programFault) {
      el.hint.textContent = programFault
      el.hint.classList.add("warn")
    }

    rafId = requestAnimationFrame(loop)
  }

  // ---------- §38 first-time crisis brief ----------

  const overlay = root.querySelector<HTMLElement>('#crisisOverlay')!
  // The walkthrough covers this ground for a first-time visitor, so the older
  // crisis card is only shown to someone who has already been through it.
  if (!graph.placed.length && !briefSeen && hasSeenOnboarding()) {
    overlay.hidden = false
    briefSeen = true
    // The card already carries the briefing text. A second voice on top of it
    // is noise, and on a phone the bubble physically covers the buttons.
    hideAssistant()
  }
  root.querySelector<HTMLButtonElement>('#crisisInspect')!.addEventListener('click', () => {
    overlay.hidden = true
    assistant.show(
      'Look at the field. The soil is pale and cracked and nothing here moves water. ' +
        'Where would you begin?',
      'concerned',
    )
  })
  root.querySelector<HTMLButtonElement>('#crisisWorkshop')!.addEventListener('click', () => {
    overlay.hidden = true
    onWorkshop()
  })

  // Equipment that has not been installed must not appear on the farm — an
  // un-built system has to look un-built, or the opening screen lies.
  // The field is regenerated whenever the bench changes, so it contains
  // exactly the components that exist and nothing that does not.
  let fieldStamp = ''
  const installation = root.querySelector<HTMLElement>('#installation')!

  function renderInstallation() {
    // Plumbing and pump controls are part of the twin, so they exist only when
    // the student has actually installed something that moves water.
    const hasActuator = graph.placed.some((p) => partOfCat(p.instanceId) === 'actuators')
    root.querySelectorAll<HTMLElement>('#pipeRun, #pipeRiser, .sprinkler, .spray')
      .forEach((n) => { n.style.display = hasActuator ? '' : 'none' })
    const pumpBtn = root.querySelector<HTMLElement>('#pumpButton')
    if (pumpBtn) pumpBtn.style.display = hasActuator ? '' : 'none'
    for (const id of ['#flowState', '#actuatorTemp', '#actuatorStrain', '#tankLevel']) {
      const row = root.querySelector(id)?.closest('.metric') as HTMLElement | null
      if (row) row.style.display = hasActuator ? '' : 'none'
    }

    const stamp = graph.placed.map((p) => p.instanceId + p.partId).join('|')
    if (stamp !== fieldStamp) {
      fieldStamp = stamp
      installation.innerHTML = renderFieldHtml()
      wireFieldClicks()
    }
    updateFieldState(installation)
  }

  // Clicking a controller opens its live I/O table.
  function wireFieldClicks() {
    installation.querySelectorAll<HTMLElement>('[data-field]').forEach((u) => {
      const open = () => {
        // Tapping the shed walks you into the workbench, which is where the
        // electronics inside it were built.
        if (u.dataset.category === 'shed') { onBench(); return }
        if (u.dataset.category !== 'enclosure') return
        showControllerPanel(u.dataset.field!)
      }
      u.addEventListener('click', open)
      u.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() }
      })
    })
  }

  /** Result card shown once the farm is rescued. */
  function showScoreboard(_hours: number) {
    document.getElementById('scorePanel')?.remove()
    const rows = score.runs
      .slice(0, 5)
      .map(
        (r, i) => `
        <tr class="${i === 0 ? 'best' : ''}">
          <td>${i + 1}</td>
          <td>${formatFarmTime(r.farmHours)}</td>
          <td>${Math.round(r.litresUsed)} L</td>
          <td>${r.relayCycles}</td>
          <td>${r.parts} / ${r.cost}c</td>
          <td class="score-rating">${ratingFor(r)}</td>
        </tr>`,
      )
      .join('')

    el.scene.insertAdjacentHTML(
      'beforeend',
      `<div class="score-panel" id="scorePanel">
         <div class="cp-head">
           <div>
             <div class="cp-title">Farm saved</div>
             <div class="cp-sub">Best runs this session</div>
           </div>
           <button class="cp-close" id="scoreClose" aria-label="Close">&times;</button>
         </div>
         <table class="score-table">
           <thead><tr><th>#</th><th>Time</th><th>Water</th><th>Cycles</th><th>Build</th><th>Score</th></tr></thead>
           <tbody>${rows}</tbody>
         </table>
         <p class="cp-note">Score weighs speed most, then water used, control stability and battery reserve.</p>
       </div>`,
    )
    document.getElementById('scoreClose')?.addEventListener('click', () =>
      document.getElementById('scorePanel')?.remove(),
    )
  }

  let openController: string | null = null
  function showControllerPanel(instanceId: string) {
    document.getElementById('controllerPanel')?.remove()
    openController = instanceId
    void instanceId
    el.scene.insertAdjacentHTML('beforeend', enclosurePanelHtml())
    document.getElementById('cpClose')?.addEventListener('click', () => {
      document.getElementById('controllerPanel')?.remove()
      openController = null
    })
  }

  renderInstallation()

  renderMission()
  rafId = requestAnimationFrame(loop)
}
