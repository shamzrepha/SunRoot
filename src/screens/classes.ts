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
import { CLASS_TOPICS } from '../accounts/types'
import type { Classroom, ClassroomInvite, Team, UserProfile } from '../accounts/types'

export function renderClasses(root: HTMLElement, nav: { toWorkshop: () => void }) {
  const profile = session.profile
  if (!profile) return
  renderList(root, profile, nav)
}

async function renderList(root: HTMLElement, profile: UserProfile, nav: { toWorkshop: () => void }) {
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
          !profile.verified
            ? `<div class="verify-banner">Your account is pending admin verification. You can browse and use the SunRoot Original demo class now \u2014 ${profile.role === 'teacher' ? 'creating a class' : 'joining other classes'} unlocks once you\u2019re verified.</div>`
            : ''
        }

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
              ? `<button class="ghost-button" id="showCreateBtn" ${!profile.verified ? 'disabled title="Verification required"' : ''}>+ New class</button>`
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

async function renderDetail(root: HTMLElement, profile: UserProfile, classroomId: string, nav: { toWorkshop: () => void }) {
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

  paintDetail(root, profile, classroom, roster, teams, isOwner, nav)
}

function paintDetail(
  root: HTMLElement,
  profile: UserProfile,
  classroom: Classroom,
  roster: UserProfile[],
  teams: Team[],
  isOwner: boolean,
  nav: { toWorkshop: () => void },
) {
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
                  .map(
                    (s) => `<li data-uid="${s.uid}">
                      <span>${escapeHtml(s.displayName)}</span>
                      ${isOwner ? `<button class="ghost-button small remove-btn">Remove</button>` : ''}
                    </li>`,
                  )
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
  root.querySelector('#openWorkshopBtn')?.addEventListener('click', () => nav.toWorkshop())

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

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}
