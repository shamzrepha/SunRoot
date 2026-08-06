import { distinctOwned } from '../hardware/PartsTray'
import { BB_COLUMNS, LOWER_ROWS, RAILS, UPPER_ROWS, railHole, stripHole } from '../hardware/Breadboard'
import {
  canRedo,
  canUndo,
  graph,
  isBreadboard,
  pushHistory,
  redo,
  undo,
  clearGraph,
  connectPins,
  moveComponent,
  partOf,
  placeComponent,
  placedCountOf,
  removeComponent,
  removeWire,
  terminalsOf,
  wiresOnPin,
} from '../hardware/CircuitGraph'
import { checkGraph } from '../hardware/GraphChecker'
import type { Issue } from '../hardware/GraphChecker'
import { componentArt } from '../ui/ComponentArt'
import { icon } from '../ui/icons'
import { toast } from '../game/shell'
import { sfx } from '../game/sound'
import { assistant } from '../ai/Assistant'
import { observeCircuit } from '../learning/EvidenceCollector'
import { noteAction } from '../learning/ContextBuilder'
import { computeMetrics } from '../learning/DesignMetrics'
import { nextGuidance, remainingSteps } from '../learning/ContextualTutor'
import { MODES, currentMode, setMode } from '../learning/LearningModes'
import type { ModeId } from '../learning/LearningModes'

/**
 * The bench starts empty. Its palette is built from whatever the student
 * bought, its pin labels come from the real pinout of the boards they chose,
 * and nothing here refuses a connection on grounds of taste. Wrong circuits are
 * buildable on purpose — the farm is where being wrong becomes visible.
 */
