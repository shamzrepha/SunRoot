import { session, refreshProfile } from '../accounts/Session'
import {
  listClassroomsForUser,
  getClassroom,
  listPendingInvites,
  respondToInvite,
  createClassroom,
  createPersonalClassroom,
  deleteClassroom,
  inviteStudentByTag,
  removeStudent,
  leaveClassroom,
  fetchUsersByIds,
  submitClassSuggestion,
  resetDatabaseToSingleClassroom,
  DEMO_CLASSROOM_ID,
} from '../accounts/ClassroomService'
import { toast } from '../game/shell'
import { createTeam, joinTeam, listTeamsForClassroom, setMyTeamRole, teamBudgetRemaining } from '../accounts/TeamService'
import { fetchClassroomProgress, isRecentlyActive } from '../accounts/ProgressService'
import { generateTeachingRecommendations, generateStudentRecommendation } from '../ai/TeachingInsights'
import { listStudySetsForClassroom, createStudySet, deleteStudySet } from '../accounts/StudySetService'
import { generateStudySet, generateCourseFromOutline } from '../ai/StudySetGenerator'
import { openStudySet } from './studySetViewer'
import { CONCEPT_BY_ID, MASTERY_THRESHOLD } from '../learning/LearnerModel'
import { CLASS_TOPICS, TEAM_ROLES } from '../accounts/types'
import type { Classroom, ClassroomInvite, ProgressSnapshot, StudySet, Team, TeamRole, UserProfile, CourseModule } from '../accounts/types'

type ClassNav = { toWorkshop: (classroomId: string) => void; toTeamWorkshop: (classroomId: string, teamId: string) => void; toStudySetViewer: () => void }

const DEFAULT_CANONICAL_MODULES: CourseModule[] = [
  {
    id: 'mod-1',
    title: 'Unit 1: Solar Irradiance, Photovoltaics & Energy Budgeting',
    description: 'Model solar diurnal curves, panel angle efficiency, and 24h battery capacity to sustain uninterrupted operations.',
    durationMinutes: 45,
  },
  {
    id: 'mod-2',
    title: 'Unit 2: Virtual Breadboard Wiring, Ground Integrity & Pin Voltages',
    description: 'Establish shared 0V ground reference, match 3.3V and 5V logic levels, and limit GPIO pin current draw.',
    durationMinutes: 50,
  },
  {
    id: 'mod-3',
    title: 'Unit 3: Capacitive Soil Sensing & ADC Telemetry Calibration',
    description: 'Read analog moisture values, filter ambient sensor noise, and tune precision irrigation boundaries.',
    durationMinutes: 40,
  },
  {
    id: 'mod-4',
    title: 'Unit 4: Closed-Loop Blockly Automation & Hysteresis Suppression',
    description: 'Implement dual-threshold hysteresis control state machines to eliminate actuator chatter and optimize crop health.',
    durationMinutes: 60,
  },
]

const CLASS_ICON_COLORS = [
  { bg: 'rgba(232,185,66,0.14)', fg: '#e8b942' },
  { bg: 'rgba(224,135,168,0.14)', fg: '#e087a8' },
  { bg: 'rgba(79,214,122,0.14)', fg: '#4fd67a' },
  { bg: 'rgba(122,197,255,0.14)', fg: '#7ac5ff' },
  { bg: 'rgba(180,140,230,0.14)', fg: '#b48ce6' },
]

