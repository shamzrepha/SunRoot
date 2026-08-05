import { sfx } from '../game/sound'

export function renderLoading(root: HTMLElement, onDone: () => void) {
  root.innerHTML = `
    <div class="boot loading-screen">
      <div class="boot-sun"></div>
      <div class="boot-inner">
        <div class="boot-mark">
          <svg viewBox="0 0 24 24" width="54" height="54">
            <path d="M12 21c0-5 2-8 7-9-5-1-7-4-7-9-0 5-2 8-7 9 5 1 7 4 7 9z" fill="#4fd67a"/>
          </svg>
        </div>
        <div class="loading-logo">SUNROOT</div>
        <div class="loading-sub">Learn it. Build it. Watch it grow.</div>
        <div class="loading-bar"><div class="loading-bar-fill" id="loadingFill"></div></div>
        <div class="loading-status" id="loadingStatus">Booting simulation...</div>
      </div>
    </div>
  `

  const fill = root.querySelector<HTMLDivElement>('#loadingFill')!
  const status = root.querySelector<HTMLDivElement>('#loadingStatus')!
  const steps = [
    'Booting simulation core...',
    'Loading farm digital twin...',
    'Calibrating soil sensors...',
    'Charging battery bank...',
    'Ready.',
  ]

  let i = 0
  const interval = setInterval(() => {
    i++
    fill.style.width = `${Math.min(100, (i / steps.length) * 100)}%`
    status.textContent = steps[Math.min(i, steps.length - 1)]
    if (i >= steps.length) {
      clearInterval(interval)
      setTimeout(onDone, 420)
    }
  }, 360)
}

export function renderIntro(root: HTMLElement, onStart: () => void) {
  // The assistant sets up the problem before the student sees a single control.
  root.innerHTML = `
    <div class="boot intro-screen">
      <div class="intro-card">
        <div class="intro-tag">MISSION 01</div>
        <h1>Save the farm</h1>
        <p>
          The crop is dying. Soil moisture has fallen to 12% and there is no
          power grid for kilometres. You have a workshop, a set of components,
          and one growing season to prove that engineering can save this field.
        </p>
        <ul class="intro-objectives">
          <li>Install a solar panel, battery bank and water pump</li>
          <li>Program the logic that decides when the pump runs</li>
          <li>Deploy it and keep the crop alive through the day/night cycle</li>
        </ul>
        <button id="startButton" class="primary-button large">Enter the workshop</button>
      </div>
    </div>
  `
  root.querySelector<HTMLButtonElement>('#startButton')!.addEventListener('click', () => {
    sfx.deploy()
    onStart()
  })
}
