import { session } from '../accounts/Session'
import { listFriendUids } from '../accounts/FriendService'
import { fetchGlobalLeaderboard, fetchFriendsLeaderboard, fetchTeamLeaderboard, getLeagueForXp } from '../accounts/LeaderboardService'
import { listClassroomsForUser } from '../accounts/ClassroomService'
import { getStreakState } from '../accounts/StreakService'
import type { LeaderboardCategory, LeaderboardEntry, TeamLeaderboardEntry } from '../accounts/types'

type Tab = 'global' | 'friends' | 'teams'

const CATEGORY_LABEL: Record<LeaderboardCategory, string> = {
  streak: '🔥 Daily Streak',
  xp: '⚡ Score Points (XP)',
  mastery: '🎓 Overall Mastery',
  concepts: '🧠 Concepts Mastered',
}

export async function renderLeaderboard(root: HTMLElement) {
  const profile = session.profile
  if (!profile) return

  root.innerHTML = `<div class="screen"><p class="empty-note">Loading leaderboard\u2026</p></div>`

  let tab: Tab = 'global'
  let category: LeaderboardCategory = 'streak' // Default to Duolingo-style streaks as requested!
  let selectedClassroomId = ''

  const streakState = getStreakState(profile)
  const myXp = (profile as any)?.xp ?? (profile.streak ? profile.streak.current * 30 : 50)
  const myLeague = getLeagueForXp(myXp)

  const myClassrooms = await listClassroomsForUser(profile)
  if (myClassrooms.length) selectedClassroomId = myClassrooms[0].id

  async function paint() {
    root.innerHTML = `
      <div class="screen">
        <div class="lab-header">
          <div>
            <h1>Global Leaderboard</h1>
            <p>Compete in daily check-in streaks, earn XP, and climb the Duolingo leagues.</p>
          </div>
        </div>

        <!-- Duolingo League Hero Banner -->
        <div class="league-banner-card" style="background: linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01)); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 20px 24px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <div style="font-size: 42px; line-height: 1; filter: drop-shadow(0 4px 12px ${myLeague.color}40);">${myLeague.icon}</div>
            <div>
              <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.1em; color: ${myLeague.color};">Current Duolingo League</div>
              <div style="font-size: 22px; font-weight: 800; color: #fff;">${myLeague.name}</div>
              <div style="font-size: 13px; color: var(--campus-text-muted);">Top 3 cadets in this division qualify for promotion!</div>
            </div>
          </div>
          <div style="display: flex; gap: 12px; align-items: center;">
            <div style="text-align: right;">
              <div style="font-size: 11px; color: var(--campus-text-muted); text-transform: uppercase;">Your Streak</div>
              <div style="font-size: 18px; font-weight: 800; color: #f97316;">🔥 ${streakState.displayStreak} Days</div>
            </div>
            <div style="width: 1px; height: 32px; background: rgba(255,255,255,0.1);"></div>
            <div style="text-align: right;">
              <div style="font-size: 11px; color: var(--campus-text-muted); text-transform: uppercase;">Total Score</div>
              <div style="font-size: 18px; font-weight: 800; color: #38bdf8;">⚡ ${myXp} XP</div>
            </div>
          </div>
        </div>

        <div class="mode-switch">
          <button type="button" class="mode-tab${tab === 'global' ? ' is-active' : ''}" data-tab="global">Global League</button>
          <button type="button" class="mode-tab${tab === 'friends' ? ' is-active' : ''}" data-tab="friends">Friends</button>
          ${myClassrooms.length ? `<button type="button" class="mode-tab${tab === 'teams' ? ' is-active' : ''}" data-tab="teams">Teams in Class</button>` : ''}
        </div>

        <div class="inline-form" style="margin: 16px 0; display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          <span style="font-size: 13px; font-weight: 600; color: var(--campus-text-muted);">Rank By:</span>
          <select id="categorySelect" style="min-width: 180px;">
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

        <div class="class-panel" id="boardHost"><p class="empty-note">Loading leaderboard ranks\u2026</p></div>
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
        host.innerHTML = `<p class="empty-note">No friends added yet \u2014 connect with classmates from your Profile to compete directly.</p>`
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
    if (!entries.length) return `<p class="empty-note">No activity recorded yet for this ranking category.</p>`
    return `
      <div class="league-zone-tag" style="margin-bottom: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #10b981; font-weight: 700;">
        ⬆️ PROMOTION ZONE (TOP 3)
      </div>
      <ol class="leaderboard-list">
        ${entries
          .map((e, i) => {
            const isTop3 = i < 3
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`
            const valDisplay =
              cat === 'mastery'
                ? Math.round(e.value * 100) + '%'
                : cat === 'streak'
                  ? `🔥 ${Math.round(e.value)}d`
                  : `⚡ ${Math.round(e.value)} XP`

            return `
              <li class="leaderboard-row ${e.uid === selfUid ? 'is-me' : ''} ${isTop3 ? 'top-tier' : ''}" style="${isTop3 ? 'border-left: 3px solid #10b981;' : ''}">
                <span class="lb-rank" style="font-weight: 800; font-size: ${isTop3 ? '16px' : '13px'};">${medal}</span>
                <span class="lb-name" style="display: flex; align-items: center; gap: 8px;">
                  <span>${escapeHtml(e.displayName)}</span>
                  ${e.uid === selfUid ? '<span class="tag-badge" style="background: rgba(56,189,248,0.2); color:#38bdf8;">YOU</span>' : ''}
                </span>
                <span class="lb-value" style="font-weight: 700; font-size: 15px; color: ${cat === 'streak' ? '#f97316' : '#38bdf8'};">${valDisplay}</span>
              </li>
              ${i === 2 && entries.length > 3 ? `<div class="league-zone-divider" style="padding: 6px 12px; margin: 4px 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--campus-text-muted); background: rgba(255,255,255,0.02); border-radius: 4px;">🛡️ Safe Zone</div>` : ''}
            `
          })
          .join('')}
      </ol>
    `
  }

  function renderTeamEntries(entries: TeamLeaderboardEntry[], cat: LeaderboardCategory): string {
    if (!entries.length) return `<p class="empty-note">No teams with activity in this class yet.</p>`
    return `
      <ol class="leaderboard-list">
        ${entries
          .map((e, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`
            const valDisplay =
              cat === 'mastery'
                ? Math.round(e.value * 100) + '%'
                : cat === 'streak'
                  ? `🔥 ${Math.round(e.value)}d`
                  : `⚡ ${Math.round(e.value)} XP`

            return `
              <li class="leaderboard-row ${i < 3 ? 'top-tier' : ''}">
                <span class="lb-rank" style="font-weight: 800;">${medal}</span>
                <span class="lb-name">
                  <strong>${escapeHtml(e.name)}</strong>
                  <span class="empty-note">(${e.memberCount} member${e.memberCount === 1 ? '' : 's'})</span>
                </span>
                <span class="lb-value" style="font-weight: 700; color: #38bdf8;">${valDisplay}</span>
              </li>
            `
          })
          .join('')}
      </ol>
    `
  }

  paint()
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}
