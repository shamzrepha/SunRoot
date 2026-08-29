import type { User as FirebaseUser } from 'firebase/auth'
import { completeGoogleSignup, describeAuthError } from '../accounts/AuthService'
import { refreshProfile } from '../accounts/Session'
import type { Role } from '../accounts/types'

const ROLE_COPY: Record<Role, { label: string; hint: string }> = {
  teacher: { label: 'Teacher', hint: 'Build classrooms, invite students by tag, track progress.' },
  student: { label: 'Student', hint: 'Join a classroom and learn at your own pace.' },
  individual: { label: 'Individual', hint: 'Learn on your own \u2014 no classroom required.' },
}

/**
 * Shown whenever someone is authenticated (Firebase Auth has a user) but has
 * no Firestore profile document yet. This is the fix for a real race: Google
 * sign-in sets the Firebase Auth session immediately, which fires the app's
 * global auth-state listener (main.ts) at the same time the login screen's
 * own code is still asking "is this a new user, and if so, which role?" —
 * whichever finishes first wins, and the global listener often wins, sending
 * a profile-less account straight into the app with no role ever assigned.
 *
 * Rather than patch that specific race, this screen makes "authenticated
 * with no profile" a state the app handles correctly no matter how it was
 * reached — main.ts's auth gate renders this directly instead of proceeding
 * to the dashboard whenever it finds no profile for a signed-in user.
 */
export function renderCompleteProfile(root: HTMLElement, user: FirebaseUser, onDone: () => void) {
  let role: Role = 'student'

  function paint() {
    root.innerHTML = `
      <div class="screen login-screen">
        <div class="login-canvas">
          <div class="login-mark">
            <svg viewBox="0 0 24 24" width="40" height="40">
              <path d="M12 21c0-5 2-8 7-9-5-1-7-4-7-9-0 5-2 8-7 9 5 1 7 4 7 9z" fill="#4fd67a"/>
            </svg>
          </div>
          <h1>SunRoot</h1>
          <p>Wire the circuit. Route the water. Grow the farm.</p>
        </div>
        <div class="login-card">
          <p class="empty-note">Almost there \u2014 how will you use SunRoot?</p>
          <div class="role-tabs" role="tablist">
            ${(Object.keys(ROLE_COPY) as Role[])
              .map((r) => `<button type="button" class="role-tab${r === role ? ' is-active' : ''}" data-role="${r}">${ROLE_COPY[r].label}</button>`)
              .join('')}
          </div>
          <p class="empty-note">${ROLE_COPY[role].hint}</p>
          <p class="login-error" id="completeError" hidden></p>
          <button type="button" class="primary-button large" id="finishButton">Continue</button>
        </div>
      </div>
    `

    root.querySelectorAll<HTMLButtonElement>('.role-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        role = btn.dataset.role as Role
        paint()
      })
    })

    const errorEl = root.querySelector<HTMLParagraphElement>('#completeError')!
    root.querySelector<HTMLButtonElement>('#finishButton')!.addEventListener('click', async (e) => {
      const btn = e.currentTarget as HTMLButtonElement
      btn.disabled = true
      btn.textContent = 'Working\u2026'
      try {
        await completeGoogleSignup(user, role)
        await refreshProfile()
        onDone()
      } catch (err: any) {
        errorEl.textContent = describeAuthError(err?.code ?? '')
        errorEl.hidden = false
        btn.disabled = false
        btn.textContent = 'Continue'
      }
    })
  }

  paint()
}