function topicIcon(topic: string | undefined | null, color: string): string {
  const t = (topic || '').toLowerCase()
  if (t.includes('solar') || t.includes('irrigation')) {
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="${color}"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/></svg>`
  }
  if (t.includes('robot') || t.includes('mechatronic') || t.includes('automation')) {
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="${color}" stroke-width="1.8"><rect x="5" y="8" width="14" height="10" rx="2"/><circle cx="9.5" cy="13" r="1.3" fill="${color}"/><circle cx="14.5" cy="13" r="1.3" fill="${color}"/><path d="M12 8V4M9 4h6"/></svg>`
  }
  if (t.includes('water') || t.includes('hydraulic')) {
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="${color}"><path d="M12 2c4 5 7 8.5 7 12.5A7 7 0 0 1 5 14.5C5 10.5 8 7 12 2z"/></svg>`
  }
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="${color}" stroke-width="1.8"><path d="M12 3 2 8l10 5 10-5-10-5z"/><path d="M2 16l10 5 10-5M2 12l10 5 10-5"/></svg>`
}

export function renderClasses(root: HTMLElement, nav: ClassNav) {
  const profile = session.profile
  if (!profile) return
  renderList(root, profile, nav)
}

async function renderList(root: HTMLElement, profile: UserProfile, nav: ClassNav) {
  root.innerHTML = `<div class="screen"><p class="empty-note">Loading classes\u2026</p></div>`

  let classrooms: Classroom[]
  let invites: ClassroomInvite[]
  const myProgressByClassroom: Record<string, ProgressSnapshot | null> = {}

  try {
    ;[classrooms, invites] = await Promise.all([
      listClassroomsForUser(profile),
      profile.role !== 'teacher' ? listPendingInvites(profile.uid) : Promise.resolve([] as ClassroomInvite[]),
    ])

    // For students/individuals, pull each classroom's real progress snapshot
    // so the card can show honest mastery/XP, not a placeholder.
    if (profile.role !== 'teacher') {
      const snaps = await Promise.all(classrooms.map((c) => fetchClassroomProgress(c.id, [profile.uid])))
      classrooms.forEach((c, i) => {
        myProgressByClassroom[c.id] = snaps[i][profile.uid] ?? null
      })
    }
  } catch (err) {
    // A failed fetch used to leave this screen stuck on "Loading classes…"
    // forever with no signal why — this is the fix: show an actual error
    // and a way to retry instead of hanging silently.
    console.error('SunRoot: failed to load classes', err)
    root.innerHTML = `
      <div class="screen">
        <div class="class-panel">
          <h2>Couldn\u2019t load your classes</h2>
          <p class="empty-note">Something went wrong reaching the database. This is usually temporary.</p>
          <button class="ghost-button" id="retryClassesBtn">Try again</button>
        </div>
      </div>
    `
    root.querySelector('#retryClassesBtn')?.addEventListener('click', () => renderList(root, profile, nav))
    return
  }

  let showCreateForm = false
  let showPersonalModal = false

  function paint() {
    root.innerHTML = `
      <div class="screen">
        <div class="lab-header">
          <div>
            <h1>My Classes</h1>
            <p>${profile.role === 'teacher' ? 'Manage curriculum, monitor live student cohorts, and create classrooms.' : 'Your cyber-physical learning classrooms and personal study labs.'}</p>
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
            <button class="primary-button" id="openPersonalCreateBtn">✨ + Create Personal Class</button>
            ${profile.role === 'teacher' ? `<button class="ghost-button" id="showCreateBtn">+ Create Institutional Class</button>` : ''}
          </div>
        </div>

        ${
          invites.length
            ? `<div class="class-panel">
                <h2>Pending invites</h2>
                ${invites
                  .map(
                    (inv) => `<div class="invite-row" data-invite="${inv.id}" data-classroom="${inv.classroomId}">
                      <span>${escapeHtml(inv.classroomName)}</span>
                      <div class="invite-actions">
                        <button class="ghost-button small accept-btn">Accept</button>
                        <button class="ghost-button small decline-btn">Decline</button>
                      </div>
                    </div>`,
                  )
                  .join('')}
              </div>`
            : ''
        }

        ${
          showPersonalModal
            ? `<div class="modal-backdrop personal-class-modal-backdrop" id="personalClassModal" style="display:flex; position:fixed; inset:0; background:rgba(0,0,0,0.75); z-index:999; align-items:center; justify-content:center; padding:16px;">
                <div class="modal-box" style="max-width:580px; width:100%; text-align:left; padding:26px 28px; background:#0f172a; border:1px solid rgba(255,255,255,0.12); border-radius:14px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h2 style="margin:0; font-size:20px; display:flex; align-items:center; gap:8px;">
                      <span style="color:#38bdf8;">✨</span> Create Personal Class with Gemini
                    </h2>
                    <button class="ghost-button small" id="closePersonalModalBtn" type="button">✕</button>
                  </div>
                  <p style="color:var(--campus-text-muted); font-size:13px; line-height:1.5; margin:0 0 14px;">
                    Upload or paste your course syllabus, lecture scheme of work, or topic outline. Google Gemini will build a custom course with Udemy-style modular units and a grounded Personal Study Lab (briefing doc, audio podcast, flashcards & quiz).
                  </p>

                  <div style="display:flex; gap:6px; margin-bottom:12px; flex-wrap:wrap;">
                    <span style="font-size:11px; color:var(--campus-text-muted); align-self:center;">Templates:</span>
                    <button type="button" class="ghost-button small template-pill-btn" data-template="agritech">🌱 Smart Agritech</button>
                    <button type="button" class="ghost-button small template-pill-btn" data-template="iot">⚡ IoT Circuits</button>
                    <button type="button" class="ghost-button small template-pill-btn" data-template="robotics">🤖 Robotics Control</button>
                  </div>

                  <textarea id="personalOutlineInput" rows="7" placeholder="Paste your course outline, lecture syllabus, or scheme of work here... e.g.:&#10;Course: Embedded Robotics & Sensors&#10;Unit 1: Microcontroller GPIO and Sensor ADC&#10;Unit 2: Motor Drivers, PWM and Hysteresis&#10;Unit 3: Solar PV Harvesting & Telemetry" style="width:100%; padding:12px; font-size:13px; line-height:1.5; font-family:inherit; margin-bottom:12px; border-radius:8px; border:1px solid rgba(255,255,255,0.12); background:rgba(0,0,0,0.3); color:#fff; box-sizing:border-box;"></textarea>

                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
                    <label style="display:flex; align-items:center; gap:8px; font-size:12px; color:var(--campus-text-muted); cursor:pointer;">
                      <input type="checkbox" id="personalWorkshopCheckbox" checked />
                      Include digital twin workshop simulation
                    </label>
                    <label class="ghost-button small" style="cursor:pointer; font-size:12px; margin:0;">
                      📁 Upload File (.txt, .md)
                      <input type="file" id="personalOutlineFileInput" accept=".txt,.md,.json" style="display:none;" />
                    </label>
                  </div>

                  <div id="personalCreateStatus" style="font-size:13px; min-height:22px; margin-bottom:16px; color:var(--campus-text-muted);"></div>

                  <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button type="button" class="ghost-button small" id="cancelPersonalModalBtn">Cancel</button>
                    <button type="button" class="primary-button" id="submitPersonalClassBtn">⚡ Generate Course with Gemini</button>
                  </div>
                </div>
              </div>`
            : ''
        }

        ${
          profile.role === 'teacher' && showCreateForm
            ? `<div class="class-panel">
                  <h2>Create an institutional class</h2>
                  <form id="createClassForm" class="inline-form-stack">
                    <input type="text" id="className" placeholder="Class name" required />
                    <select id="classTopic" required>
                      <option value="" disabled selected>Choose a topic</option>
                      ${CLASS_TOPICS.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
                    </select>
                    <textarea id="classDescription" placeholder="What will students do in this class? (optional)" rows="2"></textarea>
                    <select id="classVisibility">
                      <option value="private">Private (invite only)</option>
                      <option value="public">Public (listed on Find a Class)</option>
                    </select>
                    <div class="inline-form">
                      <button type="submit" class="primary-button">Create class</button>
                      <button type="button" class="ghost-button" id="cancelCreateBtn">Cancel</button>
                    </div>
                  </form>
                </div>`
            : ''
        }

        ${
          profile.role === 'teacher'
            ? `<div class="class-panel suggest-panel">
                <h2>Don\u2019t see a topic you want to teach?</h2>
                <p class="empty-note">Send a request to the admin team \u2014 they\u2019ll see it and can build it out as a new class topic for everyone.</p>
                <form id="suggestForm" class="inline-form-stack">
                  <input type="text" id="suggestTitle" placeholder="Topic, e.g. Gear Reduction" required />
                  <textarea id="suggestDescription" placeholder="What would students build or learn?" rows="2"></textarea>
                  <button type="submit" class="ghost-button">Send suggestion</button>
                </form>
                <p class="empty-note" id="suggestStatus"></p>
              </div>`
            : ''
        }

        <div class="class-cards">
          ${
            classrooms.length
              ? classrooms
                  .map((c, i) => {
                    const p = myProgressByClassroom[c.id]
                    const pct = p ? Math.round(p.overallMastery * 100) : 0
                    const swatch = CLASS_ICON_COLORS[i % CLASS_ICON_COLORS.length]
                    const topicStr = c.topic || 'General'
                    const nameStr = c.name || 'Untitled Class'
                    const teacherStr = c.teacherName || 'Instructor'
                    const studentCount = c.studentIds?.length ?? 0
                    return `<button class="class-card-row" data-classroom="${c.id}">
                      <div class="class-card-icon" style="background:${swatch.bg}">${topicIcon(topicStr, swatch.fg)}</div>
                      <div class="class-card-mid">
                        <div class="class-card-name">${escapeHtml(nameStr)}</div>
                        <div class="class-card-sub">${escapeHtml(topicStr)}</div>
                        <div class="class-card-by">by ${escapeHtml(teacherStr)}</div>
                        ${c.isDemo ? `<span class="tag-badge">Demo Class</span> <span class="tag-badge tag-badge-muted">Pinned</span>` : ''}
                        ${c.isPersonal ? `<span class="tag-badge" style="background:rgba(56,189,248,0.2); color:#38bdf8;">Personal Study Lab</span>` : ''}
                      </div>
                      ${
                        profile.role !== 'teacher'
                          ? `<div class="class-card-progress">
                              <div class="class-card-progress-label">Progress</div>
                              <div class="cb-track class-card-track"><div class="cb-fill high" style="width:${pct}%"></div></div>
                              <div class="class-card-stats">
                                <span><strong>${pct}%</strong> Mastery</span>
                                <span><strong>${p?.xp ?? 0}</strong> XP</span>
                                <span><strong>${studentCount}</strong> Students</span>
                              </div>
                            </div>`
                          : `<div class="class-card-progress">
                              <div class="class-card-stats">
                                <span><strong>${studentCount}</strong> Students</span>
                              </div>
                            </div>`
                      }
                      <span class="class-card-cta">Open Class \u2192</span>
                    </button>`
                  })
                  .join('')
              : `<p class="empty-note">${profile.role === 'teacher' ? 'Create your first class above.' : 'No classes yet \u2014 create a personal class or check Find a Class.'}</p>`
          }
        </div>
      </div>
    `

    root.querySelector('#openPersonalCreateBtn')?.addEventListener('click', () => {
      showPersonalModal = true
      paint()
    })
    root.querySelector('#closePersonalModalBtn')?.addEventListener('click', () => {
      showPersonalModal = false
      paint()
    })
    root.querySelector('#cancelPersonalModalBtn')?.addEventListener('click', () => {
      showPersonalModal = false
      paint()
    })

    // Template pills
    root.querySelectorAll<HTMLButtonElement>('.template-pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.template
        const input = root.querySelector<HTMLTextAreaElement>('#personalOutlineInput')
        if (!input) return
        if (t === 'agritech') {
          input.value = `Course: Smart Agritech & Closed-Loop Irrigation
Unit 1: Solar Irradiance, Photovoltaics & Energy Reserve Budgeting
Unit 2: Capacitive Soil Moisture Telemetry & ADC Precision Calibration
Unit 3: Dual-Threshold Hysteresis State Machines to Prevent Pump Chatter
Unit 4: Closed-Loop Crop Transpiration & Autonomous Yield Maximization`
        } else if (t === 'iot') {
          input.value = `Course: Virtual Breadboard & Embedded IoT Systems
Unit 1: Microcontroller GPIO, Common Grounding & 3.3V/5V Logic Levels
Unit 2: Analog Sensor Signal Conditioning & Filter Noise Reduction
Unit 3: Transistor & MOSFET Drive Stages for Inductive Actuators
Unit 4: Low-Power Sleep Cycles & Telemetry Transmission Protocol`
        } else if (t === 'robotics') {
          input.value = `Course: Mechatronics & Actuator Control Systems
Unit 1: Motor Driver H-Bridges, PWM Speed Modulation & Back-EMF
Unit 2: Encoder Feedback & Closed-Loop Proportional Position Control
Unit 3: Power Distribution, Voltage Regulation & Peak Current Protection
Unit 4: Safety Interlocks, Failsafe States & Hardware Telemetry Logs`
        }
      })
    })

    // File upload
    root.querySelector<HTMLInputElement>('#personalOutlineFileInput')?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const input = root.querySelector<HTMLTextAreaElement>('#personalOutlineInput')
        if (input && typeof reader.result === 'string') {
          input.value = reader.result
        }
      }
      reader.readAsText(file)
    })

    // Submit Personal Class
    root.querySelector<HTMLButtonElement>('#submitPersonalClassBtn')?.addEventListener('click', async () => {
      const outlineInput = root.querySelector<HTMLTextAreaElement>('#personalOutlineInput')!
      const statusEl = root.querySelector<HTMLElement>('#personalCreateStatus')!
      const submitBtn = root.querySelector<HTMLButtonElement>('#submitPersonalClassBtn')!
      const workshopCheckbox = root.querySelector<HTMLInputElement>('#personalWorkshopCheckbox')!

      const text = outlineInput.value.trim()
      if (!text) {
        statusEl.textContent = 'Please enter or paste a course outline or scheme of work.'
        statusEl.style.color = '#ef4444'
        return
      }

      submitBtn.disabled = true
      submitBtn.textContent = 'Generating with Gemini\u2026'
      statusEl.style.color = '#38bdf8'
      statusEl.textContent = '⚡ Synthesizing course syllabus, modular units, and Study Lab with Gemini...'

      try {
        const coursePkg = await generateCourseFromOutline(text)
        statusEl.textContent = '💾 Saving personal class and grounded study material...'

        const newClass = await createPersonalClassroom({
          userId: profile.uid,
          userName: profile.displayName || 'Learner',
          name: coursePkg.title,
          description: coursePkg.description,
          topic: coursePkg.topic,
          hasWorkshop: workshopCheckbox.checked ? coursePkg.hasWorkshop : false,
          twinType: coursePkg.twinType,
          modules: coursePkg.modules,
        })

        // Also create study set linked to this class
        await createStudySet({
          classroomId: newClass.id,
          teacherId: profile.uid,
          teacherName: profile.displayName || 'Learner',
          title: `${coursePkg.title}: Study Lab`,
          sourceText: text,
          notes: coursePkg.studySet.notes,
          briefingDoc: coursePkg.studySet.briefingDoc,
          faq: coursePkg.studySet.faq,
          audioOverview: coursePkg.studySet.audioOverview,
          flashcards: coursePkg.studySet.flashcards,
          quiz: coursePkg.studySet.quiz,
        }).catch((e) => console.warn('Study set creation warning:', e))

        toast(`✨ Personal Class "${newClass.name}" created!`, 'success')
        showPersonalModal = false
        await refreshProfile()
        renderDetail(root, profile, newClass.id, nav)
      } catch (err: any) {
        console.error('Failed to create personal class:', err)
        statusEl.style.color = '#ef4444'
        statusEl.textContent = `Error: ${err?.message || 'Could not generate class'}`
        submitBtn.disabled = false
        submitBtn.textContent = '⚡ Generate Course with Gemini'
      }
    })

    root.querySelector('#showCreateBtn')?.addEventListener('click', () => {
      showCreateForm = true
      paint()
    })
    root.querySelector('#cancelCreateBtn')?.addEventListener('click', () => {
      showCreateForm = false
      paint()
    })

    root.querySelector<HTMLFormElement>('#suggestForm')?.addEventListener('submit', async (e) => {
      e.preventDefault()
      const titleInput = root.querySelector<HTMLInputElement>('#suggestTitle')!
      const descInput = root.querySelector<HTMLTextAreaElement>('#suggestDescription')!
      const statusEl = root.querySelector<HTMLParagraphElement>('#suggestStatus')!
      if (!titleInput.value.trim()) return
      await submitClassSuggestion({
        teacherId: profile.uid,
        teacherName: profile.displayName,
        title: titleInput.value.trim(),
        description: descInput.value.trim(),
      })
      titleInput.value = ''
      descInput.value = ''
      statusEl.textContent = 'Sent \u2014 thanks! The admin team will follow up.'
    })

    root.querySelectorAll<HTMLElement>('.invite-row').forEach((row) => {
      const inviteId = row.dataset.invite!
      const classroomId = row.dataset.classroom!
      row.querySelector('.accept-btn')?.addEventListener('click', async () => {
        await respondToInvite(inviteId, true, profile.uid, classroomId)
        await refreshProfile()
        renderList(root, session.profile!, nav)
      })
      row.querySelector('.decline-btn')?.addEventListener('click', async () => {
        await respondToInvite(inviteId, false, profile.uid, classroomId)
        renderList(root, session.profile!, nav)
      })
    })

    root.querySelector<HTMLFormElement>('#createClassForm')?.addEventListener('submit', async (e) => {
      e.preventDefault()
      const nameInput = root.querySelector<HTMLInputElement>('#className')!
      const topicSelect = root.querySelector<HTMLSelectElement>('#classTopic')!
      const descInput = root.querySelector<HTMLTextAreaElement>('#classDescription')!
      const visibilitySelect = root.querySelector<HTMLSelectElement>('#classVisibility')!
      const submitBtn = root.querySelector<HTMLButtonElement>('#createClassForm button[type="submit"]')!
      if (!nameInput.value.trim() || !topicSelect.value) return

      // Disabled immediately and the form disappears on success — this is
      // the fix for "accidentally creating the class twice" from a stray
      // second click, and for the new class not showing up right away.
      submitBtn.disabled = true
      submitBtn.textContent = 'Creating\u2026'
      try {
        const newId = await createClassroom({
          teacherId: profile.uid,
          teacherName: profile.displayName,
          name: nameInput.value.trim(),
          description: descInput.value.trim(),
          topic: topicSelect.value,
          visibility: visibilitySelect.value as 'public' | 'private',
        })
        // Patch the in-memory profile immediately rather than waiting on a
        // fresh Firestore round-trip, so the new class is visible right now.
        profile.classroomsTaughtIds = [...(profile.classroomsTaughtIds ?? []), newId]
        classrooms.push({
          id: newId,
          teacherId: profile.uid,
          teacherName: profile.displayName,
          name: nameInput.value.trim(),
          description: descInput.value.trim(),
          topic: topicSelect.value,
          visibility: visibilitySelect.value as 'public' | 'private',
          studentIds: [],
          createdAt: Date.now(),
        })
        showCreateForm = false
        await refreshProfile()
        paint()
      } catch (err) {
        console.error(err)
        submitBtn.disabled = false
        submitBtn.textContent = 'Create class'
      }
    })

    root.querySelectorAll<HTMLButtonElement>('.class-card-row').forEach((btn) => {
      btn.addEventListener('click', () => renderDetail(root, profile, btn.dataset.classroom!, nav))
    })
  }

  paint()
}

