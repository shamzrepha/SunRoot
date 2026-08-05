// ---------------------------------------------------------------------------
// icons
//
// Inline SVG rather than emoji. Emoji render differently on every platform,
// carry a cartoon register that undercuts an engineering tool, and cannot be
// styled — these inherit currentColor and scale with the type around them.
//
// All paths are drawn on a 24×24 grid with a 1.6 stroke so they sit evenly
// beside 13–14 px text.
// ---------------------------------------------------------------------------

export type IconName =
  | 'farm'
  | 'workshop'
  | 'shed'
  | 'circuit'
  | 'code'
  | 'tutor'
  | 'report'
  | 'quiz'
  | 'rewards'
  | 'lock'
  | 'close'
  | 'check'
  | 'cross'
  | 'star'
  | 'starOutline'
  | 'dot'
  | 'dotOutline'
  | 'arrowRight'
  | 'search'
  | 'minus'
  | 'plus'
  | 'undo'
  | 'redo'
  | 'brain'
  | 'class'
  | 'access'

const PATHS: Record<IconName, string> = {
  // A seedling: two cotyledons on a stem, rooted in a soil line.
  farm:
    '<path d="M12 21V10"/><path d="M12 12C12 8.5 9.5 6 6 6c0 3.5 2.5 6 6 6Z"/>' +
    '<path d="M12 11c0-3 2-5.5 5.5-5.5C17.5 8.5 15 11 12 11Z"/><path d="M4 21h16"/>',

  // Adjustable spanner.
  workshop:
    '<path d="M15.5 3.5a5 5 0 0 0-4.6 6.9L3.6 17.7a2 2 0 0 0 2.8 2.8l7.3-7.3a5 5 0 0 0 6.2-6.6l-2.9 2.9-2.6-.7-.7-2.6 2.8-2.7Z"/>',

  // Tool chest with a handle and a latch.
  shed:
    '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>' +
    '<path d="M3 13h18"/><path d="M10.5 13v2.5h3V13"/>',

  // Integrated circuit with pin legs.
  circuit:
    '<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M10 7V4M14 7V4M10 20v-3M14 20v-3"/>' +
    '<path d="M7 10H4M7 14H4M20 10h-3M20 14h-3"/>',

  // Interlocking blocks, as in a block-based editor.
  code:
    '<rect x="3.5" y="4.5" width="8" height="6" rx="1.2"/><rect x="12.5" y="4.5" width="8" height="6" rx="1.2"/>' +
    '<rect x="8" y="13.5" width="8" height="6" rx="1.2"/><path d="M7.5 10.5v3M16.5 10.5v3"/>',

  // Assistant: a head-and-shoulders outline with a signal arc.
  tutor:
    '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>' +
    '<path d="M17.5 4.2a5.5 5.5 0 0 1 2.3 3"/>',

  // Bar chart.
  report: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',

  // Question mark in a circle.
  quiz:
    '<circle cx="12" cy="12" r="9"/><path d="M9.4 9.2a2.7 2.7 0 0 1 5.2.9c0 1.8-2.6 2.2-2.6 3.9"/>' +
    '<path d="M12 17.3h.01"/>',

  // Award ribbon.
  rewards:
    '<circle cx="12" cy="9" r="5.5"/><path d="M8.5 13.6 7 21l5-2.4L17 21l-1.5-7.4"/>',

  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V7a3.5 3.5 0 0 1 7 0v3.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M4.5 12.5l5 5L19.5 7"/>',
  cross: '<path d="M6 6l12 12M18 6L6 18"/>',
  star: '<path d="M12 3.5l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8L6.6 20l1-6L3.3 9.9l6-.9Z" fill="currentColor"/>',
  starOutline: '<path d="M12 3.5l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8L6.6 20l1-6L3.3 9.9l6-.9Z"/>',
  dot: '<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>',
  dotOutline: '<circle cx="12" cy="12" r="5"/>',
  arrowRight: '<path d="M4 12h15"/><path d="M13.5 6.5 19 12l-5.5 5.5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4 21 21"/>',
  minus: '<path d="M6 12h12"/>',
  plus: '<path d="M6 12h12M12 6v12"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h9a7 7 0 0 1 0 14h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9h-9a7 7 0 0 0 0 14h3"/>',
  // The universal access mark: a figure with arms outstretched.
  access:
    '<circle cx="12" cy="4.2" r="1.8"/><path d="M4.5 8.2h15"/>' +
    '<path d="M12 7v6"/><path d="M12 13l-3.2 7M12 13l3.2 7"/>',
  // Three figures: the cohort.
  class:
    '<circle cx="8" cy="8.5" r="2.6"/><circle cx="16" cy="8.5" r="2.6"/>' +
    '<path d="M3 19a5 5 0 0 1 10 0"/><path d="M11 19a5 5 0 0 1 10 0"/>',
  // A head in profile with a circuit inside: the learner model.
  brain:
    '<path d="M15.5 21a4 4 0 0 0 4-4V9.5A6.5 6.5 0 0 0 7 7.6 4 4 0 0 0 6 15.4V21"/>' +
    '<path d="M10 11.5h2.5v-3"/><circle cx="14.5" cy="12.5" r="1.6"/><path d="M12.5 11.5h.4"/>',
}

/**
 * Render an icon. `size` is in pixels; stroke weight is scaled so small icons
 * do not look spindly and large ones do not look heavy.
 */
export function icon(name: IconName, size = 18, className = ''): string {
  const stroke = size <= 16 ? 1.8 : size >= 28 ? 1.4 : 1.6
  return (
    `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="${stroke}" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">` +
    PATHS[name] +
    `</svg>`
  )
}
