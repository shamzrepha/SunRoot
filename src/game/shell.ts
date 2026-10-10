import { progress, rankFor } from './progress'
import { setSpeechEnabled, isSpeechEnabled, hide as hideAssistant } from '../ai/Assistant'
import { icon } from '../ui/icons'
import { sfx, setSoundEnabled, isSoundEnabled } from './sound'
import type { Screen } from '../appState'
import { session } from '../accounts/Session'
import { getActiveTeam } from '../accounts/WorkshopContext'
import { getTeam, shipTeamState } from '../accounts/TeamService'
import { buildSnapshot, applySnapshot } from '../persistence/SaveManager'
import { logOut } from '../accounts/AuthService'
import { listNotificationsForUser } from '../accounts/NotificationService'
import { getStreakState, clockInToday } from '../accounts/StreakService'
import { loadConfig, saveConfig, testGeminiConnection } from '../ai/AIProvider'

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

export function setTopbarTitle(title: string) {
  const el = document.querySelector<HTMLElement>('#topbarTitle')
  if (el) el.textContent = title
}

export function mountShell(root: HTMLElement, navigate: (s: Screen) => void) {
  onNavigate = navigate
  root.innerHTML = `
    <div class="shell" id="shellRoot">
      <div class="sidebar-backdrop" id="sidebarBackdrop"></div>
      <aside class="sidebar" id="sidebarRail">
        <div class="brand">
          <div class="brand-mark">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
              <circle cx="12" cy="7" r="3.5" fill="#F59E0B" />
              <path d="M12 1.5v1.8M4.9 4.2l1.3 1.3M19.1 4.2l-1.3 1.3M2 7h1.8M20.2 7H22" stroke="#F59E0B" stroke-width="1.6" stroke-linecap="round" />
              <path d="M12 10.5v5.5" stroke="#38BDF8" stroke-width="2" stroke-linecap="round" />
              <path d="M5 16h14" stroke="#38BDF8" stroke-width="2" stroke-linecap="round" />
              <path d="M8 19h8" stroke="#38BDF8" stroke-width="1.8" stroke-linecap="round" />
              <path d="M10.5 22h3" stroke="#38BDF8" stroke-width="1.6" stroke-linecap="round" />
            </svg>
          </div>
          <div>
            <div class="brand-name">SUNROOT</div>
            <div class="brand-tag">Cyber-Physical Engineering</div>
          </div>
        </div>

        <nav class="nav" id="navList"></nav>

        <div class="rank-card">
          <div class="rank-avatar">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <rect x="5" y="7" width="14" height="11" rx="3" fill="#4fd67a"/>
              <circle cx="9.5" cy="12" r="1.6" fill="#0b1a24"/>
              <circle cx="14.5" cy="12" r="1.6" fill="#0b1a24"/>
              <rect x="11" y="3" width="2" height="4" fill="#4fd67a"/>
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

        <div class="sidebar-user-section">
          <button class="profile-chip" id="profileChip">
            <span class="profile-avatar" id="profileAvatar">?</span>
            <span class="profile-chip-info">
              <span class="profile-chip-name" id="profileChipName">Account</span>
              <span class="profile-chip-role" id="profileChipRole"></span>
            </span>
          </button>
          <button class="sidebar-logout-btn" id="sidebarLogoutBtn" title="Sign out of your account">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span>Log Out</span>
          </button>
        </div>
      </aside>

      <div class="main-col">
        <header class="shell-topbar">
          <div class="shell-topbar-left">
            <button class="menu-toggle-btn" id="menuToggleBtn" aria-label="Toggle navigation drawer">
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <div class="shell-breadcrumb">
              <span class="shell-breadcrumb-brand">SunRoot</span>
              <span class="shell-breadcrumb-sep">/</span>
              <span class="shell-breadcrumb-page" id="topbarTitle">Dashboard</span>
            </div>
          </div>
            <button class="shell-streak-pill" id="topbarStreakBtn" title="Daily Engineering Streak (Duolingo Style)">
              <span class="streak-icon">🔥</span>
              <span class="streak-label" id="topbarStreakLabel">0-Day Streak</span>
            </button>
            <div class="topbar-controls">
              <button class="topbar-icon-btn" id="topbarAiKeyBtn" title="Google Gemini AI Configuration">
                <span style="font-weight:800; font-size:11px; color:#38bdf8;">AI</span>
              </button>
              <button class="topbar-icon-btn" id="topbarSoundBtn" title="Toggle Sound">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
              </button>
              <button class="topbar-icon-btn" id="topbarVoiceBtn" title="Toggle AI Voice">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/></svg>
              </button>
              <button class="topbar-icon-btn" id="topbarNotifBtn" title="View Class Notifications & Homework">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
                <span class="notif-dot" id="notifDot" style="display:none"></span>
              </button>
            </div>
            <button class="topbar-profile-chip" id="topbarProfileChip" title="View Account Profile">
              <span class="topbar-avatar" id="topbarAvatar">?</span>
              <span class="topbar-name" id="topbarName">Profile</span>
            </button>
            <button class="topbar-logout-btn" id="topbarLogoutBtn" title="Sign out of your account">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span>Log Out</span>
            </button>
          </div>
        </header>

        <div class="view" id="view"></div>
      </div>

      <div class="toast-stack" id="toastStack"></div>
    </div>
  `

  const shellRoot = root.querySelector<HTMLElement>('#shellRoot')
  const backdrop = root.querySelector<HTMLElement>('#sidebarBackdrop')
  const menuBtn = root.querySelector<HTMLButtonElement>('#menuToggleBtn')

  menuBtn?.addEventListener('click', () => {
    shellRoot?.classList.toggle('sidebar-open')
  })

  backdrop?.addEventListener('click', () => {
    shellRoot?.classList.remove('sidebar-open')
  })

  const syncSoundButtons = () => {
    const on = isSoundEnabled()
    const sidebarBtn = root.querySelector<HTMLButtonElement>('#soundToggle')
    const topbarBtn = root.querySelector<HTMLButtonElement>('#topbarSoundBtn')
    if (sidebarBtn) sidebarBtn.textContent = `Sound: ${on ? 'On' : 'Off'}`
    if (topbarBtn) topbarBtn.classList.toggle('active', on)
  }

  const syncVoiceButtons = () => {
    const on = isSpeechEnabled()
    const sidebarBtn = root.querySelector<HTMLButtonElement>('#voiceToggle')
    const topbarBtn = root.querySelector<HTMLButtonElement>('#topbarVoiceBtn')
    if (sidebarBtn) sidebarBtn.textContent = `Voice: ${on ? 'On' : 'Off'}`
    if (topbarBtn) topbarBtn.classList.toggle('active', on)
  }

  root.querySelector<HTMLButtonElement>('#soundToggle')!.addEventListener('click', () => {
    setSoundEnabled(!isSoundEnabled())
    syncSoundButtons()
    if (isSoundEnabled()) sfx.click()
  })

  root.querySelector<HTMLButtonElement>('#topbarSoundBtn')?.addEventListener('click', () => {
    setSoundEnabled(!isSoundEnabled())
    syncSoundButtons()
    if (isSoundEnabled()) sfx.click()
  })

  root.querySelector<HTMLButtonElement>('#voiceToggle')!.addEventListener('click', () => {
    setSpeechEnabled(!isSpeechEnabled())
    syncVoiceButtons()
    if (!isSpeechEnabled()) hideAssistant()
  })

  root.querySelector<HTMLButtonElement>('#topbarVoiceBtn')?.addEventListener('click', () => {
    setSpeechEnabled(!isSpeechEnabled())
    syncVoiceButtons()
    if (!isSpeechEnabled()) hideAssistant()
  })

  root.querySelector<HTMLButtonElement>('#profileChip')!.addEventListener('click', () => {
    shellRoot?.classList.remove('sidebar-open')
    onNavigate?.('profile')
  })

  root.querySelector<HTMLButtonElement>('#topbarProfileChip')?.addEventListener('click', () => {
    shellRoot?.classList.remove('sidebar-open')
    onNavigate?.('profile')
  })

  // Explicit 1-Click Logout
  const handleSignOut = async () => {
    shellRoot?.classList.remove('sidebar-open')
    try {
      await logOut()
      toast('Signed out successfully.', 'info')
      onNavigate?.('login')
    } catch {
      onNavigate?.('login')
    }
  }

  root.querySelector<HTMLButtonElement>('#sidebarLogoutBtn')?.addEventListener('click', handleSignOut)
  root.querySelector<HTMLButtonElement>('#topbarLogoutBtn')?.addEventListener('click', handleSignOut)

  // Notification bell
  root.querySelector<HTMLButtonElement>('#topbarNotifBtn')?.addEventListener('click', async () => {
    const prof = session.profile
    if (!prof) return
    const notifs = await listNotificationsForUser(prof.uid)
    if (notifs.length === 0) {
      toast('No new notifications or homework assignments.', 'info')
    } else {
      const latest = notifs[0]
      toast(`<strong>${latest.title}</strong>: ${latest.body}`, 'info')
    }
  })

  // Streak pill & Duolingo modal
  root.querySelector<HTMLButtonElement>('#topbarStreakBtn')?.addEventListener('click', () => {
    openStreakModal()
  })

  // Gemini AI Key modal
  root.querySelector<HTMLButtonElement>('#topbarAiKeyBtn')?.addEventListener('click', () => {
    openGeminiKeyModal()
  })

  window.addEventListener('sunroot:streak-updated', () => {
    updateStreakPill()
  })

  syncSoundButtons()
  syncVoiceButtons()
  updateProfileChip()
  updateStreakPill()

  return {
    view: root.querySelector<HTMLDivElement>('#view')!,
    hud: root.querySelector<HTMLDivElement>('#hud'),
  }
}

