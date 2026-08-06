import { progress, rankFor } from './progress'
import { setSpeechEnabled, isSpeechEnabled, hide as hideAssistant } from '../ai/Assistant'
import { icon } from '../ui/icons'
import { sfx, setSoundEnabled, isSoundEnabled } from './sound'
import type { Screen } from '../appState'

export interface NavItem {
  group?: string
  id: Screen
  label: string
  icon: string
  locked?: boolean
}

let onNavigate: ((s: Screen) => void) | null = null

export function mountShell(root: HTMLElement, navigate: (s: Screen) => void) {
  onNavigate = navigate
  root.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">
            <svg viewBox="0 0 24 24" width="26" height="26">
              <path d="M12 21c0-5 2-8 7-9-5-1-7-4-7-9-0 5-2 8-7 9 5 1 7 4 7 9z" fill="#4fd67a"/>
            </svg>
          </div>
          <div>
            <div class="brand-name">SUNROOT</div>
            <div class="brand-tag">Learn it. Build it. Watch it grow.</div>
          </div>
        </div>

        <nav class="nav" id="navList"></nav>

        <div class="rank-card">
          <div class="rank-avatar">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <rect x="5" y="7" width="14" height="11" rx="3" fill="#7fd8ff"/>
              <circle cx="9.5" cy="12" r="1.6" fill="#0b1a24"/>
              <circle cx="14.5" cy="12" r="1.6" fill="#0b1a24"/>
              <rect x="11" y="3" width="2" height="4" fill="#7fd8ff"/>
            </svg>
          </div>
          <div class="rank-info">
            <div class="rank-name" id="rankName">Explorer</div>
            <div class="rank-xp" id="rankXp">0 / 150 XP</div>
            <div class="xp-track"><div class="xp-fill" id="xpFill"></div></div>
          </div>
        </div>

        <div class="shell-toggles">
          <button class="sound-toggle" id="soundToggle">Sound: On</button>
          <button class="sound-toggle" id="voiceToggle">Voice: Off</button>
        </div>
      </aside>

      <div class="main-col">
        <div class="hud" id="hud"></div>
        <div class="view" id="view"></div>
      </div>

      <div class="toast-stack" id="toastStack"></div>
    </div>
  `

  root.querySelector<HTMLButtonElement>('#soundToggle')!.addEventListener('click', (e) => {
    const btn = e.currentTarget as HTMLButtonElement
    setSoundEnabled(!isSoundEnabled())
    btn.textContent = `Sound: ${isSoundEnabled() ? 'On' : 'Off'}`
    if (isSoundEnabled()) sfx.click()
  })

  root.querySelector<HTMLButtonElement>('#voiceToggle')!.addEventListener('click', (e) => {
    const btn = e.currentTarget as HTMLButtonElement
    setSpeechEnabled(!isSpeechEnabled())
    btn.textContent = `Voice: ${isSpeechEnabled() ? 'On' : 'Off'}`
    if (!isSpeechEnabled()) hideAssistant()
  })

  return {
    view: root.querySelector<HTMLDivElement>('#view')!,
    hud: root.querySelector<HTMLDivElement>('#hud')!,
  }
}

export function renderNav(items: NavItem[], active: Screen) {
  const nav = document.querySelector<HTMLElement>('#navList')
  if (!nav) return

  // Items arrive already grouped; headings are emitted on each change of group
  // so the build path reads as a sequence rather than a list of eleven things.
  let lastGroup = ''
  nav.innerHTML = items
    .map((it) => {
      const heading =
        it.group && it.group !== lastGroup
          ? `<div class="nav-group">${(lastGroup = it.group)}</div>`
          : ''
      return `${heading}
      <button class="nav-item ${it.id === active ? 'active' : ''} ${it.locked ? 'locked' : ''}"
              data-nav="${it.id}" ${it.locked ? 'disabled' : ''}>
        <span class="nav-icon">${it.icon}</span>
        <span>${it.label}</span>
        ${it.locked ? `<span class="nav-lock">${icon('lock', 13)}</span>` : ''}
      </button>`
    })
    .join('')

  nav.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach((b) => {
    b.addEventListener('click', () => onNavigate?.(b.dataset.nav as Screen))
  })
}

export function renderHud(fields: { label: string; value: string; tone?: string }[]) {
  const hud = document.querySelector<HTMLElement>('#hud')
  if (!hud) return
  hud.innerHTML = fields
    .map(
      (f) => `
      <div class="hud-chip ${f.tone ? 'tone-' + f.tone : ''}">
        <span class="hud-label">${f.label}</span>
        <strong class="hud-value">${f.value}</strong>
      </div>`
    )
    .join('')
}

export function updateRankUi() {
  const { current, next } = rankFor(progress.xp)
  const nameEl = document.querySelector<HTMLElement>('#rankName')
  const xpEl = document.querySelector<HTMLElement>('#rankXp')
  const fillEl = document.querySelector<HTMLElement>('#xpFill')
  if (!nameEl || !xpEl || !fillEl) return

  nameEl.textContent = current.name
  if (next) {
    const span = next.xp - current.xp
    const into = progress.xp - current.xp
    xpEl.textContent = `${progress.xp} / ${next.xp} XP`
    fillEl.style.width = `${Math.min(100, (into / span) * 100)}%`
  } else {
    xpEl.textContent = `${progress.xp} XP — max rank`
    fillEl.style.width = '100%'
  }
}

export function toast(message: string, kind: 'info' | 'success' | 'badge' = 'info') {
  const stack = document.querySelector<HTMLElement>('#toastStack')
  if (!stack) return
  const el = document.createElement('div')
  el.className = `toast toast-${kind}`
  el.innerHTML = message
  stack.appendChild(el)
  if (kind === 'badge') sfx.badge()
  else if (kind === 'success') sfx.success()
  setTimeout(() => {
    el.classList.add('leaving')
    setTimeout(() => el.remove(), 400)
  }, 3200)
}

export function transitionView(render: (host: HTMLElement) => void) {
  const view = document.querySelector<HTMLElement>('#view')
  if (!view) return
  view.classList.add('fading')
  setTimeout(() => {
    render(view)
    view.classList.remove('fading')
  }, 160)
}
