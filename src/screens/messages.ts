import { session } from '../accounts/Session'
import { listFriendUids } from '../accounts/FriendService'
import { fetchUsersByIds } from '../accounts/ClassroomService'
import { sendMessage, listConversation, blockUser, unblockUser, isBlockedEitherWay, reportMessage } from '../accounts/MessageService'
import type { ChatMessage, UserProfile } from '../accounts/types'

let preselectedUid: string | null = null

/** Call before navigating to the messages screen to open straight to one friend's thread. */
export function openThreadWith(uid: string) {
  preselectedUid = uid
}

export async function renderMessages(root: HTMLElement) {
  const profile = session.profile
  if (!profile) return

  root.innerHTML = `<div class="screen"><p class="empty-note">Loading\u2026</p></div>`

  const friendUids = await listFriendUids(profile.uid)
  const friends = await fetchUsersByIds(friendUids)

  let activeFriend: UserProfile | null = friends.find((f) => f.uid === preselectedUid) ?? friends[0] ?? null
  preselectedUid = null

  function paint() {
    root.innerHTML = `
      <div class="screen">
        <div class="lab-header"><div><h1>Messages</h1><p>Only people you\u2019re friends with \u2014 nobody else can message you.</p></div></div>

        <div class="messages-layout">
          <div class="friend-list-col">
            ${
              friends.length
                ? friends
                    .map(
                      (f) => `<button class="friend-list-item ${activeFriend?.uid === f.uid ? 'is-active' : ''}" data-uid="${f.uid}">${escapeHtml(f.displayName)}</button>`,
                    )
                    .join('')
                : `<p class="empty-note">No friends yet \u2014 add some from your Profile.</p>`
            }
          </div>
          <div class="thread-col" id="threadHost">
            ${activeFriend ? '' : `<p class="empty-note">Pick a friend to start chatting.</p>`}
          </div>
        </div>
      </div>
    `

    root.querySelectorAll<HTMLButtonElement>('.friend-list-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeFriend = friends.find((f) => f.uid === btn.dataset.uid) ?? null
        paint()
      })
    })

    if (activeFriend) paintThread(activeFriend)
  }

  async function paintThread(friend: UserProfile) {
    const host = root.querySelector<HTMLElement>('#threadHost')!
    host.innerHTML = `<p class="empty-note">Loading\u2026</p>`

    const [messages, blocked] = await Promise.all([
      listConversation(profile!.uid, friend.uid),
      isBlockedEitherWay(profile!.uid, friend.uid),
    ])

    host.innerHTML = `
      <div class="thread-header">
        <span class="profile-chip-name">${escapeHtml(friend.displayName)}</span>
        <button class="link-button" id="blockToggleBtn">${blocked ? 'Unblock' : 'Block'}</button>
      </div>
      <div class="thread-messages" id="threadMessages">
        ${
          messages.length
            ? messages.map((m) => renderBubble(m, profile!.uid)).join('')
            : `<p class="empty-note">No messages yet \u2014 say hi.</p>`
        }
      </div>
      ${
        blocked
          ? `<p class="empty-note">Messaging is blocked between you and ${escapeHtml(friend.displayName)}.</p>`
          : `<form id="sendForm" class="inline-form">
              <input type="text" id="messageInput" placeholder="Message ${escapeHtml(friend.displayName)}\u2026" maxlength="2000" />
              <button type="submit" class="primary-button small">Send</button>
            </form>`
      }
    `

    const threadEl = host.querySelector<HTMLElement>('#threadMessages')
    if (threadEl) threadEl.scrollTop = threadEl.scrollHeight

    host.querySelector('#blockToggleBtn')?.addEventListener('click', async () => {
      if (blocked) await unblockUser(profile!.uid, friend.uid)
      else await blockUser(profile!.uid, friend.uid)
      paintThread(friend)
    })

    host.querySelector<HTMLFormElement>('#sendForm')?.addEventListener('submit', async (e) => {
      e.preventDefault()
      const input = host.querySelector<HTMLInputElement>('#messageInput')!
      if (!input.value.trim()) return
      const text = input.value
      input.value = ''
      input.disabled = true
      const result = await sendMessage({ uid: profile!.uid, displayName: profile!.displayName }, { uid: friend.uid, displayName: friend.displayName }, text)
      input.disabled = false
      if (result === 'sent') paintThread(friend)
      else if (result === 'blocked') {
        input.value = text
        alert('This message couldn\u2019t be sent \u2014 messaging is blocked between you two.')
      }
    })

    host.querySelectorAll<HTMLButtonElement>('.report-msg-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const msg = messages.find((m) => m.id === btn.dataset.msg)
        if (!msg) return
        const reason = prompt('What\u2019s wrong with this message? (this goes to the moderation team)')
        if (reason === null) return
        await reportMessage(msg, { uid: profile!.uid, displayName: profile!.displayName }, reason)
        btn.textContent = 'Reported'
        btn.disabled = true
      })
    })
  }

  paint()
}

function renderBubble(m: ChatMessage, myUid: string): string {
  const mine = m.fromUid === myUid
  return `
    <div class="msg-bubble-row ${mine ? 'is-mine' : ''}">
      <div class="msg-bubble">${escapeHtml(m.text)}</div>
      ${!mine ? `<button class="report-msg-btn" data-msg="${m.id}" title="Report">\u2691</button>` : ''}
    </div>
  `
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}
