import { CONCEPT_BY_ID } from '../learning/LearnerModel'
import { session } from '../accounts/Session'
import { listClassroomsForUser, DEMO_CLASSROOM_ID } from '../accounts/ClassroomService'
import { fetchProgressSnapshot } from '../accounts/ProgressService'

interface RadarMetric {
  label: string
  value: number // 0 to 1
}

export function renderDashboard(
  root: HTMLElement,
  nav: {
    toClasses: () => void
    toFindClass: () => void
    onLogout: () => void
    toAdmin: () => void
    toDemoWorkshop: () => void
  },
) {
  const profile = session.profile
  if (!profile) return

  root.innerHTML = `<div class="screen dash-screen"><p class="empty-note">Loading your portal…</p></div>`

  const isTeacher = profile.role === 'teacher'

  Promise.all([
    listClassroomsForUser(profile),
    isTeacher ? Promise.resolve(null) : fetchProgressSnapshot(DEMO_CLASSROOM_ID, profile.uid).catch(() => null),
  ])
    .then(([classrooms, demoProgress]) => {
      const enrolledCount = classrooms.length
      const xp = demoProgress?.xp ?? 0
      const overallMastery = demoProgress?.overallMastery ?? 0
      const rankTitle = demoProgress?.rank ?? 'Apprentice'
      const level = Math.max(1, Math.floor(xp / 100) + 1)
      const nextLevelXp = level * 100 - xp
      const firstName = (profile.displayName || (isTeacher ? 'Instructor' : 'Student')).split(' ')[0]

      // Extract real concept mastery or fallback to engineering concepts
      const conceptEntries = demoProgress?.conceptMastery
        ? Object.entries(demoProgress.conceptMastery).filter(([, c]) => c.engaged)
        : []

      const strengths = [...conceptEntries]
        .sort((a, b) => b[1].mastery - a[1].mastery)
        .filter(([, c]) => c.mastery >= 0.5)
        .slice(0, 3)

      const focusAreas = [...conceptEntries]
        .sort((a, b) => a[1].mastery - b[1].mastery)
        .filter(([, c]) => c.mastery < 0.5)
        .slice(0, 3)

      // Six radar axes for the cyber-physical solar-irrigation digital twin
      const radarAxes = [
        { id: 'solar', label: 'Solar & Power' },
        { id: 'circuit', label: 'Circuit & Pins' },
        { id: 'logic', label: 'Control Logic' },
        { id: 'hydraulics', label: 'Hydraulics' },
        { id: 'sensing', label: 'Soil Sensing' },
        { id: 'feedback', label: 'Feedback Loop' },
      ]

      const radarMetrics: RadarMetric[] = radarAxes.map((axis) => {
        const found = demoProgress?.conceptMastery?.[axis.id]
        return {
          label: axis.label,
          value: found?.mastery ?? Math.max(0.12, Math.min(0.95, overallMastery || 0.2)),
        }
      })

      root.innerHTML = `
        <div class="screen dash-screen dash-screen-v2">
          <!-- Top Header -->
          <div class="dash-v2-header">
            <div>
              <div class="dash-role-badge">${isTeacher ? 'Instructor & Lab Lead' : 'Engineering Student'}</div>
              <h1>${isTeacher ? 'Instructor Portal' : 'Student Portal'}</h1>
              <p class="dash-greeting">Welcome back, <strong>${escapeHtml(firstName)}</strong>! ${isTeacher ? 'Here is an overview of your active classes and cohorts.' : 'Track your concept mastery and continue your simulation design.'}</p>
            </div>
            <div class="dash-header-actions">
              ${profile.isAdmin ? `<button class="ghost-button small" id="toAdminBtn">🛡️ Admin</button>` : ''}
              <button class="primary-button" id="myClassesTopBtn">${isTeacher ? 'Manage Classes' : 'My Classes'}</button>
              ${!isTeacher ? `<button class="ghost-button" id="findClassTopBtn">Find a Class</button>` : ''}
            </div>
          </div>

          <!-- 4 Stat Summary Cards -->
          <div class="dash-v2-stats-grid">
            <div class="dash-stat-card">
              <div class="dash-stat-icon gold">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="#F5B942"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              </div>
              <div class="dash-stat-info">
                <div class="dash-stat-val">${xp}</div>
                <div class="dash-stat-label">Total XP</div>
                <div class="dash-stat-sub good">${xp > 0 ? '+120 this week' : 'Start learning!'}</div>
              </div>
            </div>

            <div class="dash-stat-card">
              <div class="dash-stat-icon green">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="#22C55E"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <div class="dash-stat-info">
                <div class="dash-stat-val">Level ${level}</div>
                <div class="dash-stat-label">${escapeHtml(rankTitle)}</div>
                <div class="dash-stat-sub">${nextLevelXp > 0 ? `${nextLevelXp} XP to next rank` : 'Top Rank'}</div>
              </div>
            </div>

            <div class="dash-stat-card">
              <div class="dash-stat-icon green">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="#22C55E"><circle cx="12" cy="12" r="10" stroke="#22C55E" stroke-width="2" fill="none"/><path d="M9 12l2 2 4-4" stroke="#22C55E" stroke-width="2" fill="none"/></svg>
              </div>
              <div class="dash-stat-info">
                <div class="dash-stat-val">${Math.round(overallMastery * 100)}%</div>
                <div class="dash-stat-label">Overall Mastery</div>
                <div class="dash-stat-sub good">${overallMastery > 0 ? '+5% recently' : 'Build to master'}</div>
              </div>
            </div>

            <div class="dash-stat-card">
              <div class="dash-stat-icon blue">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="#3B82F6"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              </div>
              <div class="dash-stat-info">
                <div class="dash-stat-val">${enrolledCount}</div>
                <div class="dash-stat-label">${isTeacher ? 'Classes Teaching' : 'Classes Enrolled'}</div>
                <div class="dash-stat-sub">${enrolledCount > 0 ? 'Active' : 'Browse classes'}</div>
              </div>
            </div>
          </div>

          <!-- Main 2-Column Grid -->
          <div class="dash-v2-main-grid">
            <!-- Left: Continue Learning Hero Card -->
            <div class="dash-card continue-learning-card">
              <h2>Continue Learning</h2>
              <div class="continue-farm-hero" id="heroThumb" role="button" tabindex="0">
                <div class="continue-farm-overlay">
                  <div class="farm-overlay-badge">SunRoot Original</div>
                  <div class="farm-overlay-sub">Solar + Irrigation Systems · Cyber-Physical Digital Twin</div>
                </div>
              </div>
              <div class="continue-details">
                <div class="continue-progress-row">
                  <div class="continue-progress-bar">
                    <div class="continue-progress-fill" style="width: ${Math.max(15, Math.round(overallMastery * 100))}%"></div>
                  </div>
                  <span class="continue-progress-pct">${Math.round(overallMastery * 100)}%</span>
                </div>
                <button class="primary-button large" id="toWorkshopBtn" style="width:100%">Open Workshop →</button>
              </div>
            </div>

            <!-- Right: Your Progress Overview (Radar Spider Webchart) -->
            <div class="dash-card progress-overview-card">
              <div class="dash-card-head">
                <h2>Progression Overview</h2>
                <span class="radar-tag">Bayesian Knowledge Tracing</span>
              </div>
              <div class="radar-chart-wrap">
                <canvas id="radarChartCanvas" width="340" height="230"></canvas>
              </div>

              <!-- Strengths & Focus Areas -->
              <div class="progress-competency-row">
                <div class="competency-box strengths">
                  <div class="comp-title"><span class="comp-dot green"></span> Strengths</div>
                  <ul class="comp-list">
                    ${strengths.length ? strengths.map(([id]) => `<li>${escapeHtml(CONCEPT_BY_ID.get(id as any)?.label ?? id)}</li>`).join('') : '<li>Solar Architecture</li><li>Sensors</li>'}
                  </ul>
                </div>

                <div class="competency-box focus">
                  <div class="comp-title"><span class="comp-dot orange"></span> Focus Areas</div>
                  <ul class="comp-list">
                    ${focusAreas.length ? focusAreas.map(([id]) => `<li>${escapeHtml(CONCEPT_BY_ID.get(id as any)?.label ?? id)}</li>`).join('') : '<li>Control Logic</li><li>Hydraulic Flow</li>'}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      `

      // Draw HTML5 Canvas Radar Webchart in Dark Theme
      const canvas = root.querySelector<HTMLCanvasElement>('#radarChartCanvas')
      if (canvas) {
        drawRadarChart(canvas, radarMetrics)
      }

      root.querySelector('#toWorkshopBtn')?.addEventListener('click', nav.toDemoWorkshop)
      root.querySelector('#heroThumb')?.addEventListener('click', nav.toDemoWorkshop)
      root.querySelector('#myClassesTopBtn')?.addEventListener('click', nav.toClasses)
      root.querySelector('#findClassTopBtn')?.addEventListener('click', nav.toFindClass)
      root.querySelector('#toAdminBtn')?.addEventListener('click', nav.toAdmin)
    })
    .catch((err) => {
      console.error('SunRoot: dashboard load failed', err)
      root.innerHTML = `
        <div class="screen dash-screen">
          <div class="class-panel">
            <h2>Couldn’t load your dashboard</h2>
            <p class="empty-note">Something went wrong reaching the database. Please try again.</p>
            <div class="dash-actions" style="margin-top:16px">
              <button class="primary-button" id="retryDashBtn">Try again</button>
            </div>
          </div>
        </div>
      `
      root.querySelector('#retryDashBtn')?.addEventListener('click', () => renderDashboard(root, nav))
    })
}

