import { CONCEPT_BY_ID } from '../learning/LearnerModel'
import { session } from '../accounts/Session'
import { listClassroomsForUser, DEMO_CLASSROOM_ID } from '../accounts/ClassroomService'
import { fetchProgressSnapshot } from '../accounts/ProgressService'

export function renderDashboard(
  root: HTMLElement,
  nav: { toClasses: () => void; toFindClass: () => void; onLogout: () => void; toAdmin: () => void },
) {
  const profile = session.profile
  if (!profile) return

  root.innerHTML = `<div class="screen dash-screen"><p class="empty-note">Loading your dashboard\u2026</p></div>`

  const isTeacher = profile.role === 'teacher'

  Promise.all([
    listClassroomsForUser(profile),
    // The dashboard is not a workshop screen, so it deliberately does NOT
    // read the local farm/learner singletons — those reflect whichever
    // class was last open in this browser tab, with no indication of which
    // one, and never get cleared on leaving a workshop. Reading the demo
    // class's real Firestore snapshot instead means what's shown here is
    // honest and always tied to a specific, known class.
    isTeacher ? Promise.resolve(null) : fetchProgressSnapshot(DEMO_CLASSROOM_ID, profile.uid),
  ]).then(([classrooms, demoProgress]) => {
    const engaged = demoProgress ? Object.entries(demoProgress.conceptMastery).filter(([, c]) => c.engaged) : []
    const strengths = [...engaged].sort((a, b) => b[1].mastery - a[1].mastery).filter(([, c]) => c.mastery >= 0.6).slice(0, 3)
    const focusAreas = [...engaged].sort((a, b) => a[1].mastery - b[1].mastery).filter(([, c]) => c.mastery < 0.6).slice(0, 3)
    const mastered = demoProgress?.conceptsMastered ?? 0
    const totalConcepts = demoProgress?.totalConcepts ?? 0
    const label = (id: string) => CONCEPT_BY_ID.get(id as any)?.label ?? id

    root.innerHTML = `
      <div class="screen dash-screen">
        <div class="lab-header">
          <div>
            <h1>Welcome back, ${escapeHtml(profile.displayName.split(' ')[0])}</h1>
            <p>${isTeacher ? 'Here\u2019s how your classes are doing.' : 'Here\u2019s where you stand and what to work on next.'}</p>
          </div>
          ${profile.studentTag ? `<div class="class-stat"><div class="class-figure tag-figure">${profile.studentTag}</div><div class="class-caption">your tag</div></div>` : ''}
        </div>

        ${profile.isAdmin ? `<div class="admin-banner">You have admin access. <button class="link-button" id="toAdminBtn">Open the admin dashboard \u2192</button></div>` : ''}

        <div class="dash-grid">
          <div class="teach-card">
            <div class="teach-tag">${isTeacher ? 'CLASSES TEACHING' : 'CLASSES ENROLLED'}</div>
            <div class="class-figure">${classrooms.length}</div>
          </div>
          ${
            !isTeacher
              ? `<div class="teach-card">
                  <div class="teach-tag">CONCEPTS MASTERED \u00b7 DEMO CLASS</div>
                  <div class="class-figure">${mastered} / ${totalConcepts || 10}</div>
                </div>`
              : ''
          }
        </div>

        ${
          !isTeacher
            ? demoProgress && engaged.length
              ? `<div class="teacher-body">
                  <section class="class-panel">
                    <h2>Your strong suit \u2014 SunRoot Original</h2>
                    ${
                      strengths.length
                        ? `<div class="class-bars">${strengths
                            .map(
                              ([id, c]) => `<div class="class-bar-row"><span class="cb-name">${escapeHtml(label(id))}</span>
                                <div class="cb-track"><div class="cb-fill high" style="width:${c.mastery * 100}%"></div></div>
                                <span class="cb-pct">${Math.round(c.mastery * 100)}%</span></div>`,
                            )
                            .join('')}</div>`
                        : `<p class="empty-note">Nothing mastered yet \u2014 keep building.</p>`
                    }
                  </section>
                  <aside class="teacher-panel">
                    <div class="teach-card recommend">
                      <div class="teach-tag">FOCUS ON NEXT</div>
                      ${
                        focusAreas.length
                          ? focusAreas
                              .map(([id, c]) => `<p class="teach-body"><strong>${escapeHtml(label(id))}</strong> \u2014 ${Math.round(c.mastery * 100)}%</p>`)
                              .join('')
                          : `<p class="teach-body">No weak spots detected yet.</p>`
                      }
                    </div>
                  </aside>
                </div>`
              : `<div class="class-panel">
                  <h2>Get started</h2>
                  <p>Head to <strong>My Classes</strong> and open the SunRoot Original demo class to start building \u2014 your progress will show up here once you do.</p>
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
      </div>
    `

    root.querySelector('#toClasses')?.addEventListener('click', nav.toClasses)
    root.querySelector('#toFind')?.addEventListener('click', nav.toFindClass)
    root.querySelector('#toLogout')?.addEventListener('click', nav.onLogout)
    root.querySelector('#toAdminBtn')?.addEventListener('click', nav.toAdmin)
  })
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}
