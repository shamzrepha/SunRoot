import './style.css'
import { farm, updateFarm } from './simulation/FarmState'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <!-- ========================================= -->
  <!-- LOADING SCREEN                            -->
  <!-- ========================================= -->

  <section id="loadingScreen" class="screen loading-screen">
    <div class="loading-logo">
      <div class="logo-leaf">🌱</div>
      <div class="loading-title">SUNROOT</div>
      <div class="loading-subtitle">LEARN IT. BUILD IT. WATCH IT GROW.</div>
    </div>

    <div class="loading-progress">
      <div id="loadingBar"></div>
    </div>

    <div id="loadingText" class="loading-text">
      INITIALIZING FARM SYSTEM...
    </div>
  </section>


  <!-- ========================================= -->
  <!-- GAME STARTUP                              -->
  <!-- ========================================= -->

  <section id="startupScreen" class="screen startup-screen hidden">

    <div class="startup-card">

      <div class="mission-number">MISSION 01</div>

      <h1>SAVE THE FARM</h1>

      <p class="startup-description">
        The crops are drying out.
        Your mission is to design a solar-powered
        irrigation system that keeps the farm alive.
      </p>

      <div class="mission-objectives">

        <div class="objective">
          <span>01</span>
          <div>
            <strong>BUILD</strong>
            <small>Connect the farm hardware.</small>
          </div>
        </div>

        <div class="objective">
          <span>02</span>
          <div>
            <strong>PROGRAM</strong>
            <small>Create the irrigation logic.</small>
          </div>
        </div>

        <div class="objective">
          <span>03</span>
          <div>
            <strong>TEST</strong>
            <small>Keep the crops healthy.</small>
          </div>
        </div>

      </div>

      <button id="startMission" class="primary-button">
        START MISSION →
      </button>

      <div class="startup-footer">
        SYSTEMS ENGINEERING SIMULATION
      </div>

    </div>

  </section>


  <!-- ========================================= -->
  <!-- MAIN GAME                                 -->
  <!-- ========================================= -->

  <section id="gameScreen" class="game-screen hidden">

    <!-- LEFT NAVIGATION -->

    <aside class="sidebar">

      <div class="brand">
        <div class="brand-icon">🌱</div>

        <div>
          <strong>SUNROOT</strong>
          <small>Learn. Build. Watch it grow.</small>
        </div>
      </div>

      <nav>

        <button class="nav-item active" data-panel="dashboard">
          <span>⌂</span>
          DASHBOARD
        </button>

        <button class="nav-item" data-panel="mission">
          <span>◆</span>
          MISSION
        </button>

        <button class="nav-item" data-panel="circuit">
          <span>⚡</span>
          CIRCUIT LAB
        </button>

        <button class="nav-item" data-panel="coding">
          <span>▣</span>
          CODING LAB
        </button>

        <button class="nav-item" data-panel="farm">
          <span>♧</span>
          FARM
        </button>

        <button class="nav-item" data-panel="report">
          <span>▤</span>
          REPORT
        </button>

        <button class="nav-item" data-panel="tutor">
          <span>●</span>
          TUTOR
        </button>

      </nav>

      <div class="engineer-card">

        <div class="robot">🤖</div>

        <div class="engineer-info">
          <strong>Engineer</strong>
          <span>Novice</span>

          <div class="xp-bar">
            <div></div>
          </div>

          <small>650 / 1200 XP</small>
        </div>

      </div>

      <div class="settings">
        ⚙ SETTINGS
      </div>

    </aside>


    <!-- MAIN CONTENT -->

    <main class="main-content">

      <!-- TOP BAR -->

      <header class="game-header">

        <div>
          <strong>MISSION 01 — SAVE THE FARM</strong>
          <small>Solar-powered smart irrigation</small>
        </div>

        <div class="header-actions">
          <span id="gameTime">DAY 1 • 08:00</span>
          <span class="online-dot">● ONLINE</span>
        </div>

      </header>


      <!-- TELEMETRY -->

      <section class="stat-strip">

        <div class="chip">
          <span class="chip-label">☀ SOLAR</span>
          <strong id="solar">0 W</strong>
        </div>

        <div class="chip">
          <span class="chip-label">🔋 BATTERY</span>
          <strong id="battery">0%</strong>
        </div>

        <div class="chip">
          <span class="chip-label">💧 SOIL MOISTURE</span>
          <strong id="moisture">0%</strong>
        </div>

        <div class="chip">
          <span class="chip-label">⚙ PUMP</span>
          <strong id="pump">OFF</strong>
        </div>

        <div class="chip">
          <span class="chip-label">🌱 CROP HEALTH</span>
          <strong id="health">0%</strong>
        </div>

      </section>


      <!-- WORKSPACE -->

      <section class="workspace">

        <!-- FARM -->

        <section class="farm-card">

          <div class="section-header">

            <div>
              <strong>FARM DIGITAL TWIN</strong>
              <small>Live simulation environment</small>
            </div>

            <div class="farm-controls">
              <button id="pauseButton">Ⅱ</button>
              <button id="speedButton">SPEED 1×</button>
            </div>

          </div>


          <div class="farm-world">

           <div class="sky">
  <div class="cloud cloud-1"></div>
  <div class="cloud cloud-2"></div>
  <div class="cloud cloud-3"></div>

  <div class="sun-object" id="sunObject">
    ☀
  </div>

  <div class="moon-object" id="moonObject">
    ☾
  </div>
