import { postToDock } from './AssistantDock'
// ---------------------------------------------------------------------------
// Assistant
//
// The field engineer. Two things separate this from the old narrator.
//
// First, it is expressive: an SVG face that blinks, widens, winces and warms
// according to what is actually happening. Expression is continuous and silent,
// which is what lets the voice stay off — a reviewer found unprompted speech
// annoying and they were right, so speech is now opt-in and everything the
// assistant conveys is legible without it.
//
// Second, it reads state rather than following a script. Its mood is computed
// from the bench and the farm, so "concerned" means the battery genuinely is
// low, not that a cue fired.
// ---------------------------------------------------------------------------

import type { CheckSummary } from '../hardware/GraphChecker'

export type Mood = 'idle' | 'thinking' | 'pleased' | 'impressed' | 'concerned' | 'alarmed'

let mood: Mood = 'idle'
let host: HTMLElement | null = null
let faceEl: HTMLElement | null = null
let textEl: HTMLElement | null = null
void textEl
let speechEnabled = false // opt-in, deliberately
let lastSpoken = ''
let hideTimer = 0

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

let voice: SpeechSynthesisVoice | null = null

/**
 * Voice choice, in order of preference. The default on most platforms is a
 * flat, nasal system voice; these read noticeably better and are the ones most
 * likely to be installed.
 */
const PREFERRED = [
  'Google UK English Female',
  'Google UK English Male',
  'Microsoft Libby Online',
  'Microsoft Sonia Online',
  'Daniel',
  'Serena',
  'Google US English',
]

function pickVoice() {
  if (!supported || voice) return
  const all = window.speechSynthesis.getVoices()
  if (!all.length) return

  for (const name of PREFERRED) {
    const match = all.find((v) => v.name.includes(name))
    if (match) {
      voice = match
      return
    }
  }
  // Failing that, any English voice — local first, since network voices arrive
  // late and can land on top of whatever is already playing.
  voice =
    all.find((v) => /^en-GB/i.test(v.lang) && v.localService) ??
    all.find((v) => /^en/i.test(v.lang) && v.localService) ??
    all.find((v) => /^en/i.test(v.lang)) ??
    all[0]
}
if (supported) {
  pickVoice()
  window.speechSynthesis.onvoiceschanged = pickVoice
}

// --- face ------------------------------------------------------------------

/** Eye and mouth geometry per mood. Drawn, not sprited, so it scales cleanly. */
const FACES: Record<Mood, { eye: string; mouth: string; brow: string; tint: string }> = {
  idle: {
    eye: '<ellipse cx="20" cy="26" rx="4.2" ry="5"/><ellipse cx="44" cy="26" rx="4.2" ry="5"/>',
    mouth: '<path d="M22 42q10 6 20 0" fill="none" stroke-width="3"/>',
    brow: '',
    tint: '#5aa9e6',
  },
  thinking: {
    eye: '<ellipse cx="20" cy="25" rx="4.2" ry="4.4"/><ellipse cx="45" cy="24" rx="4.2" ry="4.4"/>',
    mouth: '<path d="M24 43h12" fill="none" stroke-width="3"/>',
    brow: '<path d="M14 16l10 3" fill="none" stroke-width="2.6"/>',
    tint: '#6fb6e8',
  },
  pleased: {
    eye: '<path d="M15 27q5-6 10 0" fill="none" stroke-width="3"/><path d="M39 27q5-6 10 0" fill="none" stroke-width="3"/>',
    mouth: '<path d="M20 40q12 10 24 0" fill="none" stroke-width="3.2"/>',
    brow: '',
    tint: '#4fd67a',
  },
  impressed: {
    eye: '<ellipse cx="20" cy="26" rx="5.4" ry="6"/><ellipse cx="44" cy="26" rx="5.4" ry="6"/>',
    mouth: '<ellipse cx="32" cy="43" rx="6" ry="5" fill="none" stroke-width="3"/>',
    brow: '<path d="M13 14l11-3M51 14l-11-3" fill="none" stroke-width="2.6"/>',
    tint: '#7fe0a8',
  },
  concerned: {
    eye: '<ellipse cx="20" cy="27" rx="4" ry="4.6"/><ellipse cx="44" cy="27" rx="4" ry="4.6"/>',
    mouth: '<path d="M22 45q10-5 20 0" fill="none" stroke-width="3"/>',
    brow: '<path d="M13 17l11 4M51 17l-11 4" fill="none" stroke-width="2.6"/>',
    tint: '#e6b45a',
  },
  alarmed: {
    eye: '<ellipse cx="20" cy="26" rx="6" ry="6.6"/><ellipse cx="44" cy="26" rx="6" ry="6.6"/>' +
      '<circle cx="20" cy="26" r="2.4" fill="#1a1d21" stroke="none"/><circle cx="44" cy="26" r="2.4" fill="#1a1d21" stroke="none"/>',
    mouth: '<ellipse cx="32" cy="45" rx="7" ry="5.5" fill="none" stroke-width="3"/>',
    brow: '<path d="M12 14l12 5M52 14l-12 5" fill="none" stroke-width="3"/>',
    tint: '#e5776a',
  },
}

function faceSvg(m: Mood): string {
  const f = FACES[m]
  return `
    <svg viewBox="0 0 64 60" class="assistant-face-svg" aria-hidden="true">
      <g stroke="${f.tint}" stroke-linecap="round" stroke-linejoin="round" fill="${f.tint}">
        ${f.brow}
        <g class="assistant-eyes">${f.eye}</g>
        <g fill="none" stroke="${f.tint}">${f.mouth}</g>
      </g>
    </svg>`
}