export function renderCircuitLab(root: HTMLElement, onContinue: () => void, onBack: () => void) {
  const owned = distinctOwned()

  root.innerHTML = `
    <div class="screen circuit-screen">
      <div class="lab-header">
        <div>
          <h1>Circuit Lab</h1>
          <p>Drag your parts onto the bench and wire them however you think they should go.
             Click a pin, then click another to join them.</p>
        </div>
        <div class="lab-header-actions">
          <button id="undoButton" class="ghost-button icon-only" title="Undo (Ctrl+Z)" disabled>${icon('undo', 15)}</button>
          <button id="redoButton" class="ghost-button icon-only" title="Redo (Ctrl+Shift+Z)" disabled>${icon('redo', 15)}</button>
          <button id="circuitBack" class="ghost-button">Tool shed</button>
          <button id="checkButton" class="ghost-button">Check circuit</button>
          <button id="circuitContinue" class="primary-button">Coding lab</button>
        </div>
      </div>

      <div class="circuit-body">
        <aside class="parts-palette">
          <h2>Your parts</h2>
          <div class="palette-list" id="paletteList"></div>
          <button id="clearBench" class="ghost-button small">Clear bench</button>
        </aside>

        <div class="bench-wrap">
          <div class="bench-viewport" id="benchViewport">
            <div class="bench" id="bench">
              <svg class="wire-layer" id="wireLayer"></svg>
              <p class="bench-empty" id="benchEmpty">
                Drag a component here to start building.
              </p>
            </div>
          </div>
          <div class="bench-bar">
            <p class="bench-tip" id="benchTip">Drag a part by its name to move it. Click two pins to wire them. Shift-click a wired pin to lift that wire, Escape to discard it.</p>
            <div class="zoom-controls">
              <button id="zoomOut" class="ghost-button icon-only" title="Zoom out">${icon('minus', 14)}</button>
              <span class="zoom-level" id="zoomLevel">100%</span>
              <button id="zoomIn" class="ghost-button icon-only" title="Zoom in">${icon('plus', 14)}</button>
              <button id="zoomFit" class="ghost-button small">Fit</button>
            </div>
          </div>
        </div>

        <aside class="circuit-inspector">
          <div class="mode-switch" id="modeSwitch" role="group" aria-label="Learning mode">
            ${MODES.map(
              (m) => `<button class="mode-btn ${m.id === currentMode().id ? 'active' : ''}"
                              data-mode="${m.id}" title="${m.blurb}">${m.label}</button>`,
            ).join('')}
          </div>

          <div class="live-score" id="liveScore"></div>
          <div class="coach" id="coachPanel"></div>

          <h2>Diagnostics</h2>
          <div class="check-output" id="checkOutput">
            <p class="check-idle">Build something, then press <strong>Check circuit</strong>.
               Nothing here stops you deploying — you can always try it on the farm and see.</p>
          </div>
        </aside>
      </div>
    </div>
  `

  const bench = root.querySelector<HTMLElement>('#bench')!
  const viewport = root.querySelector<HTMLElement>('#benchViewport')!
  const undoButton = root.querySelector<HTMLButtonElement>('#undoButton')!
  const redoButton = root.querySelector<HTMLButtonElement>('#redoButton')!
  const wireLayer = root.querySelector<SVGSVGElement>('#wireLayer')! as unknown as SVGSVGElement
  const palette = root.querySelector<HTMLElement>('#paletteList')!
  const checkOutput = root.querySelector<HTMLElement>('#checkOutput')!
  const coachPanel = root.querySelector<HTMLElement>('#coachPanel')!
  const benchEmpty = root.querySelector<HTMLElement>('#benchEmpty')!
  const benchTip = root.querySelector<HTMLElement>('#benchTip')!

  /** Half-made wire: first pin clicked, waiting for a second. */
  let pendingPin: { instanceId: string; pin: string } | null = null
  let dragging: { instanceId: string; dx: number; dy: number; moved: boolean } | null = null
  let zoom = 1

  // ---- palette -----------------------------------------------------------

  function renderPalette() {
    if (!owned.length) {
      palette.innerHTML = `<p class="empty-note">You did not buy anything. Go back to the tool shed.</p>`
      return
    }
    palette.innerHTML = owned
      .map(({ part, quantity }) => {
        const used = placedCountOf(part.id)
        const left = quantity - used
        return `
          <button class="palette-item ${left <= 0 ? 'exhausted' : ''}"
                  data-place="${part.id}" ${left <= 0 ? 'disabled' : ''}
                  draggable="${left > 0}">
            <span class="palette-art">${componentArt(part.id, part.category)}</span>
            <span class="palette-meta">
              <span class="palette-name">${part.name}</span>
              <span class="palette-left">${left} of ${quantity} left</span>
            </span>
          </button>`
      })
      .join('')

    palette.querySelectorAll<HTMLButtonElement>('[data-place]').forEach((b) => {
      b.addEventListener('click', () => {
        // Click drops it in the middle of whatever space is free.
        place(b.dataset.place!, ...nextFreeSpot(b.dataset.place!))
      })
      b.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData('text/plain', b.dataset.place!)
      })
    })
  }

  bench.addEventListener('dragover', (e) => e.preventDefault())
  bench.addEventListener('drop', (e) => {
    e.preventDefault()
    const partId = e.dataTransfer?.getData('text/plain')
    if (!partId) return
    const r = bench.getBoundingClientRect()
    place(partId, ((e.clientX - r.left) / r.width) * 100 - 8, ((e.clientY - r.top) / r.height) * 100 - 10)
  })

  /**
   * A breadboard is wide and everything else needs its holes reachable, so the
   * board takes the top of the bench and components flow beneath it. Without
   * this, a card dropped on the board covers the very holes it needs.
   */
  function nextFreeSpot(partId: string): [number, number] {
    const isBoard = partId === 'breadboardFull' || partId === 'breadboardHalf'
    if (isBoard) {
      // The board takes the top of the bench, so anything already sitting there
      // is pushed down rather than being buried underneath it.
      let moved = 0
      for (const p of graph.placed) {
        if (isBreadboard(p.instanceId)) continue
        if (p.y < 38) {
          moveComponent(p.instanceId, 2 + (moved % 3) * 31, 40 + Math.floor(moved / 3) * 30)
          moved++
        }
      }
      return [2, 2]
    }

    const boardPresent = graph.placed.some((p) => isBreadboard(p.instanceId))
    const others = graph.placed.filter((p) => !isBreadboard(p.instanceId)).length
    const topOffset = boardPresent ? 40 : 4
    return [2 + (others % 3) * 31, topOffset + Math.floor(others / 3) * 30]
  }

  function place(partId: string, x: number, y: number) {
    const entry = owned.find((o) => o.part.id === partId)
    if (!entry || placedCountOf(partId) >= entry.quantity) {
      toast('You have none of those left in your tray.', 'info')
      return
    }
    pushHistory()
    placeComponent(partId, clamp(x, 1, 88), clamp(y, 1, 88))
    noteAction(`placed ${entry.part.name} on the bench`)
    sfx.install()
    assistant.onPlace(partId)
    renderBench()
    renderPalette()
    renderCoach()
  }

  // ---- bench -------------------------------------------------------------

  function renderBench() {
    benchEmpty.hidden = graph.placed.length > 0

    for (const el of [...bench.querySelectorAll('.placed')]) el.remove()

    for (const inst of graph.placed) {
      const part = partOf(inst.instanceId)!
      const terms = terminalsOf(inst.instanceId)

      const node = document.createElement('div')
      node.className = isBreadboard(inst.instanceId) ? 'placed placed-breadboard' : 'placed'
      node.dataset.instance = inst.instanceId
      node.style.left = `${inst.x}%`
      node.style.top = `${inst.y}%`
      if (isBreadboard(inst.instanceId)) {
        node.innerHTML = `
          ${breadboardHtml(inst.instanceId)}
          <div class="placed-foot">
            <span class="placed-grip" data-grip-inst="${inst.instanceId}"
                  title="Drag to move">${part.name}</span>
            <button class="placed-remove" data-remove-inst="${inst.instanceId}"
                    title="Remove ${part.name}" aria-label="Remove ${part.name}">${icon('close', 11)}</button>
          </div>`
        bench.appendChild(node)
        continue
      }

      node.innerHTML = `
        <div class="placed-art">${componentArt(part.id, part.category)}</div>
        <div class="placed-pins">
          ${terms
            .map(
              (t) => `
            <span class="pin-slot" data-pin="${t.name}" data-instance="${inst.instanceId}"
                  title="${t.name} — ${t.note}">
              <span class="pin-dot" style="--pin-colour:${t.colour}"></span>
              <span class="pin-name">${t.name}</span>
            </span>`,
            )
            .join('')}
        </div>
        <div class="placed-foot">
          <span class="placed-grip" data-grip-inst="${inst.instanceId}"
                title="Drag to move">${part.name}</span>
          <button class="placed-remove" data-remove-inst="${inst.instanceId}"
                  title="Remove ${part.name}" aria-label="Remove ${part.name}">${icon('close', 11)}</button>
        </div>
      `
      bench.appendChild(node)
    }

    // Removal has its own button. Previously the label did both, so every
    // attempt to drag a part ended in deleting it.
    bench.querySelectorAll<HTMLElement>('.placed-remove').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        pushHistory()
        removeComponent(b.dataset.removeInst!)
        sfx.click()
        renderBench()
        renderPalette()
        refreshHistoryButtons()
      })
    })

    // The body of the card is the drag handle.
    bench.querySelectorAll<HTMLElement>('.placed-grip').forEach((g) => {
      g.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        const id = g.dataset.gripInst!
        const inst = graph.placed.find((p) => p.instanceId === id)!
        const r = bench.getBoundingClientRect()
        pushHistory()
        dragging = {
          instanceId: id,
          dx: ((e.clientX - r.left) / r.width) * 100 - inst.x,
          dy: ((e.clientY - r.top) / r.height) * 100 - inst.y,
          moved: false,
        }
        g.setPointerCapture(e.pointerId)
      })
      g.addEventListener('pointermove', (e) => {
        if (!dragging || dragging.instanceId !== g.dataset.gripInst) return
        dragging.moved = true
        const r = bench.getBoundingClientRect()
        moveComponent(
          dragging.instanceId,
          clamp(((e.clientX - r.left) / r.width) * 100 - dragging.dx, 0, 92),
          clamp(((e.clientY - r.top) / r.height) * 100 - dragging.dy, 0, 92),
        )
        const node = bench.querySelector<HTMLElement>(`[data-instance="${dragging.instanceId}"]`)
        const inst = graph.placed.find((p) => p.instanceId === dragging!.instanceId)!
        if (node) {
          node.style.left = `${inst.x}%`
          node.style.top = `${inst.y}%`
        }
        drawWires()
      })
      const finish = () => {
        if (!dragging) return
        // A press that never moved is not an edit worth remembering.
        if (!dragging.moved) undo()
        dragging = null
        refreshHistoryButtons()
      }
      g.addEventListener('pointerup', finish)
      g.addEventListener('pointercancel', finish)
    })

    bench.querySelectorAll<HTMLElement>('.bb-hole').forEach((h) => {
      h.addEventListener('click', (e) => {
        e.stopPropagation()
        onPinClick(h.dataset.instance!, h.dataset.pin!, e.shiftKey || e.altKey)
      })
    })

    bench.querySelectorAll<HTMLElement>('.pin-slot').forEach((p) => {
      p.addEventListener('click', (e) => {
        e.stopPropagation()
        onPinClick(p.dataset.instance!, p.dataset.pin!, e.shiftKey || e.altKey)
      })
    })

    drawWires()
  }


  // ---- wiring ------------------------------------------------------------

  function onPinClick(instanceId: string, pin: string, lift = false) {
    // Shift- or alt-click lifts an existing wire off this pin so it can be
    // landed somewhere else. Endpoint handles were tried first and had to go:
    // adjacent breadboard holes are seven pixels apart, so any handle big
    // enough to grab also covered the pins around it.
    if (lift && !pendingPin) {
      const attached = wiresOnPin(instanceId, pin)
      const w = attached[attached.length - 1]
      if (!w) {
        toast('No wire on that pin to lift.', 'info')
        return
      }
      pushHistory()
      const keepInst = w.fromInstance === instanceId && w.fromPin === pin ? w.toInstance : w.fromInstance
      const keepPin = w.fromInstance === instanceId && w.fromPin === pin ? w.toPin : w.fromPin
      removeWire(w.id)
      pendingPin = { instanceId: keepInst, pin: keepPin }
      markPending()
      benchTip.textContent = 'Wire lifted. Click a pin to land it somewhere else.'
      sfx.click()
      drawWires()
      refreshHistoryButtons()
      return
    }

    if (!pendingPin) {
      pendingPin = { instanceId, pin }
      markPending()
      benchTip.textContent = `${pin} selected. Click another pin to join them, or press Escape to cancel.`
      sfx.click()
      return
    }

    pushHistory()
    const res = connectPins(pendingPin.instanceId, pendingPin.pin, instanceId, pin)
    if (!res.ok) undo()
    if (res.ok) {
      noteAction(`wired ${pendingPin.pin} to ${pin}`)
      sfx.install()
      assistant.onWire()
    } else {
      toast(res.reason, 'info')
      sfx.error()
    }
    pendingPin = null
    markPending()
    benchTip.textContent = 'Click a pin to start a wire. Click a placed part\u2019s label to remove it.'
    drawWires()
    renderCoach()
  }

  function markPending() {
    bench.querySelectorAll('.pin-slot, .bb-hole').forEach((p) => p.classList.remove('pending'))
    if (!pendingPin) return
    const sel = `[data-instance="${pendingPin.instanceId}"][data-pin="${CSS.escape(pendingPin.pin)}"]`
    bench.querySelector(`.pin-slot${sel}, .bb-hole${sel}`)?.classList.add('pending')
  }

  document.addEventListener('keydown', escHandler)
  function escHandler(e: KeyboardEvent) {
    if (e.key === 'Escape' && pendingPin) {
      // A lifted wire that is never landed is simply gone, which doubles as the
      // way to delete short runs that carry no midpoint handle.
      pendingPin = null
      markPending()
      benchTip.textContent =
        'Drag a part by its name to move it. Click two pins to wire them. ' +
        'Shift-click a wired pin to lift that wire, Escape to discard it.'
      drawWires()
    }
  }

  function centreOf(instanceId: string, pin: string) {
    const el =
      bench.querySelector(`.pin-slot[data-instance="${instanceId}"][data-pin="${pin}"] .pin-dot`) ??
      bench.querySelector(`.bb-hole[data-instance="${instanceId}"][data-pin="${CSS.escape(pin)}"]`)
    if (!el) return null
    const b = el.getBoundingClientRect()
    const r = bench.getBoundingClientRect()
    return { x: b.left + b.width / 2 - r.left, y: b.top + b.height / 2 - r.top }
  }

  function drawWires() {
    const r = bench.getBoundingClientRect()
    wireLayer.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`)
    wireLayer.setAttribute('width', String(r.width))
    wireLayer.setAttribute('height', String(r.height))

    const parts: string[] = []
    for (const w of graph.wires) {
      const a = centreOf(w.fromInstance, w.fromPin)
      const b = centreOf(w.toInstance, w.toPin)
      if (!a || !b) continue
      // Wires sag between their endpoints, the way a real jumper lies.
      const sag = Math.min(40, Math.abs(b.x - a.x) * 0.28 + 14)
      const d = `M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${Math.max(a.y, b.y) + sag} ${b.x} ${b.y}`
      parts.push(`<path class="wire-shadow" d="${d}"/>`)
      parts.push(`<path class="wire" d="${d}" stroke="${w.colour}"/>`)
      // The path itself takes no pointer events — a jumper crossing the board
      // would otherwise swallow clicks on every hole beneath it. Removal goes
      // through a small handle at the midpoint instead.
      // Short runs get no handle at all. A jumper between two holes in one
      // column is barely longer than the handle itself, so the handle would sit
      // on top of the very pins it neighbours. Those are removed by lifting the
      // wire with shift-click and pressing Escape.
      const span = Math.hypot(b.x - a.x, b.y - a.y)
      if (span >= 60) {
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2 + sag / 2
        parts.push(
          `<circle class="wire-handle" cx="${mx}" cy="${my}" r="5" fill="${w.colour}" data-wire="${w.id}"><title>Remove this wire</title></circle>`,
        )
      }
    }
    wireLayer.innerHTML = parts.join('')

    wireLayer.querySelectorAll<SVGCircleElement>('[data-wire]').forEach((p) => {
      p.addEventListener('click', () => {
        pushHistory()
        removeWire(p.dataset.wire!)
        sfx.click()
        drawWires()
        refreshHistoryButtons()
      })
    })
  }

  // ---- diagnostics -------------------------------------------------------

  root.querySelector<HTMLButtonElement>('#checkButton')!.addEventListener('click', () => {
    const summary = checkGraph()
    observeCircuit(summary.issues)
    checkOutput.innerHTML = `
      <p class="check-summary ${summary.errors ? 'fail' : summary.warnings ? 'warn' : 'pass'}">
        ${summary.headline}
      </p>
      ${summary.issues.map(issueHtml).join('')}
    `
    if (summary.errors) sfx.error()
    else sfx.success()
    assistant.onCheck(summary)
  })

  function issueHtml(i: Issue) {
    // In Challenge and Exam the student is told a fault exists but not what it
    // is, so diagnosis stays their work.
    if (!currentMode().detailedDiagnostics) {
      return `
        <div class="issue ${i.severity}">
          <div class="issue-head">
            <span class="issue-mark">${icon(i.severity === 'error' ? 'cross' : 'dotOutline', 12)}</span>
            <span class="issue-system">${i.system}</span>
          </div>
          <p class="issue-message">A fault in this subsystem will stop the design working.</p>
          <p class="issue-prompt">${i.prompt}</p>
        </div>`
    }
    return `
      <div class="issue ${i.severity}">
        <div class="issue-head">
          <span class="issue-mark">${icon(i.severity === 'error' ? 'cross' : 'dotOutline', 12)}</span>
          <span class="issue-system">${i.system}</span>
        </div>
        <p class="issue-message">${i.message}</p>
        <p class="issue-why">${i.why}</p>
        <p class="issue-prompt">${i.prompt}</p>
      </div>`
  }

  root.querySelector<HTMLButtonElement>('#clearBench')!.addEventListener('click', () => {
    pushHistory()
    clearGraph()
    sfx.click()
    renderBench()
    renderPalette()
    renderCoach()
    refreshHistoryButtons()
  })

  root.querySelector<HTMLButtonElement>('#circuitBack')!.addEventListener('click', onBack)
  root.querySelector<HTMLButtonElement>('#circuitContinue')!.addEventListener('click', onContinue)

  /**
   * The coach reads the live graph after every edit, so its advice is always
   * about the circuit as it stands rather than a script written in advance.
   */
  /**
   * The running score. Recomputed on every edit, so a student sees tidiness
   * fall the moment they leave a part dangling and correctness rise when they
   * fix a fault — rather than discovering it at the end.
   */
  function renderLiveScore() {
    const el = root.querySelector<HTMLElement>('#liveScore')
    if (!el) return
    const m = computeMetrics()
    if (m.overall === null) {
      el.innerHTML = `<div class="ls-empty">Your design score appears here as you build.</div>`
      return
    }
    el.innerHTML = `
      <div class="ls-head">
        <span class="ls-tag">DESIGN SCORE</span>
        <span class="ls-value ${m.overall >= 75 ? 'high' : m.overall < 45 ? 'low' : ''}">${m.overall}</span>
      </div>
      <div class="ls-dims">
        ${m.dimensions
          .filter((d) => d.value !== null)
          .map(
            (d) => `<div class="ls-dim" title="${d.notes.join(' · ')}">
              <span>${d.label}</span>
              <span class="ls-num">${d.value}</span>
            </div>`,
          )
          .join('')}
      </div>`
  }

  function renderCoach() {
    renderLiveScore()
    const g = nextGuidance()
    const mode = currentMode()

    if (!g) {
      coachPanel.innerHTML = `
        <div class="coach-card done">
          <div class="coach-step">${icon('check', 13)} Nothing outstanding</div>
          <p class="coach-text">${
            mode.ceiling === 'silent'
              ? 'Exam mode — no guidance is given. Your build is being recorded.'
              : 'This build has everything it needs. Deploy it and watch what happens.'
          }</p>
        </div>`
      return
    }

    const steps = mode.showChecklist ? remainingSteps() : []

    coachPanel.innerHTML = `
      <div class="coach-card depth-${g.depth}">
        <div class="coach-head">
          <span class="coach-tag">NEXT STEP</span>
          <span class="coach-depth">${depthLabel(g.depth)}</span>
        </div>
        <div class="coach-step">${g.step}</div>
        <p class="coach-text">${g.text}</p>
        ${
          steps.length > 1
            ? `<details class="coach-remaining">
                 <summary>${steps.length - 1} more step${steps.length === 2 ? '' : 's'} after this</summary>
                 <ol>${steps.slice(1).map((st) => `<li>${st.step}</li>`).join('')}</ol>
               </details>`
            : ''
        }
      </div>`

    // Highlight the parts the advice is about.
    bench.querySelectorAll('.placed').forEach((n) => n.classList.remove('coached'))
    for (const id of g.highlight) {
      bench.querySelector(`[data-instance="${id}"]`)?.classList.add('coached')
    }
  }

  function depthLabel(d: string) {
    return d === 'instruction' ? 'guided'
      : d === 'pointer' ? 'pointed'
      : d === 'question' ? 'socratic'
      : 'nudge'
  }

  root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => {
    b.addEventListener('click', () => {
      setMode(b.dataset.mode as ModeId)
      root.querySelectorAll('[data-mode]').forEach((x) => x.classList.remove('active'))
      b.classList.add('active')
      sfx.click()
      renderCoach()
    })
  })

  function refreshHistoryButtons() {
    undoButton.disabled = !canUndo()
    redoButton.disabled = !canRedo()
  }

  function applyHistory(ok: boolean) {
    if (!ok) return
    pendingPin = null
    sfx.click()
    renderBench()
    renderPalette()
    refreshHistoryButtons()
  }

  undoButton.addEventListener('click', () => applyHistory(undo()))
  redoButton.addEventListener('click', () => applyHistory(redo()))

  document.addEventListener('keydown', historyKeys)
  function historyKeys(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey)) return
    if (e.key.toLowerCase() !== 'z') return
    e.preventDefault()
    applyHistory(e.shiftKey ? redo() : undo())
  }

  // --- zoom. The bench is a fixed-size canvas inside a scrolling viewport, so
  // a large circuit gets more room rather than more cramped.
  function setZoom(z: number) {
    zoom = clamp(z, 0.4, 1.8)
    bench.style.transform = `scale(${zoom})`
    root.querySelector('#zoomLevel')!.textContent = `${Math.round(zoom * 100)}%`
    requestAnimationFrame(drawWires)
  }
  root.querySelector<HTMLButtonElement>('#zoomIn')!.addEventListener('click', () => setZoom(zoom + 0.15))
  root.querySelector<HTMLButtonElement>('#zoomOut')!.addEventListener('click', () => setZoom(zoom - 0.15))
  root.querySelector<HTMLButtonElement>('#zoomFit')!.addEventListener('click', () => {
    const fit = Math.min(1, (viewport.clientWidth - 24) / bench.offsetWidth)
    setZoom(fit)
    viewport.scrollTo({ top: 0, left: 0 })
  })

  window.addEventListener('resize', drawWires)

  renderPalette()
  refreshHistoryButtons()
  requestAnimationFrame(() => {
    renderBench()
    renderCoach()
  })
}

/**
 * The board, drawn as it is built: four rail strips and two banks of terminal
 * columns split by the centre channel. Every hole is a real, clickable node —
 * plugging into any hole in a column joins you to the other four.
 */
function breadboardHtml(instanceId: string): string {
  const hole = (id: string, cls: string) =>
    `<span class="bb-hole ${cls}" data-pin="${id}" data-instance="${instanceId}"></span>`

  const railRow = (rail: string, cls: string) =>
    `<div class="bb-rail ${cls}">
       <span class="bb-rail-mark">${rail.endsWith('+') ? '+' : '\u2212'}</span>
       ${Array.from({ length: BB_COLUMNS }, (_, c) => hole(railHole(rail as never, c), 'bb-rail-hole')).join('')}
     </div>`

  const strip = (rows: readonly string[]) =>
    rows
      .map(
        (r) =>
          `<div class="bb-row">${Array.from({ length: BB_COLUMNS }, (_, c) =>
            hole(stripHole(r, c), 'bb-strip-hole'),
          ).join('')}</div>`,
      )
      .join('')

  return `
    <div class="bb-board">
      ${railRow(RAILS[0], 'bb-pos')}
      ${railRow(RAILS[1], 'bb-neg')}
      <div class="bb-strip">${strip(UPPER_ROWS)}</div>
      <div class="bb-channel"></div>
      <div class="bb-strip">${strip(LOWER_ROWS)}</div>
      ${railRow(RAILS[2], 'bb-pos')}
      ${railRow(RAILS[3], 'bb-neg')}
    </div>`
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi)
}
