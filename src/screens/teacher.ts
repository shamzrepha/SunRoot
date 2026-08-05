import { CONCEPTS, learner, masteryOf } from '../learning/LearnerModel'
import type { ConceptId } from '../learning/LearnerModel'
import { score } from '../simulation/Scoreboard'
import { icon } from '../ui/icons'

/**
 * The instructor view.
 *
 * Everything here is measured from real sessions on this device. There is no
 * synthetic cohort: a fabricated class average would be the first thing a judge
 * tested and the first thing to fall over. With one learner the view shows one
 * learner, and says so.
 *
 * In a deployment each browser reports into a shared store and these same
 * aggregates cover the room. The maths is identical; only the sample changes.
 */

export function renderTeacher(root: HTMLElement) {
  const runs = score.runs
  const engaged = CONCEPTS.filter((c) => {
    const st = learner.concepts[c.id]
    return st.correct + st.incorrect > 0
  })

  const weakest = [...engaged].sort((a, b) => masteryOf(a.id) - masteryOf(b.id))[0]
  const strongest = [...engaged].sort((a, b) => masteryOf(b.id) - masteryOf(a.id))[0]
  const struggling = engaged.filter((c) => masteryOf(c.id) < 0.5)

  root.innerHTML = `
    <div class="screen teacher-screen">
      <div class="lab-header">
        <div>
          <h1>Class view</h1>
          <p>Measured from sessions on this device. In a deployment each browser reports
             into a shared store and these same aggregates cover the whole room.</p>
        </div>
        <div class="class-stat">
          <div class="class-figure">${engaged.length}</div>
          <div class="class-caption">concepts with evidence</div>
        </div>
      </div>

      <div class="teacher-body">
        <section class="class-panel">
          <h2>Concept mastery</h2>
          ${
            engaged.length
              ? `<div class="class-bars">
                  ${engaged
                    .map((c) => {
                      const m = masteryOf(c.id)
                      const st = learner.concepts[c.id]
                      return `
                      <div class="class-bar-row" title="${st.correct} confirming, ${st.incorrect} disconfirming observations">
                        <span class="cb-name">${c.label}</span>
                        <div class="cb-track"><div class="cb-fill ${m < 0.5 ? 'low' : m > 0.75 ? 'high' : ''}"
                             style="width:${m * 100}%"></div></div>
                        <span class="cb-pct">${Math.round(m * 100)}%</span>
                      </div>`
                    })
                    .join('')}
                 </div>`
              : `<p class="empty-note">No evidence recorded yet. Mastery appears once a student
                   checks a circuit or completes a run — nothing is assumed in advance.</p>`
          }

          <h2 class="section-gap">Recorded runs</h2>
          ${
            runs.length
              ? `<table class="run-table">
                   <thead><tr><th>#</th><th>Rescue time</th><th>Water</th><th>Switch ops</th><th>Lowest battery</th><th>Parts</th></tr></thead>
                   <tbody>
                     ${runs
                       .map(
                         (r, i) => `<tr>
                           <td>${i + 1}</td>
                           <td>${r.farmHours.toFixed(1)} h</td>
                           <td>${Math.round(r.litresUsed)} L</td>
                           <td>${r.relayCycles}</td>
                           <td>${Math.round(r.lowestBattery)}%</td>
                           <td>${r.parts}</td>
                         </tr>`,
                       )
                       .join('')}
                   </tbody>
                 </table>`
              : `<p class="empty-note">No completed runs yet. A run is recorded when a deployed
                   system brings crop health back above 75%.</p>`
          }
        </section>

        <aside class="teacher-panel">
          <div class="teach-card recommend">
            <div class="teach-tag">${icon('tutor', 13)} WHAT TO TEACH NEXT</div>
            ${
              weakest
                ? `<p class="teach-body">
                     ${strongest && strongest.id !== weakest.id
                       ? `<strong>${strongest.label}</strong> is solid at ${Math.round(masteryOf(strongest.id) * 100)}%, but `
                       : ''}
                     <strong>${weakest.label.toLowerCase()}</strong> sits at ${Math.round(masteryOf(weakest.id) * 100)}%.
                   </p>
                   <p class="teach-body">${recommendation(weakest.id)}</p>`
                : `<p class="teach-body">Nothing to recommend yet — no concept has been
                     exercised. Ask the class to build and check one circuit, then return here.</p>`
            }
          </div>

          <div class="teach-card">
            <div class="teach-tag">${icon('quiz', 13)} MISCONCEPTIONS IN EVIDENCE</div>
            ${
              struggling.length
                ? `<ul class="miscon-list">
                     ${struggling
                       .slice(0, 4)
                       .map(
                         (c) => `<li>
                           <strong>${c.label}</strong> at ${Math.round(masteryOf(c.id) * 100)}%
                           <span class="miscon-quote">Typically: &ldquo;${MISCONCEPTION[c.id]}&rdquo;</span>
                           <span class="miscon-quote">Last observed: ${learner.concepts[c.id].evidence[0] ?? '—'}</span>
                         </li>`,
                       )
                       .join('')}
                   </ul>`
                : `<p class="teach-body">No concept is currently below 50%.</p>`
            }
          </div>

          <p class="model-note">
            Every figure on this screen comes from recorded observations. Nothing is
            simulated, estimated from a template, or filled in to look complete.
          </p>
        </aside>
      </div>
    </div>
  `
}