function escapeHtml(s: string): string {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}

export function updateStreakPill() {
  const profile = session.profile
  const streakState = getStreakState(profile)
  const btn = document.querySelector<HTMLButtonElement>('#topbarStreakBtn')
  const label = document.querySelector<HTMLElement>('#topbarStreakLabel')
  if (!btn || !label) return

  if (streakState.hasClockedInToday) {
    label.textContent = `${streakState.currentStreak}-Day Streak`
    btn.classList.add('is-active')
    btn.classList.remove('needs-clockin')
    btn.title = `🔥 Active Streak: ${streakState.currentStreak} Days (Clocked In)`
  } else {
    label.textContent = `0-Day Streak • Clock In!`
    btn.classList.add('needs-clockin')
    btn.classList.remove('is-active')
    btn.title = `🔥 Clock in today to keep your streak going!`
  }
}

export function openStreakModal() {
  const shell = document.querySelector<HTMLElement>('#shellRoot')
  if (!shell) return
  shell.querySelector('.streak-modal-backdrop')?.remove()

  const profile = session.profile
  const streakState = getStreakState(profile)

  const backdrop = document.createElement('div')
  backdrop.className = 'modal-backdrop streak-modal-backdrop'
  backdrop.innerHTML = `
    <div class="modal-box streak-modal-box" style="max-width: 440px; text-align: center; padding: 28px 24px;">
      <div style="font-size: 54px; margin-bottom: 8px;">🔥</div>
      <h2 style="margin: 0 0 6px; font-size: 22px; font-weight: 800;">Daily Engineering Streak</h2>
      <p style="color: var(--campus-text-muted); font-size: 13px; margin: 0 0 20px;">
        Duolingo-style daily clock-in keeps your cyber-physical engineering habit sharp.
      </p>

      <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div>
          <div style="font-size: 11px; text-transform: uppercase; color: var(--campus-text-muted);">Current Streak</div>
          <div style="font-size: 26px; font-weight: 900; color: #f97316;">${streakState.displayStreak} <span style="font-size: 13px;">Days</span></div>
        </div>
        <div>
          <div style="font-size: 11px; text-transform: uppercase; color: var(--campus-text-muted);">Longest Record</div>
          <div style="font-size: 26px; font-weight: 900; color: #38bdf8;">${streakState.longestStreak} <span style="font-size: 13px;">Days</span></div>
        </div>
      </div>

      <div id="streakModalActionArea">
        ${streakState.hasClockedInToday ? `
          <div style="background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.3); border-radius: 10px; padding: 14px; margin-bottom: 16px;">
            <div style="color: #10b981; font-weight: 700; font-size: 14px;">✅ You are clocked in for today!</div>
            <div style="font-size: 12px; color: var(--campus-text-muted); margin-top: 4px;">Come back tomorrow to increment your streak to ${streakState.currentStreak + 1} days.</div>
          </div>
        ` : `
          <button class="primary-button" id="clockInSubmitBtn" style="width: 100%; padding: 14px; font-size: 15px; font-weight: 700; margin-bottom: 12px;">
            ⚡ Clock In Today (+25 XP)
          </button>
          <div style="font-size: 12px; color: #f59e0b;">${streakState.statusText}</div>
        `}
      </div>

      <button class="ghost-button small" id="closeStreakModalBtn" style="margin-top: 14px; width: 100%;">Close</button>
    </div>
  `

  shell.appendChild(backdrop)

  backdrop.querySelector('#closeStreakModalBtn')?.addEventListener('click', () => backdrop.remove())
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove()
  })

  backdrop.querySelector('#clockInSubmitBtn')?.addEventListener('click', async () => {
    const btn = backdrop.querySelector<HTMLButtonElement>('#clockInSubmitBtn')!
    btn.disabled = true
    btn.textContent = 'Clocking In\u2026'
    const res = await clockInToday()
    if (res.success) {
      toast(res.message, 'success')
      sfx.badge()
      updateStreakPill()
      backdrop.remove()
    } else {
      toast(res.message, 'info')
      btn.disabled = false
      btn.textContent = '⚡ Clock In Today'
    }
  })
}

