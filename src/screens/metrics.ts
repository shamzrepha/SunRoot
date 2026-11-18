import { createElement } from 'react'
import { mountReactIsland } from '../ui/reactMount'

export function renderMetrics(host: HTMLElement): void {
  mountReactIsland(
    host,
    createElement(
      'section',
      { className: 'screen', 'aria-labelledby': 'metrics-heading' },
      createElement('h1', { id: 'metrics-heading' }, 'KPI & AI Cost Metrics'),
      createElement(
        'p',
        null,
        'North-Star KPI tracking (verified learning, retention, lab completion, cost per learner) and AI cache/model telemetry.',
      ),
    ),
  )
}