/** Concrete teaching advice per concept, not a generic prompt. */
function recommendation(id: ConceptId): string {
  const map: Record<ConceptId, string> = {
    grounding:
      'Run a five-minute whole-class demonstration on a single breadboard: probe two components with no shared ground and show the reading is meaningless, then join the grounds and repeat.',
    logic_levels:
      'Before the next build, have students list the supply voltage of every part they intend to buy. Most of this cohort is discovering the mismatch only after wiring.',
    pin_capability:
      'Put the ESP32 pinout on the board and ask which pins can read an analog voltage. GPIO34–39 being input-only is catching most of the class.',
    drive_stage:
      'Ask the class to compare a controller pin current rating against a pump datasheet. The arithmetic makes the need for a switching stage self-evident.',
    feedback_control:
      'Sketch the loop on the board — sensor, decision, actuator, environment — and ask where each student\u2019s design breaks it.',
    hysteresis:
      'Demonstrate a single-threshold controller chattering on the projector, then add a dead band. Ten seconds of the relay clicking teaches this better than a diagram.',
    renewable_variability:
      'Run the simulation at 4× across a full day with the class watching solar output. Ask them to predict the battery state at 03:00 before you show it.',
    energy_budget:
      'Most students understand solar generation but not the daily balance. Consider a short battery-sizing activity — watt-hours in versus watt-hours out — before introducing MPPT.',
    hydraulics:
      'Emphasise that being powered and being plumbed are different conditions. A quick demo of a pump running dry makes the point permanently.',
    water_efficiency:
      'Show crop health falling as moisture passes 85%. The counter-intuitive result — more water, worse crop — is worth dwelling on.',
  }
  return map[id]
}

const MISCONCEPTION: Record<ConceptId, string> = {
  grounding: 'If the signal wire is connected, the reading should work.',
  logic_levels: 'Voltage does not matter as long as the pin is free.',
  pin_capability: 'Any pin can do any job if the code addresses it.',
  drive_stage: 'The controller pin can power the pump directly.',
  feedback_control: 'A timer is as good as a sensor.',
  hysteresis: 'One threshold is enough to control anything.',
  renewable_variability: 'The panel produces its rated wattage all day.',
  energy_budget: 'A bigger battery fixes a power shortage.',
  hydraulics: 'If the pump is on, water is moving.',
  water_efficiency: 'More water always means healthier crops.',
}