async function renderDetail(root: HTMLElement, profile: UserProfile, classroomId: string, nav: ClassNav) {
  root.innerHTML = `<div class="screen"><p class="empty-note">Loading class details\u2026</p></div>`

  try {
    const classroom = await getClassroom(classroomId)
    if (!classroom) {
      root.innerHTML = `
        <div class="screen">
          <div class="class-panel">
            <h2>Class not found</h2>
            <p class="empty-note">This class may have been deleted or the link is invalid.</p>
            <button class="ghost-button" id="backToClassesBtn">\u2190 Back to My Classes</button>
          </div>
        </div>
      `
      root.querySelector('#backToClassesBtn')?.addEventListener('click', () => renderClasses(root, nav))
      return
    }

    const studentIds = classroom.studentIds ?? []
    const [roster, teams, studySets] = await Promise.all([
      fetchUsersByIds(studentIds),
      listTeamsForClassroom(classroomId).catch(() => [] as Team[]),
      listStudySetsForClassroom(classroomId).catch(() => [] as StudySet[]),
    ])

    const isOwner = profile.role === 'teacher' && classroom.teacherId === profile.uid
    // Scoped to THIS classroom — the same student in a different class of
    // yours (or someone else's) gets a completely separate snapshot.
    let progressByUid: Record<string, ProgressSnapshot> = {}
    if (isOwner && studentIds.length > 0) {
      try {
        progressByUid = await fetchClassroomProgress(classroom.id, studentIds)
      } catch (e) {
        console.warn('Could not load classroom progress:', e)
      }
    }

    paintDetail(root, profile, classroom, roster, teams, isOwner, nav, progressByUid, studySets)
  } catch (err) {
    console.error('SunRoot: failed to load class detail', err)
    root.innerHTML = `
      <div class="screen">
        <div class="class-panel">
          <h2>Couldn\u2019t load this class</h2>
          <p class="empty-note">Something went wrong reaching the database. This is usually temporary.</p>
          <div class="inline-form">
            <button class="primary-button" id="retryDetailBtn">Try again</button>
            <button class="ghost-button" id="backToClassesBtn">Back to My Classes</button>
          </div>
        </div>
      </div>
    `
    root.querySelector('#retryDetailBtn')?.addEventListener('click', () => renderDetail(root, profile, classroomId, nav))
    root.querySelector('#backToClassesBtn')?.addEventListener('click', () => renderClasses(root, nav))
  }
}

