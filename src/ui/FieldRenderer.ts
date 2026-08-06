// ---------------------------------------------------------------------------
// FieldRenderer
//
// The farm's installation row, generated from the circuit graph rather than
// drawn in advance. Previously the field showed a solar array, a tank and a
// pump whatever the student had built, which made the twin a lie: someone who
// wired only an LED still saw an irrigation plant.
//
// Now the field contains exactly what is on the bench, each unit showing its
// own live state, and the controller is clickable so its I/O can be inspected.
// ---------------------------------------------------------------------------

import { graph, partOf, wiredOutputs, wiredSensors } from '../hardware/CircuitGraph'
import type { CatalogPart } from '../hardware/ComponentCatalog'
import { outputOf, readingOf } from '../simulation/DeviceState'
import { farm } from '../simulation/FarmState'
import { alwaysOnLoads, topology } from '../simulation/PowerSystem'
import { componentArt } from './ComponentArt'
import { isPipeRun, isOutdoors, placementFor } from './SceneLayout'

/**
 * On a real installation the electronics live in a weatherproof enclosure and
 * only the field hardware is exposed: panel on its rack, pump at the water,
 * probe in the soil. Splitting them here is not decoration — it is why the
 * control box exists as a thing you open.
 */

export interface FieldUnit {
  instanceId: string
  part: CatalogPart
}


function allPlaced(): FieldUnit[] {
  return graph.placed
    .map((p) => ({ instanceId: p.instanceId, part: partOf(p.instanceId)! }))
    .filter((u) => !!u.part)
}

/** Hardware mounted out in the weather. */
export function fieldUnits(): FieldUnit[] {
  return allPlaced().filter((u) => isOutdoors(u.part))
}

/** Everything else — it lives in the sealed enclosure and is not drawn outside. */
export function enclosedUnits(): FieldUnit[] {
  return allPlaced().filter((u) => !isOutdoors(u.part))
}

/**
 * The scene. Built in zones rather than as a row, so the house sits on the
 * earth, the array sits on its roof, probes sit in the soil with cable running
 * back to the box, and nothing hangs in mid-air.
 */
export function renderFieldHtml(): string {
  const outdoor = fieldUnits()
  const inside = enclosedUnits()

  if (!outdoor.length && !inside.length) {
    return `<div class="field-empty">Nothing has been installed on this farm yet.</div>`
  }

  const zoneOf = (z: string) => outdoor.filter((u) => placementFor(u.part).zone === z)

  /**
   * Lay a zone out without overlaps.
   *
   * The placement table gives a preferred position, but two components can want
   * the same spot and a fixed table cannot know how many are installed. Items
   * are sorted by preference, then walked left to right and pushed along
   * whenever they would collide with the one before.
   */
  const layout = (units: FieldUnit[], startPct: number, endPct: number) => {
    const sorted = [...units].sort(
      (a, b) => placementFor(a.part).leftPct - placementFor(b.part).leftPct,
    )
    const gap = 2.5
    let cursor = startPct
    return sorted.map((u) => {
      const pl = placementFor(u.part)
      const x = Math.max(cursor, Math.min(pl.leftPct, endPct - pl.widthPct))
      cursor = x + pl.widthPct + gap
      return { unit: u, x, w: pl.widthPct }
    })
  }
  const roof = zoneOf('roof')
  const ground = zoneOf('ground')
  const soil = zoneOf('soil')
  const field = zoneOf('field')

  const item = (u: FieldUnit, extraClass = '') => {
    const pl = placementFor(u.part)
    if (isPipeRun(u.part)) return ''
    // The label and state sit in their own absolutely-positioned strip beneath
    // the ground line. If they took part in the normal flow they would push the
    // artwork upward, and every component would appear to hover.
    return `
      <div class="sc-item ${extraClass}" data-field="${u.instanceId}"
           data-category="${u.part.category}" title="${u.part.name}">
        <div class="sc-art">${componentArt(u.part.id, u.part.category)}</div>
        <div class="sc-caption">
          <div class="sc-label">${pl.label ?? shortName(u.part)}</div>
          <div class="sc-state" data-state="${u.instanceId}"></div>
        </div>
      </div>`
  }

  // Roof furniture rides on the house, so it is nested inside it.
  const house = `
    <div class="sc-house" data-field="__shed" data-category="shed" role="button" tabindex="0"
         title="Open the workbench">
      <div class="sc-roof">
        <div class="sc-roof-face"></div>
        <div class="sc-roof-mounts">${roof
          .map((u) => `<div class="roof-slot" style="--w:${placementFor(u.part).widthPct * 3}%">${item(u, 'on-roof')}</div>`)
          .join('')}</div>
      </div>
      <div class="sc-walls">
        <div class="sc-door"></div>
        <div class="sc-window"></div>
      </div>
      <div class="sc-house-label">WORKSHOP</div>
    </div>`

  const box = inside.length
    ? `<div class="sc-box" data-field="__enclosure" data-category="enclosure" role="button"
            tabindex="0" title="Open the control box">
         <div class="sc-box-body">
           <span class="sc-vent"></span><span class="sc-vent"></span><span class="sc-vent"></span>
           <span class="sc-latch"></span>
           <span class="sc-box-led" data-state="__enclosureLed"></span>
         </div>
         <div class="sc-box-post"></div>
         <div class="sc-label">CONTROL BOX</div>
         <div class="sc-state" data-state="__enclosure"></div>
       </div>`
    : ''

  // Cable runs from every field device back to the enclosure, drawn along the
  // ground the way armoured cable actually lies.
  const cabled = [...ground, ...soil, ...field].filter((u) => placementFor(u.part).cableToBox)
  const cables = cabled
    .map((u) => {
      const pl = placementFor(u.part)
      return `<span class="sc-cable" style="--from:${pl.leftPct}%"></span>`
    })
    .join('')

  return `
    <div class="sc-stage">
      <div class="sc-backline">
        ${house}
        ${box}
        ${layout(ground, 34, 97)
          .map((g) => `<div class="sc-anchor" style="--x:${g.x}%;--w:${g.w}%">${item(g.unit)}</div>`)
          .join('')}
      </div>
      <div class="sc-cables">${cables}</div>
      <div class="sc-fieldline">
        ${layout(field, 68, 98)
          .map((g) => `<div class="sc-anchor" style="--x:${g.x}%;--w:${g.w}%">${item(g.unit)}</div>`)
          .join('')}
      </div>
      <div class="sc-soilline">
        ${layout(soil, 40, 66)
          .map((g) => `<div class="sc-anchor" style="--x:${g.x}%;--w:${g.w}%">${item(g.unit, 'in-soil')}</div>`)
          .join('')}
      </div>
    </div>`
}

