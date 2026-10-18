#!/usr/bin/env node
/**
 * Workbench collection verifier.
 *
 * Each plugin stays an independent DSH bundle package; this script only checks
 * that the collection manifest, package metadata, JS syntax, JSON and icons are
 * all still valid before a commit.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(root, 'plugins.json')

let checks = 0
let failures = 0

function check(ok, label, detail = '') {
  checks += 1
  if (!ok) failures += 1
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
}

function walk(directory, found = []) {
  for (const name of readdirSync(directory)) {
    if (name === '.git' || name === 'node_modules') continue
    const path = join(directory, name)
    const info = statSync(path)
    if (info.isDirectory()) walk(path, found)
    else found.push(path)
  }
  return found
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

console.log(`\nWorkbench verify: ${relative(process.cwd(), root) || '.'}\n`)

if (!existsSync(manifestPath)) {
  check(false, 'plugins.json', 'missing')
  process.exit(1)
}

const manifest = readJson(manifestPath)
check(manifest.collection === 'dsh-workbetch-aerc-style', 'manifest collection', manifest.collection)
check(Array.isArray(manifest.plugins) && manifest.plugins.length > 0, 'manifest plugins')
check(manifest.plugins.length === 3, 'manifest plugin count', String(manifest.plugins.length))

for (const plugin of manifest.plugins) {
  const directory = join(root, plugin.path)
  const packageFile = join(directory, 'package.json')
  const label = plugin.id

  console.log(`\n[${label}]`)
  check(existsSync(directory), `${label} directory`)
  check(existsSync(packageFile), `${label} package.json`)
  if (!existsSync(packageFile)) continue

  let pkg
  try {
    pkg = readJson(packageFile)
    check(true, `${label} package.json parses`)
  } catch (error) {
    check(false, `${label} package.json parses`, error.message)
    continue
  }

  check(pkg.name === plugin.id, `${label} package name`, pkg.name)
  check(typeof pkg.version === 'string' && pkg.version.length > 0, `${label} package version`, pkg.version)
  check(existsSync(join(directory, 'README.md')), `${label} README`)

  if (plugin.install === 'bundle') {
    const patch = pkg.dsh?.bundle?.patch
    check(typeof patch === 'string' && existsSync(join(directory, patch)), `${label} bundle patch`, patch)
  } else {
    const host = pkg.main || pkg.exports?.['.']
    const hostPath = typeof host === 'string' ? host : host?.default
    check(typeof hostPath === 'string' && existsSync(join(directory, hostPath)), `${label} host entry`, hostPath)
  }

  if (pkg.dsh?.client) {
    const client = pkg.exports?.['./client']
    const clientPath = typeof client === 'string' ? client : client?.default
    check(typeof clientPath === 'string' && existsSync(join(directory, clientPath)), `${label} client export`, clientPath)
  }

  const localeFiles = walk(directory).filter((file) => /\/locale\/[^/]+\.json$/.test(file))
  for (const file of localeFiles) {
    try {
      const dict = readJson(file)
      const title = dict?.meta?.title
      const description = dict?.meta?.description
      check(
        typeof title === 'string' && title.length > 0 && typeof description === 'string' && description.length > 0,
        `${label} locale meta ${relative(directory, file)}`,
      )
    } catch (error) {
      check(false, `${label} locale parses ${relative(directory, file)}`, error.message)
    }
  }

  const icon = pkg.icon ? join(directory, pkg.icon) : join(directory, 'icon.svg')
  if (existsSync(icon)) {
    const svg = readFileSync(icon, 'utf8').trim()
    check(svg.startsWith('<svg') && svg.endsWith('</svg>'), `${label} icon SVG`, relative(directory, icon))
  }

  let jsCount = 0
  for (const file of walk(directory)) {
    if (!/\.(?:mjs|cjs|js)$/.test(file)) continue
    jsCount += 1
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
      check(true, `${label} syntax ${relative(directory, file)}`)
    } catch (error) {
      const text = String(error.stderr || error.stdout || error.message)
      check(false, `${label} syntax ${relative(directory, file)}`, text.split('\n').find(Boolean) || 'syntax error')
    }
  }
  check(jsCount > 0, `${label} JavaScript files`, String(jsCount))

  for (const file of walk(directory)) {
    if (!file.endsWith('.json')) continue
    try {
      readJson(file)
      check(true, `${label} JSON ${relative(directory, file)}`)
    } catch (error) {
      check(false, `${label} JSON ${relative(directory, file)}`, error.message)
    }
  }
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${checks - failures}/${checks} checks passed.\n`)
process.exit(failures === 0 ? 0 : 1)
