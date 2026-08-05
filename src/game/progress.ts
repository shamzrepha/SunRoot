export interface Badge {
  id: string
  name: string
  desc: string
  earned: boolean
}

export interface Objective {
  id: string
  label: string
  done: boolean
}

export const RANKS = [
  { name: 'Explorer', xp: 0 },
  { name: 'Engineer Novice', xp: 150 },
  { name: 'Maker', xp: 400 },
  { name: 'Systems Engineer', xp: 800 },
  { name: 'Innovation Master', xp: 1400 },
]

export const progress = {
  xp: 0,
  badges: [
    { id: 'circuit', name: 'Circuit Expert', desc: 'Installed every component correctly', earned: false },
    { id: 'logic', name: 'Logic Builder', desc: 'Deployed working control logic', earned: false },
    { id: 'energy', name: 'Energy Saver', desc: 'Kept battery above 40% for a full day', earned: false },
    { id: 'guardian', name: 'Farm Guardian', desc: 'Restored crop health above 80%', earned: false },
  ] as Badge[],
  objectives: [
    { id: 'install', label: 'Choose components in the tool shed', done: false },
    { id: 'wire', label: 'Build a circuit that passes its check', done: false },
    { id: 'code', label: 'Write control logic that compiles', done: false },
    { id: 'deploy', label: 'Deploy your system to the farm', done: false },
    { id: 'moisture', label: 'Keep soil moisture above 30%', done: false },
    { id: 'health', label: 'Restore crop health above 80%', done: false },
  ] as Objective[],
  stats: {
    peakHealth: 0,
    lowestBattery: 100,
    pumpCycles: 0,
    daysSurvived: 0,
  },
}

export function addXp(amount: number) {
  progress.xp += amount
}

export function rankFor(xp: number) {
  let current = RANKS[0]
  let next: (typeof RANKS)[number] | null = null
  for (let i = 0; i < RANKS.length; i++) {
    if (xp >= RANKS[i].xp) {
      current = RANKS[i]
      next = RANKS[i + 1] ?? null
    }
  }
  return { current, next }
}

export function completeObjective(id: string, xp = 50) {
  const o = progress.objectives.find((x) => x.id === id)
  if (o && !o.done) {
    o.done = true
    addXp(xp)
    return true
  }
  return false
}

export function earnBadge(id: string, xp = 75) {
  const b = progress.badges.find((x) => x.id === id)
  if (b && !b.earned) {
    b.earned = true
    addXp(xp)
    return b
  }
  return null
}