interface ClassAnalytics {
  studentsWithData: number
  avgMastery: number
  avgXp: number
  atRisk: { student: UserProfile; reason: string }[]
  rapidProgressStudents: { student: UserProfile; rapidConcepts: string[]; velocity: string }[]
  rapidConcepts: { id: string; label: string; avgMastery: number; studentCount: number }[]
  weakestConcepts: { id: string; label: string; avgMastery: number; studentCount: number }[]
}

function computeClassAnalytics(roster: UserProfile[], progressByUid: Record<string, ProgressSnapshot>): ClassAnalytics {
  const withData = roster.filter((s) => progressByUid[s.uid])
  const avgMastery = withData.length
    ? withData.reduce((sum, s) => sum + progressByUid[s.uid].overallMastery, 0) / withData.length
    : 0
  const avgXp = withData.length ? withData.reduce((sum, s) => sum + progressByUid[s.uid].xp, 0) / withData.length : 0

  const atRisk: ClassAnalytics['atRisk'] = []
  const rapidProgressStudents: ClassAnalytics['rapidProgressStudents'] = []

  for (const s of roster) {
    const p = progressByUid[s.uid]
    if (!p) {
      atRisk.push({ student: s, reason: 'No activity yet' })
    } else {
      const studentRapids: string[] = []
      let totalCorrect = 0
      let totalIncorrect = 0

      for (const [conceptId, c] of Object.entries(p.conceptMastery)) {
        if (!c.engaged) continue
        totalCorrect += c.correct
        totalIncorrect += c.incorrect
        const accuracy = c.correct + c.incorrect > 0 ? c.correct / (c.correct + c.incorrect) : 0
        if (c.mastery >= 0.72 && accuracy >= 0.7 && c.correct >= 2) {
          studentRapids.push(CONCEPT_BY_ID.get(conceptId as any)?.label ?? conceptId)
        }
      }

      const totalAttempts = totalCorrect + totalIncorrect
      const velocityRatio = totalAttempts > 0 ? totalCorrect / totalAttempts : 0
      const velocity = velocityRatio >= 0.75 && p.conceptsMastered >= 3 ? '⚡ Rapid Pace' : velocityRatio < 0.45 ? '🔄 Friction' : '📈 Steady'

      if (studentRapids.length > 0) {
        rapidProgressStudents.push({ student: s, rapidConcepts: studentRapids, velocity })
      }

      if (p.overallMastery < 0.4 && Object.values(p.conceptMastery).some((c) => c.engaged)) {
        atRisk.push({ student: s, reason: `${Math.round(p.overallMastery * 100)}% mastery \u2014 trapped in error loops` })
      }
    }
  }

  const conceptTotals = new Map<string, { sum: number; count: number; correct: number; incorrect: number }>()
  for (const s of withData) {
    const p = progressByUid[s.uid]
    for (const [conceptId, c] of Object.entries(p.conceptMastery)) {
      if (!c.engaged) continue
      const entry = conceptTotals.get(conceptId) ?? { sum: 0, count: 0, correct: 0, incorrect: 0 }
      entry.sum += c.mastery
      entry.count += 1
      entry.correct += c.correct
      entry.incorrect += c.incorrect
      conceptTotals.set(conceptId, entry)
    }
  }

  const allConceptEntries = [...conceptTotals.entries()].map(([id, st]) => ({
    id,
    label: CONCEPT_BY_ID.get(id as any)?.label ?? id,
    avgMastery: st.sum / st.count,
    studentCount: st.count,
    accuracy: st.correct + st.incorrect > 0 ? st.correct / (st.correct + st.incorrect) : 0,
  }))

  const rapidConcepts = [...allConceptEntries]
    .filter((c) => c.avgMastery >= 0.7 && c.accuracy >= 0.7)
    .sort((a, b) => b.avgMastery - a.avgMastery)
    .slice(0, 3)

  const weakestConcepts = [...allConceptEntries]
    .sort((a, b) => a.avgMastery - b.avgMastery)
    .slice(0, 3)

  return { studentsWithData: withData.length, avgMastery, avgXp, atRisk, rapidProgressStudents, rapidConcepts, weakestConcepts }
}

