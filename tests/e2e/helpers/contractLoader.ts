/// <reference types="vite/client" />
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HELPERS_DIR = path.dirname(fileURLToPath(import.meta.url))
const CANDIDATE_ROOT = path.resolve(HELPERS_DIR, '..', '..', '..')
const PROJECT_ROOT = fs.existsSync(path.join(CANDIDATE_ROOT, 'package.json'))
  ? CANDIDATE_ROOT
  : process.cwd()
const SRC_ROOT = path.join(PROJECT_ROOT, 'src')

type ModuleLoader = () => Promise<unknown>

let viteGlobModules: Record<string, ModuleLoader> = {}
try {
  viteGlobModules = import.meta.glob('/src/**/*.{ts,tsx,js}')
} catch {
  viteGlobModules = {}
}

const EXTENSION_CANDIDATES = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '/index.ts',
  '/index.tsx',
  '/index.js',
] as const

function normalizeSrcPath(relPath: string): string {
  if (typeof relPath !== 'string' || !relPath.trim()) {
    throw new Error(`Invalid module path: ${String(relPath)}`)
  }
  if (relPath.includes('\0')) {
    throw new Error(`Null byte in module path: ${relPath}`)
  }

  let cleaned = relPath.trim().replace(/\\/g, '/')
  while (cleaned.startsWith('./') || cleaned.startsWith('../') || cleaned.startsWith('/')) {
    if (cleaned.startsWith('./')) cleaned = cleaned.slice(2)
    else if (cleaned.startsWith('../')) cleaned = cleaned.slice(3)
    else cleaned = cleaned.slice(1)
  }

  if (cleaned.startsWith('src/')) {
    cleaned = cleaned.slice(4)
  }

  if (!cleaned || cleaned.split('/').some((seg) => seg === '..' || seg === '.')) {
    throw new Error(`Unsafe relative segment in module path: "${relPath}"`)
  }

  return `src/${cleaned}`
}

const normalizedGlobMap = new Map<string, ModuleLoader>()
for (const [rawKey, loader] of Object.entries(viteGlobModules)) {
  if (typeof loader !== 'function') continue
  try {
    const key = normalizeSrcPath(rawKey)
    normalizedGlobMap.set(key, loader)
  } catch {
    // Ignore non-source keys
  }
}

function toSafeSrcAbsPath(canonicalSrcPath: string): string {
  const absPath = path.resolve(PROJECT_ROOT, canonicalSrcPath)
  const relFromSrc = path.relative(SRC_ROOT, absPath)
  if (!relFromSrc || relFromSrc.startsWith('..') || path.isAbsolute(relFromSrc)) {
    throw new Error(`Path escapes src/: "${canonicalSrcPath}"`)
  }
  return absPath
}

function isRegularFile(absPath: string): boolean {
  try {
    return fs.existsSync(absPath) && fs.statSync(absPath).isFile()
  } catch {
    return false
  }
}

function resolveCandidate(relPath: string): {
  canonical: string
  absPath: string
  globLoader: ModuleLoader | null
} | null {
  const baseCanonical = normalizeSrcPath(relPath)

  for (const ext of EXTENSION_CANDIDATES) {
    if (ext && /\.(?:ts|tsx|js|jsx|mjs|cjs)$/i.test(baseCanonical)) continue
    const candidate = `${baseCanonical}${ext}`
    const absPath = toSafeSrcAbsPath(candidate)
    const globLoader = normalizedGlobMap.get(candidate) ?? null
    if (isRegularFile(absPath)) {
      return { canonical: candidate, absPath, globLoader }
    }
    if (globLoader) {
      // Fallback if glob matched without fs visibility
      return { canonical: candidate, absPath, globLoader }
    }
  }

  return null
}

export function hasSrcModule(relPath: string): boolean {
  return resolveCandidate(relPath) !== null
}

export async function loadSrcModule<T = Record<string, unknown>>(relPath: string): Promise<T | null> {
  const target = resolveCandidate(relPath)
  if (!target) {
    return null
  }

  if (target.globLoader && isRegularFile(target.absPath)) {
    const mod = await target.globLoader()
    return mod as T
  }

  if (isRegularFile(target.absPath)) {
    const mod = await import(/* @vite-ignore */ pathToFileURL(target.absPath).href)
    return mod as T
  }

  if (target.globLoader) {
    const mod = await target.globLoader()
    return mod as T
  }

  return null
}

export async function requireSrcModule<T = Record<string, unknown>>(relPath: string): Promise<T> {
  const normalized = normalizeSrcPath(relPath)
  const expectedAbs = toSafeSrcAbsPath(normalized)
  const mod = await loadSrcModule<T>(relPath)
  if (mod === null) {
    throw new Error(
      `Required SunRoot source module "${normalized}" was not found at "${expectedAbs}". Ensure the corresponding milestone (M1-M6) has created this file.`,
    )
  }
  return mod
}
