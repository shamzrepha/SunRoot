import { tray } from '../hardware/PartsTray'
import { graph } from '../hardware/CircuitGraph'
import { getSavedWorkspace } from './codingLab'
import { progress } from '../game/progress'
import { CATALOG } from '../hardware/ComponentCatalog'

export function renderWorkshopHub(root: HTMLElement, toToolShed: () => void) {
  const componentsOwned = tray.lines.length
  const componentsTotal = CATALOG.length
  const wireCount = graph.wires.length
  const hasCode = !!getSavedWorkspace()
  const tested = graph.lastCheckedAt > 0

  root.innerHTML = `
    <div class="screen ws-hub">
      <div class="ws-hub-header">
        <div>
          <h1>SunRoot Workshop</h1>
          <p>Build. Test. Code. Grow.</p>
        </div>
        <div class="ws-hub-stats">
          <span class="ws-stat"><i class="ws-dot ws-dot-gold"></i>${progress.xp} XP</span>
        </div>
      </div>

      <div class="ws-hub-grid">
        <div class="ws-hero-card" id="heroCard" role="button" tabindex="0">
          <div class="ws-hero-tag">Current stage</div>
          <h2>Build Your System</h2>
          <p class="ws-hero-copy">Select components, write your circuit and code, and run your solution in the farm.</p>
          <ul class="ws-hero-list">
            <li>Choose components in Tool Shed</li>
            <li>Build your circuit and plumbing</li>
            <li>Code your controller logic</li>
            <li>Test in the farm simulation</li>
          </ul>
          <button class="primary-button" id="goToShedBtn">Go to Tool Shed \u2192</button>
        </div>

        <div class="ws-tutor-card">
          <div class="ws-tutor-head">
            <div class="ws-tutor-avatar">
              <svg viewBox="0 0 24 24" width="26" height="26"><rect x="5" y="7" width="14" height="11" rx="3" fill="#22C55E"/><circle cx="9.5" cy="12" r="1.6" fill="#0D1220"/><circle cx="14.5" cy="12" r="1.6" fill="#0D1220"/><rect x="11" y="3" width="2" height="4" fill="#22C55E"/></svg>
            </div>
            <div>
              <div class="ws-tutor-title">AI Tutor</div>
              <div class="ws-tutor-sub">What would you like to work on today?</div>
            </div>
          </div>
          <div class="ws-tutor-prompts">
            <button class="ws-prompt-btn" data-prompt="hint">Give me a hint</button>
            <button class="ws-prompt-btn" data-prompt="explain">Explain this concept</button>
            <button class="ws-prompt-btn" data-prompt="next">What should I try next?</button>
          </div>
        </div>
      </div>

      <div class="ws-status-bar">
        <div class="ws-status-item"><span class="ws-status-label">Components</span><span class="ws-status-value">${componentsOwned}/${componentsTotal}</span></div>
        <div class="ws-status-item"><span class="ws-status-label">Connections</span><span class="ws-status-value">${wireCount}</span></div>
        <div class="ws-status-item"><span class="ws-status-label">Code uploaded</span><span class="ws-status-value">${hasCode ? 'Yes' : 'No'}</span></div>
        <div class="ws-status-item"><span class="ws-status-label">System test</span><span class="ws-status-value">${tested ? 'Tested' : 'Not yet'}</span></div>
      </div>
    </div>
  `

  root.querySelector('#goToShedBtn')?.addEventListener('click', toToolShed)
  root.querySelector('#heroCard')?.addEventListener('click', toToolShed)
  root.querySelector<HTMLElement>('#heroCard')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') toToolShed()
  })
  root.querySelectorAll<HTMLButtonElement>('.ws-prompt-btn').forEach((btn) => {
    btn.addEventListener('click', toToolShed) // for now, routes into the build flow — full tutor chat lives on the Tutor screen
  })
}
