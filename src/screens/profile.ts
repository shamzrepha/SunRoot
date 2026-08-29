import { session, refreshProfile } from '../accounts/Session'
import { updateDisplayName, updateBio, changePassword, requestPasswordReset, describeAuthError } from '../accounts/AuthService'
import { updateProfileChip } from '../game/shell'
import {
  listIncomingRequests,
  listOutgoingRequests,
  listFriendUids,
  respondToFriendRequest,
  sendFriendRequest,
  searchUsersByName,
} from '../accounts/FriendService'
import { fetchUsersByIds } from '../accounts/ClassroomService'
import type { UserProfile } from '../accounts/types'

type Tab = 'info' | 'security' | 'friends'

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
        <div class="lab-header"><div><h1>Profile</h1><p>Manage how you show up on SunRoot, your friends, and your account security.</p></div></div>

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
          <button type="button" class="mode-tab${tab === 'friends' ? ' is-active' : ''}" data-tab="friends">Friends</button>
          <button type="button" class="mode-tab${tab === 'security' ? ' is-active' : ''}" data-tab="security">Security</button>
        </div>

        <div id="tabHost">${tab === 'info' ? paintInfoTab() : tab === 'security' ? paintSecurityTab() : `<p class="empty-note">Loading\u2026</p>`}</div>
      </div>
    `

    root.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        tab = btn.dataset.tab as Tab
        paint()
      })
    })

    if (tab === 'info') wireInfoTab()
    else if (tab === 'security') wireSecurityTab()
    else paintFriendsTab()
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

  async function paintFriendsTab() {
    const host = root.querySelector<HTMLElement>('#tabHost')!
    const [incoming, outgoing, friendUids] = await Promise.all([
      listIncomingRequests(profile!.uid),
      listOutgoingRequests(profile!.uid),
      listFriendUids(profile!.uid),
    ])
    const friends = await fetchUsersByIds(friendUids)

    host.innerHTML = `
      <div class="class-panel">
        <h2>Find friends</h2>
        <form id="searchForm" class="inline-form">
          <input type="text" id="searchInput" placeholder="Search by name\u2026" />
          <button type="submit" class="ghost-button">Search</button>
        </form>
        <div id="searchResults"></div>
      </div>

      ${
        incoming.length
          ? `<div class="class-panel">
              <h2>Requests (${incoming.length})</h2>
              <ul class="roster-list">
                ${incoming.map((r) => `<li data-req="${r.id}"><span>${escapeHtml(r.fromName)}</span><div class="invite-actions"><button class="ghost-button small accept-req-btn">Accept</button><button class="ghost-button small decline-req-btn">Decline</button></div></li>`).join('')}
              </ul>
            </div>`
          : ''
      }

      <div class="class-panel">
        <h2>Friends (${friends.length})</h2>
        ${
          friends.length
            ? `<div class="team-members">${friends.map((f) => `<span class="team-member-chip">${escapeHtml(f.displayName)}</span>`).join('')}</div>`
            : `<p class="empty-note">No friends yet \u2014 search above to add some.</p>`
        }
        ${outgoing.length ? `<p class="empty-note" style="margin-top:8px">${outgoing.length} request${outgoing.length === 1 ? '' : 's'} sent, waiting on a reply.</p>` : ''}
      </div>
    `

    host.querySelectorAll<HTMLElement>('[data-req]').forEach((li) => {
      li.querySelector('.accept-req-btn')?.addEventListener('click', async () => {
        await respondToFriendRequest(li.dataset.req!, true)
        paintFriendsTab()
      })
      li.querySelector('.decline-req-btn')?.addEventListener('click', async () => {
        await respondToFriendRequest(li.dataset.req!, false)
        paintFriendsTab()
      })
    })

    host.querySelector<HTMLFormElement>('#searchForm')!.addEventListener('submit', async (e) => {
      e.preventDefault()
      const input = host.querySelector<HTMLInputElement>('#searchInput')!
      const resultsEl = host.querySelector<HTMLElement>('#searchResults')!
      if (!input.value.trim()) return
      resultsEl.innerHTML = `<p class="empty-note">Searching\u2026</p>`
      const results = await searchUsersByName(input.value, profile!.uid)
      resultsEl.innerHTML = results.length
        ? `<ul class="roster-list" id="searchList">
            ${results
              .map(
                (u) => `<li data-uid="${u.uid}"><span>${escapeHtml(u.displayName)} <span class="empty-note">${u.role}</span></span>
                  <button class="ghost-button small add-friend-btn">Add friend</button></li>`,
              )
              .join('')}
          </ul>`
        : `<p class="empty-note">No one found with that name.</p>`

      resultsEl.querySelectorAll<HTMLElement>('[data-uid]').forEach((li) => {
        const target = results.find((u: UserProfile) => u.uid === li.dataset.uid)
        li.querySelector('.add-friend-btn')?.addEventListener('click', async (e) => {
          if (!target) return
          const btn = e.currentTarget as HTMLButtonElement
          btn.disabled = true
          btn.textContent = 'Sending\u2026'
          try {
            const result = await sendFriendRequest({ uid: profile!.uid, displayName: profile!.displayName }, { uid: target.uid, displayName: target.displayName })
            btn.textContent = { sent: 'Sent', already_pending: 'Pending', already_friends: 'Already friends', self: 'That\u2019s you' }[result]
          } catch (err) {
            console.error('SunRoot: send friend request failed', err)
            btn.textContent = 'Failed \u2014 try again'
            btn.disabled = false
          }
        })
      })
    })
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
