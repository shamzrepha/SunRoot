// ---------------------------------------------------------------------------
// SceneLayout
//
// Where a component physically lives on a real smallholding, and how big it is
// relative to everything else. A water tank is chest height; a relay is the
// size of a matchbox and lives in a sealed box on the wall. Drawing them at the
// same size, floating at the same height, is what made the old scene read as a
// row of icons rather than a farm.
//
// Three rules govern everything here:
//   1. Nothing floats. Every item is anchored to the ground, a roof, the soil,
//      or the inside of the enclosure.
//   2. Only weatherproof field hardware is outdoors. Electronics are in the box.
//   3. Scale is relative and honest — the house and tank dominate, sensors are
//      barely visible, which is exactly how a real installation looks.
// ---------------------------------------------------------------------------

import type { CatalogPart } from '../hardware/ComponentCatalog'

export type Zone =
  | 'roof'      // mounted on the house roof
  | 'ground'    // standing on the earth
  | 'soil'      // buried in the crop bed, probe showing
  | 'field'     // out among the crops
  | 'inside'    // in the sealed enclosure, not visible outdoors

export interface Placement {
  zone: Zone
  /** Width as a percentage of the scene, so scale stays relative. */
  widthPct: number
  /** Left edge, percentage across the scene. Roof items are relative to it. */
  leftPct: number
  /** True when a cable should be drawn from here to the control box. */
  cableToBox?: boolean
  label?: string
}

/**
 * Explicit placements. Anything absent is small electronics and goes inside,
 * which is the safe default: a part nobody has placed outdoors cannot float.
 */
const PLACEMENTS: Record<string, Placement> = {
  // --- roof-mounted -------------------------------------------------------
  solar10: { zone: 'roof', widthPct: 9, leftPct: 0, label: 'ARRAY' },
  solar20: { zone: 'roof', widthPct: 12, leftPct: 0, label: 'ARRAY' },
  solar50: { zone: 'roof', widthPct: 16, leftPct: 0, label: 'ARRAY' },
  // A light sensor belongs where it can see the sky, not in a shaded box.
  ldr: { zone: 'roof', widthPct: 2.4, leftPct: 0, cableToBox: true, label: 'LDR' },
  rainSensor: { zone: 'roof', widthPct: 4.6, leftPct: 0, cableToBox: true, label: 'RAIN' },
  bmp280: { zone: 'roof', widthPct: 3, leftPct: 0, cableToBox: true, label: 'BARO' },

  // --- standing on the ground --------------------------------------------
  waterTank: { zone: 'ground', widthPct: 11, leftPct: 46, label: 'TANK' },
  lifepo4_7: { zone: 'ground', widthPct: 6, leftPct: 33, label: 'BANK' },
  lifepo4_20: { zone: 'ground', widthPct: 7, leftPct: 33, label: 'BANK' },
  lifepo4_40: { zone: 'ground', widthPct: 8, leftPct: 33, label: 'BANK' },
  pump12v: { zone: 'ground', widthPct: 5.5, leftPct: 61, cableToBox: true, label: 'PUMP' },
  pump5v: { zone: 'ground', widthPct: 3.8, leftPct: 61, cableToBox: true, label: 'PUMP' },
  solenoidValve: { zone: 'ground', widthPct: 4, leftPct: 67, cableToBox: true, label: 'VALVE' },
  flowMeter: { zone: 'ground', widthPct: 3.2, leftPct: 66, cableToBox: true, label: 'FLOW' },
  gantryKit: { zone: 'field', widthPct: 26, leftPct: 70, label: 'GANTRY' },
  gantryRail: { zone: 'field', widthPct: 20, leftPct: 70, label: 'RAIL' },

  // --- in the crop bed ----------------------------------------------------
  soilCapacitive: { zone: 'soil', widthPct: 3.4, leftPct: 46, cableToBox: true, label: 'MOISTURE' },
  soilResistive: { zone: 'soil', widthPct: 3.4, leftPct: 46, cableToBox: true, label: 'MOISTURE' },
  ds18b20: { zone: 'soil', widthPct: 2.2, leftPct: 56, cableToBox: true, label: 'TEMP' },
  waterLevel: { zone: 'ground', widthPct: 2.4, leftPct: 52, cableToBox: true, label: 'LEVEL' },
  floatSwitch: { zone: 'ground', widthPct: 2.2, leftPct: 52, cableToBox: true, label: 'FLOAT' },
  dht22: { zone: 'ground', widthPct: 2.8, leftPct: 27, cableToBox: true, label: 'AIR' },
  dht11: { zone: 'ground', widthPct: 2.8, leftPct: 27, cableToBox: true, label: 'AIR' },
  ultrasonic: { zone: 'ground', widthPct: 3.4, leftPct: 43, cableToBox: true, label: 'RANGE' },

  // --- out among the crops ------------------------------------------------
  sprinklerHead: { zone: 'field', widthPct: 6, leftPct: 78, label: 'SPRINKLER' },
  dripEmitter: { zone: 'field', widthPct: 3.4, leftPct: 84, label: 'DRIP' },
  tubing: { zone: 'field', widthPct: 0, leftPct: 0, label: 'LINE' },
}

/** Everything not named above is small electronics and belongs in the box. */
export function placementFor(part: CatalogPart): Placement {
  return PLACEMENTS[part.id] ?? { zone: 'inside', widthPct: 0, leftPct: 0 }
}

export function isOutdoors(part: CatalogPart): boolean {
  const z = placementFor(part).zone
  return z !== 'inside'
}

/** Tubing is drawn as a run, not as an object, so it is handled separately. */
export function isPipeRun(part: CatalogPart): boolean {
  return part.id === 'tubing'
}
