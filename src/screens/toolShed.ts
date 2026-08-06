import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  CATALOG_BY_ID,
  partsInCategory,
} from '../hardware/ComponentCatalog'
import type { CatalogPart, Category } from '../hardware/ComponentCatalog'
import {
  addPart,
  canProceed,
  distinctOwned,
  quantityOf,
  remaining,
  removePart,
  spent,
  tray,
} from '../hardware/PartsTray'
import { toast } from '../game/shell'
import { sfx } from '../game/sound'
import { assistant } from '../ai/Assistant'
import { noteAction } from '../learning/ContextBuilder'
import { icon } from '../ui/icons'
import { componentArt } from '../ui/ComponentArt'

let activeCategory: Category = 'controllers'
let searchTerm = ''

export function renderToolShed(root: HTMLElement, onProceed: () => void) {
  root.innerHTML = `
    <div class="screen shed-screen">
      <div class="lab-header">
        <div>
          <h1>Tool Shed</h1>
          <p>Choose your own hardware. Nothing here is required and nothing is recommended —
             read the specs and decide what your design actually needs.</p>
        </div>
        <div class="budget-readout">
          <div class="budget-line"><span>Credits left</span><strong id="budgetLeft">0</strong></div>
          <div class="budget-bar"><div class="budget-fill" id="budgetFill"></div></div>
        </div>
      </div>

      <div class="shed-body">
        <nav class="shed-categories" id="shedCategories" aria-label="Component categories"></nav>

        <div class="shed-main">
          <input id="shedSearch" class="shed-search" type="search"
                 placeholder="Search all ${CATALOG_BY_ID.size} components…" aria-label="Search components">
          <div class="part-grid" id="partGrid"></div>
        </div>

        <aside class="tray-panel">
          <h2>Parts tray</h2>
          <div class="tray-list" id="trayList"></div>
          <div class="tray-footer">
            <div class="tray-total"><span>Spent</span><strong id="traySpent">0</strong></div>
            <button id="shedProceed" class="primary-button">Take to circuit lab</button>
            <p class="tray-note" id="trayNote"></p>
          </div>
        </aside>
      </div>
    </div>
  `

  const grid = root.querySelector<HTMLElement>('#partGrid')!
  const cats = root.querySelector<HTMLElement>('#shedCategories')!
  const trayList = root.querySelector<HTMLElement>('#trayList')!
  const proceed = root.querySelector<HTMLButtonElement>('#shedProceed')!
  const note = root.querySelector<HTMLElement>('#trayNote')!
  const search = root.querySelector<HTMLInputElement>('#shedSearch')!

  // ---- categories --------------------------------------------------------

  function renderCategories() {
    cats.innerHTML = CATEGORY_ORDER.map((c) => {
      const owned = distinctOwned().filter((x) => x.part.category === c).length
      return `
        <button class="cat-item ${c === activeCategory && !searchTerm ? 'active' : ''}" data-cat="${c}">
          <span class="cat-name">${CATEGORY_LABELS[c]}</span>
          <span class="cat-count">${partsInCategory(c).length}</span>
          ${owned ? `<span class="cat-owned">${owned}</span>` : ''}
        </button>
      `
    }).join('')

    cats.querySelectorAll<HTMLButtonElement>('[data-cat]').forEach((b) => {
      b.addEventListener('click', () => {
        activeCategory = b.dataset.cat as Category
        searchTerm = ''
        search.value = ''
        sfx.click()
        renderAll()
      })
    })
  }

  // ---- part grid ---------------------------------------------------------

  function visibleParts(): CatalogPart[] {
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      return [...CATALOG_BY_ID.values()].filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.specs.some((s) => s.toLowerCase().includes(q)),
      )
    }
    return partsInCategory(activeCategory)
  }

  function renderGrid() {
    const parts = visibleParts()
    if (!parts.length) {
      grid.innerHTML = `<p class="empty-note">Nothing matches “${searchTerm}”.</p>`
      return
    }

    grid.innerHTML = parts
      .map((p) => {
        const owned = quantityOf(p.id)
        const affordable = remaining() >= p.cost
        return `
          <article class="part-card ${owned ? 'owned' : ''}" data-part="${p.id}">
            <div class="part-art">${componentArt(p.id, p.category)}</div>
            <header class="part-head">
              <h3>${p.name}</h3>
              <span class="part-cost ${affordable ? '' : 'unaffordable'}">${p.cost}</span>
            </header>
            <p class="part-desc">${p.description}</p>
            <ul class="part-specs">${p.specs.map((s) => `<li>${s}</li>`).join('')}</ul>
            <footer class="part-foot">
              <span class="complexity c${p.complexity}" title="Build complexity">
                ${icon('dot',9).repeat(p.complexity)}${icon('dotOutline',9).repeat(3 - p.complexity)}
              </span>
              ${owned ? `<span class="owned-badge">${owned} in tray</span>` : ''}
              <button class="add-button" data-add="${p.id}" ${affordable ? '' : 'disabled'}>
                ${owned && !p.stackable ? 'Added' : 'Add'}
              </button>
            </footer>
          </article>
        `
      })
      .join('')

    grid.querySelectorAll<HTMLButtonElement>('[data-add]').forEach((b) => {
      b.addEventListener('click', () => {
        const res = addPart(b.dataset.add!)
        if (res.ok) {
          noteAction(`bought ${CATALOG_BY_ID.get(b.dataset.add!)?.name}`)
          sfx.install()
        } else {
          toast(res.reason, 'info')
          sfx.error()
        }
        renderAll()
      })
    })
  }

  // ---- tray --------------------------------------------------------------

  function renderTray() {
    const lines = distinctOwned()
    trayList.innerHTML = lines.length
      ? lines
          .map(
            ({ part, quantity }) => `
        <div class="tray-line">
          <span class="tray-qty">${quantity}&times;</span>
          <span class="tray-name">${part.name}</span>
          <span class="tray-cost">${part.cost * quantity}</span>
          <button class="tray-remove" data-remove="${part.id}" aria-label="Remove one ${part.name}">${icon('minus', 12)}</button>
        </div>`,
          )
          .join('')
      : '<p class="empty-note">Your tray is empty. Browse the categories and pick what you think you need.</p>'

    trayList.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach((b) => {
      b.addEventListener('click', () => {
        removePart(b.dataset.remove!)
        sfx.click()
        renderAll()
      })
    })

    root.querySelector('#traySpent')!.textContent = String(spent())
    root.querySelector('#budgetLeft')!.textContent = String(remaining())

    const pct = Math.min(100, (spent() / tray.budget) * 100)
    const fill = root.querySelector<HTMLElement>('#budgetFill')!
    fill.style.width = `${pct}%`
    fill.classList.toggle('tight', pct > 85)

    const gate = canProceed()
    proceed.disabled = !gate.ok
    note.textContent = gate.ok
      ? 'Anything you did not buy will not exist on the bench. There is no required parts list.'
      : (gate.reason ?? '')
  }

  function renderAll() {
    renderCategories()
    renderGrid()
    renderTray()
  }

  // ---- wiring ------------------------------------------------------------

  search.addEventListener('input', () => {
    searchTerm = search.value.trim()
    renderGrid()
    renderCategories()
  })

  proceed.addEventListener('click', () => {
    if (!canProceed().ok) return
    sfx.deploy()
    assistant.show(
      'Those are your parts. Whatever you did not bring, you will not have on the bench.',
      'thinking',
    )
    onProceed()
  })

  renderAll()
}
