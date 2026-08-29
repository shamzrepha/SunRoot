import {
  signUp,
  logIn,
  signInWithGoogle,
  requestPasswordReset,
  describeAuthError,
} from '../accounts/AuthService'
import { refreshProfile } from '../accounts/Session'
import type { Role } from '../accounts/types'

type Mode = 'login' | 'signup' | 'reset'

const ROLE_COPY: Record<Role, { label: string; hint: string }> = {
  teacher: { label: 'Teacher', hint: 'Build classrooms, invite students by tag, track progress.' },
  student: { label: 'Student', hint: 'Join a classroom and learn at your own pace.' },
  individual: { label: 'Individual', hint: 'Learn on your own \u2014 no classroom required.' },
}

export function renderLogin(root: HTMLElement, onAuthenticated: () => void) {
  let mode: Mode = 'login'
  let role: Role = 'student'

  function paintCanvas() {
    return `
      <div class="login-canvas">
        <div class="login-mark">
          <svg viewBox="0 0 24 24" width="40" height="40">
            <path d="M12 21c0-5 2-8 7-9-5-1-7-4-7-9-0 5-2 8-7 9 5 1 7 4 7 9z" fill="#4fd67a"/>
          </svg>
        </div>
        <h1>SunRoot</h1>
        <p>Wire the circuit. Route the water. Grow the farm.</p>
      </div>
    `
  }

  function paint() {
    const isReset = mode === 'reset'

    root.innerHTML = `
      <div class="screen login-screen">
        ${paintCanvas()}

        <form class="login-card" id="loginForm">
          ${
            isReset
              ? `<p class="empty-note">Enter your account email and we\u2019ll send a reset link.</p>`
              : `<div class="role-tabs" role="tablist">
                  ${(Object.keys(ROLE_COPY) as Role[])
                    .map(
                      (r) => `<button type="button" class="role-tab${r === role ? ' is-active' : ''}" data-role="${r}">
                        ${ROLE_COPY[r].label}
                      </button>`,
                    )
                    .join('')}
                </div>
                <p class="empty-note">${ROLE_COPY[role].hint}</p>

                <div class="mode-switch">
                  <button type="button" class="mode-tab${mode === 'login' ? ' is-active' : ''}" data-mode="login">Log in</button>
                  <button type="button" class="mode-tab${mode === 'signup' ? ' is-active' : ''}" data-mode="signup">Create account</button>
                </div>`
          }

          ${
            mode === 'signup'
              ? `<label class="field"><span>Name</span><input type="text" id="nameInput" autocomplete="name" placeholder="Ada Lovelace" /></label>`
              : ''
          }
          <label class="field"><span>Email</span><input type="email" id="emailInput" autocomplete="email" required placeholder="you@school.edu" /></label>
          ${
            isReset
              ? ''
              : `<label class="field"><span>Password</span><input type="password" id="passInput" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" required minlength="6" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" /></label>`
          }

          ${mode === 'login' ? `<button type="button" class="link-button" id="forgotButton">Forgot password?</button>` : ''}

          <p class="login-error" id="loginError" hidden></p>
          <p class="login-success" id="loginSuccess" hidden></p>

          <button type="submit" class="primary-button large" id="submitButton">
            ${isReset ? 'Send reset link' : mode === 'signup' ? `Create ${ROLE_COPY[role].label.toLowerCase()} account` : 'Log in'}
          </button>

          ${
            isReset
              ? `<button type="button" class="link-button" id="backToLoginButton">Back to log in</button>`
              : `<div class="divider"><span>or</span></div>
                 <button type="button" class="google-button" id="googleButton">
                   <svg viewBox="0 0 18 18" width="18" height="18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z"/></svg>
                   Continue with Google
                 </button>`
          }
        </form>
      </div>
    `

    root.querySelectorAll<HTMLButtonElement>('.role-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        role = btn.dataset.role as Role
        paint()
      })
    })
    root.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        mode = btn.dataset.mode as Mode
        paint()
      })
    })
    root.querySelector<HTMLButtonElement>('#forgotButton')?.addEventListener('click', () => {
      mode = 'reset'
      paint()
    })
    root.querySelector<HTMLButtonElement>('#backToLoginButton')?.addEventListener('click', () => {
      mode = 'login'
      paint()
    })

    const form = root.querySelector<HTMLFormElement>('#loginForm')!
    const errorEl = root.querySelector<HTMLParagraphElement>('#loginError')!
    const successEl = root.querySelector<HTMLParagraphElement>('#loginSuccess')!
    const submitButton = root.querySelector<HTMLButtonElement>('#submitButton')!

    root.querySelector<HTMLButtonElement>('#googleButton')?.addEventListener('click', async () => {
      errorEl.hidden = true
      try {
        // Deliberately not doing anything else here — no role check, no
        // navigation. Google sign-in changes Firebase's auth state, which
        // main.ts's global auth-state listener reacts to on its own: it
        // decides whether this account needs a role picker (no profile
        // yet) or goes straight to the dashboard (returning user). Having
        // that decision made in exactly one place, instead of also trying
        // to make it here, is what fixes the race that used to let a
        // Google sign-in through with no role ever assigned.
        await signInWithGoogle()
      } catch (err: any) {
        errorEl.textContent = describeAuthError(err?.code ?? '')
        errorEl.hidden = false
      }
    })

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      errorEl.hidden = true
      successEl.hidden = true
      submitButton.disabled = true
      submitButton.textContent = 'Working\u2026'
      try {
        const email = (root.querySelector<HTMLInputElement>('#emailInput')!).value

        if (mode === 'reset') {
          await requestPasswordReset(email)
          successEl.textContent = 'Check your inbox for a reset link.'
          successEl.hidden = false
          submitButton.disabled = false
          submitButton.textContent = 'Send reset link'
          return
        }

        const password = (root.querySelector<HTMLInputElement>('#passInput')!).value
        if (mode === 'signup') {
          const nameInput = root.querySelector<HTMLInputElement>('#nameInput')
          const displayName = nameInput?.value.trim() ?? ''
          if (!displayName) throw { code: 'custom/name' }
          await signUp({ email, password, displayName, role })
        } else {
          await logIn(email, password)
        }
        await refreshProfile()
        onAuthenticated()
      } catch (err: any) {
        errorEl.textContent = err?.code === 'custom/name' ? 'Enter your name.' : describeAuthError(err?.code ?? '')
        errorEl.hidden = false
        submitButton.disabled = false
        submitButton.textContent = mode === 'reset' ? 'Send reset link' : mode === 'signup' ? `Create ${ROLE_COPY[role].label.toLowerCase()} account` : 'Log in'
      }
    })
  }

  paint()
}
