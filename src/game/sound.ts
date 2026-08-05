// Synthesized UI sound. No audio files needed — keeps the build tiny and
// works fully offline, which matters for low-bandwidth classrooms.

let ctx: AudioContext | null = null
let enabled = true

function getCtx(): AudioContext | null {
  if (!enabled) return null
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      return null
    }
  }
  // Browsers suspend audio until a user gesture; resume on first use.
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function setSoundEnabled(on: boolean) {
  enabled = on
}

export function isSoundEnabled() {
  return enabled
}

function tone(freq: number, duration: number, type: OscillatorType, gain = 0.05, delay = 0) {
  const c = getCtx()
  if (!c) return
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, c.currentTime + delay)
  g.gain.setValueAtTime(0, c.currentTime + delay)
  g.gain.linearRampToValueAtTime(gain, c.currentTime + delay + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + duration)
  osc.connect(g)
  g.connect(c.destination)
  osc.start(c.currentTime + delay)
  osc.stop(c.currentTime + delay + duration + 0.02)
}

export const sfx = {
  click: () => tone(420, 0.06, 'triangle', 0.04),
  install: () => {
    tone(320, 0.1, 'triangle', 0.05)
    tone(480, 0.14, 'triangle', 0.045, 0.07)
  },
  success: () => {
    tone(523, 0.12, 'sine', 0.05)
    tone(659, 0.12, 'sine', 0.05, 0.09)
    tone(784, 0.22, 'sine', 0.05, 0.18)
  },
  error: () => {
    tone(200, 0.16, 'sawtooth', 0.035)
    tone(150, 0.22, 'sawtooth', 0.03, 0.1)
  },
  badge: () => {
    tone(659, 0.1, 'sine', 0.05)
    tone(880, 0.1, 'sine', 0.05, 0.08)
    tone(1046, 0.28, 'sine', 0.05, 0.16)
  },
  pump: () => tone(180, 0.18, 'sine', 0.025),
  deploy: () => {
    tone(392, 0.14, 'triangle', 0.05)
    tone(587, 0.26, 'triangle', 0.05, 0.12)
  },
}
