export interface AxeViolationNode {
  html: string
  target: string[]
  failureSummary?: string
}

export interface AxeViolation {
  id: string
  impact?: string | null
  description: string
  help: string
  helpUrl: string
  tags: string[]
  nodes: AxeViolationNode[]
}

export interface AxeAuditResult {
  violations: AxeViolation[]
  criticalOrSerious: AxeViolation[]
}

type AxeRunner = {
  run: (
    context: Element | Document,
    options?: Record<string, unknown>,
  ) => Promise<{ violations?: AxeViolation[] }>
}

const AXE_CORE_PKG = 'axe-core'
const NODE_MODULE_PKG = 'node:module'
let loadedAxeView: unknown = null

async function tryImportAxe(
  view: unknown,
): Promise<{ runner: AxeRunner | null; error: unknown }> {
  try {
    const mod = (await import(/* @vite-ignore */ AXE_CORE_PKG)) as Record<string, unknown>
    const candidate = (mod.default ?? mod) as Partial<AxeRunner>
    if (typeof candidate?.run === 'function') {
      loadedAxeView = view ?? loadedAxeView
      return { runner: candidate as AxeRunner, error: null }
    }
    return { runner: null, error: null }
  } catch (err) {
    return { runner: null, error: err }
  }
}

async function tryRequireAxe(
  view: unknown,
  bustCacheOnViewChange: boolean,
): Promise<{ runner: AxeRunner | null; error: unknown }> {
  try {
    const nodeModule = (await import(/* @vite-ignore */ NODE_MODULE_PKG)) as {
      createRequire?: (url: string) => NodeRequireLike
    }
    if (typeof nodeModule.createRequire === 'function') {
      const req = nodeModule.createRequire(import.meta.url)
      const resolved = req.resolve(AXE_CORE_PKG)
      if (bustCacheOnViewChange && view && loadedAxeView !== view && req.cache) {
        delete req.cache[resolved]
      }
      const candidate = req(resolved) as Partial<AxeRunner>
      if (typeof candidate?.run === 'function') {
        loadedAxeView = view ?? loadedAxeView
        return { runner: candidate as AxeRunner, error: null }
      }
    }
    return { runner: null, error: null }
  } catch (err) {
    return { runner: null, error: err }
  }
}

type NodeRequireLike = {
  (id: string): unknown
  resolve: (id: string) => string
  cache?: Record<string, unknown>
}

async function loadAxeCore(view: unknown): Promise<AxeRunner> {
  const inVitest = typeof process !== 'undefined' && Boolean(process.env?.VITEST)
  const preferFreshRequire = !inVitest && Boolean(view)

  if (preferFreshRequire) {
    const reqRes = await tryRequireAxe(view, true)
    if (reqRes.runner) return reqRes.runner

    const impRes = await tryImportAxe(view)
    if (impRes.runner) return impRes.runner

    const detail =
      reqRes.error instanceof Error
        ? reqRes.error.message
        : impRes.error instanceof Error
          ? impRes.error.message
          : String(reqRes.error ?? impRes.error ?? 'not found')
    throw new Error(
      `Missing required dependency "axe-core" in runAxeAudit(): install "axe-core" before running accessibility audits. (${detail})`,
    )
  }

  const impRes = await tryImportAxe(view)
  if (impRes.runner) return impRes.runner

  const reqRes = await tryRequireAxe(view, false)
  if (reqRes.runner) return reqRes.runner

  const detail =
    impRes.error instanceof Error
      ? impRes.error.message
      : reqRes.error instanceof Error
        ? reqRes.error.message
        : String(impRes.error ?? reqRes.error ?? 'not found')
  throw new Error(
    `Missing required dependency "axe-core" in runAxeAudit(): install "axe-core" before running accessibility audits. (${detail})`,
  )
}

export async function runAxeAudit(
  container: Element | Document,
  options?: Record<string, unknown>,
): Promise<AxeAuditResult> {
  if (!container || typeof (container as { nodeType?: unknown }).nodeType !== 'number') {
    throw new Error('runAxeAudit() requires a valid DOM Element or Document container.')
  }

  const doc =
    (container as { nodeType: number; ownerDocument?: Document | null }).nodeType === 9
      ? (container as Document)
      : (container as Element).ownerDocument
  const view = doc?.defaultView ?? null
  const g = globalThis as Record<string, unknown>
  const hadWindow = 'window' in g
  const hadDocument = 'document' in g
  let patchedWindow = false
  let patchedDocument = false

  if (!hadWindow && view) {
    g.window = view
    patchedWindow = true
  }
  if (!hadDocument && doc) {
    g.document = doc
    patchedDocument = true
  }

  try {
    const axe = await loadAxeCore(view ?? (g.window ?? null))
    const target =
      (container as { nodeType: number }).nodeType === 9 &&
      !hadWindow &&
      (container as Document).documentElement
        ? (container as Document).documentElement
        : container
    const results = await axe.run(target, options ?? {})
    const violations = Array.isArray(results?.violations) ? results.violations : []
    const criticalOrSerious = violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    )

    return {
      violations,
      criticalOrSerious,
    }
  } finally {
    if (patchedWindow) {
      delete g.window
    }
    if (patchedDocument) {
      delete g.document
    }
  }
}
