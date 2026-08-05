// ---------------------------------------------------------------------------
// LocalAnswerer
//
// What the assistant says when there is no model behind it. It reads the same
// live state the language model would receive and answers from rules, so a
// classroom with no internet still gets specific, useful help rather than an
// apology.
//
// The matching is intent-based rather than keyword-soup: each handler asks a
// question of the actual simulation and answers from the result, which is why
// these replies name real pins and real readings.
// ---------------------------------------------------------------------------

import { graph, partOf, wiredOutputs, wiredSensors } from '../hardware/CircuitGraph'
import { farm } from '../simulation/FarmState'
import { alwaysOnLoads, hydraulicPath, topology } from '../simulation/PowerSystem'
import { nextGuidance, remainingSteps } from '../learning/ContextualTutor'
import { nextConcept } from '../learning/LearnerModel'
import { currentMode } from '../learning/LearningModes'
import { appState } from '../appState'
import { canProceed, distinctOwned, remaining } from '../hardware/PartsTray'
import { suggestedLoadout, trayDescription } from '../learning/ContextBuilder'

type Handler = { match: RegExp; reply: () => string }

const HANDLERS: Handler[] = [
  // --- shopping: what do I need to buy ---
  {
    match: /what.*(need|buy|bought|list|component|part|tool|own)|shopping|loadout|cart|tray|budget|afford|purchas/i,
    reply: () => {
      const owned = distinctOwned()
      const gate = canProceed()
      const head = owned.length
        ? `${trayDescription()}\n\n`
        : 'Your tray is empty. Here is a complete loadout that works:\n\n'
      const list = `${suggestedLoadout()}\n\nYou have ${remaining()} credits left.`
      const tail = owned.length
        ? gate.ok
          ? '\n\nThat is enough to move to the circuit lab whenever you want.'
          : `\n\nYou cannot proceed yet: ${gate.reason}`
        : ''
      return head + list + tail
    },
  },

  // --- what do I do now ---
  {
    match: /what (should|do) i (do|build|connect)|next step|where (do i|should i) (start|begin)|stuck|help me/i,
    reply: () => {
      // Advice has to fit the screen they are standing on. Telling someone in
      // the Tool Shed to drag a board onto a bench they cannot see is useless.
      if (appState.screen === 'shed') {
        const gate = canProceed()
        return gate.ok
          ? `You have what you need to start — press "Take to circuit lab". ${trayDescription()}`
          : `${gate.reason} Here is a loadout that works:\n\n${suggestedLoadout()}`
      }
      const g = nextGuidance()
      if (!g) return 'Nothing is outstanding — the build has everything it needs. Deploy it and watch what happens.'
      const rest = remainingSteps().length - 1
      return `${g.text}${rest > 0 ? ` After that there ${rest === 1 ? 'is' : 'are'} ${rest} more step${rest === 1 ? '' : 's'}.` : ''}`
    },
  },

  // --- flooding / over-watering ---
  {
    match: /flood|too (much|wet)|over ?water|saturat|soggy/i,
    reply: () => {
      if (farm.soilMoisture > 80) {
        const hard = alwaysOnLoads()
        if (hard.length) {
          return `Moisture is ${farm.soilMoisture.toFixed(0)}% and your ${hard[0].part.name} is wired directly across the ${hard[0].via}. That means it runs continuously — no program can switch it off. Put a relay or MOSFET between the supply and the pump.`
        }
        return `Moisture is ${farm.soilMoisture.toFixed(0)}%, past the point where roots start suffocating. Your program is turning the pump on but nothing is turning it off — you need an upper threshold as well as a lower one, and they should be different numbers so it does not chatter.`
      }
      return `Moisture is ${farm.soilMoisture.toFixed(0)}% right now, which is not flooding. The optimal band is roughly 30 to 70 percent. If it climbed earlier, check whether your program has an off-threshold at all.`
    },
  },

  // --- battery / energy ---
  {
    match: /batter|power|energy|charg|flat|dead|drain/i,
    reply: () => {
      const t = topology()
      if (!t.capacityWh) return 'There is no battery on the bench, so nothing is stored. At night your system has no supply at all.'
      if (!t.chargePathComplete && t.installedPeakWatts) {
        return `You have ${t.installedPeakWatts} W of panel installed but nothing reaches the battery, so the bank only ever discharges. Connect the panel through a charge controller to the battery terminals.`
      }
      return `Battery is at ${farm.battery.toFixed(0)}%. Generation is ${farm.solarGeneration} W against ${(t.activeLoadWatts + t.standbyWatts).toFixed(0)} W of load. ${farm.solarGeneration < t.activeLoadWatts ? 'You are consuming faster than you generate, so the bank trends to empty over a day.' : 'That is a positive balance while the sun is up.'} ${t.controllerName.startsWith('none') ? 'Note you have no charge controller, so you are harvesting about 55% of what the panel could give.' : ''}`
    },
  },

  // --- which panel / component choice ---
  {
    match: /which (panel|sensor|controller|battery|board|relay|mosfet|component)|what should i (buy|choose|pick)|mppt|pwm/i,
    reply: () => {
      const t = topology()
      const load = t.activeLoadWatts || 30
      const need = Math.round((load * 6) / 0.85)
      return `Work it backwards from your load. You are running about ${load} W. Over a day that is roughly ${need} Wh, so the array has to replace that during daylight — about ${Math.ceil(need / 5)} W of panel as a rough sizing. An MPPT controller harvests around 95% against a PWM's 75%, so it buys you panel for its price. Between soil sensors, capacitive costs more but does not corrode; resistive is cheap and runs at 5 V, which an ESP32 input cannot tolerate.`
    },
  },

  // --- pump not working ---
  {
    match: /pump|not (running|working|pumping)|no water|nothing happen/i,
    reply: () => {
      const path = hydraulicPath()
      const drivers = wiredOutputs().filter((o) => o.part.category === 'drivers')
      if (!path.complete) return `The water path is the problem: ${path.reason} Being powered and being plumbed are different conditions — the motor will spin and draw current while delivering nothing.`
      if (!drivers.length) return 'Nothing your program controls can switch the pump. A controller pin carries a decision, not the current to act on it, so you need a relay or MOSFET between them.'
      if (farm.battery < 3) return `The battery is at ${farm.battery.toFixed(0)}%. The pump is not permitted to start below 3% — the command is being issued and the hardware cannot execute it.`
      if (farm.tankLitres <= 0) return 'The tank is empty. The pump is running dry, which stops flow and damages the impeller — the water it moves is also what cools it.'
      return `The pump is ${farm.pumpOn ? 'on' : 'off'} and flow is ${farm.waterFlow > 0 ? 'active' : 'zero'}. If your program is commanding it, check the block is inside a condition that is actually true — moisture is ${farm.soilMoisture.toFixed(0)}% right now.`
    },
  },

  // --- sensor / reading ---
  {
    match: /sensor|reading|moisture|not read|zero|floating/i,
    reply: () => {
      const s = wiredSensors()
      if (!s.length) return 'No sensor signal reaches a controller yet. A sensor can be powered and still report nowhere — the signal line has to land on a pin that can measure a voltage.'
      const bad = s.find((x) => !x.readable)
      if (bad) return `${bad.part.name} is on ${bad.pinName}, and ${bad.reason} That is why it returns a floating zero however the code is written.`
      return `${s[0].part.name} is wired to ${s[0].pinName} and reading fine. Moisture is ${farm.soilMoisture.toFixed(0)}%. If your program is not reacting, the threshold in your comparison is probably the issue.`
    },
  },

  // --- wiring / pins ---
  {
    match: /pin|wire|wiring|connect|breadboard|rail|ground|gnd/i,
    reply: () => {
      const g = nextGuidance()
      if (g) return g.text
      return 'Everything on your bench is wired. A breadboard rail is one node the length of the board, and each column of five holes is one node — so plugging into any hole in a column joins you to the other four.'
    },
  },

  // --- code / blocks ---
  {
    match: /code|block|program|logic|if|loop|threshold|hysteresis/i,
    reply: () => {
      const s = wiredSensors()[0]
      const o = wiredOutputs()[0]
      if (!s && !o) return 'The Coding Lab generates blocks from your wiring, so nothing wired means no blocks. Wire a sensor to an ADC pin and a driver to a digital pin, and both will appear.'
      return `Your blocks are "read ${s ? s.part.name.toLowerCase() : 'sensor'}${s ? ` (${s.pinName})` : ''}" and "set ${o ? o.part.name : 'output'}${o ? ` (${o.pinName})` : ''}". Put the reading into a comparison inside an "if", and switch the output in the body. Use two thresholds — on below 30, off above 35 — so the relay does not switch on every tick. And do not wrap it in a forever loop: your program is already called once per tick.`
    },
  },

  // --- what am I learning / progress ---
  {
    match: /learn|progress|mastery|how am i doing|score/i,
    reply: () => {
      const n = nextConcept()
      return n
        ? `Your weakest concept with its prerequisites met is ${n.label.toLowerCase()}. ${n.statement} The Learning model screen shows every estimate and the evidence behind it.`
        : 'Every tracked concept is above the mastery threshold. Try a leaner build or a harder scenario.'
    },
  },

  // --- what have I built ---
  {
    match: /what is on|my (build|circuit)|the bench|on the bench/i,
    reply: () => {
      const parts = graph.placed.map((p) => partOf(p.instanceId)?.name).filter(Boolean)
      if (!parts.length) return 'The bench is empty. Whatever you bought in the Tool Shed is in your parts tray on the left.'
      return `On the bench: ${parts.join(', ')}. ${wiredSensors().length} sensor reading${wiredSensors().length === 1 ? '' : 's'} and ${wiredOutputs().length} output${wiredOutputs().length === 1 ? '' : 's'} reach the controller.`
    },
  },
]

export function answerLocally(question: string): string {
  if (currentMode().id === 'exam') {
    return 'You are in Exam mode, so I cannot help with the task. Switch to Practice if you want guidance.'
  }

  for (const h of HANDLERS) {
    if (h.match.test(question)) return h.reply()
  }

  // No match: fall back to the most useful thing there is — the next step.
  const g = nextGuidance()
  return g
    ? `I am not sure what you are asking, but the next thing your build needs is this: ${g.text}`
    : 'I am not sure what you are asking. Try asking about your battery, your sensor readings, the pump, or what to wire next.'
}
