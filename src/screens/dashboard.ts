import { CONCEPT_BY_ID } from '../learning/LearnerModel'
import type { ConceptId } from '../learning/LearnerModel'
import { session } from '../accounts/Session'
import { listClassroomsForUser, DEMO_CLASSROOM_ID } from '../accounts/ClassroomService'
import { fetchProgressSnapshot, fetchClassroomProgress } from '../accounts/ProgressService'
import { listHomeworkForStudent } from '../accounts/HomeworkService'
import { listStudySetsForClassroom } from '../accounts/StudySetService'
import { openStudySet } from './studySetViewer'
import { progress, rankFor } from '../game/progress'
import type { Classroom, UserProfile, ProgressSnapshot, HomeworkAssignment, StudySet } from '../accounts/types'
import { toast } from '../game/shell'

export interface DashboardNav {
  toClasses: () => void
  toFindClass: () => void
  onLogout: () => void
  toAdmin: () => void
  toDemoWorkshop: () => void
  toCircuit?: () => void
  toCoding?: () => void
  toFarm?: () => void
  toShed?: () => void
  toQuiz?: () => void
  toLeaderboard?: () => void
  toMessages?: () => void
  toProfile?: () => void
  toStudySetViewer?: () => void
  toTeacherAnalytics?: () => void
  toClassWorkshop?: (classroomId: string) => void
}

interface RadarMetric {
  label: string
  value: number // 0 to 1
}

interface CurriculumModule {
  id: number
  title: string
  subtitle: string
  desc: string
  conceptIds: ConceptId[]
  screen: 'shed' | 'circuit' | 'coding' | 'farm'
  badgeText: string
  iconSvg: string
}

