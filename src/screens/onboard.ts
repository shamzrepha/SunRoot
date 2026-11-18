import { createElement } from 'react'
import { mountReactIsland } from '../ui/reactMount'

export interface OnboardNav {
  toGuidedLabs?: () => void
  toWorkshop?: () => void
  toDashboard?: () => void
}

export function renderOnboard(host: HTMLElement, nav: OnboardNav = {}): void {
  mountReactIsland(
    host,
    createElement(
      'section',
      { className: 'screen', 'aria-labelledby': 'onboard-heading' },
      createElement('h1', { id: 'onboard-heading' }, 'Start Learning'),
      createElement(
        'p',
        null,
        'Choose a guided Maker-Studio lab or enter your topic to launch a SunRoot learning path.',
      ),
      createElement(
        'div',
        { style: { display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' } },
        nav.toGuidedLabs
          ? createElement(
              'button',
              { type: 'button', className: 'primary-button', onClick: nav.toGuidedLabs },
              'Open Guided Labs',
            )
          : null,
        nav.toWorkshop
          ? createElement(
              'button',
              { type: 'button', className: 'ghost-button', onClick: nav.toWorkshop },
              'Open Workshop',
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
