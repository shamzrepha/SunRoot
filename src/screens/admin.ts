import { session } from '../accounts/Session'
import { listClassSuggestions, markSuggestionReviewed } from '../accounts/ClassroomService'
import { fetchStats, fetchAllUsers, removeUserAccess } from '../accounts/AdminService'
import type { UserStats } from '../accounts/AdminService'
import { listMessageReports, dismissReport, removeReportedMessage } from '../accounts/MessageService'
import type { ClassSuggestion, MessageReport, UserProfile } from '../accounts/types'

type Tab = 'overview' | 'users' | 'suggestions' | 'reports'

export async function renderAdmin(root: HTMLElement) {
  const profile = session.profile
  if (!profile?.isAdmin) {
    root.innerHTML = `<div class="screen"><p class="empty-note">You don\u2019t have access to this page.</p></div>`
    return
  }

  root.innerHTML = `<div class="screen"><p class="empty-note">Loading admin dashboard\u2026</p></div>`

  const [stats, users, suggestions, reports] = await Promise.all([
    fetchStats(),
    fetchAllUsers(),
    listClassSuggestions(),
    listMessageReports(),
  ])

  let tab: Tab = 'overview'
  let search = ''
  let roleFilter: 'all' | UserProfile['role'] = 'all'

  function paint() {
    const newReportCount = reports.filter((r) => r.status === 'new').length
    root.innerHTML = `
      <div class="screen">
        <div class="lab-header">
          <div><h1>Admin</h1><p>Platform-wide data: users, classes, teacher requests, and moderation.</p></div>
        </div>

        <div class="mode-switch">
          <button type="button" class="mode-tab${tab === 'overview' ? ' is-active' : ''}" data-tab="overview">Overview</button>
          <button type="button" class="mode-tab${tab === 'users' ? ' is-active' : ''}" data-tab="users">Users (${users.length})</button>
          <button type="button" class="mode-tab${tab === 'suggestions' ? ' is-active' : ''}" data-tab="suggestions">Suggestions (${suggestions.filter((s) => s.status === 'new').length})</button>
          <button type="button" class="mode-tab${tab === 'reports' ? ' is-active' : ''}" data-tab="reports">Reports ${newReportCount ? `(${newReportCount})` : ''}</button>
        </div>

        ${tab === 'overview' ? paintOverview(stats) : ''}
        ${tab === 'users' ? paintUsers(users, search, roleFilter) : ''}
        ${tab === 'suggestions' ? paintSuggestions(suggestions) : ''}
        ${tab === 'reports' ? paintReports(reports) : ''}
      </div>
    `

    root.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        tab = btn.dataset.tab as Tab
        paint()
      })
    })

    if (tab === 'users') wireUsers()
    if (tab === 'suggestions') wireSuggestions()
    if (tab === 'reports') wireReports()
  }

  function paintOverview(s: UserStats) {
    return `
      <div class="dash-grid">
        <div class="teach-card"><div class="teach-tag">TOTAL USERS</div><div class="class-figure">${s.total}</div></div>
        <div class="teach-card"><div class="teach-tag">TEACHERS</div><div class="class-figure">${s.byRole.teacher}</div></div>
        <div class="teach-card"><div class="teach-tag">STUDENTS</div><div class="class-figure">${s.byRole.student}</div></div>
        <div class="teach-card"><div class="teach-tag">INDIVIDUALS</div><div class="class-figure">${s.byRole.individual}</div></div>
        <div class="teach-card"><div class="teach-tag">CLASSROOMS</div><div class="class-figure">${s.totalClassrooms}</div></div>
        <div class="teach-card"><div class="teach-tag">TEAMS</div><div class="class-figure">${s.totalTeams}</div></div>
      </div>
    `
  }

  function paintUsers(all: UserProfile[], q: string, role: 'all' | UserProfile['role']) {
    const filtered = all.filter((u) => {
      const matchesRole = role === 'all' || u.role === role
      const needle = q.trim().toLowerCase()
      const matchesSearch =
        !needle ||
        u.displayName.toLowerCase().includes(needle) ||
        u.email.toLowerCase().includes(needle) ||
        (u.studentTag ?? '').toLowerCase().includes(needle)
      return matchesRole && matchesSearch
    })

    return `
      <div class="class-panel">
        <div class="inline-form">
          <input type="text" id="userSearch" placeholder="Search by name, email, or tag\u2026" value="${escapeHtml(q)}" />
          <select id="roleFilter">
            <option value="all" ${role === 'all' ? 'selected' : ''}>All roles</option>
            <option value="teacher" ${role === 'teacher' ? 'selected' : ''}>Teachers</option>
            <option value="student" ${role === 'student' ? 'selected' : ''}>Students</option>
            <option value="individual" ${role === 'individual' ? 'selected' : ''}>Individuals</option>
          </select>
        </div>
        <ul class="roster-list" style="margin-top:12px">
          ${
            filtered.length
              ? filtered
                  .map(
                    (u) => `<li data-uid="${u.uid}" class="roster-row">
                      <div class="roster-identity">
                        <span>${escapeHtml(u.displayName)} ${u.isAdmin ? '<span class="tag-badge">Admin</span>' : ''}</span>
                        <span class="roster-progress">${u.role} \u00b7 ${escapeHtml(u.email)}${u.studentTag ? ` \u00b7 ${u.studentTag}` : ''}</span>
                      </div>
                      ${u.uid === session.profile!.uid ? '' : `<button class="ghost-button small danger-btn remove-user-btn">Remove</button>`}
                    </li>`,
                  )
                  .join('')
              : `<p class="empty-note">No users match.</p>`
          }
        </ul>
      </div>
    `
  }

  function paintSuggestions(suggestions: ClassSuggestion[]) {
    const newSuggestions = suggestions.filter((s) => s.status === 'new')
    const reviewedSuggestions = suggestions.filter((s) => s.status === 'reviewed')
    return `
      <div class="class-panel">
        <h2>New (${newSuggestions.length})</h2>
        ${
          newSuggestions.length
            ? newSuggestions
                .map(
                  (s) => `<div class="suggestion-card" data-id="${s.id}">
                    <div class="suggestion-title">${escapeHtml(s.title)}</div>
                    <div class="empty-note">from ${escapeHtml(s.teacherName)}</div>
                    <p>${escapeHtml(s.description)}</p>
                    <button class="ghost-button small reviewed-btn">Mark reviewed</button>
                  </div>`,
                )
                .join('')
            : `<p class="empty-note">No new suggestions.</p>`
        }
      </div>
      ${
        reviewedSuggestions.length
          ? `<div class="class-panel">
              <h2>Reviewed (${reviewedSuggestions.length})</h2>
              ${reviewedSuggestions
                .map((s) => `<div class="suggestion-card is-reviewed"><div class="suggestion-title">${escapeHtml(s.title)}</div><div class="empty-note">from ${escapeHtml(s.teacherName)}</div></div>`)
                .join('')}
            </div>`
          : ''
      }
    `
  }

  function paintReports(reports: MessageReport[]) {
    const newReports = reports.filter((r) => r.status === 'new')
    const reviewedReports = reports.filter((r) => r.status === 'reviewed')
    return `
      <div class="class-panel">
        <h2>New reports (${newReports.length})</h2>
        ${
          newReports.length
            ? newReports
                .map(
                  (r) => `<div class="suggestion-card" data-report="${r.id}" data-message="${r.messageId}">
                    <div class="empty-note">Message from ${escapeHtml(r.messageFrom)}, reported by ${escapeHtml(r.reporterName)}</div>
                    <div class="reported-message-text">${escapeHtml(r.messageText)}</div>
                    <div class="empty-note">Reason: ${escapeHtml(r.reason)}</div>
                    <div class="inline-form" style="margin-top:8px">
                      <button class="ghost-button small dismiss-report-btn">Dismiss</button>
                      <button class="ghost-button small danger-btn remove-message-btn">Delete message</button>
                    </div>
                  </div>`,
                )
                .join('')
            : `<p class="empty-note">No pending reports.</p>`
        }
      </div>
      ${
        reviewedReports.length
          ? `<div class="class-panel"><h2>Reviewed (${reviewedReports.length})</h2>${reviewedReports.map((r) => `<div class="suggestion-card is-reviewed"><div class="empty-note">${escapeHtml(r.messageFrom)}, reported by ${escapeHtml(r.reporterName)}</div></div>`).join('')}</div>`
          : ''
      }
    `
  }

  function wireUsers() {
    const searchInput = root.querySelector<HTMLInputElement>('#userSearch')!
    const roleSelect = root.querySelector<HTMLSelectElement>('#roleFilter')!
    searchInput.addEventListener('input', () => {
      search = searchInput.value
      paint()
      const el = root.querySelector<HTMLInputElement>('#userSearch')!
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    })
    roleSelect.addEventListener('change', () => {
      roleFilter = roleSelect.value as typeof roleFilter
      paint()
    })

    root.querySelectorAll<HTMLElement>('.roster-list li').forEach((li) => {
      li.querySelector('.remove-user-btn')?.addEventListener('click', async () => {
        const target = users.find((u) => u.uid === li.dataset.uid)
        if (!target) return
        const warning =
          target.role === 'teacher'
            ? `Remove ${target.displayName}? Their classes will stay but will no longer have an active teacher account attached. This can't be undone.`
            : `Remove ${target.displayName}? They'll be pulled out of every class and team. This can't be undone.`
        if (!confirm(warning)) return
        await removeUserAccess(target)
        const idx = users.findIndex((u) => u.uid === target.uid)
        if (idx >= 0) users.splice(idx, 1)
        stats.total--
        stats.byRole[target.role]--
        paint()
      })
    })
  }

  function wireSuggestions() {
    root.querySelectorAll<HTMLElement>('.suggestion-card').forEach((card) => {
      card.querySelector('.reviewed-btn')?.addEventListener('click', async () => {
        await markSuggestionReviewed(card.dataset.id!)
        const found = suggestions.find((s) => s.id === card.dataset.id)
        if (found) found.status = 'reviewed'
        paint()
      })
    })
  }

  function wireReports() {
    root.querySelectorAll<HTMLElement>('[data-report]').forEach((card) => {
      card.querySelector('.dismiss-report-btn')?.addEventListener('click', async () => {
        await dismissReport(card.dataset.report!)
        const found = reports.find((r) => r.id === card.dataset.report)
        if (found) found.status = 'reviewed'
        paint()
      })
      card.querySelector('.remove-message-btn')?.addEventListener('click', async () => {
        if (!confirm('Delete this message permanently?')) return
        await removeReportedMessage(card.dataset.report!, card.dataset.message!)
        const idx = reports.findIndex((r) => r.id === card.dataset.report)
        if (idx >= 0) reports.splice(idx, 1)
        paint()
      })
    })
  }

  paint()
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}
