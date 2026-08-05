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

import { ask, isLiveAI, loadConfig, saveConfig } from './AIProvider'
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
          <button class="dock-icon" id="dockSettings" aria-label="AI settings">${icon('workshop', 14)}</button>
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
        <p class="dock-note">
          Connect a language model for open conversation. Without one the assistant still
          answers from the live simulation using built-in rules — offline and free.
        </p>
        <label class="dock-field"><span>Endpoint</span>
          <input id="cfgEndpoint" type="text" placeholder="https://api.groq.com/openai/v1/chat/completions"></label>
        <label class="dock-field"><span>Model</span>
          <input id="cfgModel" type="text" placeholder="llama-3.3-70b-versatile"></label>
        <label class="dock-field"><span>API key</span>
          <input id="cfgKey" type="password" placeholder="gsk_…"></label>
        <label class="dock-field"><span>Or proxy URL</span>
          <input id="cfgProxy" type="text" placeholder="/.netlify/functions/ask"></label>
        <p class="dock-warn">
          A key entered here is stored in this browser and is visible to anyone with access
          to this machine. For a shared deployment use a proxy so the key stays server-side.
        </p>
        <button class="primary-button small" id="cfgSave">Save</button>
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
  dock.querySelector('#dockSettings')!.addEventListener('click', () => {
    settings.hidden = !settings.hidden
    if (!settings.hidden) fillSettings()
  })

  dock.querySelectorAll<HTMLButtonElement>('[data-ask]').forEach((b) => {
    b.addEventListener('click', () => submit(b.dataset.ask!))
  })

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const q = input.value.trim()
    if (q) submit(q)
  })

  dock.querySelector('#cfgSave')!.addEventListener('click', () => {
    saveConfig({
      endpoint: (dock!.querySelector('#cfgEndpoint') as HTMLInputElement).value.trim() || undefined,
      model: (dock!.querySelector('#cfgModel') as HTMLInputElement).value.trim() || undefined,
      apiKey: (dock!.querySelector('#cfgKey') as HTMLInputElement).value.trim(),
      proxyUrl: (dock!.querySelector('#cfgProxy') as HTMLInputElement).value.trim(),
    } as never)
    settings.hidden = true
    refreshSub()
    append('assistant', isLiveAI()
      ? 'Connected. Ask me anything about your build and I will answer against your actual circuit.'
      : 'Cleared. I am running on built-in rules — still specific to your build, just less conversational.')
  })

  function fillSettings() {
    const c = loadConfig()
    ;(dock!.querySelector('#cfgEndpoint') as HTMLInputElement).value = c.endpoint
    ;(dock!.querySelector('#cfgModel') as HTMLInputElement).value = c.model
    ;(dock!.querySelector('#cfgKey') as HTMLInputElement).value = c.apiKey
    ;(dock!.querySelector('#cfgProxy') as HTMLInputElement).value = c.proxyUrl
  }

  function refreshSub() {
    dock!.querySelector('#dockSub')!.textContent =
      `${currentMode().label} mode · ${isLiveAI() ? 'model connected' : 'offline rules'}`
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