function drawRadarChart(canvas: HTMLCanvasElement, metrics: RadarMetric[]) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const width = canvas.width
  const height = canvas.height
  const cx = width / 2
  const cy = height / 2 + 6
  const radius = Math.min(width, height) * 0.36
  const total = metrics.length

  ctx.clearRect(0, 0, width, height)

  // Draw Concentric Hexagonal Rings (3 rings: 33%, 66%, 100%) in Dark Theme
  const rings = [0.33, 0.66, 1.0]
  rings.forEach((rScale) => {
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
    ctx.lineWidth = 1
    for (let i = 0; i < total; i++) {
      const angle = (Math.PI * 2 * i) / total - Math.PI / 2
      const x = cx + radius * rScale * Math.cos(angle)
      const y = cy + radius * rScale * Math.sin(angle)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.stroke()
  })

  // Radial Axes & Labels (clean dark-theme muted text)
  ctx.font = '500 11px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = '#94A3B8'
  for (let i = 0; i < total; i++) {
    const angle = (Math.PI * 2 * i) / total - Math.PI / 2
    const x = cx + radius * Math.cos(angle)
    const y = cy + radius * Math.sin(angle)

    ctx.beginPath()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)'
    ctx.moveTo(cx, cy)
    ctx.lineTo(x, y)
    ctx.stroke()

    // Label Positioning
    const labelX = cx + (radius + 22) * Math.cos(angle)
    const labelY = cy + (radius + 15) * Math.sin(angle)
    ctx.textAlign = Math.abs(Math.cos(angle)) < 0.2 ? 'center' : Math.cos(angle) > 0 ? 'left' : 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(metrics[i].label, labelX, labelY)
  }

  // Polygonal Data Area (Translucent Emerald Fill)
  ctx.beginPath()
  metrics.forEach((m, i) => {
    const angle = (Math.PI * 2 * i) / total - Math.PI / 2
    const r = radius * Math.max(0.1, m.value)
    const x = cx + r * Math.cos(angle)
    const y = cy + r * Math.sin(angle)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
  ctx.fillStyle = 'rgba(79, 214, 122, 0.24)'
  ctx.fill()
  ctx.strokeStyle = '#4FD67A'
  ctx.lineWidth = 2.2
  ctx.stroke()

  // Vertex Points
  metrics.forEach((m, i) => {
    const angle = (Math.PI * 2 * i) / total - Math.PI / 2
    const r = radius * Math.max(0.1, m.value)
    const x = cx + r * Math.cos(angle)
    const y = cy + r * Math.sin(angle)

    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fillStyle = '#4FD67A'
    ctx.fill()
    ctx.strokeStyle = '#0B1410'
    ctx.lineWidth = 1.5
    ctx.stroke()
  })
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}
