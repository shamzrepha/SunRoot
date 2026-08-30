import { CONCEPTS, CONCEPT_BY_ID } from '../learning/LearnerModel'
import { session } from '../accounts/Session'
import { listClassroomsForUser, DEMO_CLASSROOM_ID } from '../accounts/ClassroomService'
import { fetchProgressSnapshot } from '../accounts/ProgressService'

export function renderDashboard(
  root: HTMLElement,
  nav: { toClasses: () => void; toFindClass: () => void; onLogout: () => void; toAdmin: () => void; toDemoWorkshop: () => void },
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
    const xp = demoProgress?.xp ?? 0
    const rank = demoProgress?.rank ?? 'Apprentice'
    const overallMastery = demoProgress?.overallMastery ?? 0
    const label = (id: string) => CONCEPT_BY_ID.get(id as any)?.label ?? id

    root.innerHTML = `
      <div class="screen dash-screen">
        <div class="lab-header">
          <div>
            <h1>Welcome back, ${escapeHtml(profile.displayName.split(' ')[0])}</h1>
            <p>${isTeacher ? 'Here\u2019s how your classes are doing.' : 'Ready to build something amazing today?'}</p>
          </div>
          ${profile.studentTag ? `<div class="class-stat"><div class="class-figure tag-figure">${profile.studentTag}</div><div class="class-caption">your tag</div></div>` : ''}
        </div>

        ${profile.isAdmin ? `<div class="admin-banner">You have admin access. <button class="link-button" id="toAdminBtn">Open the admin dashboard \u2192</button></div>` : ''}

        <div class="stat-row">
          ${
            !isTeacher
              ? `
                <div class="stat-tile">
                  <div class="stat-icon stat-icon-gold">${starIcon()}</div>
                  <div><div class="stat-value">${xp}</div><div class="stat-label">Total XP</div></div>
                </div>
                <div class="stat-tile">
                  <div class="stat-icon stat-icon-orange">${boltIcon()}</div>
                  <div><div class="stat-value">${escapeHtml(rank)}</div><div class="stat-label">Current rank</div></div>
                </div>
                <div class="stat-tile">
                  <div class="stat-icon stat-icon-green">${checkIcon()}</div>
                  <div><div class="stat-value">${Math.round(overallMastery * 100)}%</div><div class="stat-label">Overall mastery</div></div>
                </div>
              `
              : ''
          }
          <div class="stat-tile">
            <div class="stat-icon stat-icon-blue">${bookIcon()}</div>
            <div><div class="stat-value">${classrooms.length}</div><div class="stat-label">${isTeacher ? 'Classes teaching' : 'Classes enrolled'}</div></div>
          </div>
        </div>

        ${
          !isTeacher
            ? `<div class="dash-two-col">
                <div class="class-panel continue-card">
                  <h2>Continue learning</h2>
                  <div class="continue-thumb">${farmThumb()}</div>
                  <div class="continue-title">SunRoot Original</div>
                  <div class="continue-sub">Solar + Irrigation Systems</div>
                  <div class="cb-track continue-track"><div class="cb-fill high" style="width:${Math.round(overallMastery * 100)}%"></div></div>
                  <div class="continue-pct">${Math.round(overallMastery * 100)}%</div>
                  <button class="primary-button" id="toWorkshopBtn" style="width:100%;margin-top:12px">Open Workshop \u2192</button>
                </div>

                <div class="class-panel">
                  <h2>Your progress overview</h2>
                  ${radarChart(engaged.length ? engaged : sampleConcepts())}
                  <div class="progress-lists">
                    <div>
                      <div class="progress-list-title strengths-title">Strengths</div>
                      ${strengths.length ? strengths.map(([id]) => `<div class="progress-list-row"><span class="dot dot-green"></span>${escapeHtml(label(id))}</div>`).join('') : `<p class="empty-note">None yet</p>`}
                    </div>
                    <div>
                      <div class="progress-list-title focus-title">Focus areas</div>
                      ${focusAreas.length ? focusAreas.map(([id]) => `<div class="progress-list-row"><span class="dot dot-gold"></span>${escapeHtml(label(id))}</div>`).join('') : `<p class="empty-note">None yet</p>`}
                    </div>
                  </div>
                </div>
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
    root.querySelector('#toWorkshopBtn')?.addEventListener('click', nav.toDemoWorkshop)
  })
}

/** Falls back to the first six concepts at zero mastery so the radar always renders a shape, even before any activity. */
function sampleConcepts(): [string, { mastery: number }][] {
  return CONCEPTS.slice(0, 6).map((c) => [c.id, { mastery: 0 }])
}

function radarChart(entries: [string, { mastery: number }][]): string {
  const axes = entries.slice(0, 6)
  const n = Math.max(axes.length, 3)
  const cx = 110
  const cy = 100
  const maxR = 72
  const angleFor = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2

  const ringPath = (r: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = angleFor(i)
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`
    }).join(' ')

  const dataPoints = axes
    .map(([, c], i) => {
      const a = angleFor(i)
      const r = maxR * Math.max(0.06, c.mastery)
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`
    })
    .join(' ')

  const labels = axes
    .map(([id], i) => {
      const a = angleFor(i)
      const lx = cx + (maxR + 22) * Math.cos(a)
      const ly = cy + (maxR + 14) * Math.sin(a)
      const anchor = Math.cos(a) > 0.3 ? 'start' : Math.cos(a) < -0.3 ? 'end' : 'middle'
      const text = CONCEPT_BY_ID.get(id as any)?.label ?? id
      return `<text x="${lx}" y="${ly}" text-anchor="${anchor}" class="radar-label">${escapeHtml(text.split(' ')[0])}</text>`
    })
    .join('')

  return `
    <svg viewBox="0 0 220 200" class="radar-svg">
      <polygon points="${ringPath(maxR)}" class="radar-ring" />
      <polygon points="${ringPath(maxR * 0.66)}" class="radar-ring" />
      <polygon points="${ringPath(maxR * 0.33)}" class="radar-ring" />
      <polygon points="${dataPoints}" class="radar-fill" />
      ${labels}
    </svg>
  `
}

function starIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="#E8A33D"><path d="M12 2l2.9 6.6L22 9.3l-5 4.9 1.2 7-6.2-3.4L5.8 21l1.2-7-5-4.9 7.1-.7L12 2z"/></svg>`
}
function boltIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="#E8813D"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>`
}
function checkIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#1FA35C" stroke-width="2.4" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg>`
}
function bookIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#3B82C4" stroke-width="2"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20"/></svg>`
}
function farmThumb() {
  return `<svg viewBox="0 0 260 100" preserveAspectRatio="xMidYMid slice">
    <rect width="260" height="100" fill="#123024" />
    <circle cx="215" cy="24" r="14" fill="#E8A33D" />
    <rect x="30" y="30" width="46" height="30" rx="2" fill="#1B3A2C" stroke="#2FA360" stroke-width="1.5" />
    <rect x="90" y="50" width="28" height="20" rx="2" fill="#2FA360" />
    <rect x="130" y="60" width="90" height="26" fill="#1B3A2C" />
    <circle cx="145" cy="60" r="4" fill="#4FD67A" /><circle cx="165" cy="60" r="4" fill="#4FD67A" /><circle cx="185" cy="60" r="4" fill="#4FD67A" /><circle cx="205" cy="60" r="4" fill="#4FD67A" />
  </svg>`
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}
