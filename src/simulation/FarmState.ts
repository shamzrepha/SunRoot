export interface FarmState {
  soilMoisture: number
  battery: number
  solarGeneration: number
  pumpOn: boolean
  cropHealth: number
  hour: number
}

export const farm: FarmState = {
  soilMoisture: 12,
  battery: 23,
  solarGeneration: 520,
  pumpOn: false,
  cropHealth: 24,
  hour: 8,
}

export function updateFarm(deltaSeconds: number) {
  // Simple day/night solar cycle
  const daylight = Math.max(
    0,
    Math.sin(((farm.hour - 6) / 12) * Math.PI)
  )

  farm.solarGeneration = Math.round(600 * daylight)

  // Solar charges the battery
 if (farm.solarGeneration > 0) {
  farm.battery += farm.solarGeneration * 0.0008 * deltaSeconds
}

farm.battery = Math.min(farm.battery, 100)

  // Pump consumes battery and adds water to the soil
 if (farm.pumpOn && farm.battery > 0) {
  farm.battery -= 2.5 * deltaSeconds
  farm.battery = Math.max(0, farm.battery)

  // Only pump while energy is actually available
  if (farm.battery > 0) {
    farm.soilMoisture += 4 * deltaSeconds
  } else {
    farm.pumpOn = false
  }
}else {
    // Soil slowly dries when the pump is off
    farm.soilMoisture -= 0.4 * deltaSeconds
  }

  // Crop health reacts to soil moisture
  if (farm.soilMoisture < 25) {
    farm.cropHealth -= 1.2 * deltaSeconds
  } else if (farm.soilMoisture >= 30 && farm.soilMoisture <= 70) {
    farm.cropHealth += 0.5 * deltaSeconds
  }

  // Keep values inside sensible limits
  farm.battery = clamp(farm.battery, 0, 100)
  farm.soilMoisture = clamp(farm.soilMoisture, 0, 100)
  farm.cropHealth = clamp(farm.cropHealth, 0, 100)

  // Advance simulation time
  farm.hour += (deltaSeconds / 60) * 0.5

  if (farm.hour >= 24) {
    farm.hour = 0
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}