function shortName(part: CatalogPart): string {
  return part.name
    .replace(/\s*\(.*?\)/g, '')
    .replace(/module|pack|panel/gi, '')
    .trim()
    .toUpperCase()
    .slice(0, 14)
}

/**
 * Per-tick update. Each unit reports its own condition, so a buzzer sounding
 * and an LED lit are as visible as a pump running.
 */
export function updateFieldState(host: HTMLElement) {
  // The roof array reports what it is actually generating right now.

  const encState = host.querySelector<HTMLElement>('[data-state="__enclosure"]')
  if (encState) {
    const io = wiredSensors().length + wiredOutputs().length
    const anyOn = enclosedUnits().some((u) => outputOf(u.instanceId).on)
    encState.textContent = io ? `${io} I/O live` : 'idle'
    const box = host.querySelector<HTMLElement>('[data-field="__enclosure"]')
    box?.classList.toggle('unit-active', anyOn)
    if (box) box.dataset.tone = io ? 'good' : 'idle'
  }

  for (const u of fieldUnits()) {
    const el = host.querySelector<HTMLElement>(`[data-state="${u.instanceId}"]`)
    const unit = host.querySelector<HTMLElement>(`[data-field="${u.instanceId}"]`)
    if (!el || !unit) continue

    const { text, active, tone } = unitState(u)
    el.textContent = text
    unit.classList.toggle('unit-active', active)
    unit.dataset.tone = tone
  }
}

