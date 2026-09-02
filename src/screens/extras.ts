import { assess } from '../learning/AIAssessor'
import { buildQuiz, hasBuildEvidence, recordAnswer } from '../learning/AdaptiveQuiz'
import type { QuizOption, QuizQuestion } from '../learning/AdaptiveQuiz'
import { progress } from '../game/progress'
import { icon } from '../ui/icons'
import { toast, updateRankUi } from '../game/shell'
import { sfx } from '../game/sound'
import { farm } from '../simulation/FarmState'

// ---------- Adaptive tutor ----------

interface TutorEntry {
  condition: () => boolean
  mild: string
  strong: string
}

const TUTOR_RULES: TutorEntry[] = [
  {
    condition: () => farm.battery < 15,
    mild: 'Your battery is running very low. What happens to the pump when there is no stored power?',
    strong: 'The battery is nearly empty. The pump draws power even at night, so if your threshold keeps it running too long you will drain the bank before sunrise. Try raising the moisture threshold so the pump runs in shorter bursts.',
  },
  {
    condition: () => farm.soilMoisture < 20,
    mild: 'Soil moisture is critically low. Is your pump threshold set high enough to react in time?',
    strong: 'Moisture has dropped below 20%. Your IF block only turns the pump on below its threshold — if that number is too low, the crop starts suffering before irrigation even begins. Try triggering at 35% instead of 30%.',
  },
  {
    condition: () => farm.cropHealth < 40,
    mild: 'Crop health is falling. What range of soil moisture do you think plants need?',
    strong: 'Crop health falls whenever moisture sits outside the healthy band for too long. Watch the moisture bar for one full day cycle and note when it dips — then set your threshold just above that dip.',
  },
  {
    condition: () => farm.pumpOn && farm.soilMoisture > 60,
    mild: 'The pump is still running with plenty of moisture. Is that efficient?',
    strong: 'You are over-watering. Every extra second of pumping drains the battery you need for tomorrow. Add an IF block that turns the pump OFF once moisture goes above your target.',
  },
]

export function renderTutor(host: HTMLElement) {
  const active = TUTOR_RULES.find((r) => r.condition())

  host.innerHTML = `
    <div class="panel-grid single">
      <section class="panel">
        <h2 class="panel-title">Adaptive tutor</h2>
        <div class="tutor-body">
          <div class="tutor-avatar">
            <svg viewBox="0 0 48 48" width="64" height="64">
              <rect x="9" y="15" width="30" height="23" rx="7" fill="#7fd8ff"/>
              <circle cx="19" cy="26" r="3.4" fill="#08202e"/>
              <circle cx="29" cy="26" r="3.4" fill="#08202e"/>
              <path d="M19 32.5q5 3 10 0" stroke="#08202e" stroke-width="1.8" fill="none" stroke-linecap="round"/>
              <rect x="22.5" y="7" width="3" height="8" fill="#7fd8ff"/>
              <circle cx="24" cy="6" r="2.6" fill="#4fd67a"/>
            </svg>
          </div>
          <div class="tutor-speech" id="tutorSpeech">
            ${active
              ? `<p>${active.mild}</p>`
              : '<p>Everything looks stable right now. Watch a full day cycle and see whether your battery recovers before the next irrigation run.</p>'}
          </div>
        </div>

        <div class="tutor-actions">
          ${active
            ? `<button class="ghost-button" id="hintStrong">Give me a stronger hint</button>`
            : ''}
          <button class="ghost-button" id="hintNone">I'll figure it out</button>
        </div>

        <p class="panel-note">The tutor never gives the answer outright — it asks the question an engineer would ask next.</p>
      </section>
    </div>
  `

  host.querySelector('#hintStrong')?.addEventListener('click', () => {
    sfx.click()
    const speech = host.querySelector('#tutorSpeech')!
    speech.innerHTML = `<p>${active!.strong}</p>`
  })
  host.querySelector('#hintNone')?.addEventListener('click', () => {
    sfx.click()
    toast('Good — struggle is where the learning happens.', 'info')
  })
}

// ---------- Engineer report ----------

