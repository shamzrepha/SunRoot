import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HELPERS_DIR = path.dirname(fileURLToPath(import.meta.url))
const CANDIDATE_ROOT = path.resolve(HELPERS_DIR, '..', '..', '..')
const PROJECT_ROOT = fs.existsSync(path.join(CANDIDATE_ROOT, 'package.json'))
  ? CANDIDATE_ROOT
  : process.cwd()

const SKIP_DIRS = new Set(['node_modules', '.git'])

export interface ListFilesOptions {
  recursive?: boolean
  extensions?: string[]
}

export interface DistChunkInfo {
  path: string
  fileName: string
  bytes: number
  isEntry: boolean
  isPreloaded: boolean
  isInitial: boolean
  isLazy: boolean
  staticImports: string[]
  dynamicImports: string[]
  libraries: {
    blockly: boolean
    three: boolean
    react: boolean
  }
}

export interface LibraryChunkSummary {
  detected: boolean
  inEntry: boolean
  inInitial: boolean
  chunks: string[]
  initialChunks: string[]
  lazyChunks: string[]
}

export interface DistInspectionReport {
  distExists: boolean
  indexHtmlExists: boolean
  entryScripts: string[]
  modulePreloads: string[]
  stylesheets: string[]
  initialChunks: string[]
  lazyChunks: string[]
  allJsChunks: string[]
  chunks: DistChunkInfo[]
  libraries: {
    blockly: LibraryChunkSummary
    three: LibraryChunkSummary
    react: LibraryChunkSummary
  }
}

export function getProjectRoot(): string {
  return PROJECT_ROOT
}

function resolveProjectPathInternal(relPath: string, allowRoot: boolean): string {
  if (typeof relPath !== 'string') {
    throw new Error(`Invalid project path: ${String(relPath)}`)
  }
  if (relPath.includes('\0')) {
    throw new Error(`Null byte in project path: ${relPath}`)
  }

  const trimmed = relPath.trim()
  if (!trimmed) {
    if (allowRoot) return PROJECT_ROOT
    throw new Error('Project relative path must not be empty.')
  }

  if (
    path.isAbsolute(trimmed) ||
    /^[a-zA-Z]:/.test(trimmed) ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('\\')
  ) {
    throw new Error(`Absolute paths are not allowed: "${relPath}"`)
  }

  const resolved = path.resolve(PROJECT_ROOT, trimmed)
  const rel = path.relative(PROJECT_ROOT, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel) || (!allowRoot && rel === '')) {
    throw new Error(`Path escapes project root: "${relPath}"`)
  }

  if (fs.existsSync(resolved)) {
    const realRoot = fs.realpathSync(PROJECT_ROOT)
    const realTarget = fs.realpathSync(resolved)
    const realRel = path.relative(realRoot, realTarget)
    if (realRel.startsWith('..') || path.isAbsolute(realRel)) {
      throw new Error(`Symlink escapes project root: "${relPath}"`)
    }
  }

  return resolved
}

export function resolveProjectPath(relPath: string): string {
  return resolveProjectPathInternal(relPath, false)
}

export function fileExists(relPath: string): boolean {
  try {
    const absPath = resolveProjectPathInternal(relPath, false)
    return fs.existsSync(absPath)
  } catch {
    return false
  }
}

export function readProjectText(relPath: string): string {
  const absPath = resolveProjectPath(relPath)
  if (!fs.existsSync(absPath)) {
    throw new Error(`Project file does not exist: "${relPath}" (${absPath})`)
  }
  if (!fs.statSync(absPath).isFile()) {
    throw new Error(`Project path is not a file: "${relPath}" (${absPath})`)
  }
  return fs.readFileSync(absPath, 'utf8')
}

