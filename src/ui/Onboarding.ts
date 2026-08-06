// ---------------------------------------------------------------------------
// Onboarding
//
// A first-time visitor was being dropped onto a dying farm with nine navigation
// items and no explanation. That is not a difficulty problem, it is an
// orientation problem, and the fix is not to simplify the simulation but to
// tell someone where they are and what to do first.
//
// The walkthrough spotlights one real element at a time and advances only when
// the student actually performs the action — it reads live app state rather
// than counting clicks, so it cannot get out of step with what they have done.
// It can be skipped at any point and never runs again once finished.
// ---------------------------------------------------------------------------

import { appState } from '../appState'
import { graph } from '../hardware/CircuitGraph'
import { distinctOwned } from '../hardware/PartsTray'
import { wiredOutputs, wiredSensors } from '../hardware/CircuitGraph'
import { icon } from './icons'

const SEEN_KEY = 'sunroot.onboarding.done'

export interface Step {
  id: string
  title: string
  body: string
  /** CSS selector to spotlight. Empty means a centred card with no target. */
  target: string
  /** Where the card sits relative to the target. */
  side?: 'right' | 'left' | 'top' | 'bottom' | 'centre'
  /** True once the student has done the thing. Polled every 400 ms. */
  done: () => boolean
  /** Screen this step belongs to; the step is skipped if they navigate away. */
  screen?: string
}

const STEPS: Step[] = [
  {
    id: 'welcome',
    title: 'This farm is dying',
    body:
      'The soil is cracked, the crops are failing, and there is no irrigation system here at all. ' +
      'Your job is to build one — choose real components, wire them, program them, and watch what your design does.\n\n' +
      'This walkthrough takes about five minutes. You can skip it whenever you like.',
    target: '',
    side: 'centre',
    done: () => false,
  },
  {
    id: 'telemetry',
    title: 'Everything here is measured',
    body:
      'These readings are live. Soil moisture is critically low and crop health is falling — that is why the field looks like it does. ' +
      'Nothing on this screen is decorative.',
    target: '.telemetry-panel',
    side: 'left',
    done: () => false,
  },
  {
    id: 'assistant',
    title: 'You can ask for help at any time',
    body:
      'The assistant in the corner can see your screen, your parts, your wiring and the farm. ' +
      'Ask it "what should I do next?" and it answers about your actual build.',
    target: '.dock-bubble',
    side: 'left',
    done: () => false,
  },
  {
    id: 'goToShed',
    title: 'Start in the Tool Shed',
    body: 'Everything you build with has to be bought first. Click Tool shed to see what is available.',
    target: '[data-nav="shed"]',
    side: 'right',
    done: () => appState.screen === 'shed',
  },
  {
    id: 'buy',
    title: 'Buy your components',
    body:
      'Sixty-five real parts, each with real specifications and a real price. Nothing is marked as the correct answer — that is your decision.\n\n' +
      'Not sure? Ask the assistant "what do I need to buy" and it will give you a costed list. ' +
      'Add at least a controller and a breadboard to continue.',
    target: '.part-grid',
    side: 'left',
    screen: 'shed',
    done: () => distinctOwned().length >= 2,
  },
  {
    id: 'proceed',
    title: 'Take your parts to the bench',
    body: 'When your tray has what you need, this takes you to the workbench.',
    target: '#shedProceed',
    side: 'left',
    screen: 'shed',
    done: () => appState.screen === 'circuit',
  },
  {
    id: 'place',
    title: 'The bench starts empty',
    body:
      'Only what you bought appears in the palette. Click a part to place it — start with your controller.\n\n' +
      'The panel on the right tells you the exact next step at every point.',
    target: '.parts-palette',
    side: 'right',
    screen: 'circuit',
    done: () => graph.placed.length >= 1,
  },
  {
    id: 'coach',
    title: 'Follow the coach',
    body:
      'This panel reads your bench and names the exact wire to run next. It updates every time you connect something.\n\n' +
      'Click a pin, then click another pin, to join them. Wire a sensor and a driver to your controller to continue.',
    target: '#coachPanel',
    side: 'left',
    screen: 'circuit',
    done: () => wiredSensors().length > 0 || wiredOutputs().length > 0,
  },
  {
    id: 'modes',
    title: 'Choose how much help you want',
    body:
      'Learn names the exact pins. Practice points at the problem. Challenge asks questions only. Exam gives nothing and records your work.\n\n' +
      'You are in Learn. Change it whenever you like.',
    target: '.mode-switch',
    side: 'left',
    screen: 'circuit',
    done: () => false,
  },
  {
    id: 'code',
    title: 'Now write the logic',
    body:
      'The Coding Lab generates blocks from your wiring — wire a sensor to a pin and that exact pin appears as a block. ' +
      'The workspace starts empty; the logic is yours to build.',
    target: '[data-nav="coding"]',
    side: 'right',
    done: () => appState.screen === 'coding',
  },
  {
    id: 'deploy',
    title: 'Deploy and watch',
    body:
      'You can deploy at any time, working or not. A design that fails will fail visibly on the farm, and that is the point — ' +
      'watching why it failed is how you find the problem.',
    target: '#deployButton',
    side: 'left',
    screen: 'coding',
    done: () => appState.screen === 'farm' && appState.codeReady,
  },
  {
    id: 'done',
    title: 'That is the whole loop',
    body:
      'Observe, design, build, program, deploy, watch the consequence, then improve it.\n\n' +
      'The rest of the navigation — Learning model, Class view, Report — tracks what you understand as you go. ' +
      'You never have to open them, but they are there.',
    target: '',
    side: 'centre',
    done: () => false,
  },
]

let index = 0
let host: HTMLElement | null = null
let poll = 0
let running = false

