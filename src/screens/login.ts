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

const ROLE_COPY: Record<Role, { label: string }> = {
  student: { label: 'Student' },
  teacher: { label: 'Teacher' },
  individual: { label: 'Individual' },
}

export function renderLogin(root: HTMLElement, onAuthenticated: () => void) {
  let mode: Mode = 'login'
  let role: Role = 'student'

  function paintHero() {
    return `
      <div class="login-hero">
        ${heroIllustration()}
        <div class="login-hero-copy">
          <div class="login-hero-mark">
            <svg viewBox="0 0 24 24" width="30" height="30"><circle cx="12" cy="9" r="4.5" fill="#F5B942"/><path d="M12 21c0-5 2-8 7-9-5-1-7-4-7-9-0 5-2 8-7 9 5 1 7 4 7 9z" fill="#4FD67A"/></svg>
            <span>SunRoot</span>
          </div>
          <p>Build it. Understand it. Grow.</p>
        </div>
      </div>
    `
  }

  function paint() {
    const isReset = mode === 'reset'
    const isSignup = mode === 'signup'

    root.innerHTML = `
      <div class="screen login-screen">
        ${paintHero()}

        <div class="login-panel">
          <form class="login-card-v2" id="loginForm">
            <h1>${isReset ? 'Reset your password' : isSignup ? 'Create your account' : 'Welcome back!'}</h1>
            <p class="login-card-sub">${isReset ? 'Enter your account email and we\u2019ll send a reset link.' : 'Sign in to continue your learning journey.'}</p>

            ${
              isReset
                ? ''
                : `<div class="role-pills" role="tablist">
                    ${(Object.keys(ROLE_COPY) as Role[])
                      .map((r) => `<button type="button" class="role-pill${r === role ? ' is-active' : ''}" data-role="${r}">${ROLE_COPY[r].label}</button>`)
                      .join('')}
                  </div>`
            }

            ${
              isSignup
                ? `<label class="field-v2"><span>Name</span><input type="text" id="nameInput" autocomplete="name" placeholder="Ada Lovelace" /></label>`
                : ''
            }
            <label class="field-v2"><span>Email address</span><input type="email" id="emailInput" autocomplete="email" required placeholder="you@example.com" /></label>
            ${
              isReset
                ? ''
                : `<label class="field-v2"><span>Password</span><input type="password" id="passInput" autocomplete="${isSignup ? 'new-password' : 'current-password'}" required minlength="6" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" /></label>`
            }

            ${mode === 'login' ? `<button type="button" class="link-button forgot-link" id="forgotButton">Forgot password?</button>` : ''}

            <p class="login-error" id="loginError" hidden></p>
            <p class="login-success" id="loginSuccess" hidden></p>

            <button type="submit" class="primary-button large" id="submitButton">
              ${isReset ? 'Send reset link' : isSignup ? 'Sign up' : 'Sign in'}
            </button>

            ${
              isReset
                ? `<button type="button" class="link-button" id="backToLoginButton">Back to log in</button>`
                : `<div class="divider"><span>or continue with</span></div>
                   <button type="button" class="google-button" id="googleButton">
                     <svg viewBox="0 0 18 18" width="18" height="18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z"/></svg>
                     Continue with Google
                   </button>
                   <p class="login-switch">
                     ${isSignup ? 'Already have an account?' : 'Don\u2019t have an account?'}
                     <button type="button" class="link-button" id="switchModeButton">${isSignup ? 'Sign in' : 'Sign up'}</button>
                   </p>`
            }
          </form>
        </div>
      </div>
    `

    root.querySelectorAll<HTMLButtonElement>('.role-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        role = btn.dataset.role as Role
        paint()
      })
    })
    root.querySelector<HTMLButtonElement>('#switchModeButton')?.addEventListener('click', () => {
      mode = isSignup ? 'login' : 'signup'
      paint()
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
        if (isSignup) {
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
        submitButton.textContent = isReset ? 'Send reset link' : isSignup ? 'Sign up' : 'Sign in'
      }
    })
  }

  paint()
}

function heroIllustration(): string {
  return `
    <svg viewBox="0 0 400 700" preserveAspectRatio="xMidYMid slice" class="login-hero-svg">
      <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#F5B942" />
          <stop offset="45%" stop-color="#C97A4A" />
          <stop offset="100%" stop-color="#12201A" />
        </linearGradient>
      </defs>
      <rect width="400" height="700" fill="url(#skyGrad)" />
      <circle cx="300" cy="150" r="60" fill="#FDE4A8" opacity="0.9" />
      <rect y="430" width="400" height="270" fill="#12201A" />
      <g opacity="0.9">
        <rect x="40" y="360" width="130" height="80" rx="4" fill="#1B3A2C" stroke="#4FD67A" stroke-width="2" transform="skewY(-4)" />
        <rect x="200" y="380" width="130" height="80" rx="4" fill="#1B3A2C" stroke="#4FD67A" stroke-width="2" transform="skewY(-4)" />
      </g>
      <g fill="#2FA360">
        <rect x="30" y="470" width="10" height="90" /><rect x="70" y="470" width="10" height="90" /><rect x="110" y="470" width="10" height="90" />
        <rect x="150" y="470" width="10" height="90" /><rect x="190" y="470" width="10" height="90" /><rect x="230" y="470" width="10" height="90" />
        <rect x="270" y="470" width="10" height="90" /><rect x="310" y="470" width="10" height="90" /><rect x="350" y="470" width="10" height="90" />
      </g>
    </svg>
  `
}
