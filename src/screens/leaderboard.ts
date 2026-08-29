import { session } from '../accounts/Session'
import { listFriendUids } from '../accounts/FriendService'
import { fetchGlobalLeaderboard, fetchFriendsLeaderboard, fetchTeamLeaderboard } from '../accounts/LeaderboardService'
import { listClassroomsForUser } from '../accounts/ClassroomService'
import type { LeaderboardCategory, LeaderboardEntry, TeamLeaderboardEntry } from '../accounts/types'

type Tab = 'global' | 'friends' | 'teams'

const CATEGORY_LABEL: Record<LeaderboardCategory, string> = {
  mastery: 'Mastery',
  xp: 'XP',
  concepts: 'Concepts mastered',
}

export async function renderLeaderboard(root: HTMLElement) {
  const profile = session.profile
  if (!profile) return

  root.innerHTML = `<div class="screen"><p class="empty-note">Loading\u2026</p></div>`

  let tab: Tab = 'global'
  let category: LeaderboardCategory = 'mastery'
  let selectedClassroomId = ''

  const myClassrooms = await listClassroomsForUser(profile)
  if (myClassrooms.length) selectedClassroomId = myClassrooms[0].id

  async function paint() {
    root.innerHTML = `
      <div class="screen">
        <div class="lab-header"><div><h1>Leaderboard</h1><p>See how you stack up \u2014 globally, with friends, or team vs. team in a class.</p></div></div>

        <div class="mode-switch">
          <button type="button" class="mode-tab${tab === 'global' ? ' is-active' : ''}" data-tab="global">Global</button>
          <button type="button" class="mode-tab${tab === 'friends' ? ' is-active' : ''}" data-tab="friends">Friends</button>
          ${myClassrooms.length ? `<button type="button" class="mode-tab${tab === 'teams' ? ' is-active' : ''}" data-tab="teams">Teams in a class</button>` : ''}
        </div>

        <div class="inline-form" style="margin:14px 0">
          <select id="categorySelect">
            ${(Object.keys(CATEGORY_LABEL) as LeaderboardCategory[]).map((c) => `<option value="${c}" ${c === category ? 'selected' : ''}>${CATEGORY_LABEL[c]}</option>`).join('')}
          </select>
          ${
            tab === 'teams' && myClassrooms.length
              ? `<select id="classSelect">
                  ${myClassrooms.map((c) => `<option value="${c.id}" ${c.id === selectedClassroomId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                </select>`
              : ''
          }
        </div>

        <div class="class-panel" id="boardHost"><p class="empty-note">Loading\u2026</p></div>
      </div>
    `

    root.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        tab = btn.dataset.tab as Tab
        paint()
      })
    })
    root.querySelector<HTMLSelectElement>('#categorySelect')!.addEventListener('change', (e) => {
      category = (e.target as HTMLSelectElement).value as LeaderboardCategory
      paintBoard()
    })
    root.querySelector<HTMLSelectElement>('#classSelect')?.addEventListener('change', (e) => {
      selectedClassroomId = (e.target as HTMLSelectElement).value
      paintBoard()
    })

    await paintBoard()
  }

  async function paintBoard() {
    const host = root.querySelector<HTMLElement>('#boardHost')!
    host.innerHTML = `<p class="empty-note">Loading\u2026</p>`

    if (tab === 'global') {
      const entries = await fetchGlobalLeaderboard(category)
      host.innerHTML = renderEntries(entries, profile!.uid, category)
    } else if (tab === 'friends') {
      const friendUids = await listFriendUids(profile!.uid)
      if (!friendUids.length) {
        host.innerHTML = `<p class="empty-note">Add some friends from your Profile to see this \u2014 nothing to compare yet.</p>`
        return
      }
      const entries = await fetchFriendsLeaderboard(friendUids, profile!.uid, profile!.displayName, category)
      host.innerHTML = renderEntries(entries, profile!.uid, category)
    } else {
      if (!selectedClassroomId) {
        host.innerHTML = `<p class="empty-note">Join a class first.</p>`
        return
      }
      const entries = await fetchTeamLeaderboard(selectedClassroomId, category)
      host.innerHTML = renderTeamEntries(entries, category)
    }
  }

  function renderEntries(entries: LeaderboardEntry[], selfUid: string, cat: LeaderboardCategory): string {
    if (!entries.length) return `<p class="empty-note">No activity recorded yet.</p>`
    return `<ol class="leaderboard-list">
      ${entries
        .map(
          (e, i) => `<li class="leaderboard-row ${e.uid === selfUid ? 'is-me' : ''}">
            <span class="lb-rank">${i + 1}</span>
            <span class="lb-name">${escapeHtml(e.displayName)}${e.uid === selfUid ? ' (you)' : ''}</span>
            <span class="lb-value">${cat === 'mastery' ? Math.round(e.value * 100) + '%' : Math.round(e.value)}</span>
          </li>`,
        )
        .join('')}
    </ol>`
  }

  function renderTeamEntries(entries: TeamLeaderboardEntry[], cat: LeaderboardCategory): string {
    if (!entries.length) return `<p class="empty-note">No teams with activity in this class yet.</p>`
    return `<ol class="leaderboard-list">
      ${entries
        .map(
          (e, i) => `<li class="leaderboard-row">
            <span class="lb-rank">${i + 1}</span>
            <span class="lb-name">${escapeHtml(e.name)} <span class="empty-note">(${e.memberCount} member${e.memberCount === 1 ? '' : 's'})</span></span>
            <span class="lb-value">${cat === 'mastery' ? Math.round(e.value * 100) + '%' : Math.round(e.value)}</span>
          </li>`,
        )
        .join('')}
    </ol>`
  }

  paint()
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}