const CURRICULUM_MODULES: CurriculumModule[] = [
  {
    id: 1,
    title: 'Renewable Photovoltaics & Energy Budgeting',
    subtitle: 'Module 01 • Solar Generation & Storage',
    desc: 'Model solar irradiance angle, power dissipation, and 24-hour battery reserve cycles to avoid brownouts.',
    conceptIds: ['renewable_variability', 'energy_budget'],
    screen: 'shed',
    badgeText: 'PV & Storage',
    iconSvg: `<svg viewBox="0 0 24 24" width="20" height="20" fill="#F59E0B"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/></svg>`,
  },
  {
    id: 2,
    title: 'Breadboard Circuit & Pin Architecture',
    subtitle: 'Module 02 • Hardware Wiring & Tolerances',
    desc: 'Establish common ground references, match 5V and 3.3V logic levels, and observe GPIO current limits.',
    conceptIds: ['grounding', 'logic_levels', 'pin_capability'],
    screen: 'circuit',
    badgeText: 'Circuit & Pins',
    iconSvg: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
  },
  {
    id: 3,
    title: 'Soil Sensing & Telemetry Calibration',
    subtitle: 'Module 03 • Soil Physics & ADC Telemetry',
    desc: 'Interface analog capacitive moisture sensors, filter environmental noise, and set precision thresholds.',
    conceptIds: ['feedback_control', 'pin_capability'],
    screen: 'circuit',
    badgeText: 'Soil Sensing',
    iconSvg: `<svg viewBox="0 0 24 24" width="20" height="20" fill="#3B82F6"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`,
  },
  {
    id: 4,
    title: 'Algorithmic Control & Hysteresis Loops',
    subtitle: 'Module 04 • State Machines & Automation',
    desc: 'Deploy Blockly state machines with dual-threshold hysteresis to suppress harmful actuator chatter.',
    conceptIds: ['feedback_control', 'hysteresis', 'drive_stage'],
    screen: 'coding',
    badgeText: 'Control Logic',
    iconSvg: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#8B5CF6" stroke-width="2" stroke-linecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  },
  {
    id: 5,
    title: 'Cyber-Physical Ecosystem & Autonomous Yield',
    subtitle: 'Module 05 • Closed-Loop Agritech Simulation',
    desc: 'Balance hydraulic pump flow, transpiration rates, and soil moisture to achieve peak crop health index.',
    conceptIds: ['hydraulics', 'water_efficiency'],
    screen: 'farm',
    badgeText: 'Agritech Twin',
    iconSvg: `<svg viewBox="0 0 24 24" width="20" height="20" fill="#10B981"><path d="M12 21c0-5 2-8 7-9-5-1-7-4-7-9 0 5-2 8-7 9 5 1 7 4 7 9z"/></svg>`,
  },
]

export function renderDashboard(root: HTMLElement, nav: DashboardNav) {
  const profile = session.profile
  if (!profile) return

  // Modern Skeleton Shimmer while loading
  root.innerHTML = `
    <div class="screen dash-screen dash-screen-v2">
      <div class="dash-v2-header skeleton-pulse" style="height: 90px; border-radius: 14px; background: rgba(255,255,255,0.03);"></div>
      <div class="dash-v2-stats-grid">
        <div class="dash-stat-card skeleton-pulse" style="height: 95px;"></div>
        <div class="dash-stat-card skeleton-pulse" style="height: 95px;"></div>
        <div class="dash-stat-card skeleton-pulse" style="height: 95px;"></div>
        <div class="dash-stat-card skeleton-pulse" style="height: 95px;"></div>
      </div>
      <div class="dash-v2-main-grid">
        <div class="dash-card skeleton-pulse" style="height: 380px;"></div>
        <div class="dash-card skeleton-pulse" style="height: 380px;"></div>
      </div>
    </div>
  `

  const isTeacher = profile.role === 'teacher'

  Promise.all([
    listClassroomsForUser(profile),
    !isTeacher ? fetchProgressSnapshot(DEMO_CLASSROOM_ID, profile.uid).catch(() => null) : Promise.resolve(null),
    listHomeworkForStudent([{ id: DEMO_CLASSROOM_ID }], profile.uid).catch(() => [] as HomeworkAssignment[]),
    listStudySetsForClassroom(DEMO_CLASSROOM_ID).catch(() => [] as StudySet[]),
  ])
    .then(async ([classrooms, demoProgress, homeworkList, studySetsList]) => {
      // If teacher, calculate real aggregate class stats
      let teacherTotalStudents = 0
      let teacherAvgMastery = 0
      let teacherAtRiskCount = 0

      if (isTeacher && classrooms.length > 0) {
        try {
          const studentIdsSet = new Set<string>()
          classrooms.forEach((c) => c.studentIds.forEach((id) => studentIdsSet.add(id)))
          teacherTotalStudents = studentIdsSet.size

          const classSnaps = await Promise.all(
            classrooms.slice(0, 5).map((c) => fetchClassroomProgress(c.id, c.studentIds).catch(() => ({}))),
          )
          let totalMasterySum = 0
          let totalEvaluated = 0

          classSnaps.forEach((snap) => {
            Object.values(snap).forEach((s) => {
              if (s) {
                totalMasterySum += s.overallMastery ?? 0
                totalEvaluated++
                if ((s.overallMastery ?? 0) < 0.45) {
                  teacherAtRiskCount++
                }
              }
            })
          })

          teacherAvgMastery = totalEvaluated > 0 ? totalMasterySum / totalEvaluated : 0.65
        } catch (e) {
          console.warn('SunRoot: error aggregating teacher statistics', e)
        }
      }

      paintDashboard(
        root,
        profile,
        classrooms,
        demoProgress,
        {
          isTeacher,
          teacherTotalStudents,
          teacherAvgMastery,
          teacherAtRiskCount,
        },
        homeworkList,
        studySetsList,
        nav,
      )
    })
    .catch((err) => {
      console.error('SunRoot: dashboard load failed', err)
      root.innerHTML = `
        <div class="screen dash-screen dash-screen-v2">
          <div class="dash-card" style="text-align: center; padding: 48px 24px; max-width: 520px; margin: 60px auto;">
            <div style="font-size: 38px; margin-bottom: 12px;">🛰️</div>
            <h2 style="margin: 0 0 10px;">Unable to load dashboard telemetry</h2>
            <p style="color: var(--campus-text-muted); font-size: 14px; margin-bottom: 24px;">
              Could not retrieve real-time classroom and simulation metrics. Check your network connection.
            </p>
            <button class="primary-button" id="retryDashBtn" style="margin: 0 auto;">Retry Connection</button>
          </div>
        </div>
      `
      root.querySelector('#retryDashBtn')?.addEventListener('click', () => renderDashboard(root, nav))
    })
}

function paintDashboard(
  root: HTMLElement,
  profile: UserProfile,
  classrooms: Classroom[],
  demoProgress: ProgressSnapshot | null,
  teacherStats: {
    isTeacher: boolean
    teacherTotalStudents: number
    teacherAvgMastery: number
    teacherAtRiskCount: number
  },
  homeworkList: HomeworkAssignment[],
  studySetsList: StudySet[],
  nav: DashboardNav,
) {
  const { isTeacher } = teacherStats
  const enrolledCount = classrooms.length
  const xp = demoProgress?.xp ?? progress.xp ?? 0
  const overallMastery = demoProgress?.overallMastery ?? 0.35
  const rankInfo = rankFor(xp)
  const rankTitle = demoProgress?.rank ?? progress.rank ?? rankInfo.current.name
  const level = Math.max(1, Math.floor(xp / 120) + 1)
  const nextLevelXp = rankInfo.next ? rankInfo.next.xp - xp : 50
  const completedObjectives = progress.objectives.filter((o) => o.done).length
  const totalObjectives = progress.objectives.length || 6

  // Time-of-day personalized greeting
  const currentHour = new Date().getHours()
  const timeGreeting = currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = (profile.displayName || (isTeacher ? 'Instructor' : 'Student')).split(' ')[0]

  // Active Homework & Study Set for Academic Hub
  const activeHw = homeworkList.length > 0 ? homeworkList[0] : null
  const activeHwVariant = activeHw ? activeHw.variants[profile.uid] : null
  const activeStudySet = studySetsList.length > 0 ? studySetsList[0] : null

  // BKT concept mastery breakdown
  const conceptMasteryMap = demoProgress?.conceptMastery || {}
  const conceptEntries = Object.entries(conceptMasteryMap)

  const strengths = conceptEntries
    .filter(([, c]) => c.engaged && c.mastery >= 0.5)
    .sort((a, b) => b[1].mastery - a[1].mastery)
    .slice(0, 3)

  const focusAreas = conceptEntries
    .filter(([, c]) => c.engaged && c.mastery < 0.5)
    .sort((a, b) => a[1].mastery - b[1].mastery)
    .slice(0, 3)

  // 6 Cyber-Physical Radar Axes
  const radarAxes = [
    { id: 'solar', label: 'Solar & Power' },
    { id: 'circuit', label: 'Circuit & Pins' },
    { id: 'logic', label: 'Control Logic' },
    { id: 'hydraulics', label: 'Hydraulics' },
    { id: 'sensing', label: 'Soil Sensing' },
    { id: 'feedback', label: 'Feedback Loop' },
  ]

  const radarMetrics: RadarMetric[] = radarAxes.map((axis) => {
    let val = 0.25
    if (demoProgress?.conceptMastery) {
      if (axis.id === 'solar') val = demoProgress.conceptMastery.energy_budget?.mastery ?? demoProgress.conceptMastery.renewable_variability?.mastery ?? 0.4
      else if (axis.id === 'circuit') val = demoProgress.conceptMastery.grounding?.mastery ?? demoProgress.conceptMastery.pin_capability?.mastery ?? 0.35
      else if (axis.id === 'logic') val = demoProgress.conceptMastery.hysteresis?.mastery ?? 0.3
      else if (axis.id === 'hydraulics') val = demoProgress.conceptMastery.hydraulics?.mastery ?? 0.45
      else if (axis.id === 'sensing') val = demoProgress.conceptMastery.feedback_control?.mastery ?? 0.5
      else if (axis.id === 'feedback') val = demoProgress.conceptMastery.water_efficiency?.mastery ?? 0.35
    } else {
      val = Math.max(0.18, Math.min(0.9, overallMastery))
    }
    return { label: axis.label, value: Math.max(0.15, Math.min(0.98, val)) }
  })

  // Module Progress Calculation
  const moduleProgressList = CURRICULUM_MODULES.map((mod) => {
    let sum = 0
    let count = 0
    mod.conceptIds.forEach((cid) => {
      const c = conceptMasteryMap[cid]
      if (c && c.engaged) {
        sum += c.mastery
        count++
      }
    })
    const modMastery = count > 0 ? sum / count : mod.id === 1 ? Math.max(0.4, overallMastery) : mod.id === 2 ? Math.max(0.25, overallMastery * 0.7) : 0.15
    return {
      ...mod,
      mastery: modMastery,
      pct: Math.round(modMastery * 100),
      status: modMastery >= 0.75 ? 'Mastered' : modMastery >= 0.25 ? 'In Progress' : 'Up Next',
    }
  })

  root.innerHTML = `
    <div class="screen dash-screen dash-screen-v2">
      <!-- 2026 Educational Banner -->
      <div class="dash-v2-header">
        <div class="dash-header-info">
          <div class="dash-badge-row">
            <span class="dash-role-badge ${isTeacher ? 'teacher' : 'student'}">
              ${isTeacher ? 'Instructor & Lab Lead' : 'Cyber-Physical Engineering'}
            </span>
            ${profile.studentTag ? `
              <button class="student-tag-chip" id="copyTagBtn" title="Click to copy your unique ID for class invites">
                <span class="tag-label">ID:</span>
                <span class="tag-code">${escapeHtml(profile.studentTag)}</span>
                <span class="tag-copy-icon">📋</span>
              </button>
            ` : ''}
            <span class="dash-streak-chip">
              <span class="fire-icon">🔥</span> 3-Day Streak
            </span>
          </div>

          <h1 class="dash-title">
            ${timeGreeting}, <strong>${escapeHtml(firstName)}</strong>!
          </h1>
          <p class="dash-greeting">
            ${isTeacher
              ? 'Real-time overview of active student cohorts, hardware lab progress, and concept mastery bottlenecks.'
              : 'Continuous digital-twin simulation active. Wire hardware, calibrate soil telemetry, and cultivate smart crops.'}
          </p>
        </div>

        <div class="dash-header-actions">
          ${profile.isAdmin ? `<button class="ghost-button small" id="toAdminBtn">🛡️ Admin Console</button>` : ''}
          ${isTeacher ? `
            <button class="ghost-button" id="openAnalyticsTopBtn">📊 Class Analytics</button>
            <button class="primary-button" id="createClassTopBtn">+ Create Class</button>
          ` : `
            <button class="ghost-button" id="findClassTopBtn">Find a Class</button>
            <button class="primary-button" id="launchBenchTopBtn">🚀 Open Workshop</button>
          `}
        </div>
      </div>

      <!-- 4 High-Yield Metric Cards -->
      <div class="dash-v2-stats-grid">
        ${isTeacher ? `
          <div class="dash-stat-card">
            <div class="dash-stat-icon blue">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="#3B82F6"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            </div>
            <div class="dash-stat-info">
              <div class="dash-stat-val">${enrolledCount}</div>
              <div class="dash-stat-label">Active Classes</div>
              <div class="dash-stat-sub good">Teaching Active</div>
            </div>
          </div>

          <div class="dash-stat-card">
            <div class="dash-stat-icon green">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="#22C55E"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div class="dash-stat-info">
              <div class="dash-stat-val">${teacherStats.teacherTotalStudents}</div>
              <div class="dash-stat-label">Total Students</div>
              <div class="dash-stat-sub good">Across all cohorts</div>
            </div>
          </div>

          <div class="dash-stat-card">
            <div class="dash-stat-icon gold">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="#F59E0B"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </div>
            <div class="dash-stat-info">
              <div class="dash-stat-val">${Math.round(teacherStats.teacherAvgMastery * 100)}%</div>
              <div class="dash-stat-label">Avg Class Mastery</div>
              <div class="dash-stat-sub good">BKT Model</div>
            </div>
          </div>

          <div class="dash-stat-card">
            <div class="dash-stat-icon red">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="#EF4444"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <div class="dash-stat-info">
              <div class="dash-stat-val">${teacherStats.teacherAtRiskCount}</div>
              <div class="dash-stat-label">At-Risk Alerts</div>
              <div class="dash-stat-sub">${teacherStats.teacherAtRiskCount > 0 ? 'Need review' : 'All on track'}</div>
            </div>
          </div>
        ` : `
          <div class="dash-stat-card">
            <div class="dash-stat-icon gold">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="#F59E0B"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </div>
            <div class="dash-stat-info">
              <div class="dash-stat-val">${xp} XP</div>
              <div class="dash-stat-label">Total Engineering XP</div>
              <div class="dash-stat-sub good">+120 XP this week</div>
            </div>
          </div>

          <div class="dash-stat-card">
            <div class="dash-stat-icon green">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="#22C55E"><circle cx="12" cy="12" r="10" stroke="#22C55E" stroke-width="2" fill="none"/><path d="M9 12l2 2 4-4" stroke="#22C55E" stroke-width="2" fill="none"/></svg>
            </div>
            <div class="dash-stat-info">
              <div class="dash-stat-val">Level ${level}</div>
              <div class="dash-stat-label">${escapeHtml(rankTitle)}</div>
              <div class="dash-stat-sub">${nextLevelXp > 0 ? `${nextLevelXp} XP to Level ${level + 1}` : 'Top Rank Master'}</div>
            </div>
          </div>

          <div class="dash-stat-card">
            <div class="dash-stat-icon blue">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="#3B82F6"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </div>
            <div class="dash-stat-info">
              <div class="dash-stat-val">${Math.round(overallMastery * 100)}%</div>
              <div class="dash-stat-label">System Mastery</div>
              <div class="dash-stat-sub good">Bayesian Traced</div>
            </div>
          </div>

          <div class="dash-stat-card">
            <div class="dash-stat-icon purple">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="#8B5CF6"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            </div>
            <div class="dash-stat-info">
              <div class="dash-stat-val">${completedObjectives}/${totalObjectives}</div>
              <div class="dash-stat-label">Lab Objectives</div>
              <div class="dash-stat-sub">${completedObjectives >= 4 ? 'Great progress' : 'Quests active'}</div>
            </div>
          </div>
        `}
      </div>

      <!-- Main Two-Column Layout -->
      <div class="dash-v2-main-grid">
        <!-- Left Column: Continue Mission / Live Prototype & Hardware Status -->
        <!-- Left Column: Academic Homework, NotebookLM Studio, and Practical Digital Twins -->
        <div class="dash-left-col-stack">
          <!-- 1. Isomorphic Homework Hub (Anti-Cheat) -->
          <div class="dash-card dash-hw-card">
            <div class="dash-card-head">
              <div>
                <span class="sub-label">Academic Curriculum</span>
                <h2>${isTeacher ? 'Isomorphic Homework Engine' : 'Active Homework Challenge'}</h2>
              </div>
              <span class="anti-cheat-pill" title="Every student receives distinct parameterized numbers with identical difficulty">
                🛡️ Anti-Cheat Isomorphic
              </span>
            </div>

            ${isTeacher ? `
              <div class="hw-teacher-overview">
                <p class="hw-summary-text">
                  AI generates parameterized variables per student. Every student solves identical physics formulas with distinct values, preventing copying while guaranteeing fair ranking.
                </p>
                <div class="hw-teacher-stats">
                  <div class="hw-t-stat"><strong>${homeworkList.length}</strong><span>Active Assignments</span></div>
                  <div class="hw-t-stat"><strong>100%</strong><span>Fair Ranking</span></div>
                </div>
                <div style="display:flex; gap:10px; margin-top:14px;">
                  <button class="primary-button small" id="teacherGenHwBtn">+ Create Parameterized Challenge</button>
                  <button class="ghost-button small" id="teacherOpenNotesBtn">View NotebookLM Sets</button>
                </div>
              </div>
            ` : activeHw ? `
              <div class="hw-student-card">
                <div class="hw-card-top">
                  <div class="hw-title">${escapeHtml(activeHw.title)}</div>
                  <span class="hw-due-pill ${activeHwVariant?.submittedAnswer !== undefined ? 'completed' : ''}">
                    ${activeHwVariant?.submittedAnswer !== undefined ? '✓ Completed' : 'Due in 3 Days'}
                  </span>
                </div>
                <p class="hw-desc">${escapeHtml(activeHw.description)}</p>
                <div class="hw-meta-strip">
                  <span>Class: <strong>${escapeHtml(activeHw.classroomName)}</strong></span>
                  <span>Topic: <strong>${escapeHtml(activeHw.topic)}</strong></span>
                  ${activeHwVariant?.score !== undefined ? `<span>Score: <strong style="color: #4fd67a">${activeHwVariant.score}%</strong></span>` : ''}
                </div>
                <div class="hw-actions">
                  <button class="primary-button small" id="solveHwBtn">
                    ${activeHwVariant?.submittedAnswer !== undefined ? 'Review Submission 📝' : 'Solve Parameterized Challenge ⚡'}
                  </button>
                  <span class="hw-scratchpad-hint">Includes neurodivergent visual scratchpad & confidence check</span>
                </div>
              </div>
            ` : `
              <div class="hw-empty-box">
                <p>No pending homework assignments. You’re all caught up!</p>
                <button class="ghost-button small" id="exploreStudySetsBtn">Open NotebookLM Study Hub →</button>
              </div>
            `}
          </div>

          <!-- 2. NotebookLM Knowledge Studio & Audio Overview Hub -->
          <div class="dash-card dash-notebook-card">
            <div class="dash-card-head">
              <div>
                <span class="sub-label">Grounded Knowledge Hub</span>
                <h2>NotebookLM Studio & Audio Deep Dive</h2>
              </div>
              <span class="notebook-audio-badge">🎙️ 2-Speaker Podcast Ready</span>
            </div>

            <p class="notebook-studio-desc">
              Grounded in official syllabus materials: ${activeStudySet ? `<strong>${escapeHtml(activeStudySet.title)}</strong>` : 'Lecture Notes & PDFs'}. Synthesizes executive briefings, citations, and 2-speaker audio podcast conversations between Alex & Dr. Sam.
            </p>

            <div class="notebook-feature-chips">
              <span class="nb-chip">🎙️ Deep Dive Audio</span>
              <span class="nb-chip">📄 Executive Briefing</span>
              <span class="nb-chip">💬 Grounded Q&A</span>
              <span class="nb-chip">🗂️ 3D Flashcards</span>
              <span class="nb-chip">🧠 Metacognitive Checks</span>
            </div>

            <div class="notebook-card-action">
              <button class="primary-button" id="openNotebookHubBtn" style="width: 100%;">
                Open NotebookLM Study Hub 📚
              </button>
            </div>
          </div>

          <!-- 3. Classroom Practical Simulation Rigs (Digital Twins) -->
          <div class="dash-card dash-twin-rigs-card">
            <div class="dash-card-head">
              <div>
                <span class="sub-label">Hands-On Computing Labs</span>
                <h2>Classroom Practical Sessions</h2>
              </div>
              <span class="pulse-live-badge"><span class="live-dot"></span> 4 Active Labs</span>
            </div>

            <div class="practical-benches-grid">
              <div class="practical-bench-item" id="toFarmBenchBtn" role="button" tabindex="0">
                <div class="bench-item-head">
                  <span class="bench-icon">🌾</span>
                  <div>
                    <div class="bench-title">Agricultural Micro-Farm Twin</div>
                    <div class="bench-sub-type">Demo Reference Practical Simulation</div>
                  </div>
                </div>
                <p class="bench-desc">
                  Closed-loop soil moisture physics, hydraulic pump irrigation, and diurnal solar irradiance curves.
                </p>
                <span class="bench-link-arrow">Launch Farm Sim →</span>
              </div>

              <div class="practical-bench-item" id="toCircuitBenchBtn" role="button" tabindex="0">
                <div class="bench-item-head">
                  <span class="bench-icon">⚡</span>
                  <div>
                    <div class="bench-title">Circuit & Breadboard Lab</div>
                    <div class="bench-sub-type">Hardware Wiring & Tolerances</div>
                  </div>
                </div>
                <p class="bench-desc">
                  Establish common ground references, 3.3V/5V logic conversion, and GPIO drive stage protection.
                </p>
                <span class="bench-link-arrow">Open Circuit Bench →</span>
              </div>

              <div class="practical-bench-item" id="toCodingBenchBtn" role="button" tabindex="0">
                <div class="bench-item-head">
                  <span class="bench-icon">💻</span>
                  <div>
                    <div class="bench-title">Coding & Control Lab</div>
                    <div class="bench-sub-type">Blockly State Machines & Logic</div>
                  </div>
                </div>
                <p class="bench-desc">
                  Deploy dual-threshold hysteresis loops to suppress damaging actuator chatter and save power.
                </p>
                <span class="bench-link-arrow">Open Coding Lab →</span>
              </div>

              <div class="practical-bench-item" id="toShedBenchBtn" role="button" tabindex="0">
                <div class="bench-item-head">
                  <span class="bench-icon">🛠️</span>
                  <div>
                    <div class="bench-title">Tool Shed & Specs</div>
                    <div class="bench-sub-type">Datasheets & Component Inventory</div>
                  </div>
                </div>
                <p class="bench-desc">
                  Solar panel Watt ratings, battery capacity (A·h), transistor specs, and hydraulic motor parts.
                </p>
                <span class="bench-link-arrow">Open Tool Shed →</span>
              </div>
            </div>

            <button class="ghost-button large" id="openFullWorkshopBtn" style="margin-top: 14px; width: 100%;">
              Open Full Integrated Workshop Rig →
            </button>
          </div>
        </div>

        <!-- Right Column: Progression & Radar Webchart -->
        <div class="dash-card progress-overview-card">
          <div class="dash-card-head">
            <div>
              <span class="sub-label">Cognitive Assessment</span>
              <h2>Knowledge Radar</h2>
            </div>
            <span class="radar-tag" title="Bayesian Knowledge Tracing inferring mastery directly from behavioural circuit and code evidence">
              BKT Tracing
            </span>
          </div>

          <div class="radar-chart-wrap">
            <canvas id="radarChartCanvas" width="340" height="230"></canvas>
          </div>

          <!-- Verified Strengths & Target Focus Areas with Quick Practice -->
          <div class="progress-competency-row">
            <div class="competency-box strengths">
              <div class="comp-title"><span class="comp-dot green"></span> Verified Strengths</div>
              <ul class="comp-list">
                ${strengths.length
                  ? strengths.map(([id, data]) => `
                      <li>
                        <span>${escapeHtml(CONCEPT_BY_ID.get(id as any)?.label ?? id)}</span>
                        <strong class="pct-pill green">${Math.round(data.mastery * 100)}%</strong>
                      </li>
                    `).join('')
                  : `
                    <li><span>Common Grounding</span><strong class="pct-pill green">90%</strong></li>
                    <li><span>Solar Power Harvest</span><strong class="pct-pill green">82%</strong></li>
                  `}
              </ul>
            </div>

            <div class="competency-box focus">
              <div class="comp-title"><span class="comp-dot orange"></span> High-Yield Focus Areas</div>
              <ul class="comp-list">
                ${focusAreas.length
                  ? focusAreas.map(([id]) => `
                      <li>
                        <span>${escapeHtml(CONCEPT_BY_ID.get(id as any)?.label ?? id)}</span>
                        <button class="comp-practice-btn" data-concept="${id}">Practice ⚡</button>
                      </li>
                    `).join('')
                  : `
                    <li><span>Hysteresis Control</span><button class="comp-practice-btn" id="practiceQuizShortcut">Practice ⚡</button></li>
                    <li><span>Soil Telemetry Logic</span><button class="comp-practice-btn" id="practiceQuizShortcut2">Practice ⚡</button></li>
                  `}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Curriculum Roadmap: 5 Core Engineering Modules -->
      <div class="dash-section-container">
        <div class="dash-section-header">
          <div>
            <span class="sub-label">Learning Progression</span>
            <h2>Cyber-Physical Curriculum Roadmap</h2>
          </div>
          <button class="ghost-button small" id="viewAllQuizzesBtn">Take Adaptive Quiz ⚡</button>
        </div>

        <div class="curriculum-modules-grid">
          ${moduleProgressList.map((mod) => `
            <div class="curriculum-module-card ${mod.status.toLowerCase().replace(' ', '-')}" data-screen="${mod.screen}">
              <div class="mod-top-row">
                <span class="mod-icon-badge">${mod.iconSvg}</span>
                <span class="mod-status-badge ${mod.status.toLowerCase().replace(' ', '-')}">${mod.status}</span>
              </div>
              <div class="mod-sub">${mod.subtitle}</div>
              <h3 class="mod-title">${mod.title}</h3>
              <p class="mod-desc">${mod.desc}</p>
              
              <div class="mod-progress-bar-wrap">
                <div class="mod-progress-bar">
                  <div class="mod-progress-fill" style="width: ${Math.max(12, mod.pct)}%;"></div>
                </div>
                <span class="mod-pct">${mod.pct}%</span>
              </div>

              <div class="mod-footer">
                <button class="ghost-button small mod-action-btn" data-screen="${mod.screen}">
                  ${mod.status === 'Mastered' ? 'Review Bench →' : 'Launch Module →'}
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Active Cohorts & Daily Quests Section -->
      <div class="dash-bottom-grid">
        <!-- Classrooms & Teams Card -->
        <div class="dash-card">
          <div class="dash-card-head">
            <div>
              <span class="sub-label">School & Teams</span>
              <h2>${isTeacher ? 'My Active Classrooms' : 'Enrolled Classes & Squad'}</h2>
            </div>
            <button class="ghost-button small" id="bottomClassesLink">
              ${isTeacher ? 'Manage All →' : 'Browse Classes →'}
            </button>
          </div>

          <div class="cohort-list">
            ${classrooms.length > 0
              ? classrooms.map((cls) => `
                  <div class="cohort-item-card">
                    <div class="cohort-icon">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="#4FD67A"><path d="M12 3 2 8l10 5 10-5-10-5z"/><path d="M2 16l10 5 10-5M2 12l10 5 10-5" stroke="#4FD67A" stroke-width="2" fill="none"/></svg>
                    </div>
                    <div class="cohort-info">
                      <div class="cohort-name">${escapeHtml(cls.name)}</div>
                      <div class="cohort-meta">Topic: ${escapeHtml(cls.topic)} · ${cls.studentIds.length} students</div>
                    </div>
                    <button class="ghost-button small cohort-open-btn" data-classid="${cls.id}">
                      Enter Workshop
                    </button>
                  </div>
                `).join('')
              : `
                <div class="cohort-empty-box">
                  <p>You haven’t joined a formal classroom yet.</p>
                  <p class="sub">You have full access to the SunRoot Original public practical bench!</p>
                  <div style="display: flex; gap: 8px; margin-top: 10px;">
                    <button class="primary-button small" id="bottomFindClassBtn">Find a Class</button>
                    <button class="ghost-button small" id="bottomDemoBtn">Open Demo Bench</button>
                  </div>
                </div>
              `}
          </div>
        </div>

        <!-- Daily Retrieval Practice & Badges Card -->
        <div class="dash-card">
          <div class="dash-card-head">
            <div>
              <span class="sub-label">Retention & Gamification</span>
              <h2>Daily Retrieval Quests</h2>
            </div>
            <span class="quest-count-badge">${completedObjectives}/${totalObjectives} Done</span>
          </div>

          <div class="daily-quests-list">
            <div class="quest-item ${completedObjectives >= 1 ? 'completed' : ''}">
              <div class="quest-check">${completedObjectives >= 1 ? '✓' : '○'}</div>
              <div class="quest-details">
                <div class="quest-name">Wire Breadboard Sensors & Grounding</div>
                <div class="quest-xp">+50 XP · Hardware Rig</div>
              </div>
            </div>

            <div class="quest-item ${completedObjectives >= 2 ? 'completed' : ''}">
              <div class="quest-check">${completedObjectives >= 2 ? '✓' : '○'}</div>
              <div class="quest-details">
                <div class="quest-name">Deploy Dual-Threshold Hysteresis Control</div>
                <div class="quest-xp">+50 XP · Automation Lab</div>
              </div>
            </div>

            <div class="quest-item ${completedObjectives >= 3 ? 'completed' : ''}">
              <div class="quest-check">${completedObjectives >= 3 ? '✓' : '○'}</div>
              <div class="quest-details">
                <div class="quest-name">Complete 5-Minute Concept Retrieval Check</div>
                <div class="quest-xp">+75 XP · Adaptive Quiz</div>
              </div>
              <button class="primary-button small" id="launchDailyQuizBtn" style="padding: 6px 12px; font-size: 12px;">
                Quiz Now ⚡
              </button>
            </div>
          </div>

          <!-- Badges Showcase -->
          <div class="badges-shelf-row">
            <span class="shelf-label">Earned Badges:</span>
            <div class="badges-mini-shelf">
              <span class="badge-pill earned" title="Circuit Expert: Installed all circuit components correctly">⚡ Circuit Pro</span>
              <span class="badge-pill earned" title="Logic Builder: Deployed working control algorithms">🧠 Logic Builder</span>
              <span class="badge-pill" title="Farm Guardian: Maintained crop health above 80%">🌱 Farm Guardian</span>
              <span class="badge-pill" title="Energy Master: Sustained battery power for 24h">☀️ Energy Saver</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `

  // Draw 2026 Dark Neon Radar Spider Webchart
  const canvas = root.querySelector<HTMLCanvasElement>('#radarChartCanvas')
  if (canvas) {
    drawModernRadarChart(canvas, radarMetrics)
  }

  // Copy Student Tag Clipboard Handler
  root.querySelector('#copyTagBtn')?.addEventListener('click', () => {
    if (profile.studentTag) {
      navigator.clipboard.writeText(profile.studentTag)
      toast(`Copied Student ID (${profile.studentTag}) to clipboard!`, 'success')
    }
  })

  // Top action buttons
  root.querySelector('#launchBenchTopBtn')?.addEventListener('click', nav.toDemoWorkshop)
  root.querySelector('#findClassTopBtn')?.addEventListener('click', nav.toFindClass)
  root.querySelector('#toAdminBtn')?.addEventListener('click', nav.toAdmin)
  root.querySelector('#createClassTopBtn')?.addEventListener('click', nav.toClasses)
  root.querySelector('#openAnalyticsTopBtn')?.addEventListener('click', () => nav.toTeacherAnalytics?.() ?? nav.toClasses())

  // Academic Homework & NotebookLM Studio buttons
  const launchActiveStudySet = () => {
    if (activeStudySet) {
      openStudySet(activeStudySet.id)
    }
    nav.toStudySetViewer?.()
  }

  root.querySelector('#teacherGenHwBtn')?.addEventListener('click', launchActiveStudySet)
  root.querySelector('#teacherOpenNotesBtn')?.addEventListener('click', launchActiveStudySet)
  root.querySelector('#solveHwBtn')?.addEventListener('click', launchActiveStudySet)
  root.querySelector('#exploreStudySetsBtn')?.addEventListener('click', launchActiveStudySet)
  root.querySelector('#openNotebookHubBtn')?.addEventListener('click', launchActiveStudySet)

  // Practical Twin Labs bench buttons
  root.querySelector('#openFullWorkshopBtn')?.addEventListener('click', nav.toDemoWorkshop)
  root.querySelector('#toShedBenchBtn')?.addEventListener('click', () => nav.toShed?.() ?? nav.toDemoWorkshop())
  root.querySelector('#toCircuitBenchBtn')?.addEventListener('click', () => nav.toCircuit?.() ?? nav.toDemoWorkshop())
  root.querySelector('#toCodingBenchBtn')?.addEventListener('click', () => nav.toCoding?.() ?? nav.toDemoWorkshop())
  root.querySelector('#toFarmBenchBtn')?.addEventListener('click', () => nav.toFarm?.() ?? nav.toDemoWorkshop())

  // Curriculum module navigation
  root.querySelectorAll<HTMLElement>('.curriculum-module-card, .mod-action-btn').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      const targetScreen = el.dataset.screen as 'shed' | 'circuit' | 'coding' | 'farm' | undefined
      if (targetScreen === 'circuit') nav.toCircuit?.() ?? nav.toDemoWorkshop()
      else if (targetScreen === 'coding') nav.toCoding?.() ?? nav.toDemoWorkshop()
      else if (targetScreen === 'farm') nav.toFarm?.() ?? nav.toDemoWorkshop()
      else if (targetScreen === 'shed') nav.toShed?.() ?? nav.toDemoWorkshop()
      else nav.toDemoWorkshop()
    })
  })

  // Quiz & Practice buttons
  root.querySelector('#viewAllQuizzesBtn')?.addEventListener('click', () => nav.toQuiz?.() ?? nav.toDemoWorkshop())
  root.querySelector('#launchDailyQuizBtn')?.addEventListener('click', () => nav.toQuiz?.() ?? nav.toDemoWorkshop())
  root.querySelectorAll<HTMLButtonElement>('.comp-practice-btn').forEach((btn) => {
    btn.addEventListener('click', () => nav.toQuiz?.() ?? nav.toDemoWorkshop())
  })

  // Bottom classroom buttons
  root.querySelector('#bottomClassesLink')?.addEventListener('click', nav.toClasses)
  root.querySelector('#bottomFindClassBtn')?.addEventListener('click', nav.toFindClass)
  root.querySelector('#bottomDemoBtn')?.addEventListener('click', nav.toDemoWorkshop)

  root.querySelectorAll<HTMLButtonElement>('.cohort-open-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const classId = btn.dataset.classid
      if (classId && nav.toClassWorkshop) {
        nav.toClassWorkshop(classId)
      } else {
        nav.toDemoWorkshop()
      }
    })
  })
}

/**
 * 2026 Dark Neon Radar Spider Webchart
 * Renders glowing translucent polygons, radial grid axes, and readable metric tags
 */
function drawModernRadarChart(canvas: HTMLCanvasElement, metrics: RadarMetric[]) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const width = canvas.width
  const height = canvas.height
  const cx = width / 2
  const cy = height / 2 + 6
  const radius = Math.min(width, height) * 0.36
  const total = metrics.length

  ctx.clearRect(0, 0, width, height)

  // Concentric Hexagonal Rings (25%, 50%, 75%, 100%)
  const rings = [0.25, 0.5, 0.75, 1.0]
  rings.forEach((rScale, ringIdx) => {
    ctx.beginPath()
    ctx.strokeStyle = ringIdx === rings.length - 1 ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.07)'
    ctx.lineWidth = ringIdx === rings.length - 1 ? 1.4 : 1
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

  // Radial Axes & Labels
  ctx.font = '600 11px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = '#A0AEC0'
  for (let i = 0; i < total; i++) {
    const angle = (Math.PI * 2 * i) / total - Math.PI / 2
    const x = cx + radius * Math.cos(angle)
    const y = cy + radius * Math.sin(angle)

    ctx.beginPath()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)'
    ctx.lineWidth = 1
    ctx.moveTo(cx, cy)
    ctx.lineTo(x, y)
    ctx.stroke()

    // Label Positioning
    const labelDist = radius + 22
    const labelX = cx + labelDist * Math.cos(angle)
    const labelY = cy + labelDist * Math.sin(angle)
    ctx.textAlign = Math.abs(Math.cos(angle)) < 0.2 ? 'center' : Math.cos(angle) > 0 ? 'left' : 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(metrics[i].label, labelX, labelY)
  }

  // Polygonal Data Fill with Emerald Glow
  ctx.beginPath()
  metrics.forEach((m, i) => {
    const angle = (Math.PI * 2 * i) / total - Math.PI / 2
    const r = radius * Math.max(0.12, m.value)
    const x = cx + r * Math.cos(angle)
    const y = cy + r * Math.sin(angle)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()

  // Radial Gradient inside polygon
  const grad = ctx.createRadialGradient(cx, cy, 5, cx, cy, radius)
  grad.addColorStop(0, 'rgba(34, 197, 94, 0.40)')
  grad.addColorStop(1, 'rgba(79, 214, 122, 0.15)')
  ctx.fillStyle = grad
  ctx.fill()

  ctx.strokeStyle = '#4FD67A'
  ctx.lineWidth = 2.4
  ctx.stroke()

  // Vertex Points with Neon Emerald Center
  metrics.forEach((m, i) => {
    const angle = (Math.PI * 2 * i) / total - Math.PI / 2
    const r = radius * Math.max(0.12, m.value)
    const x = cx + r * Math.cos(angle)
    const y = cy + r * Math.sin(angle)

    ctx.beginPath()
    ctx.arc(x, y, 4.5, 0, Math.PI * 2)
    ctx.fillStyle = '#4FD67A'
    ctx.fill()
    ctx.strokeStyle = '#0B1410'
    ctx.lineWidth = 2
    ctx.stroke()
  })
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}
