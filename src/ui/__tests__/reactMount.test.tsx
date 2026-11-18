import { act, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mountReactIsland, unmountActiveScreenIsland } from '../reactMount'

describe('reactMount lifecycle', () => {
  it('mounts, updates in place on the same container, and unmounts via cleanup', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    let unmount!: () => void
    act(() => {
      unmount = mountReactIsland(container, <div data-testid="island">First</div>)
    })
    expect(screen.getByTestId('island')).toHaveTextContent('First')

    act(() => {
      mountReactIsland(container, <div data-testid="island">Second</div>)
    })
    expect(screen.getByTestId('island')).toHaveTextContent('Second')

    act(() => {
      unmount()
    })
    expect(container.innerHTML).toBe('')
  })

  it('unmounts #view, .login-screen, and detached islands while preserving document.body modals', () => {
    const view = document.createElement('div')
    view.id = 'view'
    const viewChild = document.createElement('div')
    view.appendChild(viewChild)

    const login = document.createElement('div')
    login.className = 'login-screen'

    const detached = document.createElement('div')
    const modal = document.createElement('div')
    modal.id = 'stuck-modal-portal'

    document.body.appendChild(view)
    document.body.appendChild(login)
    document.body.appendChild(modal)

    act(() => {
      mountReactIsland(viewChild, <span>Inside View</span>)
      mountReactIsland(login, <span>Login Island</span>)
      mountReactIsland(detached, <span>Detached Island</span>)
      mountReactIsland(modal, <span>Global Modal</span>)
    })

    expect(screen.getByText('Inside View')).toBeInTheDocument()
    expect(screen.getByText('Login Island')).toBeInTheDocument()
    expect(screen.getByText('Global Modal')).toBeInTheDocument()

    act(() => {
      unmountActiveScreenIsland()
    })

    expect(screen.queryByText('Inside View')).not.toBeInTheDocument()
    expect(screen.queryByText('Login Island')).not.toBeInTheDocument()
    expect(detached.innerHTML).toBe('')
    expect(screen.getByText('Global Modal')).toBeInTheDocument()

    act(() => {
      mountReactIsland(modal, <span>Updated Modal</span>)
    })
    expect(screen.getByText('Updated Modal')).toBeInTheDocument()
  })
})