function paintDetail(
  root: HTMLElement,
  profile: UserProfile,
  classroom: Classroom,
  roster: UserProfile[],
  teams: Team[],
  isOwner: boolean,
  nav: ClassNav,
  progressByUid: Record<string, ProgressSnapshot>,
  studySets: StudySet[],
) {
  const analytics = isOwner ? computeClassAnalytics(roster, progressByUid) : null

  const hasWorkshop =
    classroom.hasWorkshop !== false &&
    (classroom.id === DEMO_CLASSROOM_ID ||
      classroom.isDemo === true ||
      !!classroom.twinType ||
      classroom.topic.toLowerCase().includes('solar') ||
      classroom.topic.toLowerCase().includes('circuit') ||
      classroom.topic.toLowerCase().includes('robot') ||
      classroom.topic.toLowerCase().includes('water'))

  const modules: CourseModule[] =
    classroom.modules && classroom.modules.length > 0 ? classroom.modules : DEFAULT_CANONICAL_MODULES

  root.innerHTML = `
    <div class="screen">
      <button class="ghost-button small" id="backBtn">\u2190 Back to My Classes</button>
      <div class="lab-header">
        <div>
          <h1>${escapeHtml(classroom.name)} ${classroom.isDemo ? '<span class="tag-badge">Demo</span>' : ''} ${classroom.isPersonal ? '<span class="tag-badge" style="background:rgba(56,189,248,0.2); color:#38bdf8;">Personal Study Lab</span>' : ''}</h1>
          <p>by ${escapeHtml(classroom.teacherName)} \u00b7 ${escapeHtml(classroom.topic)}</p>
          ${classroom.description ? `<p>${escapeHtml(classroom.description)}</p>` : ''}
        </div>
      </div>

      ${
        hasWorkshop
          ? `<div class="workshop-callout-card" style="background: linear-gradient(135deg, rgba(16,185,129,0.12), rgba(56,189,248,0.06)); border: 1px solid rgba(16,185,129,0.3); border-radius: 14px; padding: 20px 24px; margin: 16px 0 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px;">
              <div style="display: flex; align-items: center; gap: 14px;">
                <div style="font-size: 34px;">🔬</div>
                <div>
                  <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.08em; color: #10b981;">Practical Simulation Workshop Available</div>
                  <div style="font-size: 17px; font-weight: 800; color: #fff;">Interactive Digital Twin Simulation Lab</div>
                  <div style="font-size: 12px; color: var(--campus-text-muted);">Virtual breadboard, GPIO pin voltages, Blockly logic, and telemetry farm.</div>
                </div>
              </div>
              <button class="primary-button" id="openWorkshopBtn" style="font-weight: 700; padding: 12px 22px;">
                Enter Practical Workshop 🔬 \u2192
              </button>
            </div>`
          : ''
      }

      <!-- Udemy-Style Curriculum Section -->
      <div class="class-panel curriculum-panel">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h2 style="margin: 0;">📚 Course Curriculum &amp; Modules</h2>
          <span class="tag-badge" style="background: rgba(255,255,255,0.08);">${modules.length} Lessons</span>
        </div>
        <p class="empty-note" style="margin-bottom: 16px;">Syllabus outline. Complete lessons, test retention in the Personal Study Lab, or launch interactive labs.</p>
        <div class="curriculum-accordion-list">
          ${modules
            .map(
              (m, idx) => `
            <div class="module-card-row" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 14px 18px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
              <div style="flex: 1; min-width: 220px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 11px; font-weight: 700; color: #38bdf8; text-transform: uppercase;">Unit ${idx + 1}</span>
                  <span style="font-size: 12px; color: var(--campus-text-muted);">&bull; ${m.durationMinutes || 45} mins</span>
                </div>
                <div style="font-weight: 700; font-size: 15px; margin: 2px 0 4px; color: #fff;">${escapeHtml(m.title)}</div>
                <div style="font-size: 12px; color: var(--campus-text-muted);">${escapeHtml(m.description)}</div>
              </div>
              <div style="display: flex; gap: 8px;">
                <button class="ghost-button small module-study-btn" data-modidx="${idx}">📖 Study Lab</button>
                ${hasWorkshop ? `<button class="primary-button small module-lab-btn" data-modidx="${idx}">Launch Lab ⚡</button>` : ''}
              </div>
            </div>`,
            )
            .join('')}
        </div>
      </div>

      <div class="class-panel study-set-panel">
        <h2>Personal Study Lab (AI Study Sets)</h2>
        <p class="empty-note">AI-generated notes, briefing doc, 2-speaker audio podcast, flashcards, and quiz.</p>
        ${
          isOwner
            ? `<button class="ghost-button" id="showStudySetFormBtn">+ New study set</button>
                <form id="studySetForm" class="inline-form-stack" hidden>
                  <input type="text" id="studySetTitle" placeholder="Title, e.g. Unit 3: Feedback Control" required />
                  <textarea id="studySetSource" placeholder="Paste or type your course notes here \u2014 the AI will build the study set from exactly this." rows="8" required></textarea>
                  <div class="inline-form">
                    <button type="submit" class="primary-button" id="generateStudySetBtn">Generate with AI</button>
                    <button type="button" class="ghost-button" id="cancelStudySetBtn">Cancel</button>
                  </div>
                  <p class="empty-note" id="studySetStatus"></p>
                </form>`
            : ''
        }
        ${
          studySets.length
            ? `<ul class="roster-list" style="margin-top:12px">
                ${studySets
                  .map(
                    (s) => `<li data-set="${s.id}">
                      <span>${escapeHtml(s.title)} <span class="empty-note">by ${escapeHtml(s.teacherName)} \u00b7 ${s.flashcards.length} cards \u00b7 ${s.quiz.length} questions</span></span>
                      <div class="invite-actions">
                        <button class="ghost-button small open-set-btn" data-set="${s.id}">Open</button>
                        ${isOwner ? `<button class="ghost-button small danger-btn delete-set-btn" data-set="${s.id}">Delete</button>` : ''}
                      </div>
                    </li>`,
                  )
                  .join('')}
              </ul>`
            : `<p class="empty-note" style="margin-top:8px">No study sets yet.</p>`
        }
      </div>

      ${
        isOwner && analytics
          ? `<div class="class-panel analytics-panel">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <h2>Class Observability &amp; Analytics</h2>
                <div class="inline-form" style="gap:8px;">
                  <button class="ghost-button small" id="exportGradebookBtn">📥 Export Gradebook (CSV)</button>
                  <button class="ghost-button small" id="resetClassBtn" style="color:#f87171; border-color:rgba(248,113,113,0.3)">🔄 Reset to 1 Class</button>
                </div>
              </div>

              ${
                analytics.studentsWithData === 0
                  ? `<p class="empty-note">No student activity recorded yet.</p>`
                  : `
                    <div class="dash-grid">
                      <div class="teach-card"><div class="teach-tag">AVG MASTERY</div><div class="class-figure">${Math.round(analytics.avgMastery * 100)}%</div></div>
                      <div class="teach-card"><div class="teach-tag">AVG XP</div><div class="class-figure">${Math.round(analytics.avgXp)}</div></div>
                      <div class="teach-card"><div class="teach-tag">ACTIVE STUDENTS</div><div class="class-figure">${analytics.studentsWithData}/${roster.length}</div></div>
                      <div class="teach-card"><div class="teach-tag">RAPID ACCELERATORS</div><div class="class-figure" style="color:#10B981">${analytics.rapidProgressStudents.length}</div></div>
                    </div>

                    ${
                      analytics.rapidConcepts.length
                        ? `<h3 class="sub-heading" style="color:#10B981; margin-top:14px;">⚡ Rapid Progression Areas (Cohort Acceleration)</h3>
                          <div class="class-bars">
                            ${analytics.rapidConcepts
                              .map(
                                (c) => `<div class="class-bar-row"><span class="cb-name">⚡ ${escapeHtml(c.label)}</span>
                                  <div class="cb-track"><div class="cb-fill high" style="width:${c.avgMastery * 100}%; background:#10B981;"></div></div>
                                  <span class="cb-pct" style="color:#10B981;">${Math.round(c.avgMastery * 100)}% (${c.studentCount} students)</span></div>`,
                              )
                              .join('')}
                          </div>`
                        : ''
                    }

                    ${
                      analytics.rapidProgressStudents.length
                        ? `<h3 class="sub-heading" style="margin-top:14px;">Accelerated Students (${analytics.rapidProgressStudents.length})</h3>
                          <ul class="roster-list">
                            ${analytics.rapidProgressStudents
                              .map((r) => `<li><span><strong>${escapeHtml(r.student.displayName)}</strong></span><span class="roster-progress" style="color:#10B981">${escapeHtml(r.velocity)} \u2014 Rapidly acquiring: ${escapeHtml(r.rapidConcepts.join(', '))}</span></li>`)
                              .join('')}
                          </ul>`
                        : ''
                    }

                    ${
                      analytics.atRisk.length
                        ? `<h3 class="sub-heading" style="margin-top:14px;">Cognitive Friction &amp; Inactivity (${analytics.atRisk.length})</h3>
                          <ul class="roster-list">
                            ${analytics.atRisk
                              .map((r) => `<li><span>${escapeHtml(r.student.displayName)}</span><span class="roster-progress at-risk">${escapeHtml(r.reason)}</span></li>`)
                              .join('')}
                          </ul>`
                        : `<p class="empty-note">No students currently flagged with cognitive friction.</p>`
                    }

                    ${
                      analytics.weakestConcepts.length
                        ? `<h3 class="sub-heading" style="margin-top:14px;">Weakest concepts &amp; bottlenecks</h3>
                          <div class="class-bars">
                            ${analytics.weakestConcepts
                              .map(
                                (c) => `<div class="class-bar-row"><span class="cb-name">${escapeHtml(c.label)}</span>
                                  <div class="cb-track"><div class="cb-fill ${c.avgMastery < 0.5 ? 'low' : 'high'}" style="width:${c.avgMastery * 100}%"></div></div>
                                  <span class="cb-pct">${Math.round(c.avgMastery * 100)}%</span></div>`,
                              )
                              .join('')}
                          </div>`
                        : ''
                    }
                  `
              }
              <button class="ghost-button" id="aiInsightsBtn" style="margin-top:14px">Generate AI teaching recommendations</button>
              <div id="aiInsightsResult"></div>
            </div>`
          : ''
      }

      ${
        isOwner
          ? `<div class="class-panel">
              <h2>Invite a student</h2>
              <form id="inviteForm" class="inline-form">
                <input type="text" id="tagInput" placeholder="Student tag, e.g. SR-7K2Q9F" />
                <button type="submit" class="primary-button">Invite</button>
              </form>
              <p class="empty-note" id="inviteStatus"></p>
            </div>`
          : ''
      }

      <div class="class-panel">
        <h2>Roster (${roster.length})</h2>
        ${
          roster.length
            ? `<ul class="roster-list">
                ${roster
                  .map((s) => {
                    const p = progressByUid[s.uid]
                    return `<li data-uid="${s.uid}" class="roster-row">
                      <div class="roster-identity">
                        <span>${escapeHtml(s.displayName)}</span>
                        ${
                          isOwner
                            ? p
                              ? `<span class="roster-progress">
                                  <span class="presence-dot ${isRecentlyActive(p.updatedAt) ? 'presence-online' : ''}"></span>
                                  ${isRecentlyActive(p.updatedAt) ? 'Online now' : `Active ${relativeTime(p.updatedAt)}`} \u00b7
                                  ${p.rank} \u00b7 ${p.xp} XP \u00b7 ${p.conceptsMastered}/${p.totalConcepts} concepts \u00b7 ${Math.round(p.overallMastery * 100)}% mastery
                                  <button class="link-button details-toggle-btn" data-uid="${s.uid}">Full report</button></span>
                                <div class="student-detail" id="detail-${s.uid}" hidden>${studentDetailHtml(s, p)}</div>`
                              : `<span class="roster-progress empty-note">No activity yet</span>`
                            : ''
                        }
                      </div>
                      ${isOwner ? `<button class="ghost-button small remove-btn">Remove</button>` : ''}
                    </li>`
                  })
                  .join('')}
              </ul>`
            : `<p class="empty-note">No students yet.</p>`
        }
        ${
          !isOwner && profile.role !== 'teacher' && !classroom.isDemo
            ? `<button class="ghost-button small" id="leaveBtn" style="margin-top:12px">Leave class</button>`
            : ''
        }
      </div>

      <div class="class-panel">
        <h2>Teams</h2>
        <p class="empty-note">Team up with classmates to work on a project together \u2014 save your work with a message so the team can see what changed, like a commit.</p>
        <form id="teamForm" class="inline-form">
          <input type="text" id="teamName" placeholder="New team name" />
          <button type="submit" class="primary-button">Create team</button>
        </form>
        ${
          teams.length
            ? teams
                .map((t) => {
                  const isMember = t.memberUids.includes(profile.uid)
                  const canSeeDetail = isOwner || isMember
                  const myRole = t.memberRoles?.[profile.uid]
                  return `
                    <div class="team-card" data-team="${t.id}">
                      <div class="team-card-head">
                        <span class="class-row-name">${escapeHtml(t.name)}</span>
                        <span class="empty-note">${t.memberUids.length} member${t.memberUids.length === 1 ? '' : 's'}${t.lastSavedBy ? ` \u00b7 last saved by ${escapeHtml(t.lastSavedBy)} ${t.lastSavedAt ? relativeTime(t.lastSavedAt) : ''}` : ''}</span>
                      </div>

                      ${
                        canSeeDetail
                          ? `
                            <div class="team-budget-line">
                              <span class="empty-note">Team budget: <strong>${teamBudgetRemaining(t)}</strong> / ${t.budget} credits remaining</span>
                            </div>
                            <div class="team-members">
                              ${t.memberUids
                                .map((uid) => {
                                  const member = roster.find((r) => r.uid === uid)
                                  const name = member?.displayName ?? (uid === profile.uid ? profile.displayName : uid)
                                  const role = t.memberRoles?.[uid]
                                  return `<span class="team-member-chip">${escapeHtml(name)}${role ? ` \u2014 ${escapeHtml(role)}` : ''}</span>`
                                })
                                .join('')}
                            </div>
                            ${
                              isMember
                                ? `<div class="inline-form" style="margin-top:8px">
                                    <select class="role-select" data-team="${t.id}">
                                      <option value="" ${!myRole ? 'selected' : ''} disabled>Pick your role</option>
                                      ${TEAM_ROLES.map((r) => `<option value="${r}" ${myRole === r ? 'selected' : ''}>${r}</option>`).join('')}
                                    </select>
                                    <button class="primary-button small enter-team-btn" data-team="${t.id}">Enter Team Workshop \u2192</button>
                                  </div>`
                                : `<button class="ghost-button small join-team-btn" data-team="${t.id}" style="margin-top:8px">Join</button>`
                            }
                            ${
                              t.purchaseLog?.length
                                ? `<div class="commit-log">
                                    <div class="sub-heading">Purchase history</div>
                                    ${t.purchaseLog
                                      .slice(0, 6)
                                      .map(
                                        (p) => `<div class="commit-row">
                                          <span class="commit-author">${escapeHtml(p.displayName)}</span>
                                          <span class="commit-message">bought ${p.quantityAdded > 1 ? `${p.quantityAdded}\u00d7 ` : ''}${escapeHtml(p.partName)} (${p.cost} credits)</span>
                                          <span class="commit-time">${relativeTime(p.timestamp)}</span>
                                        </div>`,
                                      )
                                      .join('')}
                                  </div>`
                                : ''
                            }
                            ${
                              t.commits?.length
                                ? `<div class="commit-log">
                                    <div class="sub-heading">Recent saves</div>
                                    ${t.commits
                                      .slice(0, 5)
                                      .map(
                                        (c) => `<div class="commit-row">
                                          <span class="commit-author">${escapeHtml(c.displayName)}</span>
                                          <span class="commit-message">${escapeHtml(c.message)}</span>
                                          <span class="commit-time">${relativeTime(c.timestamp)}</span>
                                        </div>`,
                                      )
                                      .join('')}
                                  </div>`
                                : `<p class="empty-note" style="margin-top:8px">No saves shipped yet.</p>`
                            }
                          `
                          : `<button class="ghost-button small join-team-btn" data-team="${t.id}" style="margin-top:8px">Join</button>`
                      }
                    </div>
                  `
                })
                .join('')
            : `<p class="empty-note">No teams yet \u2014 start one above.</p>`
        }
      </div>

      ${
        isOwner && !classroom.isDemo
          ? `<div class="class-panel danger-panel">
              <h2>Danger zone</h2>
              <p class="empty-note">Deleting a class removes it for every enrolled student. This can\u2019t be undone.</p>
              <button class="ghost-button danger-btn" id="deleteClassBtn">Delete this class</button>
            </div>`
          : ''
      }
    </div>
  `

  root.querySelector('#backBtn')?.addEventListener('click', () => renderClasses(root, nav))

  root.querySelectorAll<HTMLButtonElement>('.details-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = root.querySelector<HTMLElement>(`#detail-${btn.dataset.uid}`)
      if (panel) panel.hidden = !panel.hidden
    })
  })

  root.querySelectorAll<HTMLButtonElement>('.student-ai-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const uid = btn.dataset.uid!
      const student = roster.find((s) => s.uid === uid)
      const p = progressByUid[uid]
      const resultEl = root.querySelector<HTMLElement>(`#studentAIResult-${uid}`)!
      if (!student || !p) return

      btn.disabled = true
      btn.textContent = 'Thinking\u2026'
      resultEl.innerHTML = ''

      const engaged = Object.entries(p.conceptMastery).filter(([, c]) => c.engaged)
      const rapidConcepts = engaged.filter(([, c]) => c.mastery >= 0.72 && (c.correct / (c.correct + c.incorrect)) >= 0.7 && c.correct >= 2)
      const weakest = [...engaged].sort((a, b) => a[1].mastery - b[1].mastery).slice(0, 4)
      const stuckOn = engaged.filter(([, c]) => c.correct + c.incorrect > 0 && c.incorrect / (c.correct + c.incorrect) >= 0.5 && c.incorrect >= 2)
      const learningStyle = student.learningStyle
        ? `Cognitive Profile: ${Math.round(student.learningStyle.visual * 100)}% Visual, ${Math.round(student.learningStyle.kinesthetic * 100)}% Kinesthetic, ${Math.round(student.learningStyle.readingWriting * 100)}% Reading.`
        : 'Cognitive Profile: Multi-modal experiential.'

      const summary = [
        `Student: ${student.displayName}. Class: ${classroom.name} (${classroom.topic}). Rank: ${p.rank}, ${p.xp} XP, ${p.conceptsMastered}/${p.totalConcepts} concepts mastered.`,
        rapidConcepts.length
          ? `Rapid Progression Areas (Accelerated Mastery): ${rapidConcepts.map(([id, c]) => `${CONCEPT_BY_ID.get(id as any)?.label ?? id} (${Math.round(c.mastery * 100)}%)`).join(', ')}.`
          : 'Rapid Progression Areas: None yet.',
        weakest.length
          ? `Weakest Concepts: ${weakest.map(([id, c]) => `${CONCEPT_BY_ID.get(id as any)?.label ?? id} (${Math.round(c.mastery * 100)}%)`).join(', ')}.`
          : 'Weakest Concepts: None.',
        stuckOn.length
          ? `Cognitive Bottlenecks (Trapped in Error Loops): ${stuckOn.map(([id]) => CONCEPT_BY_ID.get(id as any)?.label ?? id).join(', ')}.`
          : '',
        learningStyle,
      ]
        .filter(Boolean)
        .join('\n')

      const res = await generateStudentRecommendation(summary)
      btn.disabled = false
      btn.textContent = `Regenerate intervention for ${(student.displayName || 'Student').split(' ')[0]}`
      resultEl.innerHTML = res.text
        ? `<div class="ai-insight-box">${escapeHtml(res.text).replace(/\n/g, '<br>')}</div>`
        : `<p class="empty-note">Couldn\u2019t generate an intervention: ${escapeHtml(res.error ?? 'unknown error')}</p>`
    })
  })

  // 1-Click LMS Gradebook CSV Export
  root.querySelector<HTMLButtonElement>('#exportGradebookBtn')?.addEventListener('click', () => {
    const headers = [
      'Student Name',
      'Student ID / Tag',
      'Overall Mastery (%)',
      'Engineering XP',
      'Rank',
      'Concepts Mastered',
      'Total Concepts',
      'Days Survived',
      'Rapid Progression Concepts',
      'Cognitive Bottlenecks',
      'Learning Velocity',
      'Last Active Date',
    ]

    const rows = roster.map((s) => {
      const p = progressByUid[s.uid]
      if (!p) {
        return [
          `"${s.displayName.replace(/"/g, '""')}"`,
          `"${s.studentTag || 'N/A'}"`,
          '0%',
          '0',
          'Explorer',
          '0',
          '10',
          '0',
          '"None"',
          '"No activity"',
          '"Inactive"',
          '"Never"',
        ].join(',')
      }

      const engaged = Object.entries(p.conceptMastery).filter(([, c]) => c.engaged)
      const rapid = engaged
        .filter(([, c]) => c.mastery >= 0.72 && (c.correct / (c.correct + c.incorrect)) >= 0.7 && c.correct >= 2)
        .map(([id]) => CONCEPT_BY_ID.get(id as any)?.label ?? id)
      const stuck = engaged
        .filter(([, c]) => (c.incorrect / (c.correct + c.incorrect)) >= 0.5 && c.incorrect >= 2)
        .map(([id]) => CONCEPT_BY_ID.get(id as any)?.label ?? id)

      const totalCorrect = engaged.reduce((acc, [, c]) => acc + c.correct, 0)
      const totalIncorrect = engaged.reduce((acc, [, c]) => acc + c.incorrect, 0)
      const velocityRatio = totalCorrect + totalIncorrect > 0 ? totalCorrect / (totalCorrect + totalIncorrect) : 0
      const velocity = velocityRatio >= 0.75 && p.conceptsMastered >= 3 ? 'Rapid Acceleration' : stuck.length > 0 ? 'Cognitive Friction' : 'Steady Growth'

      return [
        `"${s.displayName.replace(/"/g, '""')}"`,
        `"${s.studentTag || 'N/A'}"`,
        `"${Math.round(p.overallMastery * 100)}%"`,
        p.xp,
        `"${p.rank}"`,
        p.conceptsMastered,
        p.totalConcepts,
        p.daysSurvived,
        `"${rapid.join('; ') || 'None'}"`,
        `"${stuck.join('; ') || 'None'}"`,
        `"${velocity}"`,
        `"${new Date(p.updatedAt).toISOString().split('T')[0]}"`,
      ].join(',')
    })

    const csvContent = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `SunRoot_Gradebook_${classroom.name.replace(/[^a-zA-Z0-9]/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast('Gradebook exported for LMS integration.', 'success')
  })

  // 1-Click Database Reset to Single Canonical Class
  root.querySelector<HTMLButtonElement>('#resetClassBtn')?.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to prune all auxiliary classes and leave only 1 canonical class on the database?')) return
    try {
      const res = await resetDatabaseToSingleClassroom()
      toast(res.message, 'success')
      renderClasses(root, nav)
    } catch (err: any) {
      toast('Failed to reset classrooms: ' + err?.message, 'info')
    }
  })

  root.querySelector<HTMLButtonElement>('#aiInsightsBtn')?.addEventListener('click', async (e) => {
    if (!analytics) return
    const btn = e.currentTarget as HTMLButtonElement
    const resultEl = root.querySelector<HTMLElement>('#aiInsightsResult')!
    btn.disabled = true
    btn.textContent = 'Thinking\u2026'
    resultEl.innerHTML = ''

    const summary = [
      `Class: ${classroom.name} (${classroom.topic}).`,
      `${analytics.studentsWithData} of ${roster.length} students have activity.`,
      `Average mastery: ${Math.round(analytics.avgMastery * 100)}%.`,
      analytics.rapidProgressStudents.length
        ? `Rapidly progressing students (accelerated pace): ${analytics.rapidProgressStudents.map((r) => `${r.student.displayName} (${r.rapidConcepts.join(', ')})`).join('; ')}.`
        : 'No accelerated students yet.',
      analytics.atRisk.length
        ? `Struggling or inactive students: ${analytics.atRisk.map((r) => `${r.student.displayName} (${r.reason})`).join('; ')}.`
        : 'No students currently flagged as struggling.',
      analytics.weakestConcepts.length
        ? `Weakest concepts class-wide: ${analytics.weakestConcepts.map((c) => `${c.label} (${Math.round(c.avgMastery * 100)}% avg, ${c.studentCount} students)`).join('; ')}.`
        : '',
    ]
      .filter(Boolean)
      .join(' ')

    const res = await generateTeachingRecommendations(summary)
    btn.disabled = false
    btn.textContent = 'Regenerate recommendations'
      resultEl.innerHTML = res.text
        ? `<div class="ai-insight-box">${escapeHtml(res.text).replace(/\n/g, '<br>')}</div>`
        : `<p class="empty-note">Couldn\u2019t generate recommendations: ${escapeHtml(res.error ?? 'unknown error')}</p>`
    })
    root.querySelector('#openWorkshopBtn')?.addEventListener('click', () => nav.toWorkshop(classroom.id))

  root.querySelectorAll<HTMLButtonElement>('.module-study-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (studySets.length > 0) {
        openStudySet(studySets[0].id)
      }
      nav.toStudySetViewer()
    })
  })

  root.querySelectorAll<HTMLButtonElement>('.module-lab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      nav.toWorkshop(classroom.id)
    })
  })

  root.querySelector('#showStudySetFormBtn')?.addEventListener('click', () => {
    root.querySelector<HTMLElement>('#studySetForm')!.hidden = false
    root.querySelector<HTMLElement>('#showStudySetFormBtn')!.hidden = true
  })
  root.querySelector('#cancelStudySetBtn')?.addEventListener('click', () => {
    root.querySelector<HTMLElement>('#studySetForm')!.hidden = true
    root.querySelector<HTMLElement>('#showStudySetFormBtn')!.hidden = false
  })

  root.querySelector<HTMLFormElement>('#studySetForm')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const titleInput = root.querySelector<HTMLInputElement>('#studySetTitle')!
    const sourceInput = root.querySelector<HTMLTextAreaElement>('#studySetSource')!
    const statusEl = root.querySelector<HTMLParagraphElement>('#studySetStatus')!
    const btn = root.querySelector<HTMLButtonElement>('#generateStudySetBtn')!
    if (!titleInput.value.trim() || !sourceInput.value.trim()) return

    btn.disabled = true
    btn.textContent = 'Generating\u2026 this can take a bit'
    statusEl.textContent = ''

    const result = await generateStudySet(sourceInput.value)
    if (result.error) {
      statusEl.textContent = `Couldn\u2019t generate a study set: ${result.error}`
      btn.disabled = false
      btn.textContent = 'Generate with AI'
      return
    }

    await createStudySet({
      classroomId: classroom.id,
      teacherId: profile.uid,
      teacherName: profile.displayName,
      title: titleInput.value.trim(),
      sourceText: sourceInput.value,
      notes: result.notes,
      flashcards: result.flashcards,
      quiz: result.quiz,
    })
    renderDetail(root, profile, classroom.id, nav)
  })

  root.querySelectorAll<HTMLButtonElement>('.open-set-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      openStudySet(btn.dataset.set!)
      nav.toStudySetViewer()
    })
  })
  root.querySelectorAll<HTMLButtonElement>('.delete-set-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this study set? This can\u2019t be undone.')) return
      await deleteStudySet(btn.dataset.set!)
      renderDetail(root, profile, classroom.id, nav)
    })
  })

  root.querySelector<HTMLFormElement>('#inviteForm')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const input = root.querySelector<HTMLInputElement>('#tagInput')!
    const statusEl = root.querySelector<HTMLParagraphElement>('#inviteStatus')!
    if (!input.value.trim()) return
    const result = await inviteStudentByTag({
      classroomId: classroom.id,
      classroomName: classroom.name,
      teacherId: profile.uid,
      tag: input.value,
    })
    statusEl.textContent = {
      sent: 'Invite sent.',
      not_found: 'No student found with that tag.',
      already_pending: 'That student already has a pending invite.',
      already_member: 'That student is already in this class.',
    }[result]
    if (result === 'sent') input.value = ''
  })

  root.querySelectorAll<HTMLElement>('.roster-list li').forEach((li) => {
    li.querySelector('.remove-btn')?.addEventListener('click', async () => {
      await removeStudent(classroom.id, li.dataset.uid!)
      renderDetail(root, profile, classroom.id, nav)
    })
  })

  root.querySelector('#leaveBtn')?.addEventListener('click', async () => {
    await leaveClassroom(classroom.id, profile.uid)
    await refreshProfile()
    renderClasses(root, nav)
  })

  root.querySelector('#deleteClassBtn')?.addEventListener('click', async () => {
    if (!confirm(`Delete "${classroom.name}"? This can't be undone.`)) return
    await deleteClassroom(classroom.id, profile.uid)
    await refreshProfile()
    renderClasses(root, nav)
  })

  root.querySelector<HTMLFormElement>('#teamForm')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const input = root.querySelector<HTMLInputElement>('#teamName')!
    if (!input.value.trim()) return
    await createTeam({ classroomId: classroom.id, name: input.value.trim(), creatorUid: profile.uid })
    renderDetail(root, profile, classroom.id, nav)
  })

  root.querySelectorAll<HTMLButtonElement>('.join-team-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await joinTeam(btn.dataset.team!, profile.uid)
      renderDetail(root, profile, classroom.id, nav)
    })
  })

  root.querySelectorAll<HTMLSelectElement>('.role-select').forEach((select) => {
    select.addEventListener('change', async () => {
      if (!select.value) return
      await setMyTeamRole(select.dataset.team!, profile.uid, select.value as TeamRole)
      renderDetail(root, profile, classroom.id, nav)
    })
  })

  root.querySelectorAll<HTMLButtonElement>('.enter-team-btn').forEach((btn) => {
    btn.addEventListener('click', () => nav.toTeamWorkshop(classroom.id, btn.dataset.team!))
  })
}

