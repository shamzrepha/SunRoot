import './style.css'
import { appState } from './appState'
import type { Screen } from './appState'
import { renderLoading, renderIntro } from './screens/boot'
import { initAccessibility } from './ui/Accessibility'
import { unmountActiveScreenIsland } from './ui/reactMount'
import { mountAssistantDock } from './ai/AssistantDock'
import { hasSeenOnboarding, renderWelcomeGate, startOnboarding } from './ui/Onboarding'
import { mountShell, renderNav, updateRankUi, updateTeamPanel, setSidebarTheme, setHudVisible, transitionView, setTopbarTitle } from './game/shell'
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
import { ensureDemoClassroomExists, DEMO_CLASSROOM_ID } from './accounts/ClassroomService'
import { renderLogin } from './screens/login'
import { renderDashboard } from './screens/dashboard'
import { renderCompleteProfile } from './screens/completeProfile'

// --- Lazy screen loading ------------------------------------------------------
// Only the auth gate, boot screens, shell and dashboard ship in the entry
// bundle. Every other screen is fetched the first time it is opened, which
// keeps first load small on slow mobile data. Vite/Rolldown turns each
// import() below into its own chunk; repeat visits hit the module cache.

// The farm runs a RAF loop. We only need to stop it if the farm module has
// actually been loaded, so keep a handle instead of importing it eagerly.
let stopFarmLoop: (() => void) | null = null

function lazyScreen<M>(
  host: HTMLElement,
  screen: Screen,
  label: string,
  load: () => Promise<M>,
  render: (mod: M) => void,
) {
  host.innerHTML = `<div class="lazy-load" role="status" aria-live="polite">Loading ${label}\u2026</div>`
  load()
    .then((mod) => {
      // The student may have navigated elsewhere while the chunk downloaded.
      if (appState.screen !== screen) return
      render(mod)
    })
    .catch((err) => {
      console.error(`[SunRoot] failed to load ${screen} screen`, err)
      if (appState.screen !== screen) return
      host.innerHTML = `<div class="screen"><p>Couldn't load ${label}. Check your connection.</p><button type="button" class="btn" data-retry>Try again</button></div>`
      host.querySelector<HTMLButtonElement>('[data-retry]')?.addEventListener('click', () => goTo(screen))
    })
}

const root = document.querySelector<HTMLDivElement>('#app')!
let shellMounted = false
let postLoadingScreen: Screen = 'dashboard'

const WORKSHOP_SCREENS: Screen[] = ['workshopHub', 'farm', 'shed', 'circuit', 'coding', 'learning', 'quiz', 'report', 'rewards', 'tutor']

