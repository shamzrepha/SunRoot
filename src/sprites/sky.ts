// Computes sky gradient colors and sun/moon position from the farm's
// current hour (0-24). Used to make the farm scene feel alive over time.

type RGB = [number, number, number]

const STOPS: { hour: number; top: RGB; bottom: RGB }[] = [
  { hour: 0, top: [5, 10, 23], bottom: [15, 27, 46] },   // midnight
  { hour: 6, top: [43, 58, 92], bottom: [217, 138, 82] }, // dawn
  { hour: 12, top: [111, 179, 224], bottom: [191, 227, 201] }, // noon
  { hour: 18, top: [58, 48, 96], bottom: [224, 122, 79] }, // dusk
  { hour: 24, top: [5, 10, 23], bottom: [15, 27, 46] },   // midnight again
]

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t)
}

function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

function rgbToCss(c: RGB) {
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

export function getSky(hour: number) {
  const h = ((hour % 24) + 24) % 24
  let lo = STOPS[0]
  let hi = STOPS[STOPS.length - 1]

  for (let i = 0; i < STOPS.length - 1; i++) {
    if (h >= STOPS[i].hour && h <= STOPS[i + 1].hour) {
      lo = STOPS[i]
      hi = STOPS[i + 1]
      break
    }
  }

  const span = hi.hour - lo.hour
  const t = span === 0 ? 0 : (h - lo.hour) / span

  return {
    top: rgbToCss(lerpRgb(lo.top, hi.top, t)),
    bottom: rgbToCss(lerpRgb(lo.bottom, hi.bottom, t)),
  }
}

// Returns position (percent) and visibility for the sun and moon,
// tracing an arc from horizon to horizon across their half of the day.
export function getCelestialPosition(hour: number) {
  const h = ((hour % 24) + 24) % 24
  const isDay = h >= 6 && h < 18

  const sunProgress = isDay ? (h - 6) / 12 : null
  const nightHour = h < 6 ? h + 6 : h - 18
  const moonProgress = !isDay ? nightHour / 12 : null

  const arc = (t: number) => ({
    x: t * 100,
    y: 78 - Math.sin(t * Math.PI) * 62,
  })

  return {
    sun: sunProgress !== null ? { visible: true, ...arc(sunProgress) } : { visible: false, x: 0, y: 0 },
    moon: moonProgress !== null ? { visible: true, ...arc(moonProgress) } : { visible: false, x: 0, y: 0 },
  }
}
