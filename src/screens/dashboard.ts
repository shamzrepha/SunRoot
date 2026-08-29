import { CONCEPTS, learner, masteryOf } from '../learning/LearnerModel'
import { session, refreshProfile } from '../accounts/Session'
import { listClassroomsForUser } from '../accounts/ClassroomService'
import { updateDisplayName, requestPasswordReset } from '../accounts/AuthService'

export function renderDashboard(
  root: HTMLElement,
  nav: { toClasses: () => void; toFindClass: () => void; onLogout: () => void; toAdmin: () => void },
) {
  const profile = session.profile
  if (!profile) return

  root.innerHTML = `<div class="screen dash-screen"><p class="empty-note">Loading your dashboard\u2026</p></div>`

  const engaged = CONCEPTS.filter((c) => {
    const st = learner.concepts[c.id]
    return st.correct + st.incorrect > 0
  })
  const strengths = [...engaged].sort((a, b) => masteryOf(b.id) - masteryOf(a.id)).filter((c) => masteryOf(c.id) >= 0.6).slice(0, 3)
  const focusAreas = [...engaged].sort((a, b) => masteryOf(a.id) - masteryOf(b.id)).filter((c) => masteryOf(c.id) < 0.6).slice(0, 3)
  const mastered = engaged.filter((c) => masteryOf(c.id) >= 0.85).length

  listClassroomsForUser(profile).then((classrooms) => {
    const isTeacher = profile.role === 'teacher'
    root.innerHTML = `
      <div class="screen dash-screen">
        <div class="lab-header">
          <div>
            <h1>Welcome back, ${escapeHtml(profile.displayName.split(' ')[0])}</h1>
            <p>${isTeacher ? 'Here\u2019s how your classes are doing.' : 'Here\u2019s where you stand and what to work on next.'}</p>
          </div>
          ${profile.studentTag ? `<div class="class-stat"><div class="class-figure tag-figure">${profile.studentTag}</div><div class="class-caption">your tag</div></div>` : ''}
        </div>

        ${
          !profile.verified
            ? `<div class="verify-banner">Your account is pending admin verification. You have full access to the SunRoot Original demo class in the meantime \u2014 open it from <strong>My Classes</strong>.</div>`
            : ''
        }
        ${profile.isAdmin ? `<div class="admin-banner">You have admin access. <button class="link-button" id="toAdminBtn">Open the admin dashboard \u2192</button></div>` : ''}

        <div class="dash-grid">
          <div class="teach-card">
            <div class="teach-tag">${isTeacher ? 'CLASSES TEACHING' : 'CLASSES ENROLLED'}</div>
            <div class="class-figure">${classrooms.length}</div>
          </div>
          ${
            !isTeacher
              ? `<div class="teach-card">
                  <div class="teach-tag">CONCEPTS MASTERED</div>
                  <div class="class-figure">${mastered} / ${CONCEPTS.length}</div>
                </div>`
              : ''
          }
        </div>

        ${
          !isTeacher
            ? `<div class="teacher-body">
                <section class="class-panel">
                  <h2>Your strong suit</h2>
                  ${
                    strengths.length
                      ? `<div class="class-bars">${strengths
                          .map((c) => {
                            const m = masteryOf(c.id)
                            return `<div class="class-bar-row"><span class="cb-name">${escapeHtml(c.label)}</span>
                              <div class="cb-track"><div class="cb-fill high" style="width:${m * 100}%"></div></div>
                              <span class="cb-pct">${Math.round(m * 100)}%</span></div>`
                          })
                          .join('')}</div>`
                      : `<p class="empty-note">Nothing mastered yet \u2014 open a class to get started.</p>`
                  }
                </section>
                <aside class="teacher-panel">
                  <div class="teach-card recommend">
                    <div class="teach-tag">FOCUS ON NEXT</div>
                    ${
                      focusAreas.length
                        ? focusAreas
                            .map((c) => `<p class="teach-body"><strong>${escapeHtml(c.label)}</strong> \u2014 ${Math.round(masteryOf(c.id) * 100)}%</p>`)
                            .join('')
                        : `<p class="teach-body">No weak spots detected yet.</p>`
                    }
                  </div>
                </aside>
              </div>`
            : `<div class="class-panel">
                <h2>Getting started</h2>
                <p>Head to My Classes to create a class, invite students by their tag, and set up teams.</p>
              </div>`
        }

        <div class="dash-actions">
          <button class="primary-button" id="toClasses">My Classes</button>
          ${!isTeacher ? `<button class="ghost-button" id="toFind">Find a Class</button>` : ''}
          <button class="ghost-button" id="toLogout">Log out</button>
        </div>

        <div class="class-panel account-panel">
          <h2>Account</h2>
          <form id="nameForm" class="inline-form">
            <input type="text" id="nameInput" value="${escapeHtml(profile.displayName)}" />
            <button type="submit" class="ghost-button small">Save name</button>
          </form>
          <button class="link-button" id="resetPasswordBtn">Send password reset email</button>
          <p class="empty-note" id="accountStatus"></p>
        </div>
      </div>
    `

    root.querySelector('#toClasses')?.addEventListener('click', nav.toClasses)
    root.querySelector('#toFind')?.addEventListener('click', nav.toFindClass)
    root.querySelector('#toLogout')?.addEventListener('click', nav.onLogout)
    root.querySelector('#toAdminBtn')?.addEventListener('click', nav.toAdmin)

    const statusEl = root.querySelector<HTMLParagraphElement>('#accountStatus')!

    root.querySelector<HTMLFormElement>('#nameForm')?.addEventListener('submit', async (e) => {
      e.preventDefault()
      const input = root.querySelector<HTMLInputElement>('#nameInput')!
      if (!input.value.trim()) return
      await updateDisplayName(profile.uid, input.value.trim())
      await refreshProfile()
      statusEl.textContent = 'Name updated.'
    })

    root.querySelector('#resetPasswordBtn')?.addEventListener('click', async () => {
      await requestPasswordReset(profile.email)
      statusEl.textContent = 'Password reset email sent \u2014 check your inbox.'
    })
  })
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}
