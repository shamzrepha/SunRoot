import { session } from '../accounts/Session'
import { listClassSuggestions, markSuggestionReviewed } from '../accounts/ClassroomService'
import type { ClassSuggestion } from '../accounts/types'

export async function renderAdmin(root: HTMLElement) {
  const profile = session.profile
  if (!profile?.isAdmin) {
    root.innerHTML = `<div class="screen"><p class="empty-note">You don\u2019t have access to this page.</p></div>`
    return
  }

  root.innerHTML = `<div class="screen"><p class="empty-note">Loading admin dashboard\u2026</p></div>`

  const suggestions = await listClassSuggestions()
  paint(root, suggestions)
}

function paint(root: HTMLElement, suggestions: ClassSuggestion[]) {
  const newSuggestions = suggestions.filter((s) => s.status === 'new')
  const reviewedSuggestions = suggestions.filter((s) => s.status === 'reviewed')

  root.innerHTML = `
    <div class="screen">
      <div class="lab-header">
        <div><h1>Admin</h1><p>Class-topic requests from teachers.</p></div>
      </div>

      <div class="class-panel">
        <h2>New class suggestions (${newSuggestions.length})</h2>
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
    </div>
  `

  root.querySelectorAll<HTMLElement>('.suggestion-card').forEach((card) => {
    card.querySelector('.reviewed-btn')?.addEventListener('click', async () => {
      await markSuggestionReviewed(card.dataset.id!)
      const updated = suggestions.map((s) => (s.id === card.dataset.id ? { ...s, status: 'reviewed' as const } : s))
      paint(root, updated)
    })
  })
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}
