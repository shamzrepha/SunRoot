/**
 * Weather and ambient conditions. Owned by EnvironmentController, read by the
 * physics below. Neutral values (factor 1, multiplier 1) reproduce the original
 * clear-sky behaviour exactly, so the base simulation is unchanged when no
 * environment controller is running.
 */
export interface EnvironmentState {
  /** 0-1 multiplier on photovoltaic output. 1 = clear sky. */
  irradianceFactor: number
  /** Multiplier on the soil evaporation rate. 1 = normal conditions. */
  evaporationMultiplier: number
  ambientTempC: number
  /** Human-readable labels of whatever is currently active. */
  activeEvents: string[]
}

/**
 * Wear state of the moving hardware. Owned by EnvironmentController's
 * degradation model, surfaced to the tutor and the telemetry panel.
 */
export interface ActuatorHealth {
  /** 0-100 accumulated mechanical strain. */
  strain: number
  temperatureC: number
  thermalWarning: boolean
  /** Number of on/off transitions, used to detect relay chatter. */
  cycles: number
}

import { alwaysOnLoads, hydraulicPath, topology } from './PowerSystem'
import { graph, partOf } from '../hardware/CircuitGraph'

export interface FarmState {
  soilMoisture: number
  /**
   * State of charge as a percentage, 0-100. This is a *derived* view of
   * batteryEnergyWh, recomputed every tick. Never assign to it directly —
   * change the stored energy and let the percentage follow.
   */
  battery: number
  /** Energy actually held in the bank, in watt-hours. The real quantity. */
  batteryEnergyWh: number
  solarGeneration: number
  pumpOn: boolean
  /** 0 = no flow, 1 = full flow. Drives pipe + sprinkler visuals. */
  waterFlow: number
  cropHealth: number
  hour: number
  day: number
  environment: EnvironmentState
  actuator: ActuatorHealth
  /** Water remaining in the installed tanks, in litres. */
  tankLitres: number
  /** Capacity of the installed tanks. Zero when none is fitted. */
  tankCapacityLitres: number
}

// Tunable physical constants, kept in one place so the causal chain is
// readable and adjustable without hunting through the update function.
export const CONFIG = {
  panelPeakWatts: 600,
  /**
   * Retained only so older callers keep type-checking. Charging now goes
   * through the watt-hour model below, which is the physically honest one.
   */
  chargeRatePerWatt: 0.0008,
  pumpDrainPerSecond: 2.5,

  // --- §10 energy accounting -------------------------------------------
  // Battery percentage is a *display* of stored energy, never the quantity
  // being simulated. Charge and drain are computed in watt-hours so the
  // numbers correspond to hardware a student could actually buy, and so the
  // day/night cycle produces a believable state of charge rather than a bar
  // that empties in forty seconds.
  pumpPowerWatts: 90,
  /**
   * Sized deliberately: one full charge runs the pump for a little over five
   * hours, which is generous enough to experiment with and tight enough that
   * an always-on pump still fails overnight.
   */
  batteryCapacityWh: 480,
  /** Inverter, charge-controller and wiring losses on the way in. */
  chargeEfficiency: 0.85,
  /** Losses on the way out to the load. */
  dischargeEfficiency: 0.92,
  /** Below this state of charge the pump is not permitted to start. */
  minOperatingBatteryPercent: 3,

  irrigationRatePerSecond: 4,
  evaporationPerSecond: 0.4,
  healthyMoistureMin: 30,
  healthyMoistureMax: 70,
  dryStressBelow: 25,
  overwaterAbove: 85,
  healthGainPerSecond: 0.5,
  healthDryLossPerSecond: 1.2,
  healthOverwaterLossPerSecond: 0.35,
  hoursPerRealSecond: 0.5 / 60,

  // --- energy accounting, used by HardwareValidator and the tutor ---
  /** Nominal DC bus voltage of the installation. */
  busVoltage: 12,
  /** Round-trip losses in the charge controller and wiring. */
  systemEfficiency: 0.82,

  // --- thermal / mechanical degradation ---
  /** Below this battery percentage the bus sags and motors draw harder. */
  lowVoltageBelow: 20,
  strainPerSecondUnderVoltage: 1.4,
  strainRecoveryPerSecond: 0.35,
  actuatorAmbientOffsetC: 4,
  actuatorHeatPerSecond: 1.1,
  actuatorCoolPerSecond: 0.6,
  thermalWarningAboveC: 65,

  // --- water accounting -------------------------------------------------
  /** Litres a running pump delivers per simulated second. */
  pumpLitresPerSecond: 0.35,
  /** Litres a heavy rain event returns to an open tank per second. */
  rainRefillLitresPerSecond: 0.5,
}

