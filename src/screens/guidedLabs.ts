import { createElement } from 'react'
import { mountReactIsland } from '../ui/reactMount'

export interface GuidedLabsNav {
  toCoding?: () => void
  toDashboard?: () => void
}

export function renderGuidedLabs(host: HTMLElement, nav: GuidedLabsNav = {}): void {
  mountReactIsland(
    host,
    createElement(
      'section',
      { className: 'screen', 'aria-labelledby': 'guided-labs-heading' },
      createElement('h1', { id: 'guided-labs-heading' }, 'Maker-Studio Guided Labs'),
      createElement(
        'p',
        null,
        'Interactive cyber-physical labs with 3D digital twin previews, step-by-step wiring, and check-questions.',
      ),
      createElement(
        'div',
        { style: { display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' } },
        nav.toCoding
          ? createElement(
              'button',
              { type: 'button', className: 'primary-button', onClick: nav.toCoding },
              'Open Coding Lab',
            )
          : null,
        nav.toDashboard
          ? createElement(
              'button',
              { type: 'button', className: 'ghost-button', onClick: nav.toDashboard },
              'Back to Dashboard',
            )
          : null,
      ),
    ),
  )
}
