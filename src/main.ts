import './style.css'
import { appState } from './appState'
import type { Screen } from './appState'
import { renderLoading, renderIntro } from './screens/boot'
import { renderCircuitLab } from './screens/circuitLab'
import { renderToolShed } from './screens/toolShed'
import { renderLearning } from './screens/learning'
import { renderTeacher } from './screens/teacher'
import { renderAccessibility } from './screens/accessibility'
import { initAccessibility } from './ui/Accessibility'
import { mountAssistantDock } from './ai/AssistantDock'
import { hasSeenOnboarding, renderWelcomeGate, startOnboarding } from './ui/Onboarding'
import { renderFarm, stopFarmLoop } from './screens/farm'
import { renderTutor, renderReport, renderQuiz, renderRewards } from './screens/extras'
import { mountShell, renderNav, renderHud, updateRankUi, transitionView } from './game/shell'
import type { NavItem } from './game/shell'
import { farm } from './simulation/FarmState'

import { progress } from './game/progress'
import { icon } from './ui/icons'
import { hide as hideAssistant, show as assistantShow } from './ai/Assistant'

const root = document.querySelector<HTMLDivElement>('#app')!
let shellMounted = false
let hudTimer = 0

function navItems(): NavItem[] {
  // Grouped deliberately. Eleven flat items was the single biggest cause of
  // "I opened it and did not know where to go" — the four that matter are the
  // build loop, and everything else is progress the student can ignore.
  return [
    { id: 'farm', label: 'Farm', icon: icon('farm'), group: 'Build' },
    { id: 'shed', label: 'Tool shed', icon: icon('shed'), group: 'Build' },
    { id: 'circuit', label: 'Circuit lab', icon: icon('circuit'), group: 'Build' },
    { id: 'coding', label: 'Coding lab', icon: icon('code'), group: 'Build' },
    { id: 'learning', label: 'Learning model', icon: icon('brain'), group: 'Progress' },
    { id: 'quiz', label: 'Learning check', icon: icon('quiz'), group: 'Progress' },
    { id: 'report', label: 'Report', icon: icon('report'), group: 'Progress' },
    { id: 'rewards', label: 'Rewards', icon: icon('rewards'), group: 'Progress' },
    { id: 'tutor', label: 'Tutor', icon: icon('tutor'), group: 'Progress' },
    { id: 'teacher', label: 'Class view', icon: icon('class'), group: 'More' },
    { id: 'access', label: 'Accessibility', icon: icon('access'), group: 'More' },
  ].map((n) => ({ ...n, id: n.id as Screen }))
}

function startHudTicker() {
  cancelAnimationFrame(hudTimer)
  const tick = () => {
    renderHud([
      { label: 'Solar', value: `${Math.round(farm.solarGeneration)} W` },
      { label: 'Battery', value: `${Math.round(farm.battery)}%`, tone: farm.battery < 25 ? 'warn' : '' },
      { label: 'Soil moisture', value: `${Math.round(farm.soilMoisture)}%`, tone: farm.soilMoisture < 25 ? 'warn' : '' },
      { label: 'Pump', value: farm.pumpOn ? 'ON' : 'OFF', tone: farm.pumpOn ? 'good' : '' },
      { label: 'Crop health', value: `${Math.round(farm.cropHealth)}%`, tone: farm.cropHealth < 40 ? 'warn' : 'good' },
      { label: 'Time', value: formatHour(farm.hour) },
    ])
    hudTimer = requestAnimationFrame(tick)
  }
  tick()
}

function formatHour(h: number) {
  const hh = Math.floor(h)
  const mm = Math.floor((h % 1) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function ensureShell() {
  if (shellMounted) return
  mountShell(root, goTo)
  shellMounted = true
  updateRankUi()
  startHudTicker()
}

export function goTo(screen: Screen) {
  if (screen !== 'farm') stopFarmLoop()
  appState.screen = screen

  if (screen === 'loading') {
    shellMounted = false
    cancelAnimationFrame(hudTimer)
    initAccessibility()
    mountAssistantDock()
    renderLoading(root, () => goTo('farm'))
    return
  }
  if (screen === 'intro') {
    shellMounted = false
    cancelAnimationFrame(hudTimer)
    renderIntro(root, () => goTo('farm'))
    return
  }

  ensureShell()
  hideAssistant()
  renderNav(navItems(), screen)
  updateRankUi()

  transitionView((host) => {
    if (screen === 'shed') {
      renderToolShed(host, () => goTo('circuit'))
      narrateOnce(
        'shed',
        'Everything a workshop would stock is here, and none of it is marked as the right answer. ' +
          'Read the specifications and take what you think your design needs.',
      )
    } else if (screen === 'circuit') {
      renderCircuitLab(host, () => goTo('coding'), () => goTo('shed'))
      narrateOnce(
        'circuit',
        'An empty bench. Only what you bought is available, and nothing is wired for you.',
      )
    } else if (screen === 'coding') {
      host.innerHTML = '<div class="lazy-load">Loading coding lab...</div>'
      import('./screens/codingLab').then(({ renderCodingLab }) => {
        if (appState.screen !== 'coding') return
        renderCodingLab(host, () => goTo('farm'), () => goTo('circuit'))
        narrateOnce(
          'coding',
          'Blank workspace. Your blocks came from whatever you actually wired.',
        )
      })
    } else if (screen === 'farm') {
      renderFarm(host, () => goTo('coding'), () => goTo('shed'), () => goTo('circuit'))
      if (!hasSeenOnboarding() && !welcomeShown) {
        welcomeShown = true
        document.body.appendChild(
          renderWelcomeGate(
            () => startOnboarding(),
            () => { /* they chose to explore; nothing further */ },
          ),
        )
      }

    } else if (screen === 'learning') {
      renderLearning(host)
    } else if (screen === 'teacher') {
      renderTeacher(host)
    } else if (screen === 'access') {
      renderAccessibility(host)
    } else if (screen === 'tutor') {
      renderTutor(host)
    } else if (screen === 'report') {
      renderReport(host)
    } else if (screen === 'quiz') {
      renderQuiz(host)
    } else if (screen === 'rewards') {
      renderRewards(host)
    }
  })
}

// Each scripted line fires once per session so the assistant introduces a
// screen without nagging on every revisit.
const spoken = new Set<string>()
let welcomeShown = false
function narrateOnce(key: string, line: string, delay = 800) {
  if (spoken.has(key)) return
  spoken.add(key)
  setTimeout(() => assistantShow(line, 'thinking'), delay)
}

// The farm assistant reacts to live state rather than a script, so it only
// speaks when the simulation actually crosses a threshold.

// Track peak stats globally so the report reflects the whole session.
setInterval(() => {
  progress.stats.peakHealth = Math.max(progress.stats.peakHealth, farm.cropHealth)
  progress.stats.lowestBattery = Math.min(progress.stats.lowestBattery, farm.battery)
}, 1000)

goTo('loading')