export function openGeminiKeyModal() {
  const shell = document.querySelector<HTMLElement>('#shellRoot')
  if (!shell) return
  shell.querySelector('.gemini-modal-backdrop')?.remove()

  const cfg = loadConfig()
  const hasCustomKey = !!cfg.apiKey

  const backdrop = document.createElement('div')
  backdrop.className = 'modal-backdrop gemini-modal-backdrop'
  backdrop.innerHTML = `
    <div class="modal-box" style="max-width: 480px; text-align: left; padding: 26px 24px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <h2 style="margin: 0; font-size: 19px; display: flex; align-items: center; gap: 8px;">
          <span style="color: #38bdf8;">⚡</span> Google Gemini AI
        </h2>
        <span class="tag-badge" style="background: rgba(56,189,248,0.15); color: #38bdf8;">gemini-1.5-flash</span>
      </div>

      <p style="color: var(--campus-text-muted); font-size: 13px; line-height: 1.5; margin: 0 0 16px;">
        SunRoot uses Google Gemini for real-time tutoring, course syllabus synthesis, Study Lab briefings, audio podcasts, and flashcard quizzes.
      </p>

      <div style="background: ${hasCustomKey ? 'rgba(16,185,129,0.1)' : 'rgba(56,189,248,0.08)'}; border: 1px solid ${hasCustomKey ? 'rgba(16,185,129,0.3)' : 'rgba(56,189,248,0.2)'}; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 12px;">
        <strong>Active Route:</strong> ${hasCustomKey ? '🟢 Custom Personal Gemini Key (attached to all requests)' : '🌐 Deployed Vercel Serverless Proxy (/api/ask)'}
      </div>

      <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: var(--campus-text-muted);">
        Your Gemini API Key (starts with AIzaSy...):
      </label>
      <div style="display: flex; gap: 8px; margin-bottom: 12px;">
        <input type="password" id="geminiKeyField" value="${escapeHtml(cfg.apiKey || '')}" placeholder="AIzaSy..." style="flex: 1; padding: 9px 12px; font-family: monospace; font-size: 13px;" />
        <button class="ghost-button small" id="toggleKeyVisibilityBtn" type="button">👁️</button>
      </div>

      <div id="geminiTestStatus" style="font-size: 12px; min-height: 20px; margin-bottom: 16px; color: var(--campus-text-muted);"></div>

      <div style="display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap;">
        <button class="ghost-button small" id="testKeyBtn">Test Connection</button>
        ${hasCustomKey ? `<button class="ghost-button small danger-btn" id="clearKeyBtn">Clear Key</button>` : ''}
        <button class="primary-button small" id="saveKeyBtn">Save Key</button>
        <button class="ghost-button small" id="closeGeminiModalBtn">Cancel</button>
      </div>
    </div>
  `

  shell.appendChild(backdrop)

  const keyInput = backdrop.querySelector<HTMLInputElement>('#geminiKeyField')!
  const statusEl = backdrop.querySelector<HTMLElement>('#geminiTestStatus')!

  backdrop.querySelector('#toggleKeyVisibilityBtn')?.addEventListener('click', () => {
    keyInput.type = keyInput.type === 'password' ? 'text' : 'password'
  })

  backdrop.querySelector('#closeGeminiModalBtn')?.addEventListener('click', () => backdrop.remove())
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove()
  })

  backdrop.querySelector('#saveKeyBtn')?.addEventListener('click', () => {
    const val = keyInput.value.trim()
    saveConfig({ apiKey: val })
    toast(val ? 'Gemini API key saved in browser storage.' : 'Custom key removed. Using server proxy.', 'success')
    backdrop.remove()
  })

  backdrop.querySelector('#clearKeyBtn')?.addEventListener('click', () => {
    saveConfig({ apiKey: '' })
    toast('Custom key removed. Using server proxy.', 'info')
    backdrop.remove()
  })

  backdrop.querySelector('#testKeyBtn')?.addEventListener('click', async () => {
    statusEl.textContent = 'Testing connection with gemini-1.5-flash\u2026'
    statusEl.style.color = 'var(--campus-text-muted)'
    const res = await testGeminiConnection(keyInput.value.trim())
    if (res.success) {
      statusEl.style.color = '#10b981'
      statusEl.textContent = `✓ ${res.message}`
    } else {
      statusEl.style.color = '#ef4444'
      statusEl.textContent = `✗ ${res.message}`
    }
  })
}