export function readProjectJson<T = unknown>(relPath: string): T {
  const raw = readProjectText(relPath)
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to parse JSON in "${relPath}": ${detail}`)
  }
}

export function listFiles(relDir: string, options: ListFilesOptions = {}): string[] {
  const recursive = options.recursive ?? true
  const normalizedExts = options.extensions
    ? new Set(
        options.extensions.map((ext) => {
          const lower = ext.toLowerCase()
          return lower.startsWith('.') ? lower : `.${lower}`
        }),
      )
    : null

  const trimmedDir = relDir.trim()
  const allowRoot =
    trimmedDir === '' || trimmedDir === '.' || trimmedDir === './' || trimmedDir === '.\\'
  const startAbs = resolveProjectPathInternal(relDir, allowRoot)
  if (!fs.existsSync(startAbs) || !fs.statSync(startAbs).isDirectory()) {
    return []
  }

  const results: string[] = []
  const walk = (currentDir: string) => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue
      const absEntry = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        if (recursive) walk(absEntry)
      } else if (entry.isFile()) {
        if (normalizedExts && !normalizedExts.has(path.extname(entry.name).toLowerCase())) {
          continue
        }
        results.push(path.relative(PROJECT_ROOT, absEntry).replace(/\\/g, '/'))
      }
    }
  }

  walk(startAbs)
  return results.sort((a, b) => a.localeCompare(b))
}

function normalizeDistAssetRef(ref: string): string {
  let clean = ref.trim().split('?')[0]?.split('#')[0] ?? ''
  if (clean.startsWith('./')) clean = clean.slice(2)
  if (clean.startsWith('/')) clean = clean.slice(1)
  return clean
}

function resolveChunkImport(fromChunkRel: string, specifier: string): string {
  const baseDir = path.posix.dirname(fromChunkRel)
  return path.posix.normalize(path.posix.join(baseDir, specifier))
}

function extractTagAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const attrRe = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let match: RegExpExecArray | null
  while ((match = attrRe.exec(tag)) !== null) {
    const name = match[1]?.toLowerCase()
    if (!name) continue
    const val = match[2] ?? match[3] ?? match[4] ?? ''
    attrs[name] = val
  }
  return attrs
}

function parseIndexHtmlRefs(html: string): {
  entryScripts: string[]
  modulePreloads: string[]
  stylesheets: string[]
} {
  const entryScripts: string[] = []
  const modulePreloads: string[] = []
  const stylesheets: string[] = []

  const scriptRe = /<script\b[^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = scriptRe.exec(html)) !== null) {
    const attrs = extractTagAttributes(match[0])
    if (attrs.type?.toLowerCase() === 'module' && attrs.src) {
      entryScripts.push(normalizeDistAssetRef(attrs.src))
    }
  }

  const linkRe = /<link\b[^>]*>/gi
  while ((match = linkRe.exec(html)) !== null) {
    const attrs = extractTagAttributes(match[0])
    const rel = attrs.rel?.toLowerCase().split(/\s+/) ?? []
    if (attrs.href) {
      if (rel.includes('modulepreload')) {
        modulePreloads.push(normalizeDistAssetRef(attrs.href))
      } else if (rel.includes('stylesheet')) {
        stylesheets.push(normalizeDistAssetRef(attrs.href))
      }
    }
  }

  return {
    entryScripts: Array.from(new Set(entryScripts)),
    modulePreloads: Array.from(new Set(modulePreloads)),
    stylesheets: Array.from(new Set(stylesheets)),
  }
}

function extractChunkImports(chunkRel: string, content: string): {
  staticImports: string[]
  dynamicImports: string[]
} {
  const staticSet = new Set<string>()
  const dynamicSet = new Set<string>()

  const staticRe = /\bimport\s*(?:[^'"`();]*?\bfrom\s*)?['"](\.{1,2}\/[^'"]+\.m?js)['"]/g
  let match: RegExpExecArray | null
  while ((match = staticRe.exec(content)) !== null) {
    if (match[1]) staticSet.add(resolveChunkImport(chunkRel, match[1]))
  }

  const exportFromRe =
    /\bexport\s*(?:\*(?:\s*as\s+[\w$]+)?|\{[^'"`();]*\})\s*\bfrom\s*['"](\.{1,2}\/[^'"]+\.m?js)['"]/g
  while ((match = exportFromRe.exec(content)) !== null) {
    if (match[1]) staticSet.add(resolveChunkImport(chunkRel, match[1]))
  }

  const dynamicRe = /\bimport\s*\(\s*['"`](\.{1,2}\/[^'"`]+\.m?js)['"`]\s*\)/g
  while ((match = dynamicRe.exec(content)) !== null) {
    if (match[1]) dynamicSet.add(resolveChunkImport(chunkRel, match[1]))
  }

  return {
    staticImports: Array.from(staticSet).sort((a, b) => a.localeCompare(b)),
    dynamicImports: Array.from(dynamicSet).sort((a, b) => a.localeCompare(b)),
  }
}

function detectChunkLibraries(fileName: string, content: string): {
  blockly: boolean
  three: boolean
  react: boolean
} {
  const blockly =
    /blockly/i.test(fileName) ||
    /\bBlockSvg\b|\bWorkspaceSvg\b|blocklyMainBackground|blocklyToolboxDiv/.test(content)

  const three =
    /(?:^|[-_])three(?:[-_.]|$)/i.test(fileName) ||
    /\bWebGLRenderer\b|\bPerspectiveCamera\b|\bMeshStandardMaterial\b|\bBoxGeometry\b|THREE\.REVISION/.test(
      content,
    )

  const react =
    /(?:^|[-_])react(?:[-_.]|$)/i.test(fileName) ||
    /react\.transitional\.element|react\.element|__REACT_DEVTOOLS_GLOBAL_HOOK__|react-dom\/client/.test(
      content,
    )

  return { blockly, three, react }
}

function buildLibrarySummary(
  key: 'blockly' | 'three' | 'react',
  chunks: DistChunkInfo[],
): LibraryChunkSummary {
  const matched = chunks.filter((c) => c.libraries[key])
  return {
    detected: matched.length > 0,
    inEntry: matched.some((c) => c.isEntry),
    inInitial: matched.some((c) => c.isInitial),
    chunks: matched.map((c) => c.path),
    initialChunks: matched.filter((c) => c.isInitial).map((c) => c.path),
    lazyChunks: matched.filter((c) => c.isLazy).map((c) => c.path),
  }
}

export function inspectDistChunks(): DistInspectionReport {
  const distExists = fileExists('dist')
  const indexHtmlExists = fileExists('dist/index.html')

  if (!distExists || !indexHtmlExists) {
    const emptyLib: LibraryChunkSummary = {
      detected: false,
      inEntry: false,
      inInitial: false,
      chunks: [],
      initialChunks: [],
      lazyChunks: [],
    }
    return {
      distExists,
      indexHtmlExists,
      entryScripts: [],
      modulePreloads: [],
      stylesheets: [],
      initialChunks: [],
      lazyChunks: [],
      allJsChunks: [],
      chunks: [],
      libraries: {
        blockly: { ...emptyLib },
        three: { ...emptyLib },
        react: { ...emptyLib },
      },
    }
  }

  const indexHtml = readProjectText('dist/index.html')
  const { entryScripts, modulePreloads, stylesheets } = parseIndexHtmlRefs(indexHtml)

  const assetJsFiles = listFiles('dist/assets', { recursive: true, extensions: ['.js', '.mjs'] })
  const allJsChunks = assetJsFiles.map((p) => p.replace(/^dist\//, ''))
  const allJsSet = new Set(allJsChunks)

  const rawByChunk = new Map<
    string,
    {
      bytes: number
      staticImports: string[]
      dynamicImports: string[]
      libraries: { blockly: boolean; three: boolean; react: boolean }
    }
  >()

  for (const chunkRel of allJsChunks) {
    const fullRel = `dist/${chunkRel}`
    const content = readProjectText(fullRel)
    const bytes = fs.statSync(resolveProjectPath(fullRel)).size
    const { staticImports, dynamicImports } = extractChunkImports(chunkRel, content)
    const fileName = path.posix.basename(chunkRel)
    rawByChunk.set(chunkRel, {
      bytes,
      staticImports,
      dynamicImports,
      libraries: detectChunkLibraries(fileName, content),
    })
  }

  const entrySet = new Set(entryScripts)
  const preloadSet = new Set(modulePreloads)
  const initialSet = new Set<string>()
  const queue: string[] = [...entryScripts, ...modulePreloads]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (initialSet.has(current)) continue
    if (!allJsSet.has(current)) continue
    initialSet.add(current)
    const info = rawByChunk.get(current)
    if (info) {
      for (const dep of info.staticImports) {
        if (!initialSet.has(dep) && allJsSet.has(dep)) {
          queue.push(dep)
        }
      }
    }
  }

  const initialChunks = allJsChunks.filter((c) => initialSet.has(c))
  const lazyChunks = allJsChunks.filter((c) => !initialSet.has(c))

  const chunks: DistChunkInfo[] = allJsChunks.map((chunkRel) => {
    const info = rawByChunk.get(chunkRel)!
    const isInitial = initialSet.has(chunkRel)
    return {
      path: chunkRel,
      fileName: path.posix.basename(chunkRel),
      bytes: info.bytes,
      isEntry: entrySet.has(chunkRel),
      isPreloaded: preloadSet.has(chunkRel),
      isInitial,
      isLazy: !isInitial,
      staticImports: info.staticImports,
      dynamicImports: info.dynamicImports,
      libraries: info.libraries,
    }
  })

  return {
    distExists: true,
    indexHtmlExists: true,
    entryScripts,
    modulePreloads,
    stylesheets,
    initialChunks,
    lazyChunks,
    allJsChunks,
    chunks,
    libraries: {
      blockly: buildLibrarySummary('blockly', chunks),
      three: buildLibrarySummary('three', chunks),
      react: buildLibrarySummary('react', chunks),
    },
  }
}