function navItems(screen: Screen): NavItem[] {
  // The build/progress screens are the actual digital twin â€” deliberately
  // NOT shown until the student has opened a classroom's workshop, so
  // logging in lands on the school portal (Dashboard/Classes), not straight
  // into the simulation. Once inside, they stay visible so moving between
  // Tool Shed â†’ Circuit Lab â†’ Coding Lab â†’ Farm doesn't require detouring
  // back through a classroom page every time.
  const inWorkshop = WORKSHOP_SCREENS.includes(screen)
  const role = session.profile?.role

  const items: (NavItem & { group: string })[] = []

  items.push({ id: 'dashboard' as Screen, label: 'Dashboard', icon: icon('class'), group: 'Account' })
  items.push({ id: 'onboard' as Screen, label: 'Start Learning', icon: icon('star'), group: 'Account' })
  items.push({ id: 'guidedLabs' as Screen, label: 'Guided Labs', icon: icon('workshop'), group: 'Account' })
  items.push({ id: 'metrics' as Screen, label: 'KPI & Cost Metrics', icon: icon('report'), group: 'Account' })
  items.push({ id: 'classes' as Screen, label: 'My Classes', icon: icon('class'), group: 'Account' })
  items.push({ id: 'studySetViewer' as Screen, label: 'Personal Study Lab', icon: icon('brain'), group: 'Account' })
  items.push({ id: 'leaderboard' as Screen, label: 'Leaderboard', icon: icon('rewards'), group: 'Account' })
  items.push({ id: 'messages' as Screen, label: 'Messages', icon: icon('tutor'), group: 'Account' })
  if (role !== 'teacher') {
    items.push({ id: 'findClass' as Screen, label: 'Find a Class', icon: icon('class'), group: 'Account' })
  }
  if (session.profile?.isAdmin) {
    items.push({ id: 'admin' as Screen, label: 'Admin', icon: icon('class'), group: 'Account' })
  }

  if (inWorkshop) {
    items.push({ id: 'workshopHub' as Screen, label: 'Overview', icon: icon('class'), group: 'Build' })
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

function ensureShell() {
  if (shellMounted) return
  mountShell(root, goTo)
  shellMounted = true
  updateRankUi()
}

export function goTo(screen: Screen) {
  if (screen !== 'farm') stopFarmLoop?.()
  unmountActiveScreenIsland()
  appState.screen = screen

  // Leaving the workshop entirely (not just moving between its own screens)
  // clears which classroom "launched" it, so a stray sync after navigating
  // away never gets mis-tagged to a class the student isn't actively in.
  if (!WORKSHOP_SCREENS.includes(screen) && getActiveClassroom()) {
    setActiveClassroom(null)
  }

  if (screen === 'login') {
    shellMounted = false
    setSidebarTheme('campus') // login has no sidebar yet, but this also flips body.theme-campus for the auth card styling
    renderLogin(root, () => goTo('loading'))
    return
  }
  if (screen === 'loading') {
    shellMounted = false
    initAccessibility()
    mountAssistantDock()
    // Normally the dashboard, not the farm â€” but if a refresh happened
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
    renderIntro(root, () => goTo('farm'))
    return
  }

  ensureShell()
  hideAssistant()
  renderNav(navItems(screen), screen)
  updateRankUi()
  updateTeamPanel()
  setSidebarTheme(WORKSHOP_SCREENS.includes(screen) ? 'workshop' : 'campus')
  setHudVisible(screen === 'farm')

  const SCREEN_TITLES: Record<string, string> = {
    dashboard: 'Dashboard',
    onboard: 'Start Learning',
    guidedLabs: 'Guided Labs',
    metrics: 'KPI & Cost Metrics',
    classes: 'My Classes',
    findClass: 'Find a Class',
    leaderboard: 'Leaderboard',
    messages: 'Messages',
    admin: 'Admin Console',
    profile: 'My Profile',
    workshopHub: 'Workshop Overview',
    farm: 'Digital Twin Farm',
    shed: 'Tool Shed',
    circuit: 'Circuit Lab',
    coding: 'Coding Lab',
    learning: 'Learning Model',
    quiz: 'Learning Check',
    report: 'Competency Report',
    rewards: 'Rewards & Badges',
    tutor: 'AI Engineering Tutor',
    access: 'Accessibility',
    studySetViewer: 'Personal Study Lab',
  }
  setTopbarTitle(SCREEN_TITLES[screen] ?? 'Portal')

  transitionView((host) => {
    if (screen === 'workshopHub') {
      lazyScreen(host, screen, 'workshop overview', () => import('./screens/workshopHub'), ({ renderWorkshopHub }) => {
        renderWorkshopHub(host, () => goTo('shed'))
      })
    } else if (screen === 'shed') {
      lazyScreen(host, screen, 'tool shed', () => import('./screens/toolShed'), ({ renderToolShed }) => {
        renderToolShed(host, () => goTo('circuit'))
        narrateOnce(
          'shed',
          'Everything a workshop would stock is here, and none of it is marked as the right answer. ' +
            'Read the specifications and take what you think your design needs.',
        )
      })
    } else if (screen === 'circuit') {
      lazyScreen(host, screen, 'circuit lab', () => import('./screens/circuitLab'), ({ renderCircuitLab }) => {
        renderCircuitLab(host, () => goTo('coding'), () => goTo('shed'))
        narrateOnce(
          'circuit',
          'An empty bench. Only what you bought is available, and nothing is wired for you.',
        )
      })
    } else if (screen === 'coding') {
      lazyScreen(host, screen, 'coding lab', () => import('./screens/codingLab'), ({ renderCodingLab }) => {
        renderCodingLab(host, () => goTo('farm'), () => goTo('circuit'))
        narrateOnce(
          'coding',
          'Blank workspace. Your blocks came from whatever you actually wired.',
        )
      })
    } else if (screen === 'farm') {
      lazyScreen(host, screen, 'farm', () => import('./screens/farm'), (m) => {
        stopFarmLoop = m.stopFarmLoop
        m.renderFarm(host, () => goTo('coding'), () => goTo('shed'), () => goTo('circuit'))
        if (!hasSeenOnboarding() && !welcomeShown) {
          welcomeShown = true
          document.body.appendChild(
            renderWelcomeGate(
              () => startOnboarding(),
              () => { /* they chose to explore; nothing further */ },
            ),
          )
        }
      })
    } else if (screen === 'dashboard') {
      renderDashboard(host, {
        toClasses: () => goTo('classes'),
        toFindClass: () => goTo('findClass'),
        onLogout: () => logOut().then(() => goTo('login')),
        toAdmin: () => goTo('admin'),
        toDemoWorkshop: () => {
          setActiveClassroom(DEMO_CLASSROOM_ID)
          setActiveTeam(null)
          restoreForActiveClassroom()
          goTo('workshopHub')
        },
        toCircuit: () => {
          setActiveClassroom(DEMO_CLASSROOM_ID)
          setActiveTeam(null)
          restoreForActiveClassroom()
          goTo('circuit')
        },
        toCoding: () => {
          setActiveClassroom(DEMO_CLASSROOM_ID)
          setActiveTeam(null)
          restoreForActiveClassroom()
          goTo('coding')
        },
        toFarm: () => {
          setActiveClassroom(DEMO_CLASSROOM_ID)
          setActiveTeam(null)
          restoreForActiveClassroom()
          goTo('farm')
        },
        toShed: () => {
          setActiveClassroom(DEMO_CLASSROOM_ID)
          setActiveTeam(null)
          restoreForActiveClassroom()
          goTo('shed')
        },
        toQuiz: () => {
          setActiveClassroom(DEMO_CLASSROOM_ID)
          setActiveTeam(null)
          restoreForActiveClassroom()
          goTo('quiz')
        },
        toLeaderboard: () => goTo('leaderboard'),
        toMessages: () => goTo('messages'),
        toProfile: () => goTo('profile'),
        toStudySetViewer: () => goTo('studySetViewer'),
        toTeacherAnalytics: () => goTo('teacher'),
        toClassWorkshop: (classroomId: string) => {
          setActiveClassroom(classroomId)
          setActiveTeam(null)
          restoreForActiveClassroom()
          goTo('workshopHub')
        },
      })
    } else if (screen === 'classes') {
      lazyScreen(host, screen, 'your classes', () => import('./screens/classes'), ({ renderClasses }) => {
        renderClasses(host, {
          toWorkshop: (classroomId) => {
            setActiveClassroom(classroomId)
            setActiveTeam(null) // solo workshop unless a team entry point sets this itself
            restoreForActiveClassroom()
            goTo('workshopHub')
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
            goTo('workshopHub')
          },
          toStudySetViewer: () => goTo('studySetViewer'),
        })
      })
    } else if (screen === 'findClass') {
      lazyScreen(host, screen, 'class finder', () => import('./screens/findClass'), ({ renderFindClass }) => renderFindClass(host))
    } else if (screen === 'admin') {
      lazyScreen(host, screen, 'admin console', () => import('./screens/admin'), ({ renderAdmin }) => renderAdmin(host))
    } else if (screen === 'profile') {
      lazyScreen(host, screen, 'profile', () => import('./screens/profile'), ({ renderProfile }) => {
        renderProfile(host, {
          toMessages: (uid) => {
            import('./screens/messages').then(({ openThreadWith }) => {
              openThreadWith(uid)
              goTo('messages')
            })
          },
        })
      })
    } else if (screen === 'leaderboard') {
      lazyScreen(host, screen, 'leaderboard', () => import('./screens/leaderboard'), ({ renderLeaderboard }) => renderLeaderboard(host))
    } else if (screen === 'messages') {
      lazyScreen(host, screen, 'messages', () => import('./screens/messages'), ({ renderMessages }) => renderMessages(host))
    } else if (screen === 'studySetViewer') {
      lazyScreen(host, screen, 'Personal Study Lab', () => import('./screens/studySetViewer'), ({ renderStudySetViewer }) => {
        renderStudySetViewer(host, () => goTo('classes'))
      })
    } else if (screen === 'learning') {
      lazyScreen(host, screen, 'learning model', () => import('./screens/learning'), ({ renderLearning }) => renderLearning(host))
    } else if (screen === 'teacher') {
      lazyScreen(host, screen, 'teacher analytics', () => import('./screens/teacher'), ({ renderTeacher }) => renderTeacher(host))
    } else if (screen === 'access') {
      lazyScreen(host, screen, 'accessibility settings', () => import('./screens/accessibility'), ({ renderAccessibility }) => renderAccessibility(host))
    } else if (screen === 'tutor') {
      lazyScreen(host, screen, 'tutor', () => import('./screens/extras'), ({ renderTutor }) => renderTutor(host))
    } else if (screen === 'report') {
      lazyScreen(host, screen, 'report', () => import('./screens/extras'), ({ renderReport }) => renderReport(host))
    } else if (screen === 'quiz') {
      lazyScreen(host, screen, 'learning check', () => import('./screens/extras'), ({ renderQuiz }) => renderQuiz(host))
    } else if (screen === 'rewards') {
      lazyScreen(host, screen, 'rewards', () => import('./screens/extras'), ({ renderRewards }) => renderRewards(host))
    } else if (screen === 'onboard') {
      lazyScreen(host, screen, 'Start Learning', () => import('./screens/onboard'), ({ renderOnboard }) => {
        renderOnboard(host, {
          toGuidedLabs: () => goTo('guidedLabs'),
          toWorkshop: () => {
            setActiveClassroom(DEMO_CLASSROOM_ID)
            setActiveTeam(null)
            restoreForActiveClassroom()
            goTo('workshopHub')
          },
          toDashboard: () => goTo('dashboard'),
        })
      })
    } else if (screen === 'guidedLabs') {
      lazyScreen(host, screen, 'guided labs', () => import('./screens/guidedLabs'), ({ renderGuidedLabs }) => {
        renderGuidedLabs(host, {
          toCoding: () => {
            setActiveClassroom(DEMO_CLASSROOM_ID)
            setActiveTeam(null)
            restoreForActiveClassroom()
            goTo('coding')
          },
          toDashboard: () => goTo('dashboard'),
        })
      })
    } else if (screen === 'metrics') {
      lazyScreen(host, screen, 'KPI &amp; cost metrics', () => import('./screens/metrics'), ({ renderMetrics }) => renderMetrics(host))
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
// That check is what makes "stay logged in across a refresh" actually work â€”
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

  // Authenticated, but no Firestore profile â€” this is the fix for the
  // Google sign-in race (see completeProfile.ts for the full explanation).
  // Handling it here, in the one place every auth state change passes
  // through, means it's caught no matter which code path got someone into
  // this state, not just the specific race that surfaced it.
  if (!session.profile) {
    renderCompleteProfile(root, user, () => goTo('loading'))
    return
  }

  ensureDemoClassroomExists().catch(() => {})

  // Always boot into the dashboard/portal first, never straight into the farm
  postLoadingScreen = 'dashboard'
  startAutosave()

  goTo('loading')
})