export const farm: FarmState = {
  soilMoisture: 12,
  battery: 0,
  batteryEnergyWh: 0,
  solarGeneration: 520,
  pumpOn: false,
  waterFlow: 0,
  cropHealth: 24,
  hour: 8,
  day: 1,
  environment: {
    irradianceFactor: 1,
    evaporationMultiplier: 1,
    ambientTempC: 24,
    activeEvents: [],
  },
  actuator: {
    strain: 0,
    temperatureC: 28,
    thermalWarning: false,
    cycles: 0,
  },
  tankLitres: 0,
  tankCapacityLitres: 0,
}

/** Total capacity of every tank on the bench. */
function tankCapacity(): number {
  return graph.placed.reduce((sum, p) => {
    const part = partOf(p.instanceId)
    return sum + (part?.id === 'waterTank' ? 200 : 0)
  }, 0)
}

/** Reset stored energy and fill the tanks when a new system is deployed. */
export function primeBattery() {
  // Tanks arrive full; the student is not asked to fill them by hand.
  farm.tankCapacityLitres = tankCapacity()
  farm.tankLitres = farm.tankCapacityLitres

  const capacity = topology().capacityWh
  // A fresh bank arrives part-charged, as one would from a supplier.
  farm.batteryEnergyWh = capacity * 0.35
  farm.battery = capacity > 0 ? 35 : 0
}

/** Normalised sun elevation, 0 at night, 1 at solar noon. */
export function daylightFactor(hour: number): number {
  return Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI))
}

