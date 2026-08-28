import { signUp, logIn, describeAuthError } from '../accounts/AuthService'
import { refreshProfile } from '../accounts/Session'
import type { Role } from '../accounts/types'

type Mode = 'login' | 'signup'

const ROLE_COPY: Record<Role, { label: string; hint: string }> = {
  teacher: { label: 'Teacher', hint: 'Build classrooms, invite students by tag, track progress.' },
  student: { label: 'Student', hint: 'Join a classroom and learn at your own pace.' },
  individual: { label: 'Individual', hint: 'Learn on your own \u2014 no classroom required.' },
}

export function renderLogin(root: HTMLElement, onAuthenticated: () => void) {
  let mode: Mode = 'login'
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

        <form class="login-card" id="loginForm">
          <div class="role-tabs" role="tablist">
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
          </div>

          ${
            mode === 'signup'
              ? `<label class="field"><span>Name</span><input type="text" id="nameInput" autocomplete="name" placeholder="Ada Lovelace" /></label>`
              : ''
          }
          <label class="field"><span>Email</span><input type="email" id="emailInput" autocomplete="email" required placeholder="you@school.edu" /></label>
          <label class="field"><span>Password</span><input type="password" id="passInput" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" required minlength="6" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" /></label>

          <p class="login-error" id="loginError" hidden></p>

          <button type="submit" class="primary-button large" id="submitButton">
            ${mode === 'signup' ? `Create ${ROLE_COPY[role].label.toLowerCase()} account` : 'Log in'}
          </button>
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

    const form = root.querySelector<HTMLFormElement>('#loginForm')!
    const errorEl = root.querySelector<HTMLParagraphElement>('#loginError')!
    const submitButton = root.querySelector<HTMLButtonElement>('#submitButton')!

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      errorEl.hidden = true
      submitButton.disabled = true
      submitButton.textContent = 'Working\u2026'
      try {
        const email = (root.querySelector<HTMLInputElement>('#emailInput')!).value
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
        submitButton.textContent = mode === 'signup' ? `Create ${ROLE_COPY[role].label.toLowerCase()} account` : 'Log in'
      }
    })
  }

  paint()
}