// --- mounting --------------------------------------------------------------

function ensureMounted(): HTMLElement {
  if (host && document.body.contains(host)) return host

  host = document.createElement('div')
  host.className = 'assistant-panel'
  host.innerHTML = `
    <div class="assistant-face" id="assistantFace">${faceSvg('idle')}</div>
    <div class="assistant-body">
      <div class="assistant-name">Field Assistant</div>
      <p class="assistant-text" id="assistantText"></p>
    </div>
    <div class="assistant-actions">
      <button class="assistant-speak" id="assistantSpeak" title="Read this aloud" aria-label="Read aloud">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
             stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>
        </svg>
      </button>
      <button class="assistant-dismiss" id="assistantDismiss" aria-label="Dismiss">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
             stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>`
  document.body.appendChild(host)

  faceEl = host.querySelector('#assistantFace')
  textEl = host.querySelector('#assistantText')

  host.querySelector('#assistantDismiss')!.addEventListener('click', () => hide())
  host.querySelector('#assistantSpeak')!.addEventListener('click', () => speak(lastSpoken))

  return host
}

export function setMood(m: Mood) {
  if (m === mood) return
  mood = m
  ensureMounted()
  if (faceEl) {
    faceEl.innerHTML = faceSvg(m)
    faceEl.className = `assistant-face mood-${m}`
    // Retrigger the reaction animation on every change.
    faceEl.classList.remove('react')
    void faceEl.offsetWidth
    faceEl.classList.add('react')
  }
}

export function getMood(): Mood {
  return mood
}

/**
 * Show a line. Silent unless the student has switched speech on, which is the
 * fix for unprompted narration — the face still carries the reaction.
 */
export function show(text: string, m: Mood = mood, _holdMs = 0) {
  setMood(m)
  lastSpoken = text
  // One assistant, one place it speaks. The dock owns the conversation; this
  // function is kept so every existing caller still works unchanged.
  void _holdMs
  postToDock(text, m)
  if (speechEnabled) speak(text)
}

export function hide() {
  clearTimeout(hideTimer)
  clearSpeechQueue()
}

let speaking = false
const queue: { text: string; mood: Mood }[] = []
const QUEUE_LIMIT = 4

/**
 * A strict FIFO queue with one utterance in flight. The browser's own queue
 * cannot be used: cancelling to interrupt wipes everything pending, and not
 * cancelling lets a second line start over the first. Draining it here means a
 * message always finishes before the next begins, and a backlog longer than a
 * few lines is dropped rather than narrated minutes after the fact.
 */
function enqueue(text: string, m: Mood) {
  if (!supported || !text) return
  if (queue.length && queue[queue.length - 1].text === text) return // no stutter
  queue.push({ text, mood: m })
  while (queue.length > QUEUE_LIMIT) queue.shift()
  if (!speaking) drain()
}

function drain() {
  if (speaking) return
  const next = queue.shift()
  if (!next) return

  speaking = true
  try {
    const u = new SpeechSynthesisUtterance(next.text)
    if (voice) u.voice = voice
    u.rate = 0.95
    u.pitch = next.mood === 'alarmed' ? 1.08 : next.mood === 'pleased' ? 1.04 : 1
    u.volume = 0.95
    u.onend = () => {
      speaking = false
      // A short gap between lines, so two messages never run together.
      window.setTimeout(drain, 260)
    }
    u.onerror = () => {
      speaking = false
      window.setTimeout(drain, 260)
    }
    window.speechSynthesis.speak(u)
  } catch {
    speaking = false
  }
}

function speak(text: string) {
  enqueue(text, mood)
}

/** Drop anything pending. Used when the student mutes or dismisses. */
export function clearSpeechQueue() {
  queue.length = 0
  speaking = false
  if (supported) {
    try { window.speechSynthesis.cancel() } catch { /* ignore */ }
  }
}

export function isSpeaking() {
  return speaking || queue.length > 0
}

export function pendingSpeech() {
  return queue.length
}

export function setSpeechEnabled(on: boolean) {
  speechEnabled = on
  if (!on) clearSpeechQueue()
}

export function isSpeechEnabled() {
  return speechEnabled
}

// --- reactions -------------------------------------------------------------

/**
 * Event hooks. Each is rate-limited so the assistant comments on a change of
 * situation rather than on every frame — the previous version's core mistake.
 */
const lastFired: Record<string, number> = {}
function throttle(key: string, ms: number): boolean {
  const now = Date.now()
  if (now - (lastFired[key] ?? 0) < ms) return false
  lastFired[key] = now
  return true
}

export const assistant = {
  setMood,
  show,
  hide,

  onPlace(_partId: string) {
    if (!throttle('place', 9000)) return
    setMood('thinking')
  },

  onWire() {
    if (!throttle('wire', 12000)) return
    setMood('thinking')
  },

  onCheck(summary: CheckSummary) {
    if (summary.errors > 0) {
      show(summary.issues.find((i) => i.severity === 'error')!.prompt, 'concerned')
    } else if (summary.warnings > 0) {
      show('Electrically sound. A few things worth thinking about before you deploy.', 'thinking')
    } else if (summary.issues.length === 0 && summary.headline.startsWith('No problems')) {
      show('That circuit holds together. Now write something to run on it.', 'impressed')
    }
  },

  onDeploy() {
    show('Deployed. Watch what your design actually does — that is the only real test.', 'thinking')
  },

  /** Called from the farm loop with a already-throttled intervention. */
  onFarmEvent(text: string, m: Mood) {
    show(text, m)
  },
}