function unitState(u: FieldUnit): { text: string; active: boolean; tone: string } {
  const { part, instanceId } = u

  if (part.category === 'controllers') {
    const io = wiredSensors().length + wiredOutputs().length
    return { text: io ? `${io} I/O live` : 'no I/O wired', active: io > 0, tone: io ? 'good' : 'idle' }
  }

  if (part.category === 'power') {
    // A converter neither generates nor stores. Reporting array watts on one is
    // misleading, and reporting zero looks broken — what it actually does is
    // pass power through, so that is what it says.
    const isConverter = /Controller|converter|regulator/i.test(part.name)
    if (isConverter) {
      const t = topology()
      const passing = farm.solarGeneration
      if (!t.chargePathComplete) {
        return { text: 'not in circuit', active: false, tone: 'warn' }
      }
      return {
        text: passing > 0 ? `passing ${Math.round(passing)} W` : 'standby',
        active: passing > 0,
        tone: passing > 0 ? 'good' : 'idle',
      }
    }
    if (part.capacityWh) {
      return {
        text: `${Math.round(farm.battery)}%`,
        active: farm.battery > 1,
        tone: farm.battery < 20 ? 'warn' : 'good',
      }
    }
    return {
      text: `${Math.round(farm.solarGeneration)} W`,
      active: farm.solarGeneration > 0,
      tone: farm.solarGeneration > 0 ? 'good' : 'idle',
    }
  }

  if (part.category === 'sensors') {
    const r = readingOf(instanceId)
    const wired = wiredSensors().some((s) => s.instanceId === instanceId)
    if (!wired) return { text: 'not reporting', active: false, tone: 'idle' }
    return { text: `${Math.round(r.value)}`, active: true, tone: 'good' }
  }

  // Drivers, actuators and indicators all report whether they are being driven.
  const o = outputOf(instanceId)
  const driver = wiredOutputs().find(
    (w) => w.instanceId === instanceId || w.loadInstance === instanceId,
  )
  const driven = driver ? outputOf(driver.instanceId).on : o.on

  if (part.category === 'output') {
    // An indicator blinking fast is information, so the blink is real time.
    return { text: driven ? 'ON' : 'off', active: driven, tone: driven ? 'good' : 'idle' }
  }

  if (part.category === 'actuators') {
    // A load wired straight across a supply is energised with no program
    // involved, so its state cannot be read from the output map alone.
    const hardWired = alwaysOnLoads().some((l) => l.instanceId === instanceId)
    const energised = driven || (hardWired && farm.battery > 0)
    const running = energised && farm.pumpOn

    if (running && farm.waterFlow > 0) {
      return { text: hardWired ? 'RUNNING (hard-wired)' : 'RUNNING', active: true, tone: 'good' }
    }
    if (running) {
      // Spinning but delivering nothing: powered, not plumbed.
      return { text: 'running, no water path', active: true, tone: 'warn' }
    }
    if (energised) return { text: 'powered, waiting', active: false, tone: 'warn' }
    if (driven) return { text: 'commanded, no power', active: false, tone: 'warn' }
    return { text: 'idle', active: false, tone: 'idle' }
  }

  return { text: driven ? 'closed' : 'open', active: driven, tone: driven ? 'good' : 'idle' }
}

// ---------------------------------------------------------------------------
// Controller inspector
// ---------------------------------------------------------------------------

/** Everything inside the box: what is mounted, and what its pins are doing. */
export function enclosurePanelHtml(): string {
  const inside = enclosedUnits()
  const controller = inside.find((u) => u.part.category === 'controllers')

  const contents = inside
    .map(
      (u) => `
      <li class="enc-item">
        <span class="enc-item-art">${componentArt(u.part.id, u.part.category)}</span>
        <span class="enc-item-name">${u.part.name}</span>
        <span class="enc-item-state">${unitState(u).text}</span>
      </li>`,
    )
    .join('')

  return `
    <div class="controller-panel" id="controllerPanel">
      <div class="cp-head">
        <div>
          <div class="cp-title">Control box</div>
          <div class="cp-sub">${inside.length} component${inside.length === 1 ? '' : 's'} mounted inside</div>
        </div>
        <button class="cp-close" id="cpClose" aria-label="Close">&times;</button>
      </div>
      <ul class="enc-list">${contents}</ul>
      ${controller ? ioTableHtml(controller.instanceId) : ''}
      <p class="cp-note">Electronics sit in the enclosure; only field hardware is exposed to the weather.</p>
    </div>`
}

/** Live I/O table for a controller. */
export function ioTableHtml(instanceId: string): string {
  const part = partOf(instanceId)
  if (!part) return ''

  const sensors = wiredSensors().filter((s) => s.controllerInstance === instanceId)
  const outputs = wiredOutputs().filter((o) => o.controllerInstance === instanceId)

  const rows: string[] = []

  for (const s of sensors) {
    const r = readingOf(s.instanceId)
    rows.push(`
      <tr class="${s.readable ? '' : 'row-bad'}">
        <td class="io-pin">${s.pinName}</td>
        <td class="io-dir in">IN</td>
        <td class="io-name">${s.part.name}</td>
        <td class="io-value">${s.readable ? Math.round(r.value) : 'floating 0'}</td>
      </tr>`)
  }

  for (const o of outputs) {
    const d = outputOf(o.instanceId)
    const load = o.loadInstance ? partOf(o.loadInstance) : undefined
    rows.push(`
      <tr class="${o.drivable ? '' : 'row-bad'}">
        <td class="io-pin">${o.pinName}</td>
        <td class="io-dir out">OUT</td>
        <td class="io-name">${o.part.name}${load && load.id !== o.part.id ? ` &rarr; ${load.name}` : ''}</td>
        <td class="io-value ${d.on ? 'high' : ''}">${o.drivable ? (d.on ? 'HIGH' : 'LOW') : 'no effect'}</td>
      </tr>`)
  }

  if (!rows.length) {
    rows.push(
      `<tr><td colspan="4" class="io-empty">Nothing is wired to this controller, so it has no I/O to run.</td></tr>`,
    )
  }

  return `
    <div class="io-block">
      <div class="io-caption">${part.name} &middot; ${sensors.length} in, ${outputs.length} out</div>
      <table class="io-table">
        <thead><tr><th>Pin</th><th>Dir</th><th>Device</th><th>Value</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>`
}
