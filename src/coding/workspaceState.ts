let savedWorkspace: Record<string, unknown> | null = null

export function getSavedWorkspace(): Record<string, unknown> | null {
  return savedWorkspace
}

export function setSavedWorkspace(state: Record<string, unknown> | null): void {
  savedWorkspace = state
}
