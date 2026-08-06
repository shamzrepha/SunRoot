// ---------------------------------------------------------------------------
// AssistantDock
//
// The assistant as a fixture rather than a notification. It sits in the corner
// of every screen, reacts silently to what is happening, and opens into a chat
// the student can actually talk to.
//
// It is mounted once against document.body and survives screen changes, so the
// conversation is continuous across the tool shed, the bench, the coding lab
// and the farm — which matters, because "why is my soil flooding" is a question
// asked on the farm about a decision made on the bench.
// ---------------------------------------------------------------------------

import { ask, isLiveAI, lastAIFailure, loadConfig, resetAIAvailability } from './AIProvider'
import type { Turn } from './AIProvider'
import { getMood, setMood, show as speakLine } from './Assistant'
import type { Mood } from './Assistant'
import { nextGuidance } from '../learning/ContextualTutor'
import { currentMode } from '../learning/LearningModes'
import { icon } from '../ui/icons'

let dock: HTMLElement | null = null
let open = false
let busy = false
const history: Turn[] = []
/** Queued lines that arrived before the dock was mounted. */
const pendingLines: string[] = []

const SUGGESTIONS = [
  'What should I do next?',
  'Why is my soil flooding?',
  'Which panel should I choose?',
  'Why is the pump not running?',
]

export function mountAssistantDock() {
  if (dock && document.body.contains(dock)) return

  dock = document.createElement('div')
  dock.className = 'dock'
  dock.innerHTML = `
    <button class="dock-bubble" id="dockBubble" aria-label="Open the field assistant" aria-expanded="false">
      <span class="dock-face" id="dockFace"></span>
      <span class="dock-ping" id="dockPing" hidden></span>
    </button>
    <div class="dock-preview" id="dockPreview" hidden></div>

    <section class="dock-panel" id="dockPanel" hidden aria-label="Field assistant">
      <header class="dock-head">
        <div>
          <div class="dock-title">Field Assistant</div>
          <div class="dock-sub" id="dockSub"></div>
        </div>
        <div class="dock-actions">
          <span class="dock-state" id="dockState" title="Connection status"></span>
          <button class="dock-icon" id="dockClose" aria-label="Close">${icon('close', 14)}</button>
        </div>
      </header>

      <div class="dock-log" id="dockLog"></div>

      <div class="dock-suggest" id="dockSuggest">
        ${SUGGESTIONS.map((s) => `<button class="chip" data-ask="${s}">${s}</button>`).join('')}
      </div>

      <form class="dock-form" id="dockForm">
        <input id="dockInput" class="dock-input" type="text" autocomplete="off"
               placeholder="Ask about your build…" aria-label="Ask the assistant">
        <button class="dock-send" type="submit" aria-label="Send">${icon('arrowRight', 15)}</button>
      </form>

      <div class="dock-settings" id="dockSettingsPanel" hidden>
        <p class="dock-note" id="diagText"></p>
        <button class="ghost-button small" id="cfgTest">Re-test connection</button>
      </div>
      </div>
    </section>
  `
  document.body.appendChild(dock)

  const panel = dock.querySelector<HTMLElement>('#dockPanel')!
  const bubble = dock.querySelector<HTMLButtonElement>('#dockBubble')!
  const log = dock.querySelector<HTMLElement>('#dockLog')!
  const form = dock.querySelector<HTMLFormElement>('#dockForm')!
  const input = dock.querySelector<HTMLInputElement>('#dockInput')!
  const settings = dock.querySelector<HTMLElement>('#dockSettingsPanel')!

  function setOpen(next: boolean) {
    open = next
    panel.hidden = !next
    bubble.setAttribute('aria-expanded', String(next))
    dock!.classList.toggle('open', next)
    dock!.querySelector<HTMLElement>('#dockPing')!.hidden = true
    if (next) {
      refreshSub()
      if (!log.children.length) greet()
      input.focus()
    }
  }

  bubble.addEventListener('click', () => setOpen(!open))
  dock.querySelector('#dockClose')!.addEventListener('click', () => setOpen(false))

  dock.querySelectorAll<HTMLButtonElement>('[data-ask]').forEach((b) => {
    b.addEventListener('click', () => submit(b.dataset.ask!))
  })

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const q = input.value.trim()
    if (q) submit(q)
  })


  // A live round-trip, so a misconfigured key is obvious rather than silently
  // degrading to offline answers that look like the model is simply unhelpful.
  // Developer diagnostic: Ctrl+Shift+A. Deliberately not a visible control —
  // there is nothing here for a student to set, and a settings panel invites
  // them to break something that already works.
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      setOpen(true)
      settings.hidden = !settings.hidden
      if (!settings.hidden) showDiagnostic()
    }
  })

  function showDiagnostic() {
    const c = loadConfig()
    const el = dock!.querySelector<HTMLElement>('#diagText')!
    el.textContent =
      `Route: ${c.proxyUrl || c.endpoint}. ` +
      `Model: ${c.model}. ` +
      `Status: ${isLiveAI() ? 'assumed reachable' : 'unreachable'}. ` +
      (lastAIFailure() ? `Last failure: ${lastAIFailure()}` : 'No failures recorded.')
  }

  dock.querySelector('#cfgTest')!.addEventListener('click', async () => {
    const el = dock!.querySelector<HTMLElement>('#diagText')!
    resetAIAvailability()
    el.textContent = 'Testing…'
    const res = await ask('Reply with exactly: connection ok')
    el.textContent =
      res.source === 'model'
        ? `Connected. Model replied: "${res.text.slice(0, 60)}"`
        : res.reason || lastAIFailure() || 'Unreachable.'
    refreshSub()
  })


  function refreshSub() {
    const live = isLiveAI()
    dock!.querySelector('#dockSub')!.textContent =
      `${currentMode().label} mode · ${live ? 'online' : 'offline'}`
    const dot = dock!.querySelector<HTMLElement>('#dockState')
    if (dot) {
      dot.className = `dock-state ${live ? 'live' : 'offline'}`
      dot.title = live
        ? 'Connected to the field assistant.'
        : 'Working offline from built-in knowledge of your build.'
    }
  }

  function greet() {
    const g = nextGuidance()
    append('assistant', g
      ? `I am watching your build. Right now: ${g.text}`
      : 'I am watching your build. Ask me anything — I can see your components, your wiring and what the farm is doing.')
  }

  function append(role: 'user' | 'assistant', text: string, pending = false) {
    const row = document.createElement('div')
    row.className = `dock-msg ${role}${pending ? ' pending' : ''}`
    row.textContent = text
    log.appendChild(row)
    log.scrollTop = log.scrollHeight
    return row
  }

  async function submit(question: string) {
    if (busy) return
    busy = true
    input.value = ''
    append('user', question)
    const thinking = append('assistant', 'Looking at your build…', true)
    setMood('thinking')

    const res = await ask(question, history)
    thinking.remove()
    append('assistant', res.text)
    history.push({ role: 'user', content: question }, { role: 'assistant', content: res.text })

    // The face reacts to what was said, which is how the mood stays honest.
    // Availability may have changed during that call, so the badge is refreshed
    // rather than left showing a state that is no longer true.
    refreshSub()
    setMood(/empty|not |cannot|problem|wrong|fault/i.test(res.text) ? 'concerned' : 'pleased')
    speakLine(res.text, getMood())
    busy = false
  }

  // Anything that spoke before the dock existed.
  for (const line of pendingLines.splice(0)) postToDock(line)

  renderFace()
  setInterval(renderFace, 900)
}

