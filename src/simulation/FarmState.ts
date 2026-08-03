export type PlantStage =
  | 'seedling'
  | 'growing'
  | 'mature'
  | 'fruiting'
  | 'withered'

export interface FarmState {
  soilMoisture: number
  battery: number
  solarGeneration: number

  pumpOn: boolean
  waterFlow: number

  cropHealth: number
  plantGrowth: number
  fruitCount: number

  plantStage: PlantStage

  hour: number
}

export const farm: FarmState = {
  soilMoisture: 12,
  battery: 23,
  solarGeneration: 520,

  pumpOn: false,
  waterFlow: 0,

  cropHealth: 24,
  plantGrowth: 0,
  fruitCount: 0,

  plantStage: 'seedling',

  hour: 8,
}

export function updateFarm(deltaSeconds: number) {
  /*
   * ----------------------------------------
   * 1. DAY / NIGHT SOLAR SIMULATION
   * ----------------------------------------
   */

  const daylight = Math.max(
    0,
    Math.sin(((farm.hour - 6) / 12) * Math.PI)
  )

  farm.solarGeneration = Math.round(600 * daylight)

  /*
   * ----------------------------------------
   * 2. SOLAR → BATTERY
   * ----------------------------------------
   */

  const solarChargeRate = 0.0008

  farm.battery +=
    farm.solarGeneration *
    solarChargeRate *
    deltaSeconds

  /*
   * ----------------------------------------
   * 3. PUMP / WATER SYSTEM
   * ----------------------------------------
   */

  if (farm.pumpOn && farm.battery > 0) {
    const batteryUse = 2.5 * deltaSeconds

    farm.battery -= batteryUse

    /*
     * If there isn't enough energy,
     * shut the pump down.
     */
    if (farm.battery <= 0) {
      farm.battery = 0
      farm.pumpOn = false
      farm.waterFlow = 0
    } else {
      /*
       * Pump is successfully running.
       */
      farm.waterFlow = 1

      /*
       * Water enters the soil.
       */
      farm.soilMoisture += 3.5 * deltaSeconds
    }
  } else {
    /*
     * Pump isn't running.
     */
    farm.waterFlow = 0

    /*
     * Soil naturally loses moisture.
     */
    farm.soilMoisture -= 0.35 * deltaSeconds
  }

  /*
   * ----------------------------------------
   * 4. SOIL MOISTURE LIMITS
   * ----------------------------------------
   */

  farm.soilMoisture = clamp(
    farm.soilMoisture,
    0,
    100
  )

  /*
   * ----------------------------------------
   * 5. CROP HEALTH
   * ----------------------------------------
   */

  if (
    farm.soilMoisture >= 30 &&
    farm.soilMoisture <= 70
  ) {
    /*
     * Ideal growing conditions.
     */
    farm.cropHealth += 0.6 * deltaSeconds
  } else if (farm.soilMoisture < 20) {
    /*
     * Soil is too dry.
     */
    farm.cropHealth -= 1.0 * deltaSeconds
  } else if (farm.soilMoisture > 85) {
    /*
     * Too much water also stresses the crop.
     */
    farm.cropHealth -= 0.35 * deltaSeconds
  }

  farm.cropHealth = clamp(
    farm.cropHealth,
    0,
    100
  )

  /*
   * ----------------------------------------
   * 6. PLANT GROWTH
   * ----------------------------------------
   */

  if (
    farm.cropHealth >= 50 &&
    farm.soilMoisture >= 30 &&
    farm.soilMoisture <= 70
  ) {
    farm.plantGrowth +=
      0.18 * deltaSeconds
  }

  /*
   * Healthy plants can grow.
   * Unhealthy plants stop progressing.
   */
  farm.plantGrowth = clamp(
    farm.plantGrowth,
    0,
    100
  )

  /*
   * ----------------------------------------
   * 7. PLANT STAGES
   * ----------------------------------------
   */

  if (farm.cropHealth < 15) {
    farm.plantStage = 'withered'
  } else if (farm.plantGrowth < 20) {
    farm.plantStage = 'seedling'
  } else if (farm.plantGrowth < 55) {
    farm.plantStage = 'growing'
  } else if (farm.plantGrowth < 80) {
    farm.plantStage = 'mature'
  } else {
    farm.plantStage = 'fruiting'
  }

  /*
   * ----------------------------------------
   * 8. FRUIT
   * ----------------------------------------
   */

  if (
    farm.plantStage === 'fruiting' &&
    farm.cropHealth >= 70
  ) {
    /*
     * Fruit slowly develops once the
     * plant is mature and healthy.
     */
    const fruitGrowth =
      0.025 * deltaSeconds

    farm.fruitCount += fruitGrowth
  }

  farm.fruitCount = clamp(
    farm.fruitCount,
    0,
    10
  )

  /*
   * ----------------------------------------
   * 9. BATTERY LIMIT
   * ----------------------------------------
   */

  farm.battery = clamp(
    farm.battery,
    0,
    100
  )

  /*
   * ----------------------------------------
   * 10. ADVANCE FARM TIME
   * ----------------------------------------
   */

  farm.hour +=
    (deltaSeconds / 60) * 0.5

  if (farm.hour >= 24) {
    farm.hour = 0
  }
}

function clamp(
  value: number,
  min: number,
  max: number
) {
  return Math.min(
    Math.max(value, min),
    max
  )
}