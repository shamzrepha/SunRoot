// Generates an animated SVG plant sprite driven by crop health.
// Growth stage changes the shape; health also drives color and wilt.

export type GrowthStage = 0 | 1 | 2 | 3 // seed -> sprout -> young -> mature

export function getGrowthStage(health: number): GrowthStage {
  if (health < 20) return 0
  if (health < 45) return 1
  if (health < 75) return 2
  return 3
}

// Leaf/stem color shifts from dry amber (unhealthy) to healthy green.
function getPlantColor(health: number): { leaf: string; leafDark: string } {
  if (health < 20) return { leaf: '#8a7a3f', leafDark: '#6b5e2f' }
  if (health < 45) return { leaf: '#9caa4d', leafDark: '#78853a' }
  if (health < 75) return { leaf: '#6fb84a', leafDark: '#4f8f34' }
  return { leaf: '#4fd67a', leafDark: '#2fae5c' }
}

// Returns inline SVG markup for a single plant at a given stage.
// wilted adds a droop transform for very low health.
export function renderPlantSVG(health: number): string {
  const stage = getGrowthStage(health)
  const { leaf, leafDark } = getPlantColor(health)
  const wilted = health < 20

  if (stage === 0) {
    // Seed / bare soil mound — nothing above ground yet.
    return `
      <svg viewBox="0 0 40 40" class="plant-svg">
        <ellipse cx="20" cy="34" rx="9" ry="3" fill="#4a3a24" opacity="0.6" />
      </svg>`
  }

  if (stage === 1) {
    // Sprout — two small leaves on a short stem.
    return `
      <svg viewBox="0 0 40 40" class="plant-svg">
        <ellipse cx="20" cy="35" rx="9" ry="3" fill="#4a3a24" opacity="0.5" />
        <g class="plant-sway" style="transform-origin: 20px 35px;">
          <line x1="20" y1="35" x2="20" y2="24" stroke="${leafDark}" stroke-width="2" stroke-linecap="round" />
          <path d="M20 27 Q13 24 14 18 Q21 20 20 27 Z" fill="${leaf}" />
          <path d="M20 27 Q27 24 26 18 Q19 20 20 27 Z" fill="${leaf}" />
        </g>
      </svg>`
  }

  if (stage === 2) {
    // Young plant — taller stem, more leaves.
    return `
      <svg viewBox="0 0 40 40" class="plant-svg">
        <ellipse cx="20" cy="36" rx="10" ry="3" fill="#4a3a24" opacity="0.5" />
        <g class="plant-sway" style="transform-origin: 20px 36px;">
          <line x1="20" y1="36" x2="20" y2="16" stroke="${leafDark}" stroke-width="2.5" stroke-linecap="round" />
          <path d="M20 28 Q10 25 10 17 Q20 18 20 28 Z" fill="${leaf}" />
          <path d="M20 28 Q30 25 30 17 Q20 18 20 28 Z" fill="${leaf}" />
          <path d="M20 19 Q13 15 14 9 Q21 11 20 19 Z" fill="${leaf}" />
          <path d="M20 19 Q27 15 26 9 Q19 11 20 19 Z" fill="${leaf}" />
        </g>
      </svg>`
  }

  // Mature plant — full canopy, small fruit dots.
  return `
    <svg viewBox="0 0 40 40" class="plant-svg">
      <ellipse cx="20" cy="37" rx="11" ry="3" fill="#4a3a24" opacity="0.5" />
      <g class="plant-sway" style="transform-origin: 20px 37px; ${wilted ? 'transform: rotate(8deg);' : ''}">
        <line x1="20" y1="37" x2="20" y2="12" stroke="${leafDark}" stroke-width="3" stroke-linecap="round" />
        <path d="M20 26 Q8 23 8 13 Q20 15 20 26 Z" fill="${leaf}" />
        <path d="M20 26 Q32 23 32 13 Q20 15 20 26 Z" fill="${leaf}" />
        <path d="M20 17 Q11 12 12 5 Q21 8 20 17 Z" fill="${leaf}" />
        <path d="M20 17 Q29 12 28 5 Q19 8 20 17 Z" fill="${leaf}" />
        <circle cx="14" cy="20" r="2.1" fill="#e0524a" />
        <circle cx="26" cy="21" r="2.1" fill="#e0524a" />
        <circle cx="20" cy="14" r="2.1" fill="#e0524a" />
      </g>
    </svg>`
}