/** The bubble carries the same animated face used in the notification panel. */
function renderFace() {
  const el = dock?.querySelector<HTMLElement>('#dockFace')
  if (!el) return
  const mood = getMood()
  el.dataset.mood = mood
  el.innerHTML = FACE[mood] ?? FACE.idle
}

const FACE: Record<string, string> = {
  idle: dot('#5aa9e6', 'M9 20q7 4 14 0'),
  thinking: dot('#6fb6e8', 'M11 21h10'),
  pleased: dot('#4fd67a', 'M8 19q8 7 16 0'),
  impressed: dot('#7fe0a8', 'M12 20a4 4 0 0 0 8 0'),
  concerned: dot('#e6b45a', 'M9 23q7-4 14 0'),
  alarmed: dot('#e5776a', 'M10 22a3 3 0 0 0 12 0'),
}

function dot(colour: string, mouth: string): string {
  return `<svg viewBox="0 0 32 32" aria-hidden="true">
    <g stroke="${colour}" fill="${colour}" stroke-linecap="round">
      <ellipse cx="11" cy="13" rx="2.2" ry="2.6"/><ellipse cx="21" cy="13" rx="2.2" ry="2.6"/>
      <path d="${mouth}" fill="none" stroke-width="1.8" transform="scale(0.85) translate(2,2)"/>
    </g></svg>`
}

/**
 * Post a line from the simulation into the conversation. Guidance, tutor
 * interventions and farm events all arrive here, so there is exactly one place
 * the assistant speaks from rather than a second floating panel competing with
 * this one for the same corner of the screen.
 */
export function postToDock(text: string, mood: Mood = 'thinking') {
  setMood(mood)
  const log = dock?.querySelector<HTMLElement>('#dockLog')
  if (!log) {
    pendingLines.push(text)
    return
  }
  // Never repeat the line already at the bottom.
  const last = log.lastElementChild as HTMLElement | null
  if (last?.textContent === text) return

  const row = document.createElement('div')
  row.className = 'dock-msg assistant'
  row.textContent = text
  log.appendChild(row)
  while (log.children.length > 40) log.firstElementChild?.remove()
  log.scrollTop = log.scrollHeight

  if (!open) {
    const ping = dock?.querySelector<HTMLElement>('#dockPing')
    if (ping) ping.hidden = false
    // A one-line preview on the bubble, so an unopened dock still communicates.
    const preview = dock?.querySelector<HTMLElement>('#dockPreview')
    if (preview) {
      preview.textContent = text.length > 90 ? `${text.slice(0, 88)}…` : text
      preview.hidden = false
      clearTimeout(previewTimer)
      previewTimer = window.setTimeout(() => { preview.hidden = true }, 7000)
    }
  }
}

let previewTimer = 0

/** Draw attention without opening — used when the farm hits trouble. */
export function pingAssistant(mood: Mood = 'concerned') {
  setMood(mood)
  const ping = dock?.querySelector<HTMLElement>('#dockPing')
  if (ping && !open) ping.hidden = false
}
