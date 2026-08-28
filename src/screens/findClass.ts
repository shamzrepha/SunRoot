import { session, refreshProfile } from '../accounts/Session'
import { listPublicClassrooms, joinPublicClassroom } from '../accounts/ClassroomService'

export async function renderFindClass(root: HTMLElement) {
  const profile = session.profile
  if (!profile) return

  root.innerHTML = `<div class="screen"><p class="empty-note">Loading\u2026</p></div>`
  const classrooms = await listPublicClassrooms()

  root.innerHTML = `
    <div class="screen">
      <div class="lab-header">
        <div><h1>Find a Class</h1><p>Open classes anyone can join and learn from.</p></div>
      </div>
      <div class="dash-grid two-col">
        ${classrooms
          .map((c) => {
            const alreadyIn = profile.classroomIds?.includes(c.id)
            return `<div class="class-panel" data-classroom="${c.id}">
              <h2>${escapeHtml(c.name)} ${c.isDemo ? '<span class="tag-badge">Demo</span>' : ''}</h2>
              ${c.description ? `<p class="empty-note">${escapeHtml(c.description)}</p>` : ''}
              <p class="empty-note">${c.studentIds.length} student${c.studentIds.length === 1 ? '' : 's'} enrolled</p>
              <button class="primary-button join-btn" ${alreadyIn ? 'disabled' : ''}>${alreadyIn ? 'Already joined' : 'Join class'}</button>
            </div>`
          })
          .join('')}
      </div>
    </div>
  `

  root.querySelectorAll<HTMLElement>('[data-classroom]').forEach((card) => {
    card.querySelector('.join-btn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget as HTMLButtonElement
      btn.disabled = true
      btn.textContent = 'Joining\u2026'
      await joinPublicClassroom(card.dataset.classroom!, profile.uid)
      await refreshProfile()
      btn.textContent = 'Already joined'
    })
  })
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}