</div>

            <!-- FARMLAND -->

            <div class="farm-ground">

              <div class="farm-house">
                <div class="house-roof"></div>
                <div class="house-body">
                  <div class="window"></div>
                  <div class="door"></div>
                </div>
              </div>


              <!-- SOLAR INSTALLATION -->

              <div class="solar-installation">

                <div class="solar-panel-ground">

                  <div class="solar-grid"></div>

                </div>

                <div class="panel-support"></div>

                <span>SOLAR ARRAY</span>

              </div>


              <!-- BATTERY -->

              <div class="battery-station">

                <div class="battery-box">

                  <div class="battery-fill" id="batteryVisual"></div>

                  <span>🔋</span>

                </div>

                <span>BATTERY</span>

              </div>


              <!-- WATER SYSTEM -->

              <div class="water-system">

                <div class="water-tank">

                  <div class="tank-top"></div>

                  <div class="tank-body">
                    💧
                  </div>

                </div>

                <div class="pump-station">

                  <div
                    id="pumpVisual"
                    class="farm-pump"
                  >
                    ⚙
                  </div>

                  <span>PUMP</span>

                </div>

<div id="pipe" class="irrigation-pipe"></div>

<div id="sprinkler" class="sprinkler">
  <div class="sprinkler-head">💦</div>

  <div class="water-drop drop-1"></div>
  <div class="water-drop drop-2"></div>
  <div class="water-drop drop-3"></div>
  <div class="water-drop drop-4"></div>
  <div class="water-drop drop-5"></div>
  <div class="water-drop drop-6"></div>