/** Refreshes the sidebar and topbar profile chip from current session. */
export function updateProfileChip() {
  const profile = session.profile
  const avatar = document.querySelector<HTMLElement>('#profileAvatar')
  const nameEl = document.querySelector<HTMLElement>('#profileChipName')
  const roleEl = document.querySelector<HTMLElement>('#profileChipRole')
  const topbarAvatar = document.querySelector<HTMLElement>('#topbarAvatar')
  const topbarName = document.querySelector<HTMLElement>('#topbarName')

  if (!profile) {
    if (nameEl) nameEl.textContent = 'Account'
    if (roleEl) roleEl.textContent = ''
    if (avatar) avatar.textContent = '?'
    if (topbarAvatar) topbarAvatar.textContent = '?'
    if (topbarName) topbarName.textContent = 'Account'
    return
  }

  const parts = profile.displayName.trim().split(/\s+/)
  const initials = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
  const roleText = profile.role.charAt(0).toUpperCase() + profile.role.slice(1)

  if (avatar) avatar.textContent = initials
  if (nameEl) nameEl.textContent = profile.displayName
  if (roleEl) roleEl.textContent = roleText
  if (topbarAvatar) topbarAvatar.textContent = initials
  if (topbarName) topbarName.textContent = parts[0] || profile.displayName
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
    b.addEventListener('click', () => {
      document.querySelector<HTMLElement>('#shellRoot')?.classList.remove('sidebar-open')
      onNavigate?.(b.dataset.nav as Screen)
    })
  })
}

export function renderHud(_fields: { label: string; value: string; tone?: string }[]) {
  // Telemetry is rendered strictly inside specific practical simulation views (e.g. farm.ts)
}

/** Telemetry HUD is isolated to farm screen */
export function setHudVisible(_visible: boolean) {
  const hud = document.querySelector<HTMLElement>('#hud')
  if (hud) hud.style.display = 'none'
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