export function renderReport(root: HTMLElement) {
  root.innerHTML = `
    <div class="screen report-screen report-screen-v2">
      <div class="report-v2-header">
        <div>
          <h1>Design Assessment Report</h1>
          <p class="report-v2-sub">Assessing your build, circuit topology, and simulation telemetry…</p>
        </div>
        <div class="report-header-actions">
          <button class="ghost-button small" id="reassessBtn">🔄 Re-assess</button>
          <button class="ghost-button small" id="downloadPdfBtn">📥 Print / PDF</button>
        </div>
      </div>
      <div id="reportDynamicBody" class="report-loading-state">
        <p class="empty-note">Computing engineering metrics and querying AI assessor…</p>
      </div>
    </div>
  `

  const body = root.querySelector<HTMLElement>('#reportDynamicBody')!
  root.querySelector('#reassessBtn')?.addEventListener('click', runAssessment)
  root.querySelector('#downloadPdfBtn')?.addEventListener('click', () => window.print())

  async function runAssessment() {
    body.innerHTML = `<p class="empty-note">Analyzing circuit netlist, control loops, and simulation telemetry…</p>`
    try {
      const a = await assess()
      progress.rank = a.rank
      progress.xp = Math.max(progress.xp, a.xp)
      updateRankUi()

      const overall = a.overall !== null ? Math.round(a.overall) : 75
      const circumference = 364.4
      const strokeOffset = circumference * (1 - Math.min(1, Math.max(0, overall / 100)))

      const label =
        overall >= 80 ? 'Great Work!' : overall >= 60 ? 'Good Progress!' : overall >= 40 ? 'Developing' : 'Needs Work'

      body.innerHTML = `
        <!-- Top 2-Column Grid -->
        <div class="report-v2-top-grid">
          <!-- Left: Design Score Card -->
          <div class="report-card score-card">
            <h2>Design Score (${escapeHtml(a.rank)})</h2>
            <div class="report-circular-gauge-wrap">
              <svg viewBox="0 0 140 140" class="report-gauge-svg">
                <circle cx="70" cy="70" r="58" class="report-gauge-bg" />
                <circle cx="70" cy="70" r="58" class="report-gauge-fill" stroke-dasharray="${circumference}" stroke-dashoffset="${strokeOffset.toFixed(1)}" />
              </svg>
              <div class="report-gauge-center">
                <span class="report-score-num">${overall}%</span>
                <span class="report-score-label">${label}</span>
              </div>
            </div>

            <div class="report-rewards-strip">
              <div class="rep-reward-pill gold">★ +${a.xp} XP</div>
              <div class="rep-reward-pill blue">🪙 +${Math.round(a.xp * 0.4)} Credits</div>
            </div>
          </div>

          <!-- Right: Score Breakdown Card -->
          <div class="report-card breakdown-card">
            <h2>Score Breakdown</h2>
            <div class="report-breakdown-list">
              ${a.dimensions
                .map(
                  (d) => `
                <div class="rep-bar-row">
                  <span class="rep-bar-lbl">${escapeHtml(d.label)}</span>
                  <div class="rep-bar-track"><div class="rep-bar-fill" style="width: ${d.value ?? 0}%"></div></div>
                  <span class="rep-bar-pct">${d.value !== null ? `${Math.round(d.value)}%` : '—'}</span>
                </div>
              `,
                )
                .join('')}
            </div>
          </div>
        </div>

        <!-- Bottom 2-Column Grid -->
        <div class="report-v2-bottom-grid">
          <!-- Recommendations & Analysis -->
          <div class="report-card recommend-card">
            <h2>${escapeHtml(a.headline || 'Recommendations')}</h2>
            <p class="rec-text">${escapeHtml(a.summary)}</p>
            ${
              a.strengths.length
                ? `<div class="rep-strengths-box"><strong>Strengths:</strong> ${a.strengths.map((s) => escapeHtml(s)).join(' · ')}</div>`
                : ''
            }
          </div>

          <!-- What's Next -->
          <div class="report-card next-card">
            <h2>What's Next?</h2>
            <p class="rec-text">${escapeHtml(a.nextStep || 'Try testing your system under changing weather conditions or optimize your power budget.')}</p>
            <div class="report-next-actions">
              <button class="ghost-button" id="tryAgainBtn">Modify Circuit</button>
              <button class="primary-button" id="nextChallengeBtn">Open Farm Simulation →</button>
            </div>
          </div>
        </div>
      `

      body.querySelector('#tryAgainBtn')?.addEventListener('click', () => {
        const circuit = document.querySelector<HTMLElement>('[data-screen="circuit"]')
        circuit?.click()
      })

      body.querySelector('#nextChallengeBtn')?.addEventListener('click', () => {
        const farm = document.querySelector<HTMLElement>('[data-screen="farm"]')
        farm?.click()
      })
    } catch (err) {
      console.error('Report assessment failed', err)
      body.innerHTML = `<p class="empty-note">Could not generate assessment report. <button class="primary-button small" id="retryAssBtn">Retry</button></p>`
      body.querySelector('#retryAssBtn')?.addEventListener('click', runAssessment)
    }
  }

  runAssessment()
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}