</div>
              </div>


              <!-- CROP FIELD -->

              <div class="crop-field">

                <div class="crop-row">
                  🌱 🌱 🌱 🌱 🌱 🌱
                </div>

                <div class="crop-row">
                  🌱 🌱 🌱 🌱 🌱 🌱
                </div>

                <div class="crop-row">
                  🌱 🌱 🌱 🌱 🌱 🌱
                </div>

              </div>

            </div>

            <div class="farm-label">
              DIGITAL TWIN • FARM 01
            </div>

          </div>

        </section>


        <!-- RIGHT SIDE -->

        <aside class="right-workspace">

          <!-- MISSION -->

          <section class="mission-card">

            <div class="card-title">
              MISSION OBJECTIVES
            </div>

            <div class="mission-description">
              Keep soil moisture above 30%
              while conserving solar energy.
            </div>

            <label>
              <input type="checkbox" checked>
              Build solar power system
            </label>

            <label>
              <input type="checkbox">
              Program irrigation
            </label>

            <label>
              <input type="checkbox">
              Maintain moisture above 30%
            </label>

            <label>
              <input type="checkbox">
              Complete farm test
            </label>

          </section>


          <!-- CODING PREVIEW -->

          <section class="coding-card">

            <div class="card-title">
              <span>CODING LAB</span>
              <button id="openCoding">
                OPEN →
              </button>
            </div>

            <div class="blocks-preview">

              <div class="block event-block">
                WHEN STARTED
              </div>

              <div class="block sensor-block">
                READ SOIL MOISTURE
              </div>

              <div class="block logic-block">
                IF MOISTURE &lt; 30
              </div>

              <div class="block action-block">
                TURN PUMP ON
              </div>

            </div>

          </section>


          <!-- PUMP CONTROL -->

          <section class="control-card">

            <div class="card-title">
              MANUAL TEST
            </div>

            <button
              id="pumpButton"
              class="pump-button"
            >
              TURN PUMP ON
            </button>

            <p>
              Manual control is for testing only.
              Your final solution should be automated.
            </p>

          </section>

        </aside>

      </section>


      <!-- BOTTOM WORKSHOP -->

      <section class="bottom-workshop">

        <div class="workshop-panel">

          <div class="workshop-header">

            <div>
              <strong>CIRCUIT WORKSHOP</strong>
              <small>Build the physical system</small>
            </div>

            <button id="checkCircuit">
              CHECK CIRCUIT
            </button>

          </div>

          <div class="circuit-board">

            <div class="component esp">
              ESP32
            </div>

            <div class="wire wire-a"></div>

            <div class="component sensor">
              SOIL<br>SENSOR
            </div>

            <div class="wire wire-b"></div>

            <div class="component relay">
              RELAY
            </div>

            <div class="wire wire-c"></div>

            <div class="component pump">
              PUMP
            </div>

            <div class="component solar">
              ☀ SOLAR
            </div>

            <div class="component battery">
              🔋 BATTERY
            </div>

          </div>

        </div>


        <div class="workshop-panel coding-workshop">

          <div class="workshop-header">

            <div>
              <strong>BLOCK PROGRAM</strong>
              <small>Tell the farm what to do</small>
            </div>

            <button id="runCode">
              ▶ RUN
            </button>

          </div>

          <div class="block-editor">

            <div class="block event-block">
              WHEN 🌱 START
            </div>

            <div class="block control-block">
              FOREVER
            </div>

            <div class="block sensor-block">
              READ SOIL MOISTURE
            </div>

            <div class="block logic-block">
              IF MOISTURE &lt; 30%
            </div>

            <div class="block action-block">
              TURN PUMP ON
            </div>

            <div class="block logic-block">
              ELSE
            </div>

            <div class="block action-block">
              TURN PUMP OFF
            </div>

          </div>

        </div>

      </section>


      <!-- REPORT -->

      <section class="report-strip">

        <div>
          <span>ENGINEER SCORE</span>
          <strong id="score">72%</strong>
        </div>

        <div>
          <span>ENERGY EFFICIENCY</span>
          <strong id="efficiency">—</strong>
        </div>

        <div>
          <span>TROUBLESHOOTING</span>
          <strong>95%</strong>
        </div>

        <div>
          <span>MISSION</span>
          <strong>IN PROGRESS</strong>
        </div>

      </section>

    </main>

  </section>
