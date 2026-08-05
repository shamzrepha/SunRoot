import {
  CONCEPTS,
  blockedConcepts,
  learner,
  masteryOf,
  MASTERY_THRESHOLD,
  nextConcept,
  overallMastery,
} from '../learning/LearnerModel'
import { nextChallenge, scaffoldFor } from '../learning/AdaptiveEngine'
import { icon } from '../ui/icons'

/**
 * The adaptive learning system, made inspectable.
 *
 * Most tutoring systems hide their model, which makes the personalisation feel
 * arbitrary and leaves a student unable to argue with it. Here the estimate,
 * the evidence behind it, and the reason for the current level of support are
 * all shown — so the student can see why they are being asked a question rather
 * than told an answer, and a teacher can see where the class is actually stuck.
 */
export function renderLearning(root: HTMLElement) {
  const overall = overallMastery()
  const target = nextConcept()
  const challenge = nextChallenge()
  const blocked = blockedConcepts()

  root.innerHTML = `
    <div class="screen learning-screen">
      <div class="lab-header">
        <div>
          <h1>Learning model</h1>
          <p>Mastery is estimated from what you build, not from what you answer.
             Every figure below traces back to evidence in your own work.</p>
        </div>
        <div class="mastery-headline">
          <div class="mastery-figure">${Math.round(overall * 100)}<span>%</span></div>
          <div class="mastery-caption">overall mastery &middot; ${learner.attempts} deploy${learner.attempts === 1 ? '' : 's'}</div>
        </div>
      </div>

      <div class="learning-body">
        <section class="concept-panel">
          <h2>Concept mastery</h2>
          <div class="concept-list">
            ${CONCEPTS.map(conceptRow).join('')}
          </div>
        </section>

        <aside class="adaptive-panel">
          <h2>What adapts next</h2>

          ${
            target
              ? `<div class="adaptive-card focus">
                   <div class="adaptive-tag">CURRENT FOCUS</div>
                   <div class="adaptive-title">${target.label}</div>
                   <p class="adaptive-text">${target.statement}</p>
                   <div class="scaffold-note">
                     <strong>Support level ${scaffoldFor(target.id).level} of 3.</strong>
                     ${scaffoldFor(target.id).rationale}
                   </div>
                   <p class="scaffold-sample">&ldquo;${scaffoldFor(target.id).text}&rdquo;</p>
                 </div>`
              : `<div class="adaptive-card done">
                   <div class="adaptive-tag">COMPLETE</div>
                   <div class="adaptive-title">Every tracked concept mastered</div>
                   <p class="adaptive-text">Try a leaner build or a harder scenario.</p>
                 </div>`
          }

          ${
            challenge
              ? `<div class="adaptive-card">
                   <div class="adaptive-tag">RECOMMENDED CHALLENGE</div>
                   <div class="adaptive-title">${challenge.title}</div>
                   <p class="adaptive-text">${challenge.brief}</p>
                   <p class="challenge-success">${icon('check', 12)} ${challenge.successCondition}</p>
                 </div>`
              : ''
          }

          ${
            blocked.length
              ? `<div class="adaptive-card muted">
                   <div class="adaptive-tag">HELD BACK</div>
                   <p class="adaptive-text">These are not being taught yet, because their
                      prerequisites are not in place:</p>
                   <ul class="blocked-list">
                     ${blocked
                       .slice(0, 4)
                       .map(
                         (b) =>
                           `<li><strong>${b.concept.label}</strong> needs ${b.missing
                             .map((m) => CONCEPTS.find((c) => c.id === m)?.label ?? m)
                             .join(', ')}</li>`,
                       )
                       .join('')}
                   </ul>
                 </div>`
              : ''
          }

          <p class="model-note">
            Estimates use Bayesian Knowledge Tracing, allowing for both careless slips
            and lucky guesses — so one mistake does not erase mastery and one success
            does not declare it.
          </p>
        </aside>
      </div>
    </div>
  `
}

function conceptRow(c: (typeof CONCEPTS)[number]): string {
  const state = learner.concepts[c.id]
  const m = masteryOf(c.id)
  const seen = state.correct + state.incorrect
  const mastered = m >= MASTERY_THRESHOLD

  const status = !seen ? 'untested' : mastered ? 'mastered' : m < 0.4 ? 'weak' : 'developing'

  return `
    <article class="concept-row ${status}">
      <div class="concept-head">
        <span class="concept-name">${c.label}</span>
        <span class="concept-pct">${seen ? `${Math.round(m * 100)}%` : 'no evidence yet'}</span>
      </div>
      <div class="mastery-bar">
        <div class="mastery-fill" style="width:${seen ? m * 100 : 0}%"></div>
        <div class="mastery-threshold" style="left:${MASTERY_THRESHOLD * 100}%"></div>
      </div>
      <p class="concept-statement">${c.statement}</p>
      ${
        state.evidence.length
          ? `<ul class="evidence-list">
               ${state.evidence.slice(0, 3).map((e) => `<li>${e}</li>`).join('')}
             </ul>`
          : ''
      }
    </article>`
}