export function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* private browsing — it will simply offer again next time */
  }
}

export function startOnboarding(fromStart = true) {
  if (running) return
  running = true
  index = fromStart ? 0 : index
  mount()
  render()
  poll = window.setInterval(() => {
    const step = STEPS[index]
    if (!step) return
    // Advance automatically once the action is genuinely done.
    if (step.done()) next()
    else reposition()
  }, 400)
}

export function endOnboarding() {
  running = false
  clearInterval(poll)
  host?.remove()
  host = null
  document.querySelectorAll('.ob-spot').forEach((n) => n.classList.remove('ob-spot'))
  markSeen()
}

function next() {
  if (index >= STEPS.length - 1) {
    endOnboarding()
    return
  }
  index++
  render()
}

function back() {
  if (index > 0) index--
  render()
}

function mount() {
  if (host && document.body.contains(host)) return
  host = document.createElement('div')
  host.className = 'ob'
  host.innerHTML = `
    <div class="ob-veil" id="obVeil"></div>
    <div class="ob-card" id="obCard" role="dialog" aria-live="polite">
      <div class="ob-progress" id="obProgress"></div>
      <h2 class="ob-title" id="obTitle"></h2>
      <p class="ob-body" id="obBody"></p>
      <div class="ob-actions">
        <button class="ob-skip" id="obSkip">Skip the walkthrough</button>
        <div class="ob-nav">
          <button class="ghost-button small" id="obBack">Back</button>
          <button class="primary-button small" id="obNext">Next</button>
        </div>
      </div>
    </div>`
  document.body.appendChild(host)
  host.querySelector('#obSkip')!.addEventListener('click', endOnboarding)
  host.querySelector('#obNext')!.addEventListener('click', next)
  host.querySelector('#obBack')!.addEventListener('click', back)
}

function render() {
  if (!host) return
  const step = STEPS[index]
  host.querySelector('#obTitle')!.textContent = step.title
  host.querySelector('#obBody')!.textContent = step.body
  host.querySelector('#obProgress')!.textContent = `Step ${index + 1} of ${STEPS.length}`
  ;(host.querySelector('#obBack') as HTMLButtonElement).disabled = index === 0
  ;(host.querySelector('#obNext') as HTMLButtonElement).textContent =
    index === STEPS.length - 1 ? 'Start building' : 'Next'
  reposition()
}

/** Spotlight the target and place the card beside it. */
function reposition() {
  if (!host) return
  const step = STEPS[index]
  const card = host.querySelector<HTMLElement>('#obCard')!

  document.querySelectorAll('.ob-spot').forEach((n) => n.classList.remove('ob-spot'))

  if (!step.target || step.side === 'centre') {
    card.className = 'ob-card centre'
    card.style.cssText = ''
    return
  }

  const el = document.querySelector<HTMLElement>(step.target)
  if (!el) {
    // The target is not on this screen; keep the card centred rather than
    // pointing at nothing.
    card.className = 'ob-card centre'
    card.style.cssText = ''
    return
  }

  el.classList.add('ob-spot')
  const r = el.getBoundingClientRect()
  card.className = `ob-card side-${step.side ?? 'right'}`

  const cw = 330
  const ch = 250
  const gap = 16

  // A wide target — a parts grid, a workbench — leaves no room beside it, and a
  // card placed there would cover the very thing the student has to click. In
  // that case the card is docked to a free corner instead.
  const wide = r.width > window.innerWidth * 0.42
  if (wide) {
    const spaceBelow = window.innerHeight - r.bottom
    const top = spaceBelow > ch + 24 ? r.bottom + gap : Math.max(12, r.top - ch - gap)
    card.style.cssText = `left:${Math.max(12, window.innerWidth - cw - 24)}px; top:${top}px;`
    return
  }

  let left = r.right + gap
  let top = r.top

  if (step.side === 'left') left = r.left - cw - gap
  if (step.side === 'top') { left = r.left; top = r.top - ch }
  if (step.side === 'bottom') { left = r.left; top = r.bottom + gap }

  // If that would still land on the target, flip to the other side.
  const overlaps = left < r.right && left + cw > r.left && top < r.bottom && top + ch > r.top
  if (overlaps) left = r.left > window.innerWidth / 2 ? r.left - cw - gap : r.right + gap

  left = Math.max(12, Math.min(left, window.innerWidth - cw - 12))
  top = Math.max(12, Math.min(top, window.innerHeight - ch - 12))

  card.style.cssText = `left:${left}px; top:${top}px;`
}

/** The welcome gate shown on a genuine first visit. */
export function renderWelcomeGate(onGuided: () => void, onExplore: () => void): HTMLElement {
  const gate = document.createElement('div')
  gate.className = 'ob-gate'
  gate.innerHTML = `
    <div class="ob-gate-card">
      <div class="ob-gate-mark">${icon('farm', 30)}</div>
      <h1>Welcome to SunRoot</h1>
      <p class="ob-gate-lead">
        You are about to take over a farm that is failing. There is no irrigation system,
        and you are going to design one — choosing the parts, wiring the circuit, and
        programming the control logic yourself.
      </p>
      <p class="ob-gate-sub">
        No prior electronics knowledge is needed. Nothing you build can break anything.
      </p>
      <div class="ob-gate-actions">
        <button class="primary-button" id="obGuided">
          Show me around <span class="ob-gate-hint">about 5 minutes</span>
        </button>
        <button class="ghost-button" id="obExplore">I will explore on my own</button>
      </div>
    </div>`
  gate.querySelector('#obGuided')!.addEventListener('click', () => {
    gate.remove()
    onGuided()
  })
  gate.querySelector('#obExplore')!.addEventListener('click', () => {
    gate.remove()
    markSeen()
    onExplore()
  })
  return gate
}