export function updateFarm(deltaSeconds: number) {
  // The whole power chain is read from the circuit the student built. Nothing
  // below may assume a panel, a battery or a controller that is not on the bench.
  const topo = topology()

  // --- SUN -> SOLAR ---
  const daylight = daylightFactor(farm.hour)
  farm.solarGeneration = Math.round(
    topo.arrayPeakWatts * daylight * farm.environment.irradianceFactor * topo.harvestEfficiency,
  )

  // Simulation seconds converted to the farm-hours the energy maths needs.
  const deltaHours = deltaSeconds * CONFIG.hoursPerRealSecond * 60

  // --- SOLAR -> BATTERY (watt-hours in) ---
  // Energy, not percentage, and only when a path physically exists from a
  // source to the bank. Disconnect the panel and the battery stops filling.
  const capacityWh = topo.capacityWh
  if (farm.solarGeneration > 0 && topo.chargePathComplete && capacityWh > 0) {
    farm.batteryEnergyWh += farm.solarGeneration * deltaHours * CONFIG.chargeEfficiency
  }

  // A load wired straight across a supply runs whether or not any program says
  // so, because nothing is standing between it and the battery.
  if (alwaysOnLoads().length > 0 && farm.batteryEnergyWh > 0) {
    farm.pumpOn = true
  }

  // --- BATTERY -> PUMP -> WATER FLOW (watt-hours out) ---
  const canOperate =
    farm.batteryEnergyWh > 0 &&
    farm.battery >= CONFIG.minOperatingBatteryPercent

  if (farm.pumpOn && canOperate) {
    // Draw is whatever is actually on the bench. There is deliberately no
    // fallback constant: an installation with no load draws nothing, and a
    // 30 W pump must never be billed at some invented 90 W.
    const loadWatts = topo.activeLoadWatts
    const demandWh = (loadWatts * deltaHours) / CONFIG.dischargeEfficiency
    farm.batteryEnergyWh = Math.max(0, farm.batteryEnergyWh - demandWh)

    if (farm.batteryEnergyWh > 0) {
      // Electrically running is not the same as watering. Without a plumbed
      // path the motor spins, draws current and delivers nothing.
      // Water is finite. A plumbed, powered pump with an empty tank moves
      // nothing, which is the failure that catches people who never stop.
      const plumbed = hydraulicPath().complete
      const hasWater = farm.tankCapacityLitres === 0 || farm.tankLitres > 0
      farm.waterFlow = plumbed && hasWater ? 1 : 0
      if (plumbed && hasWater) {
        farm.soilMoisture += CONFIG.irrigationRatePerSecond * deltaSeconds
        farm.tankLitres = Math.max(0, farm.tankLitres - CONFIG.pumpLitresPerSecond * deltaSeconds)
      }
      else {
        farm.soilMoisture -=
          CONFIG.evaporationPerSecond * farm.environment.evaporationMultiplier * deltaSeconds
        // Running dry is the fastest way to destroy an impeller pump: the water
        // it moves is also what cools and lubricates it. Strain accrues faster
        // than idle recovery can undo it, so a dry run leaves a permanent mark.
        if (plumbed && !hasWater) {
          farm.actuator.strain = Math.min(100, farm.actuator.strain + 4 * deltaSeconds)
          farm.actuator.temperatureC += 3 * deltaSeconds
          farm.actuator.thermalWarning = true
        }
      }
    } else {
      // Energy exhausted mid-cycle: the pump physically cannot keep running,
      // no matter what the student's program is currently commanding.
      setPumpState(false)
    }
  } else {
    if (!canOperate) setPumpState(false)
    farm.waterFlow = 0
    farm.soilMoisture -=
      CONFIG.evaporationPerSecond * farm.environment.evaporationMultiplier * deltaSeconds
  }

  // Standby electronics draw whether or not anything is switched on.
  if (capacityWh > 0 && topo.standbyWatts > 0) {
    farm.batteryEnergyWh = Math.max(
      0,
      farm.batteryEnergyWh - (topo.standbyWatts * deltaHours) / CONFIG.dischargeEfficiency,
    )
  }

  // Percentage is a readout of stored energy against the capacity actually
  // installed. With no battery on the bench there is nothing to report.
  farm.batteryEnergyWh = clamp(farm.batteryEnergyWh, 0, capacityWh)
  farm.battery = capacityWh > 0 ? (farm.batteryEnergyWh / capacityWh) * 100 : 0

  farm.soilMoisture = clamp(farm.soilMoisture, 0, 100)

  // --- SOIL -> CROP HEALTH ---
  if (farm.soilMoisture < CONFIG.dryStressBelow) {
    farm.cropHealth -= CONFIG.healthDryLossPerSecond * deltaSeconds
  } else if (farm.soilMoisture > CONFIG.overwaterAbove) {
    farm.cropHealth -= CONFIG.healthOverwaterLossPerSecond * deltaSeconds
  } else if (
    farm.soilMoisture >= CONFIG.healthyMoistureMin &&
    farm.soilMoisture <= CONFIG.healthyMoistureMax
  ) {
    farm.cropHealth += CONFIG.healthGainPerSecond * deltaSeconds
  }

  farm.cropHealth = clamp(farm.cropHealth, 0, 100)

  // --- RAIN -> TANK + SOIL ---
  // Rain is not decoration either: it refills the tank and wets the ground,
  // which is why a rain sensor is worth having in the design.
  if (farm.environment.activeEvents.some((e) => /rain|storm/i.test(e))) {
    farm.tankLitres = Math.min(
      farm.tankCapacityLitres,
      farm.tankLitres + CONFIG.rainRefillLitresPerSecond * deltaSeconds,
    )
    farm.soilMoisture += CONFIG.irrigationRatePerSecond * 0.4 * deltaSeconds
    farm.soilMoisture = clamp(farm.soilMoisture, 0, 100)
  }

  // --- CLOCK ---
  farm.hour += deltaSeconds * CONFIG.hoursPerRealSecond * 60
  if (farm.hour >= 24) {
    farm.hour -= 24
    farm.day += 1
  }
}

/**
 * Single choke point for every pump state change, so relay cycles are counted
 * in one place no matter whether the command came from student code, the manual
 * button, or the physics cutting power.
 */
export function setPumpState(on: boolean) {
  if (farm.pumpOn === on) return
  farm.pumpOn = on
  farm.actuator.cycles++
  if (!on) farm.waterFlow = 0
}

/** Guarded manual control: refuses to start on an empty battery. */
export function tryTogglePump(): { ok: boolean; reason?: string } {
  if (farm.pumpOn) {
    setPumpState(false)
    return { ok: true }
  }
  if (farm.battery < CONFIG.minOperatingBatteryPercent) {
    return { ok: false, reason: 'BATTERY EMPTY — PUMP UNAVAILABLE' }
  }
  setPumpState(true)
  return { ok: true }
}

/** Hours the pump could run on what is currently stored. */
export function pumpRuntimeHoursRemaining(): number {
  const drawWh = CONFIG.pumpPowerWatts / CONFIG.dischargeEfficiency
  return farm.batteryEnergyWh / drawWh
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
