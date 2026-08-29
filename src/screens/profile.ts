import { session, refreshProfile } from '../accounts/Session'
import { updateDisplayName, updateBio, changePassword, requestPasswordReset, describeAuthError } from '../accounts/AuthService'
import { updateProfileChip } from '../game/shell'

type Tab = 'info' | 'security'

const ROLE_LABEL: Record<string, string> = {
  teacher: 'Teacher',
  student: 'Student',
  individual: 'Individual',
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

export function renderProfile(root: HTMLElement) {
  const profile = session.profile
  if (!profile) return
  let tab: Tab = 'info'

  function paint() {
    root.innerHTML = `
      <div class="screen">
        <div class="lab-header"><div><h1>Profile</h1><p>Manage how you show up on SunRoot and your account security.</p></div></div>

        <div class="profile-header">
          <div class="profile-avatar-lg">${initials(profile!.displayName)}</div>
          <div>
            <div class="profile-name">${escapeHtml(profile!.displayName)}</div>
            <div class="profile-meta">
              <span class="role-badge role-${profile!.role}">${ROLE_LABEL[profile!.role]}</span>
              ${profile!.studentTag ? `<span class="tag-badge">${profile!.studentTag}</span>` : ''}
            </div>
          </div>
        </div>

        <div class="mode-switch">
          <button type="button" class="mode-tab${tab === 'info' ? ' is-active' : ''}" data-tab="info">Personal info</button>
          <button type="button" class="mode-tab${tab === 'security' ? ' is-active' : ''}" data-tab="security">Security</button>
        </div>

        ${tab === 'info' ? paintInfoTab() : paintSecurityTab()}
      </div>
    `

    root.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        tab = btn.dataset.tab as Tab
        paint()
      })
    })

    if (tab === 'info') wireInfoTab()
    else wireSecurityTab()
  }

  function paintInfoTab() {
    return `
      <div class="class-panel">
        <h2>Display name</h2>
        <form id="nameForm" class="inline-form">
          <input type="text" id="nameInput" value="${escapeHtml(profile!.displayName)}" />
          <button type="submit" class="primary-button small">Save</button>
        </form>
      </div>
      <div class="class-panel">
        <h2>Bio</h2>
        <form id="bioForm" class="inline-form-stack">
          <textarea id="bioInput" rows="3" placeholder="Say a little about yourself\u2014 optional.">${escapeHtml(profile!.bio ?? '')}</textarea>
          <button type="submit" class="primary-button small" style="align-self:flex-start">Save bio</button>
        </form>
      </div>
      <p class="empty-note" id="infoStatus"></p>
    `
  }

  function paintSecurityTab() {
    return `
      <div class="class-panel">
        <h2>Change password</h2>
        <form id="passwordForm" class="inline-form-stack">
          <input type="password" id="newPassInput" placeholder="New password" minlength="6" required />
          <input type="password" id="confirmPassInput" placeholder="Confirm new password" minlength="6" required />
          <button type="submit" class="primary-button small" style="align-self:flex-start">Update password</button>
        </form>
        <div class="divider"><span>or</span></div>
        <button class="link-button" id="resetPasswordBtn">Email me a password reset link instead</button>
        <p class="empty-note" id="securityStatus"></p>
      </div>
      <div class="class-panel">
        <h2>Email</h2>
        <p class="empty-note">${escapeHtml(profile!.email)} \u2014 email can\u2019t be changed here yet.</p>
      </div>
    `
  }

  function wireInfoTab() {
    const statusEl = root.querySelector<HTMLParagraphElement>('#infoStatus')!
    root.querySelector<HTMLFormElement>('#nameForm')?.addEventListener('submit', async (e) => {
      e.preventDefault()
      const input = root.querySelector<HTMLInputElement>('#nameInput')!
      if (!input.value.trim()) return
      await updateDisplayName(profile!.uid, input.value.trim())
      await refreshProfile()
      updateProfileChip()
      statusEl.textContent = 'Name updated.'
      paint()
    })
    root.querySelector<HTMLFormElement>('#bioForm')?.addEventListener('submit', async (e) => {
      e.preventDefault()
      const input = root.querySelector<HTMLTextAreaElement>('#bioInput')!
      await updateBio(profile!.uid, input.value.trim())
      await refreshProfile()
      statusEl.textContent = 'Bio updated.'
    })
  }

  function wireSecurityTab() {
    const statusEl = root.querySelector<HTMLParagraphElement>('#securityStatus')!
    root.querySelector<HTMLFormElement>('#passwordForm')?.addEventListener('submit', async (e) => {
      e.preventDefault()
      statusEl.textContent = ''
      const newPass = root.querySelector<HTMLInputElement>('#newPassInput')!
      const confirmPass = root.querySelector<HTMLInputElement>('#confirmPassInput')!
      if (newPass.value !== confirmPass.value) {
        statusEl.textContent = 'Passwords don\u2019t match.'
        return
      }
      try {
        await changePassword(newPass.value)
        statusEl.textContent = 'Password updated.'
        newPass.value = ''
        confirmPass.value = ''
      } catch (err: any) {
        statusEl.textContent = describeAuthError(err?.code ?? '')
      }
    })
    root.querySelector('#resetPasswordBtn')?.addEventListener('click', async () => {
      await requestPasswordReset(profile!.email)
      statusEl.textContent = 'Password reset email sent \u2014 check your inbox.'
    })
  }

  paint()
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}
