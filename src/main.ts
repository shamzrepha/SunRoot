import './style.css'
import { farm, updateFarm } from './simulation/FarmState'
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="app">
    <header class="topbar">
      <div>
        <div class="logo">SUNROOT</div>
        <div class="subtitle">Solar Farm Digital Twin</div>
      </div>

      <div class="day-status">
        <span>DAY 01</span>
        <span class="sun">☀️</span>
      </div>
    </header>

    <main class="dashboard">

      <section class="farm-panel">
        <div class="panel-title">
          <h1>Farm Simulation</h1>
          <span class="status online">● SYSTEM ONLINE</span>
        </div>

        <div class="farm">
          <div class="sun-object">☀️</div>

          <div class="solar-panel">
            <div class="panel-label">SOLAR PANEL</div>
            <div class="panel-grid"></div>
          </div>

          <div class="battery">
            <div class="battery-body">
            <div id="batteryLevel" class="battery-level"></div>
            </div>
            <div class="battery-label">🔋 BATTERY</div>
          </div>

          <div class="water-pump">
<div id="pumpBody" class="pump-body">💧</div>
            <div class="pump-label">PUMP</div>
          </div>
<div class="soil" id="soil">
  <div class="crop-row">🌱 🌱 🌱 🌱</div>
  <div class="crop-row">🌱 🌱 🌱 🌱</div>
  <div class="crop-row">🌱 🌱 🌱 🌱</div>
</div>

<div id="waterLine" class="water-line"></div>
          </div>
      </section>

      <aside class="telemetry-panel">
        <h2>Live Telemetry</h2>

        <div class="metric">
          <span>Soil Moisture</span>
          <strong id="moisture">12%</strong>
        </div>

        <div class="metric">
          <span>Battery</span>
          <strong id="battery">23%</strong>
        </div>

        <div class="metric">
          <span>Solar Generation</span>
          <strong id="solar">520 W</strong>
        </div>
        <div class="metric">
  <span>Farm Time</span>
  <strong id="farmTime">08:00</strong>
</div>

        <div class="metric">
          <span>Pump</span>
          <strong id="pump">OFF</strong>
        </div>

        <div class="metric">
          <span>Crop Health</span>
          <strong id="health">24%</strong>
        </div>

        <button id="pumpButton" class="pump-button">
          TURN PUMP ON
        </button>
      </aside>

    </main>

    <footer>
      <span>MISSION 01</span>
      <strong>SAVE THE FARM</strong>
      <span>Build • Program • Test • Improve</span>
    </footer>
  </div>
`
const moistureElement = document.querySelector('#moisture')!
const batteryElement = document.querySelector('#battery')!
const solarElement = document.querySelector('#solar')!
const pumpElement = document.querySelector('#pump')!
const healthElement = document.querySelector('#health')!

const pumpButton = document.querySelector<HTMLButtonElement>('#pumpButton')!

pumpButton.addEventListener('click', () => {
  if (!farm.pumpOn && farm.battery <= 0) {
    return
  }

  farm.pumpOn = !farm.pumpOn

  pumpButton.textContent = farm.pumpOn
    ? 'TURN PUMP OFF'
    : 'TURN PUMP ON'
})

let lastTime = performance.now()

function simulationLoop(currentTime: number) {
  const deltaSeconds = Math.min(
    (currentTime - lastTime) / 1000,
    0.1
  )

  lastTime = currentTime

  updateFarm(deltaSeconds)
  // Battery visual
batteryLevelElement.style.width = `${farm.battery}%`

// Pump visual
pumpBodyElement.classList.toggle('active', farm.pumpOn)

// Water visual
waterLineElement.classList.toggle('active', farm.pumpOn)


// Crop visual
const health = farm.cropHealth

if (health < 25) {
  soilElement.classList.add('dry')
} else {
  soilElement.classList.remove('dry')
}
const hours = Math.floor(farm.hour)
const minutes = Math.floor((farm.hour % 1) * 60)

farmTimeElement.textContent =
  `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`

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

  requestAnimationFrame(simulationLoop)
}

requestAnimationFrame(simulationLoop)
const batteryLevelElement =
  document.querySelector<HTMLDivElement>('#batteryLevel')!

const pumpBodyElement =
  document.querySelector<HTMLDivElement>('#pumpBody')!

const waterLineElement =
  document.querySelector<HTMLDivElement>('#waterLine')!

const soilElement =
  document.querySelector<HTMLDivElement>('#soil')!
const farmTimeElement =
  document.querySelector('#farmTime')!