function studentDetailHtml(student: UserProfile, p: ProgressSnapshot): string {
  const engaged = Object.entries(p.conceptMastery).filter(([, c]) => c.engaged)
  const label = (id: string) => CONCEPT_BY_ID.get(id as any)?.label ?? id

  const rapidConcepts = engaged.filter(([, c]) => c.mastery >= 0.72 && (c.correct / (c.correct + c.incorrect)) >= 0.7 && c.correct >= 2)
  const stuckConcepts = engaged.filter(([, c]) => (c.incorrect / (c.correct + c.incorrect)) >= 0.5 && c.incorrect >= 2)

  const totalCorrect = engaged.reduce((acc, [, c]) => acc + c.correct, 0)
  const totalIncorrect = engaged.reduce((acc, [, c]) => acc + c.incorrect, 0)
  const velocityRatio = totalCorrect + totalIncorrect > 0 ? totalCorrect / (totalCorrect + totalIncorrect) : 0
  const isAccelerated = velocityRatio >= 0.75 && p.conceptsMastered >= 3
  const isStuck = stuckConcepts.length > 0

  const velocityBadge = isAccelerated
    ? '<span class="tag-badge" style="background:rgba(16,185,129,0.18); color:#10B981; border:1px solid rgba(16,185,129,0.4)">⚡ Rapid Acceleration Velocity</span>'
    : isStuck
      ? '<span class="tag-badge" style="background:rgba(239,68,68,0.18); color:#EF4444; border:1px solid rgba(239,68,68,0.4)">🔄 Cognitive Friction in Progress</span>'
      : '<span class="tag-badge" style="background:rgba(56,189,248,0.18); color:#38BDF8; border:1px solid rgba(56,189,248,0.4)">📈 Steady Progression</span>'

  const style = student.learningStyle || { visual: 0.45, kinesthetic: 0.35, readingWriting: 0.2 }

  const conceptRows = [...engaged]
    .sort((a, b) => a[1].mastery - b[1].mastery)
    .map(([id, c]) => {
      const struggleRatio = c.correct + c.incorrect > 0 ? c.incorrect / (c.correct + c.incorrect) : 0
      const stuck = struggleRatio >= 0.5 && c.incorrect >= 2
      const rapid = c.mastery >= 0.72 && (c.correct / (c.correct + c.incorrect)) >= 0.7 && c.correct >= 2
      return `
        <div class="concept-detail-row ${stuck ? 'is-stuck' : rapid ? 'is-rapid' : ''}">
          <div class="concept-detail-head">
            <span class="cb-name">
              ${rapid ? '⚡ ' : ''}${escapeHtml(label(id))}
              ${rapid ? '<span class="tag-badge" style="color:#10B981; border-color:rgba(16,185,129,0.3); font-size:10px; margin-left:6px;">Rapid Acquisition</span>' : ''}
              ${stuck ? '<span class="tag-badge" style="color:#EF4444; border-color:rgba(239,68,68,0.3); font-size:10px; margin-left:6px;">Bottleneck Loop</span>' : ''}
            </span>
            <span class="cb-pct" style="${rapid ? 'color:#10B981;' : stuck ? 'color:#EF4444;' : ''}">${Math.round(c.mastery * 100)}%</span>
          </div>
          <div class="cb-track"><div class="cb-fill ${c.mastery >= MASTERY_THRESHOLD ? 'high' : 'low'}" style="width:${c.mastery * 100}%; ${rapid ? 'background:#10B981;' : ''}"></div></div>
          <div class="empty-note">
            ${c.correct} correct \u00b7 ${c.incorrect} incorrect \u00b7 last active ${relativeTime(c.lastSeen)}
            ${stuck ? ' \u00b7 <span class="at-risk">repeating error loops</span>' : ''}
          </div>
          ${c.evidence.length ? `<div class="evidence-log">${c.evidence.map((e) => `<div class="evidence-line">${escapeHtml(e)}</div>`).join('')}</div>` : ''}
        </div>
      `
    })
    .join('')

  return `
    <div class="student-report">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
        <div>
          <span style="font-weight:600; font-size:15px; color:#F1F5F9;">Cognitive &amp; Progression Dossier</span>
          <span class="empty-note" style="margin-left:8px;">Student ID: ${escapeHtml(student.studentTag || 'N/A')}</span>
          ${rapidConcepts.length > 0 ? `<div style="font-size:12px; color:#10B981; margin-top:3px;">⚡ Rapidly acquiring: <strong>${rapidConcepts.map(([id]) => escapeHtml(label(id))).join(', ')}</strong></div>` : ''}
        </div>
        ${velocityBadge}
      </div>

      <div class="dash-grid">
        <div class="teach-card"><div class="teach-tag">RANK</div><div class="class-figure" style="font-size:20px">${escapeHtml(p.rank)}</div></div>
        <div class="teach-card"><div class="teach-tag">XP</div><div class="class-figure">${p.xp}</div></div>
        <div class="teach-card"><div class="teach-tag">BADGES</div><div class="class-figure">${p.badgesEarned}/${p.totalBadges}</div></div>
        <div class="teach-card"><div class="teach-tag">DAYS SURVIVED</div><div class="class-figure">${p.daysSurvived}</div></div>
      </div>

      <div class="class-panel" style="margin: 12px 0; padding: 12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;">
        <div style="display:flex; justify-content:space-between; font-size:12px; color:#94A3B8; margin-bottom:6px;">
          <span>🧠 Neurodivergent Multi-Modal Learning Profile:</span>
          <span><strong>Visual ${Math.round(style.visual * 100)}%</strong> \u00b7 <strong>Kinesthetic ${Math.round(style.kinesthetic * 100)}%</strong> \u00b7 <strong>Reading ${Math.round(style.readingWriting * 100)}%</strong></span>
        </div>
        <div style="font-size:12px; color:#CBD5E1;">
          ${style.visual > 0.4 ? '💡 <em>Visual Learner:</em> Benefits most from schematics, topology overlays, and live graph telemetry.' : style.kinesthetic > 0.4 ? '💡 <em>Kinesthetic Learner:</em> Thrives on active breadboard experimentation, slider tuning, and iterative trial.' : '💡 <em>Textual Learner:</em> Excels with concise datasheets, formulas, and structured technical documentation.'}
        </div>
      </div>

      ${engaged.length ? conceptRows : `<p class="empty-note">No concept activity yet.</p>`}
      <button class="ghost-button student-ai-btn" data-uid="${student.uid}" style="margin-top:10px">Generate AI Differentiated Intervention for ${escapeHtml((student.displayName || 'Student').split(' ')[0])}</button>
      <div id="studentAIResult-${student.uid}"></div>
    </div>
  `
}

/** Rough, human-friendly "X ago" — doesn't need to be exact, just legible at a glance. */
function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}
