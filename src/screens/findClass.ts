import { session, refreshProfile } from '../accounts/Session'
import { listPublicClassrooms, joinPublicClassroom } from '../accounts/ClassroomService'

export async function renderFindClass(root: HTMLElement) {
  const profile = session.profile
  if (!profile) return

  root.innerHTML = `<div class="screen"><p class="empty-note">Loading classes\u2026</p></div>`

  try {
    const classrooms = await listPublicClassrooms()

    root.innerHTML = `
      <div class="screen">
        <div class="lab-header">
          <div><h1>Find a Class</h1><p>Open classes anyone can join and learn from.</p></div>
        </div>
        <div class="dash-grid two-col">
          ${
            classrooms.length
              ? classrooms
                  .map((c) => {
                    const alreadyIn = profile.classroomIds?.includes(c.id)
                    const count = c.studentIds?.length ?? 0
                    return `<div class="class-panel" data-classroom="${c.id}">
                      <h2>${escapeHtml(c.name || 'Untitled Class')} ${c.isDemo ? '<span class="tag-badge">Demo</span>' : ''}</h2>
                      <p class="empty-note">by ${escapeHtml(c.teacherName || 'Instructor')} \u00b7 ${escapeHtml(c.topic || 'General')}</p>
                      ${c.description ? `<p class="empty-note">${escapeHtml(c.description)}</p>` : ''}
                      <p class="empty-note">${count} student${count === 1 ? '' : 's'} enrolled</p>
                      <button class="primary-button join-btn" ${alreadyIn ? 'disabled' : ''}>
                        ${alreadyIn ? 'Already joined' : 'Join class'}
                      </button>
                    </div>`
                  })
                  .join('')
              : `<p class="empty-note">No public classes available right now.</p>`
          }
        </div>
      </div>
    `

    root.querySelectorAll<HTMLElement>('[data-classroom]').forEach((card) => {
      card.querySelector('.join-btn')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget as HTMLButtonElement
        btn.disabled = true
        btn.textContent = 'Joining\u2026'
        try {
          await joinPublicClassroom(card.dataset.classroom!, profile.uid)
          await refreshProfile()
          btn.textContent = 'Already joined'
        } catch (err) {
          console.error(err)
          btn.disabled = false
          btn.textContent = 'Join class'
        }
      })
    })
  } catch (err) {
    console.error('SunRoot: failed to load public classes', err)
    root.innerHTML = `
      <div class="screen">
        <div class="class-panel">
          <h2>Couldn\u2019t load classes</h2>
          <p class="empty-note">Something went wrong reaching the database. Please try again.</p>
          <button class="ghost-button" id="retryFindBtn">Try again</button>
        </div>
      </div>
    `
    root.querySelector('#retryFindBtn')?.addEventListener('click', () => renderFindClass(root))
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}
