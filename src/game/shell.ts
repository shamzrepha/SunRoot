import { progress, rankFor } from './progress'
import { setSpeechEnabled, isSpeechEnabled, hide as hideAssistant } from '../ai/Assistant'
import { icon } from '../ui/icons'
import { sfx, setSoundEnabled, isSoundEnabled } from './sound'
import type { Screen } from '../appState'
import { session } from '../accounts/Session'
import { getActiveTeam } from '../accounts/WorkshopContext'
import { getTeam, shipTeamState } from '../accounts/TeamService'
import { buildSnapshot, applySnapshot } from '../persistence/SaveManager'

export interface NavItem {
  group?: string
  id: Screen
  label: string
  icon: string
  locked?: boolean
}

/**
 * Toggles the persistent sidebar (and body background) between the light
 * "campus" theme (Dashboard, My Classes, Login) and the dark "engineering
 * workspace" theme (everything inside a workshop). The sidebar itself is
 * mounted once and never rebuilt, so this is a class toggle, not a re-render.
 */
export function setSidebarTheme(theme: 'campus' | 'workshop') {
  document.body.classList.toggle('theme-campus', theme === 'campus')
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

        <div class="team-panel" id="teamPanel" hidden></div>

        <button class="profile-chip" id="profileChip">
          <span class="profile-avatar" id="profileAvatar">?</span>
          <span class="profile-chip-info">
            <span class="profile-chip-name" id="profileChipName">\u2026</span>
            <span class="profile-chip-role" id="profileChipRole"></span>
          </span>
        </button>
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

  root.querySelector<HTMLButtonElement>('#profileChip')!.addEventListener('click', () => {
    onNavigate?.('profile')
  })
  updateProfileChip()

  return {
    view: root.querySelector<HTMLDivElement>('#view')!,
    hud: root.querySelector<HTMLDivElement>('#hud')!,
  }
}

/** Refreshes the sidebar profile chip from the current session. Call after any change to the signed-in user's name. */
export function updateProfileChip() {
  const profile = session.profile
  const avatar = document.querySelector<HTMLElement>('#profileAvatar')
  const nameEl = document.querySelector<HTMLElement>('#profileChipName')
  const roleEl = document.querySelector<HTMLElement>('#profileChipRole')
  if (!avatar || !nameEl || !roleEl) return
  if (!profile) {
    nameEl.textContent = 'Account'
    roleEl.textContent = ''
    avatar.textContent = '?'
    return
  }
  const parts = profile.displayName.trim().split(/\s+/)
  avatar.textContent = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
  nameEl.textContent = profile.displayName
  roleEl.textContent = profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
}

/**
 * Shows/hides and wires the "save & ship to team" control in the sidebar.
 * Call this on every navigation (not just at shell mount, which only
 * happens once per session) since which team is active changes as a
 * student moves in and out of a team workshop.
 */
export function updateTeamPanel() {
  const panel = document.querySelector<HTMLElement>('#teamPanel')
  if (!panel) return
  const teamId = getActiveTeam()

  if (!teamId) {
    panel.hidden = true
    panel.innerHTML = ''
    return
  }

  panel.hidden = false
  panel.innerHTML = `
    <div class="team-panel-label">Team workshop</div>
    <button class="ghost-button small" id="refreshTeamButton" style="width:100%">\u21bb Refresh from teammates</button>
    <textarea id="shipMessage" placeholder="What did you change?" rows="2"></textarea>
    <button class="primary-button small" id="shipButton" style="width:100%">Save &amp; ship to team</button>
    <div class="team-panel-status" id="shipStatus"></div>
  `

  panel.querySelector<HTMLButtonElement>('#refreshTeamButton')!.addEventListener('click', async () => {
    const statusEl = panel.querySelector<HTMLElement>('#shipStatus')!
    const btn = panel.querySelector<HTMLButtonElement>('#refreshTeamButton')!
    btn.disabled = true
    btn.textContent = 'Pulling\u2026'
    try {
      const team = await getTeam(teamId)
      if (team?.sharedState && Object.keys(team.sharedState).length) {
        applySnapshot(team.sharedState as any)
        statusEl.textContent = `Pulled the latest \u2014 last saved by ${team.lastSavedBy ?? 'a teammate'}. Reopen the screen you were on to see it reflected.`
      } else {
        statusEl.textContent = 'Nothing shipped by the team yet.'
      }
    } catch (err) {
      console.error('SunRoot: team refresh failed', err)
      statusEl.textContent = 'Refresh failed \u2014 check your connection.'
    } finally {
      btn.disabled = false
      btn.textContent = '\u21bb Refresh from teammates'
    }
  })

  panel.querySelector<HTMLButtonElement>('#shipButton')!.addEventListener('click', async () => {
    const profile = session.profile
    if (!profile) return
    const messageInput = panel.querySelector<HTMLTextAreaElement>('#shipMessage')!
    const statusEl = panel.querySelector<HTMLElement>('#shipStatus')!
    const message = messageInput.value.trim() || 'No message'
    const btn = panel.querySelector<HTMLButtonElement>('#shipButton')!
    btn.disabled = true
    btn.textContent = 'Saving\u2026'
    try {
      await shipTeamState(teamId, { uid: profile.uid, displayName: profile.displayName, message }, buildSnapshot() as unknown as Record<string, unknown>)
      messageInput.value = ''
      statusEl.textContent = 'Shipped \u2014 your team will see this next time they open the workshop.'
      toast('Saved to team', 'success')
    } catch (err) {
      console.error('SunRoot: ship to team failed', err)
      statusEl.textContent = 'Save failed \u2014 check your connection and try again.'
    } finally {
      btn.disabled = false
      btn.textContent = 'Save & ship to team'
    }
  })
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

  // The assessor's rank wins where one has been awarded; the XP ladder is only
  // a fallback for a student who has not yet been assessed.
  nameEl.textContent = progress.rank || current.name
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
