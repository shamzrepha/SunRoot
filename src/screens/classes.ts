import { session, refreshProfile } from '../accounts/Session'
import {
  listClassroomsForUser,
  listPendingInvites,
  respondToInvite,
  createClassroom,
  deleteClassroom,
  inviteStudentByTag,
  removeStudent,
  leaveClassroom,
  fetchUsersByIds,
  submitClassSuggestion,
} from '../accounts/ClassroomService'
import { createTeam, joinTeam, listTeamsForClassroom } from '../accounts/TeamService'
import { fetchClassroomProgress, isRecentlyActive } from '../accounts/ProgressService'
import { generateTeachingRecommendations, generateStudentRecommendation } from '../ai/TeachingInsights'
import { CONCEPT_BY_ID, MASTERY_THRESHOLD } from '../learning/LearnerModel'
import { CLASS_TOPICS } from '../accounts/types'
import type { Classroom, ClassroomInvite, ProgressSnapshot, Team, UserProfile } from '../accounts/types'

type ClassNav = { toWorkshop: (classroomId: string) => void }

export function renderClasses(root: HTMLElement, nav: ClassNav) {
  const profile = session.profile
  if (!profile) return
  renderList(root, profile, nav)
}

async function renderList(root: HTMLElement, profile: UserProfile, nav: ClassNav) {
  root.innerHTML = `<div class="screen"><p class="empty-note">Loading classes\u2026</p></div>`

  const [classrooms, invites] = await Promise.all([
    listClassroomsForUser(profile),
    profile.role !== 'teacher' ? listPendingInvites(profile.uid) : Promise.resolve([] as ClassroomInvite[]),
  ])

  let showCreateForm = false

  function paint() {
    root.innerHTML = `
      <div class="screen">
        <div class="lab-header">
          <div><h1>My Classes</h1><p>${profile.role === 'teacher' ? 'Classes you teach.' : 'Classes you\u2019re part of.'}</p></div>
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
          profile.role === 'teacher'
            ? !showCreateForm
              ? `<button class="ghost-button" id="showCreateBtn">+ New class</button>`
              : `<div class="class-panel">
                  <h2>Create a class</h2>
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

        <div class="class-list">
          ${
            classrooms.length
              ? classrooms
                  .map(
                    (c) => `<button class="class-row" data-classroom="${c.id}">
                      <div>
                        <div class="class-row-name">${escapeHtml(c.name)} ${c.isDemo ? '<span class="tag-badge">Demo</span>' : ''}</div>
                        <div class="class-row-sub">by ${escapeHtml(c.teacherName)} \u00b7 ${escapeHtml(c.topic)} \u00b7 ${c.studentIds.length} student${c.studentIds.length === 1 ? '' : 's'}</div>
                      </div>
                      <span>\u2192</span>
                    </button>`,
                  )
                  .join('')
              : `<p class="empty-note">${profile.role === 'teacher' ? 'Create your first class above.' : 'No classes yet \u2014 check Find a Class to join one.'}</p>`
          }
        </div>
      </div>
    `

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

    root.querySelectorAll<HTMLButtonElement>('.class-row').forEach((btn) => {
      btn.addEventListener('click', () => renderDetail(root, profile, btn.dataset.classroom!, nav))
    })
  }

  paint()
}

async function renderDetail(root: HTMLElement, profile: UserProfile, classroomId: string, nav: ClassNav) {
  root.innerHTML = `<div class="screen"><p class="empty-note">Loading\u2026</p></div>`

  const classrooms = await listClassroomsForUser(profile)
  const classroom = classrooms.find((c) => c.id === classroomId)
  if (!classroom) {
    root.innerHTML = `<div class="screen"><p class="empty-note">Class not found.</p></div>`
    return
  }

  const [roster, teams] = await Promise.all([
    fetchUsersByIds(classroom.studentIds),
    listTeamsForClassroom(classroomId),
  ])

  const isOwner = profile.role === 'teacher' && classroom.teacherId === profile.uid
  // Scoped to THIS classroom — the same student in a different class of
  // yours (or someone else's) gets a completely separate snapshot.
  const progressByUid = isOwner ? await fetchClassroomProgress(classroom.id, classroom.studentIds) : {}

  paintDetail(root, profile, classroom, roster, teams, isOwner, nav, progressByUid)
}

interface ClassAnalytics {
  studentsWithData: number
  avgMastery: number
  avgXp: number
  atRisk: { student: UserProfile; reason: string }[]
  weakestConcepts: { id: string; label: string; avgMastery: number; studentCount: number }[]
}

function computeClassAnalytics(roster: UserProfile[], progressByUid: Record<string, ProgressSnapshot>): ClassAnalytics {
  const withData = roster.filter((s) => progressByUid[s.uid])
  const avgMastery = withData.length
    ? withData.reduce((sum, s) => sum + progressByUid[s.uid].overallMastery, 0) / withData.length
    : 0
  const avgXp = withData.length ? withData.reduce((sum, s) => sum + progressByUid[s.uid].xp, 0) / withData.length : 0

  const atRisk: ClassAnalytics['atRisk'] = []
  for (const s of roster) {
    const p = progressByUid[s.uid]
    if (!p) {
      atRisk.push({ student: s, reason: 'No activity yet' })
    } else if (p.overallMastery < 0.4 && Object.values(p.conceptMastery).some((c) => c.engaged)) {
      atRisk.push({ student: s, reason: `${Math.round(p.overallMastery * 100)}% mastery \u2014 struggling` })
    }
  }

  const conceptTotals = new Map<string, { sum: number; count: number }>()
  for (const s of withData) {
    const p = progressByUid[s.uid]
    for (const [conceptId, c] of Object.entries(p.conceptMastery)) {
      if (!c.engaged) continue
      const entry = conceptTotals.get(conceptId) ?? { sum: 0, count: 0 }
      entry.sum += c.mastery
      entry.count += 1
      conceptTotals.set(conceptId, entry)
    }
  }
  const weakestConcepts = [...conceptTotals.entries()]
    .map(([id, { sum, count }]) => ({
      id,
      label: CONCEPT_BY_ID.get(id as any)?.label ?? id,
      avgMastery: sum / count,
      studentCount: count,
    }))
    .sort((a, b) => a.avgMastery - b.avgMastery)
    .slice(0, 3)

  return { studentsWithData: withData.length, avgMastery, avgXp, atRisk, weakestConcepts }
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
) {
  const analytics = isOwner ? computeClassAnalytics(roster, progressByUid) : null
  root.innerHTML = `
    <div class="screen">
      <button class="ghost-button small" id="backBtn">\u2190 Back to My Classes</button>
      <div class="lab-header">
        <div>
          <h1>${escapeHtml(classroom.name)} ${classroom.isDemo ? '<span class="tag-badge">Demo</span>' : ''}</h1>
          <p>by ${escapeHtml(classroom.teacherName)} \u00b7 ${escapeHtml(classroom.topic)}</p>
          ${classroom.description ? `<p>${escapeHtml(classroom.description)}</p>` : ''}
        </div>
      </div>

      <button class="primary-button" id="openWorkshopBtn">Open Workshop \u2192</button>

      ${
        isOwner && analytics
          ? `<div class="class-panel analytics-panel">
              <h2>Class Analytics</h2>
              ${
                analytics.studentsWithData === 0
                  ? `<p class="empty-note">No student activity recorded yet.</p>`
                  : `
                    <div class="dash-grid">
                      <div class="teach-card"><div class="teach-tag">AVG MASTERY</div><div class="class-figure">${Math.round(analytics.avgMastery * 100)}%</div></div>
                      <div class="teach-card"><div class="teach-tag">AVG XP</div><div class="class-figure">${Math.round(analytics.avgXp)}</div></div>
                      <div class="teach-card"><div class="teach-tag">STUDENTS ACTIVE</div><div class="class-figure">${analytics.studentsWithData}/${roster.length}</div></div>
                    </div>

                    ${
                      analytics.atRisk.length
                        ? `<h3 class="sub-heading">Needs attention (${analytics.atRisk.length})</h3>
                          <ul class="roster-list">
                            ${analytics.atRisk
                              .map((r) => `<li><span>${escapeHtml(r.student.displayName)}</span><span class="roster-progress at-risk">${escapeHtml(r.reason)}</span></li>`)
                              .join('')}
                          </ul>`
                        : `<p class="empty-note">No students currently flagged as struggling.</p>`
                    }

                    ${
                      analytics.weakestConcepts.length
                        ? `<h3 class="sub-heading">Weakest concepts class-wide</h3>
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
        <p class="empty-note">Team up with classmates to work on a project together.</p>
        <form id="teamForm" class="inline-form">
          <input type="text" id="teamName" placeholder="New team name" />
          <button type="submit" class="primary-button">Create team</button>
        </form>
        ${
          teams.length
            ? `<ul class="roster-list" id="teamList">
                ${teams
                  .map(
                    (t) => `<li data-team="${t.id}">
                      <span>${escapeHtml(t.name)} \u00b7 ${t.memberUids.length} member${t.memberUids.length === 1 ? '' : 's'}</span>
                      ${t.memberUids.includes(profile.uid) ? '<span class="tag-badge">You\u2019re in</span>' : '<button class="ghost-button small join-team-btn">Join</button>'}
                    </li>`,
                  )
                  .join('')}
              </ul>`
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
      const weakest = [...engaged].sort((a, b) => a[1].mastery - b[1].mastery).slice(0, 4)
      const stuckOn = engaged.filter(([, c]) => c.correct + c.incorrect > 0 && c.incorrect / (c.correct + c.incorrect) >= 0.5 && c.incorrect >= 2)

      const summary = [
        `Student: ${student.displayName}. Class: ${classroom.name} (${classroom.topic}). Rank: ${p.rank}, ${p.xp} XP, ${p.conceptsMastered}/${p.totalConcepts} concepts mastered.`,
        weakest.length
          ? `Weakest concepts: ${weakest.map(([id, c]) => `${CONCEPT_BY_ID.get(id as any)?.label ?? id} (${Math.round(c.mastery * 100)}%)`).join(', ')}.`
          : 'No concept activity recorded yet.',
        stuckOn.length
          ? `Concepts where they keep getting it wrong: ${stuckOn.map(([id]) => CONCEPT_BY_ID.get(id as any)?.label ?? id).join(', ')}.`
          : '',
      ]
        .filter(Boolean)
        .join(' ')

      const res = await generateStudentRecommendation(summary)
      btn.disabled = false
      btn.textContent = `Regenerate recommendation for ${student.displayName.split(' ')[0]}`
      resultEl.innerHTML = res.text
        ? `<div class="ai-insight-box">${escapeHtml(res.text).replace(/\n/g, '<br>')}</div>`
        : `<p class="empty-note">Couldn\u2019t generate a recommendation: ${escapeHtml(res.error ?? 'unknown error')}</p>`
    })
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

  root.querySelectorAll<HTMLElement>('#teamList li').forEach((li) => {
    li.querySelector('.join-team-btn')?.addEventListener('click', async () => {
      await joinTeam(li.dataset.team!, profile.uid)
      renderDetail(root, profile, classroom.id, nav)
    })
  })
}

function studentDetailHtml(student: UserProfile, p: ProgressSnapshot): string {
  const engaged = Object.entries(p.conceptMastery).filter(([, c]) => c.engaged)
  const label = (id: string) => CONCEPT_BY_ID.get(id as any)?.label ?? id

  const conceptRows = [...engaged]
    .sort((a, b) => a[1].mastery - b[1].mastery) // weakest first — what a teacher needs to see first
    .map(([id, c]) => {
      const struggleRatio = c.correct + c.incorrect > 0 ? c.incorrect / (c.correct + c.incorrect) : 0
      const stuck = struggleRatio >= 0.5 && c.incorrect >= 2
      return `
        <div class="concept-detail-row ${stuck ? 'is-stuck' : ''}">
          <div class="concept-detail-head">
            <span class="cb-name">${escapeHtml(label(id))}</span>
            <span class="cb-pct">${Math.round(c.mastery * 100)}%</span>
          </div>
          <div class="cb-track"><div class="cb-fill ${c.mastery >= MASTERY_THRESHOLD ? 'high' : 'low'}" style="width:${c.mastery * 100}%"></div></div>
          <div class="empty-note">
            ${c.correct} correct \u00b7 ${c.incorrect} incorrect \u00b7 last active ${relativeTime(c.lastSeen)}
            ${stuck ? ' \u00b7 <span class="at-risk">keeps getting stuck here</span>' : ''}
          </div>
          ${c.evidence.length ? `<div class="evidence-log">${c.evidence.map((e) => `<div class="evidence-line">${escapeHtml(e)}</div>`).join('')}</div>` : ''}
        </div>
      `
    })
    .join('')

  return `
    <div class="student-report">
      <div class="dash-grid">
        <div class="teach-card"><div class="teach-tag">RANK</div><div class="class-figure" style="font-size:20px">${escapeHtml(p.rank)}</div></div>
        <div class="teach-card"><div class="teach-tag">XP</div><div class="class-figure">${p.xp}</div></div>
        <div class="teach-card"><div class="teach-tag">BADGES</div><div class="class-figure">${p.badgesEarned}/${p.totalBadges}</div></div>
        <div class="teach-card"><div class="teach-tag">DAYS SURVIVED</div><div class="class-figure">${p.daysSurvived}</div></div>
      </div>
      ${engaged.length ? conceptRows : `<p class="empty-note">No concept activity yet.</p>`}
      <button class="ghost-button student-ai-btn" data-uid="${student.uid}" style="margin-top:10px">Generate AI recommendation for ${escapeHtml(student.displayName.split(' ')[0])}</button>
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
