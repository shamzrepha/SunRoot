import { A11Y_OPTIONS, isEnabled, setOption } from '../ui/Accessibility'
import { setSpeechEnabled } from '../ai/Assistant'
import { icon } from '../ui/icons'

/**
 * Accessibility settings, gathered in one place. Every switch here changes
 * behaviour immediately — none is decorative, and the reduced-motion switch
 * starts in whatever position the operating system already asked for.
 */
export function renderAccessibility(root: HTMLElement) {
  root.innerHTML = `
    <div class="screen a11y-screen">
      <div class="lab-header">
        <div>
          <h1>Accessibility</h1>
          <p>SunRoot runs in an ordinary browser on ordinary hardware. These options
             change the interface immediately and persist while you work.</p>
        </div>
      </div>

      <div class="a11y-grid">
        ${A11Y_OPTIONS.map(
          (o) => `
          <label class="a11y-row" for="a11y-${o.id}">
            <input type="checkbox" id="a11y-${o.id}" data-a11y="${o.id}"
                   ${isEnabled(o.id) ? 'checked' : ''}>
            <span class="a11y-box">${icon('check', 13)}</span>
            <span class="a11y-text">
              <span class="a11y-label">${o.label}</span>
              <span class="a11y-detail">${o.detail}</span>
            </span>
          </label>`,
        ).join('')}
      </div>

      <div class="a11y-note">
        <strong>No install, no headset, no GPU.</strong>
        Verified down to a 360 px viewport, with every control reachable by keyboard and
        every status carrying text or an icon as well as colour.
      </div>
    </div>
  `

  root.querySelectorAll<HTMLInputElement>('[data-a11y]').forEach((box) => {
    box.addEventListener('change', () => {
      const id = box.dataset.a11y as Parameters<typeof setOption>[0]
      setOption(id, box.checked)
      if (id === 'speech') setSpeechEnabled(box.checked)
    })
  })
}
