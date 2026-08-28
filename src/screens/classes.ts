import { session, refreshProfile } from '../accounts/Session'
import {
  listClassroomsForUser,
  listPendingInvites,
  respondToInvite,
  createClassroom,
  inviteStudentByTag,
  removeStudent,
  leaveClassroom,
  fetchUsersByIds,
} from '../accounts/ClassroomService'
import { createTeam, joinTeam, listTeamsForClassroom } from '../accounts/TeamService'
import type { Classroom, ClassroomInvite, Team, UserProfile } from '../accounts/types'

export function renderClasses(root: HTMLElement) {
  const profile = session.profile
  if (!profile) return
  renderList(root, profile)
}

async function renderList(root: HTMLElement, profile: UserProfile) {
  root.innerHTML = `<div class="screen"><p class="empty-note">Loading classes\u2026</p></div>`

  const [classrooms, invites] = await Promise.all([
    listClassroomsForUser(profile),
    profile.role !== 'teacher' ? listPendingInvites(profile.uid) : Promise.resolve([] as ClassroomInvite[]),
  ])

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
          ? `<div class="class-panel">
              <h2>Create a class</h2>
              <form id="createClassForm" class="inline-form">
                <input type="text" id="className" placeholder="Class name" required />
                <select id="classVisibility">
                  <option value="private">Private (invite only)</option>
                  <option value="public">Public (listed on Find a Class)</option>
                </select>
                <button type="submit" class="primary-button">Create</button>
              </form>
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
                      <div class="class-row-sub">${c.studentIds.length} student${c.studentIds.length === 1 ? '' : 's'}</div>
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

  root.querySelectorAll<HTMLElement>('.invite-row').forEach((row) => {
    const inviteId = row.dataset.invite!
    const classroomId = row.dataset.classroom!
    row.querySelector('.accept-btn')?.addEventListener('click', async () => {
      await respondToInvite(inviteId, true, profile.uid, classroomId)
      await refreshProfile()
      renderList(root, session.profile!)
    })
    row.querySelector('.decline-btn')?.addEventListener('click', async () => {
      await respondToInvite(inviteId, false, profile.uid, classroomId)
      renderList(root, session.profile!)
    })
  })

  root.querySelector<HTMLFormElement>('#createClassForm')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const nameInput = root.querySelector<HTMLInputElement>('#className')!
    const visibilitySelect = root.querySelector<HTMLSelectElement>('#classVisibility')!
    if (!nameInput.value.trim()) return
    await createClassroom({
      teacherId: profile.uid,
      name: nameInput.value.trim(),
      visibility: visibilitySelect.value as 'public' | 'private',
    })
    await refreshProfile()
    renderList(root, session.profile!)
  })

  root.querySelectorAll<HTMLButtonElement>('.class-row').forEach((btn) => {
    btn.addEventListener('click', () => renderDetail(root, profile, btn.dataset.classroom!))
  })
}

async function renderDetail(root: HTMLElement, profile: UserProfile, classroomId: string) {
  root.innerHTML = `<div class="screen"><p class="empty-note">Loading\u2026</p></div>`

  const classrooms = await listClassroomsForUser(profile)
  let classroom = classrooms.find((c) => c.id === classroomId)
  if (!classroom) {
    // Public classroom the user isn't necessarily a member/owner of yet in cache
    const all = await listClassroomsForUser(profile)
    classroom = all.find((c) => c.id === classroomId)
  }
  if (!classroom) {
    root.innerHTML = `<div class="screen"><p class="empty-note">Class not found.</p></div>`
    return
  }

  const [roster, teams] = await Promise.all([
    fetchUsersByIds(classroom.studentIds),
    listTeamsForClassroom(classroomId),
  ])

  const isOwner = profile.role === 'teacher' && classroom.teacherId === profile.uid

  paintDetail(root, profile, classroom, roster, teams, isOwner)
}

function paintDetail(
  root: HTMLElement,
  profile: UserProfile,
  classroom: Classroom,
  roster: UserProfile[],
  teams: Team[],
  isOwner: boolean,
) {
  root.innerHTML = `
    <div class="screen">
      <button class="ghost-button small" id="backBtn">\u2190 Back to My Classes</button>
      <div class="lab-header">
        <div><h1>${escapeHtml(classroom.name)} ${classroom.isDemo ? '<span class="tag-badge">Demo</span>' : ''}</h1>
        ${classroom.description ? `<p>${escapeHtml(classroom.description)}</p>` : ''}</div>
      </div>

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
          !isOwner && profile.role !== 'teacher'
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
    </div>
  `

  root.querySelector('#backBtn')?.addEventListener('click', () => renderList(root, profile))

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
      renderDetail(root, profile, classroom.id)
    })
  })

  root.querySelector('#leaveBtn')?.addEventListener('click', async () => {
    await leaveClassroom(classroom.id, profile.uid)
    await refreshProfile()
    renderList(root, session.profile!)
  })

  root.querySelector<HTMLFormElement>('#teamForm')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const input = root.querySelector<HTMLInputElement>('#teamName')!
    if (!input.value.trim()) return
    await createTeam({ classroomId: classroom.id, name: input.value.trim(), creatorUid: profile.uid })
    renderDetail(root, profile, classroom.id)
  })

  root.querySelectorAll<HTMLElement>('#teamList li').forEach((li) => {
    li.querySelector('.join-team-btn')?.addEventListener('click', async () => {
      await joinTeam(li.dataset.team!, profile.uid)
      renderDetail(root, profile, classroom.id)
    })
  })
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}
