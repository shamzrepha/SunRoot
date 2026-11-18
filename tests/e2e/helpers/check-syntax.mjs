#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const E2E_DIR = path.resolve(__dirname, '..')
const PROJECT_ROOT = path.resolve(E2E_DIR, '..', '..')

const CHECKED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs'])
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist'])

function collectSourceFiles(dir) {
  const results = []
  if (!fs.existsSync(dir)) return results

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(fullPath))
    } else if (entry.isFile() && CHECKED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath)
    }
  }
  return results.sort((a, b) => a.localeCompare(b))
}

function checkFileSyntax(absPath) {
  const source = fs.readFileSync(absPath, 'utf8')
  const result = ts.transpileModule(source, {
    fileName: absPath,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      allowJs: true,
      isolatedModules: false,
    },
  })

  const diagnostics = result.diagnostics ?? []
  return diagnostics.map((diag) => {
    const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n')
    if (diag.file && typeof diag.start === 'number') {
      const { line, character } = diag.file.getLineAndCharacterOfPosition(diag.start)
      return {
        file: path.relative(PROJECT_ROOT, absPath).replace(/\\/g, '/'),
        line: line + 1,
        column: character + 1,
        code: diag.code,
        message,
      }
    }
    return {
      file: path.relative(PROJECT_ROOT, absPath).replace(/\\/g, '/'),
      line: 1,
      column: 1,
      code: diag.code,
      message,
    }
  })
}

function inspectVitestReadiness() {
  const require = createRequire(import.meta.url)
  let vitestInstalled = false
  let vitestVersion = null
  try {
    const pkgPath = require.resolve('vitest/package.json')
    const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    vitestInstalled = true
    vitestVersion = typeof pkgJson.version === 'string' ? pkgJson.version : null
  } catch {
    vitestInstalled = false
  }

  const configCandidates = [
    'vitest.config.ts',
    'vitest.config.mts',
    'vitest.config.js',
    'vitest.config.mjs',
  ]
  const vitestConfig =
    configCandidates.find((name) => fs.existsSync(path.join(PROJECT_ROOT, name))) ?? null

  let testScript = null
  const rootPkgPath = path.join(PROJECT_ROOT, 'package.json')
  if (fs.existsSync(rootPkgPath)) {
    try {
      const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'))
      if (typeof rootPkg?.scripts?.test === 'string') {
        testScript = rootPkg.scripts.test
      }
    } catch {
      testScript = null
    }
  }

  return {
    vitestInstalled,
    vitestVersion,
    vitestConfig,
    testScript,
    ready: vitestInstalled && vitestConfig !== null,
  }
}

export function runSyntaxCheck(options = {}) {
  const requireVitest = Boolean(options.requireVitest)
  const files = collectSourceFiles(E2E_DIR)
  const errors = []

  if (files.length === 0) {
    errors.push({
      file: path.relative(PROJECT_ROOT, E2E_DIR).replace(/\\/g, '/') || 'tests/e2e',
      line: 1,
      column: 1,
      code: 0,
      message: 'No .ts, .tsx, .js, or .mjs files found under tests/e2e.',
    })
  } else {
    for (const filePath of files) {
      errors.push(...checkFileSyntax(filePath))
    }
  }

  const vitest = inspectVitestReadiness()
  const ok = errors.length === 0 && (!requireVitest || vitest.ready)

  return {
    ok,
    projectRoot: PROJECT_ROOT,
    e2eDir: E2E_DIR,
    checkedCount: files.length,
    files: files.map((f) => path.relative(PROJECT_ROOT, f).replace(/\\/g, '/')),
    errors,
    vitest,
  }
}

function main() {
  const args = new Set(process.argv.slice(2))
  const jsonMode = args.has('--json')
  const requireVitest = args.has('--require-vitest')
  const report = runSyntaxCheck({ requireVitest })

  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } else {
    if (report.errors.length > 0) {
      for (const err of report.errors) {
        process.stderr.write(`${err.file}:${err.line}:${err.column} - error TS${err.code}: ${err.message}\n`)
      }
    }
    const vitestStatus = report.vitest.vitestInstalled
      ? `v${report.vitest.vitestVersion ?? 'unknown'} (${report.vitest.vitestConfig ?? 'no vitest.config.*'})`
      : 'not installed'
    process.stdout.write(
      `[check-syntax] Checked ${report.checkedCount} file(s) under tests/e2e | errors=${report.errors.length} | vitest=${vitestStatus}\n`,
    )
    if (requireVitest && !report.vitest.ready) {
      process.stderr.write(
        '[check-syntax] --require-vitest failed: vitest or vitest.config.* is missing.\n',
      )
    }
  }

  if (!report.ok) {
    process.exitCode = 1
  }
}

const isDirectExecution =
  typeof process.argv[1] === 'string' && path.resolve(process.argv[1]) === __filename
if (isDirectExecution) {
  main()
}