export function renderQuiz(root: HTMLElement) {
  const questions = buildQuiz(8)
  const answered = new Map<string, QuizOption>()

  if (!hasBuildEvidence()) {
    root.innerHTML = `
      <div class="screen">
        <div class="lab-header"><div>
          <h1>Learning check</h1>
          <p>Questions are generated from your own session, so there is nothing to ask yet.
             Build and check a circuit, or deploy a system, and come back.</p>
        </div></div>
      </div>`
    return
  }

  function render() {
    const done = answered.size
    const correct = [...answered.values()].filter((o) => o.correct).length

    root.innerHTML = `
      <div class="screen quiz-screen">
        <div class="lab-header">
          <div>
            <h1>Learning check</h1>
            <p>Every question below was generated from what you actually built and ran.
               Answers feed straight back into your learner model.</p>
          </div>
          <div class="quiz-score">
            <div class="quiz-figure">${done ? `${correct}/${done}` : '—'}</div>
            <div class="quiz-caption">${questions.length} question${questions.length === 1 ? '' : 's'} for you</div>
          </div>
        </div>

        <div class="quiz-list">
          ${questions.map((q, i) => questionHtml(q, i)).join('')}
        </div>
      </div>`

    root.querySelectorAll<HTMLButtonElement>('[data-opt]').forEach((b) => {
      b.addEventListener('click', () => {
        const q = questions[Number(b.dataset.q)]
        if (answered.has(q.id)) return
        const opt = q.options[Number(b.dataset.opt)]
        answered.set(q.id, opt)
        recordAnswer(q, opt)
        opt.correct ? sfx.success() : sfx.error()
        render()
      })
    })
  }

  function questionHtml(q: QuizQuestion, i: number): string {
    const chosen = answered.get(q.id)
    return `
      <article class="quiz-q ${chosen ? (chosen.correct ? 'right' : 'wrong') : ''}">
        <div class="quiz-prov">${icon('brain', 12)} ${q.provenance}</div>
        <p class="quiz-stem">${q.stem}</p>
        <div class="quiz-opts">
          ${q.options
            .map(
              (o, j) => `
            <button class="quiz-opt ${chosen ? (o.correct ? 'is-correct' : chosen === o ? 'is-chosen' : '') : ''}"
                    data-q="${i}" data-opt="${j}" ${chosen ? 'disabled' : ''}>
              ${o.text}
            </button>`,
            )
            .join('')}
        </div>
        ${chosen ? `<p class="quiz-why">${chosen.why}</p>` : ''}
      </article>`
  }

  render()
}


export function renderRewards(host: HTMLElement) {
  host.innerHTML = `
    <div class="panel-grid single">
      <section class="panel">
        <h2 class="panel-title">Rewards & progression</h2>
        <div class="badge-grid">
          ${progress.badges
            .map(
              (b) => `
            <div class="badge-card ${b.earned ? 'earned' : ''}">
              <div class="badge-medal">${b.earned ? icon('star', 20) : icon('lock', 18)}</div>
              <div class="badge-name">${b.name}</div>
              <div class="badge-desc">${b.desc}</div>
            </div>`
            )
            .join('')}
        </div>
        <div class="objective-list">
          <h3>Mission objectives</h3>
          ${progress.objectives
            .map(
              (o) => `
            <div class="objective ${o.done ? 'done' : ''}">
              <span class="obj-check">${o.done ? icon('check', 13) : ''}</span>${o.label}
            </div>`
            )
            .join('')}
        </div>
      </section>
    </div>
  `
}
