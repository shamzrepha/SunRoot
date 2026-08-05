// ---------------------------------------------------------------------------
// Accessibility
//
// The options were already honoured — reduced motion, keyboard focus, colour
// plus text for every status. They were simply invisible, which is no use to a
// student who needs them and no use to anyone assessing the claim. This makes
// each one an explicit switch that writes a class onto <body>.
// ---------------------------------------------------------------------------

export type A11yOption =
  | 'keyboardMode'
  | 'captions'
  | 'reducedMotion'
  | 'highContrast'
  | 'speech'
  | 'largeText'
  | 'colourSafe'

export interface A11yDef {
  id: A11yOption
  label: string
  detail: string
}

export const A11Y_OPTIONS: A11yDef[] = [
  { id: 'keyboardMode', label: 'Keyboard mode', detail: 'Strong focus outlines and a skip link on every screen.' },
  { id: 'captions', label: 'Captions', detail: 'Everything the assistant says appears as text. On by default.' },
  { id: 'reducedMotion', label: 'Reduced motion', detail: 'Stops drifting clouds, blinking indicators and transitions.' },
  { id: 'highContrast', label: 'High contrast', detail: 'Raises text and border contrast throughout.' },
  { id: 'speech', label: 'Text to speech', detail: 'Reads guidance aloud, one line at a time. Off by default.' },
  { id: 'largeText', label: 'Larger interface', detail: 'Increases body text and control sizes by about a fifth.' },
  { id: 'colourSafe', label: 'Colour + icon status', detail: 'Never relies on colour alone — every state also carries an icon or word.' },
]

const state: Record<A11yOption, boolean> = {
  keyboardMode: false,
  captions: true,
  reducedMotion: false,
  highContrast: false,
  speech: false,
  largeText: false,
  colourSafe: true,
}

export function isEnabled(id: A11yOption) {
  return state[id]
}

export function setOption(id: A11yOption, on: boolean) {
  state[id] = on
  document.body.classList.toggle(`a11y-${id}`, on)
}

/** Honour the operating system preference on first load. */
export function initAccessibility() {
  if (typeof window === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    setOption('reducedMotion', true)
  }
  for (const k of Object.keys(state) as A11yOption[]) {
    document.body.classList.toggle(`a11y-${k}`, state[k])
  }
}