`

/* =========================================
   LOADING
========================================= */

const loadingScreen =
  document.querySelector('#loadingScreen')!

const startupScreen =
  document.querySelector('#startupScreen')!

const gameScreen =
  document.querySelector('#gameScreen')!

const loadingBar =
  document.querySelector<HTMLDivElement>('#loadingBar')!

const loadingText =
  document.querySelector('#loadingText')!

let progress = 0

const loadingTimer = setInterval(() => {

  progress += 4

  loadingBar.style.width = `${progress}%`

  if (progress < 30) {
    loadingText.textContent = 'INITIALIZING FARM SYSTEM...'
  } else if (progress < 60) {
    loadingText.textContent = 'LOADING DIGITAL TWIN...'
  } else if (progress < 85) {
    loadingText.textContent = 'CALIBRATING SOLAR NETWORK...'
  } else {
    loadingText.textContent = 'READY.'
  }

  if (progress >= 100) {

    clearInterval(loadingTimer)

    setTimeout(() => {

      loadingScreen.classList.add('hidden')
      startupScreen.classList.remove('hidden')

    }, 500)

  }

}, 50)


/* =========================================
   START MISSION
========================================= */

document
  .querySelector('#startMission')
  ?.addEventListener('click', () => {

    startupScreen.classList.add('hidden')
    gameScreen.classList.remove('hidden')

  })


/* =========================================
   SIMULATION ELEMENTS
========================================= */

const moistureElement =
  document.querySelector('#moisture')!

const batteryElement =
  document.querySelector('#battery')!

const solarElement =
  document.querySelector('#solar')!

const pumpElement =
  document.querySelector('#pump')!

const healthElement =
  document.querySelector('#health')!

const batteryVisual =
  document.querySelector<HTMLDivElement>('#batteryVisual')!

const pumpVisual =
  document.querySelector<HTMLDivElement>('#pumpVisual')!

const pipe =
  document.querySelector<HTMLDivElement>('#pipe')!
const sprinkler =
  document.querySelector<HTMLDivElement>('#sprinkler')!

const sunObject =
  document.querySelector<HTMLDivElement>('#sunObject')!

const moonObject =
  document.querySelector<HTMLDivElement>('#moonObject')!

const gameTime =
  document.querySelector('#gameTime')!

const pumpButton =
  document.querySelector<HTMLButtonElement>('#pumpButton')!


/* =========================================
   MANUAL PUMP
========================================= */

pumpButton.addEventListener('click', () => {

  if (!farm.pumpOn && farm.battery <= 0) {
    return
  }

  farm.pumpOn = !farm.pumpOn

})


/* =========================================
   SIMULATION LOOP
========================================= */

let lastTime = performance.now()

function simulationLoop(currentTime: number) {

  const deltaSeconds =
    Math.min(
      (currentTime - lastTime) / 1000,
      0.1
    )

  lastTime = currentTime

  updateFarm(deltaSeconds)


  /* TELEMETRY */

  moistureElement.textContent =
    `${Math.round(farm.soilMoisture)}%`

  batteryElement.textContent =
    `${Math.round(farm.battery)}%`

  solarElement.textContent =
    `${Math.round(farm.solarGeneration)} W`

  pumpElement.textContent =
    farm.pumpOn ? 'ON' : 'OFF'

  healthElement.textContent =
    `${Math.round(farm.cropHealth)}%`


  /* BATTERY VISUAL */

  batteryVisual.style.width =
    `${farm.battery}%`


  batteryVisual.classList.toggle(
    'low',
    farm.battery < 20
  )


  /* PUMP VISUAL */

  pumpVisual.classList.toggle(
    'active',
    farm.pumpOn
  )

  pipe.classList.toggle(
    'active',
    farm.pumpOn
  )
  sprinkler.classList.toggle(
  'active',
  farm.waterFlow > 0
)


  /* BUTTON */

  pumpButton.textContent =
    farm.pumpOn
      ? 'TURN PUMP OFF'
      : 'TURN PUMP ON'


  /* TIME */

  const hours =
    Math.floor(farm.hour)

  const minutes =
    Math.floor(
      (farm.hour % 1) * 60
    )

  gameTime.textContent =
    `DAY 1 • ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`


  requestAnimationFrame(simulationLoop)
  /* SKY / DAY-NIGHT */

const skyProgress =
  (farm.hour - 6) / 12

const daylight =
  Math.max(
    0,
    Math.sin(skyProgress * Math.PI)
  )

/*
 * Sun travels from left → right
 * during daylight.
 */

const sunX =
  10 + (daylight > 0 ? skyProgress * 80 : 0)

const sunY =
  70 - daylight * 55

sunObject.style.left =
  `${Math.max(5, Math.min(95, sunX))}%`

sunObject.style.top =
  `${sunY}%`

sunObject.style.opacity =
  `${daylight}`


/*
 * Moon becomes visible when the
 * sun goes down.
 */

const night =
  1 - daylight

moonObject.style.opacity =
  `${night}`

const moonProgress =
  ((farm.hour + 6) % 24) / 24

moonObject.style.left =
  `${moonProgress * 100}%`

moonObject.style.top =
  `${30 + Math.sin(moonProgress * Math.PI) * -15}%`

}

requestAnimationFrame(simulationLoop)