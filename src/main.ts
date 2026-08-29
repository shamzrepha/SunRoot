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
import { mountShell, renderNav, renderHud, updateRankUi, updateTeamPanel, transitionView } from './game/shell'
import type { NavItem } from './game/shell'
import { farm } from './simulation/FarmState'

import { progress } from './game/progress'
import { icon } from './ui/icons'
import { hide as hideAssistant, show as assistantShow } from './ai/Assistant'
import { restoreForActiveClassroom, startAutosave, applySnapshot } from './persistence/SaveManager'
import { getTeam } from './accounts/TeamService'
import { onAuthChange, logOut } from './accounts/AuthService'
import { session, refreshProfile } from './accounts/Session'
import { setActiveClassroom, getActiveClassroom, setActiveTeam } from './accounts/WorkshopContext'
import { ensureDemoClassroomExists } from './accounts/ClassroomService'
import { renderLogin } from './screens/login'
import { renderDashboard } from './screens/dashboard'
import { renderClasses } from './screens/classes'
import { renderFindClass } from './screens/findClass'
import { renderAdmin } from './screens/admin'
import { renderProfile } from './screens/profile'
import { renderLeaderboard } from './screens/leaderboard'
import { renderCompleteProfile } from './screens/completeProfile'

const root = document.querySelector<HTMLDivElement>('#app')!
let shellMounted = false
let hudTimer = 0
let postLoadingScreen: Screen = 'dashboard'

const WORKSHOP_SCREENS: Screen[] = ['farm', 'shed', 'circuit', 'coding', 'learning', 'quiz', 'report', 'rewards', 'tutor']

function navItems(screen: Screen): NavItem[] {
  // The build/progress screens are the actual digital twin — deliberately
  // NOT shown until the student has opened a classroom's workshop, so
  // logging in lands on the school portal (Dashboard/Classes), not straight
  // into the simulation. Once inside, they stay visible so moving between
  // Tool Shed → Circuit Lab → Coding Lab → Farm doesn't require detouring
  // back through a classroom page every time.
  const inWorkshop = WORKSHOP_SCREENS.includes(screen)
  const role = session.profile?.role

  const items: (NavItem & { group: string })[] = []

  items.push({ id: 'dashboard' as Screen, label: 'Dashboard', icon: icon('class'), group: 'Account' })
  items.push({ id: 'classes' as Screen, label: 'My Classes', icon: icon('class'), group: 'Account' })
  items.push({ id: 'leaderboard' as Screen, label: 'Leaderboard', icon: icon('rewards'), group: 'Account' })
  if (role !== 'teacher') {
    items.push({ id: 'findClass' as Screen, label: 'Find a Class', icon: icon('class'), group: 'Account' })
  }
  if (session.profile?.isAdmin) {
    items.push({ id: 'admin' as Screen, label: 'Admin', icon: icon('class'), group: 'Account' })
  }

  if (inWorkshop) {
    items.push({ id: 'farm' as Screen, label: 'Farm', icon: icon('farm'), group: 'Build' })
    items.push({ id: 'shed' as Screen, label: 'Tool shed', icon: icon('shed'), group: 'Build' })
    items.push({ id: 'circuit' as Screen, label: 'Circuit lab', icon: icon('circuit'), group: 'Build' })
    items.push({ id: 'coding' as Screen, label: 'Coding lab', icon: icon('code'), group: 'Build' })
    items.push({ id: 'learning' as Screen, label: 'Learning model', icon: icon('brain'), group: 'Progress' })
    items.push({ id: 'quiz' as Screen, label: 'Learning check', icon: icon('quiz'), group: 'Progress' })
    items.push({ id: 'report' as Screen, label: 'Report', icon: icon('report'), group: 'Progress' })
    items.push({ id: 'rewards' as Screen, label: 'Rewards', icon: icon('rewards'), group: 'Progress' })
    items.push({ id: 'tutor' as Screen, label: 'Tutor', icon: icon('tutor'), group: 'Progress' })
  }

  items.push({ id: 'access' as Screen, label: 'Accessibility', icon: icon('access'), group: 'More' })

  return items
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

  // Leaving the workshop entirely (not just moving between its own screens)
  // clears which classroom "launched" it, so a stray sync after navigating
  // away never gets mis-tagged to a class the student isn't actively in.
  if (!WORKSHOP_SCREENS.includes(screen) && getActiveClassroom()) {
    setActiveClassroom(null)
  }

  if (screen === 'login') {
    shellMounted = false
    cancelAnimationFrame(hudTimer)
    renderLogin(root, () => goTo('loading'))
    return
  }
  if (screen === 'loading') {
    shellMounted = false
    cancelAnimationFrame(hudTimer)
    initAccessibility()
    mountAssistantDock()
    // Normally the dashboard, not the farm — but if a refresh happened
    // mid-workshop, the auth gate sets postLoadingScreen to 'farm' so a
    // refresh actually resumes the session instead of bouncing back to the
    // dashboard and making the student navigate back in by hand.
    const dest = postLoadingScreen
    postLoadingScreen = 'dashboard'
    renderLoading(root, () => goTo(dest))
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
  renderNav(navItems(screen), screen)
  updateRankUi()
  updateTeamPanel()

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

    } else if (screen === 'dashboard') {
      renderDashboard(host, {
        toClasses: () => goTo('classes'),
        toFindClass: () => goTo('findClass'),
        onLogout: () => logOut().then(() => goTo('login')),
        toAdmin: () => goTo('admin'),
      })
    } else if (screen === 'classes') {
      renderClasses(host, {
        toWorkshop: (classroomId) => {
          setActiveClassroom(classroomId)
          setActiveTeam(null) // solo workshop unless a team entry point sets this itself
          restoreForActiveClassroom()
          goTo('farm')
        },
        toTeamWorkshop: async (classroomId, teamId) => {
          setActiveClassroom(classroomId)
          setActiveTeam(teamId)
          const team = await getTeam(teamId)
          // Pull the team's last shipped state if there is one; otherwise
          // fall back to whatever this student already has saved for this
          // classroom (e.g. the very first team member to open it).
          const pulled = team?.sharedState && Object.keys(team.sharedState).length
            ? applySnapshot(team.sharedState as any)
            : false
          if (!pulled) restoreForActiveClassroom()
          goTo('farm')
        },
      })
    } else if (screen === 'findClass') {
      renderFindClass(host)
    } else if (screen === 'admin') {
      renderAdmin(host)
    } else if (screen === 'profile') {
      renderProfile(host)
    } else if (screen === 'leaderboard') {
      renderLeaderboard(host)
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

// --- Auth gate --------------------------------------------------------------
// Nothing else renders until Firebase reports whether a session is cached.
// That check is what makes "stay logged in across a refresh" actually work —
// previously there was no gate at all, so the app always booted straight into
// the farm with no notion of who (if anyone) was using it.
root.innerHTML = `<div class="screen"><p class="empty-note" style="padding:24px">Loading SunRoot\u2026</p></div>`

onAuthChange(async (user) => {
  session.user = user

  if (!user) {
    goTo('login')
    return
  }

  await refreshProfile()

  // Authenticated, but no Firestore profile — this is the fix for the
  // Google sign-in race (see completeProfile.ts for the full explanation).
  // Handling it here, in the one place every auth state change passes
  // through, means it's caught no matter which code path got someone into
  // this state, not just the specific race that surfaced it.
  if (!session.profile) {
    renderCompleteProfile(root, user, () => goTo('loading'))
    return
  }

  ensureDemoClassroomExists().catch((err) => console.error('SunRoot: seed check failed', err))

  // If a classroom workshop was active when the page was last open (see
  // WorkshopContext.ts — it persists this), resume straight back into it
  // instead of bouncing to the dashboard and making them navigate back in.
  const resumingClassroom = getActiveClassroom()
  if (resumingClassroom) {
    const resumed = restoreForActiveClassroom()
    if (resumed) postLoadingScreen = 'farm'
    else setActiveClassroom(null) // stale reference with nothing to restore — don't fake a resume
  }
  startAutosave()

  goTo('loading')
})
