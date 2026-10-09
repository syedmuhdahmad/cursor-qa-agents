#!/usr/bin/env node
// Installs the kit into an existing app. It performs the steps under
// "Add it to your app" in README.md:
//
//   1. Copy the paths in the README's copy list into the app.
//   2. Add the README's dev dependencies and the four test:* scripts to the
//      app's package.json.
//   3. Add the lines of the kit's .gitignore that the app's .gitignore lacks.
//
// Usage:
//
//   node scripts/install-into.mjs <app-dir> [--dry-run] [--force]
//
//   --dry-run  Print what would change. Write nothing.
//   --force    Replace files, dependency ranges, and scripts that the app
//              already has with the kit's. Without it they are left alone
//              and listed.
//
// The copy list and the dev dependency list are read from the two fenced
// blocks in README.md that follow the marker comments below. The README is
// the only place those lists are kept, so a path or package missing from the
// README is also missing from every install this script performs.
//
// It never deletes anything in the app and never runs `npm install`.
// Node built-ins only.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

// The repository this script sits in.
export const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const COPY_MARKER = '<!-- install:copy -->'
export const DEV_DEPENDENCIES_MARKER = '<!-- install:dev-dependencies -->'

// "The four test:* scripts" in the README.
export const TEST_SCRIPTS = ['test:unit', 'test:integration', 'test:e2e', 'test:e2e:list']

// Generated files that may sit inside a copied folder. They are never copied.
const NEVER_COPIED = new Set(['node_modules', '__pycache__', '.pytest_cache', '.DS_Store'])

const GITIGNORE_HEADING = '# Added with the Cursor QA agent kit'

const USAGE = `Usage: node scripts/install-into.mjs <app-dir> [--dry-run] [--force]

  --dry-run  Print what would change. Write nothing.
  --force    Replace files, dependency ranges, and scripts that the app already
             has with the kit's. Without it they are left alone and listed.`

// A problem the user can fix. Printed without a stack trace.
export class InstallError extends Error {}

// Returns the words inside the fenced code block that follows `marker`.
export function readMarkedBlock(readme, marker) {
  const lines = readme.split(/\r?\n/)
  const found = lines.flatMap((line, index) => (line.trim() === marker ? [index] : []))
  if (found.length !== 1) {
    throw new InstallError(
      `README.md must have exactly one "${marker}" line. Found ${found.length}.`,
    )
  }
  let at = found[0] + 1
  while (at < lines.length && lines[at].trim() === '') at += 1
  const fence = /^(`{3,}|~{3,})/.exec((lines[at] ?? '').trim())
  if (!fence) {
    throw new InstallError(
      `README.md: a fenced code block must follow "${marker}". Only blank lines may sit between them.`,
    )
  }
  const words = []
  for (at += 1; at < lines.length; at += 1) {
    const line = lines[at].trim()
    if (line.startsWith(fence[1]) && /^[`~]+$/.test(line)) {
      if (words.length === 0) {
        throw new InstallError(`README.md: the code block after "${marker}" is empty.`)
      }
      return [...new Set(words)]
    }
    words.push(...line.split(/\s+/).filter(Boolean))
  }
  throw new InstallError(`README.md: the code block after "${marker}" is never closed.`)
}

// Reads both lists from the kit's README and checks them against the kit.
export function readInstallLists(kitRoot = KIT_ROOT) {
  let readme
  try {
    readme = readFileSync(join(kitRoot, 'README.md'), 'utf8')
  } catch (error) {
    throw new InstallError(`Could not read README.md in ${kitRoot}: ${error.message}`)
  }

  const copyPaths = readMarkedBlock(readme, COPY_MARKER).map((word) => {
    const path = word.replace(/\/+$/, '')
    const parts = path.split('/')
    if (path === '' || path.startsWith('/') || path.includes('\\') || parts.includes('..') || parts.includes('.')) {
      throw new InstallError(`README.md: "${word}" in the copy list is not a path inside this repository.`)
    }
    if (!existsSync(join(kitRoot, path))) {
      throw new InstallError(`README.md lists "${word}" to copy, but this repository has no such path.`)
    }
    return path
  })

  const kitPackage = readJson(join(kitRoot, 'package.json'))
  const devDependencies = {}
  for (const name of readMarkedBlock(readme, DEV_DEPENDENCIES_MARKER)) {
    const range = kitPackage.devDependencies?.[name]
    if (typeof range !== 'string') {
      throw new InstallError(
        `README.md lists the dev dependency "${name}", but devDependencies in this repository's package.json does not have it.`,
      )
    }
    devDependencies[name] = range
  }

  const scripts = {}
  for (const name of TEST_SCRIPTS) {
    const command = kitPackage.scripts?.[name]
    if (typeof command !== 'string') {
      throw new InstallError(`This repository's package.json has no "${name}" script.`)
    }
    scripts[name] = command
  }

  return { copyPaths, devDependencies, scripts }
}

// Lists the files under `path` (a file or a folder), relative to `root`,
// with forward slashes, in a stable order.
export function listFiles(root, path) {
  const files = []
  const visit = (current) => {
    const stats = statSync(join(root, current))
    if (stats.isFile()) {
      files.push(current.split(sep).join('/'))
    } else if (stats.isDirectory()) {
      const names = readdirSync(join(root, current)).sort()
      for (const name of names) {
        if (NEVER_COPIED.has(name) || name.endsWith('.pyc')) continue
        visit(join(current, name))
      }
    }
  }
  visit(path)
  return files
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new InstallError(`Could not read ${path}: ${error.message}`)
  }
}

function kindOf(path) {
  const stats = statSync(path, { throwIfNoEntry: false })
  if (!stats) return 'missing'
  return stats.isDirectory() ? 'folder' : 'file'
}

function isInside(parent, child) {
  const path = relative(parent, child)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

// True when the app has a file where the kit needs a folder, for example a
// file named `test`.
function hasFileAsFolder(appRoot, file) {
  const parts = file.split('/').slice(0, -1)
  return parts.some((_, index) => kindOf(join(appRoot, ...parts.slice(0, index + 1))) === 'file')
}

// Decides what to do with every file. Writes nothing.
function planFiles(kitRoot, appRoot, copyPaths, force) {
  const actions = []
  for (const path of copyPaths) {
    for (const file of listFiles(kitRoot, path)) {
      const target = join(appRoot, file)
      const kind = kindOf(target)
      let action
      let note
      if (hasFileAsFolder(appRoot, file)) {
        action = 'skip'
        note = 'your app has a file where the kit needs a folder'
      } else if (kind === 'missing') {
        action = 'add'
      } else if (kind === 'folder') {
        action = 'skip'
        note = 'your app has a folder with this name'
      } else if (readFileSync(target).equals(readFileSync(join(kitRoot, file)))) {
        action = 'same'
      } else {
        action = force ? 'replace' : 'skip'
      }
      actions.push({ file, action, note })
    }
  }
  return actions
}

// Merges `wanted` into the app's package.json object. Returns one entry per name.
function planPackageEntries(appPackage, wanted, sections, addTo, force) {
  const entries = []
  for (const [name, value] of Object.entries(wanted)) {
    const section = sections.find((key) => typeof appPackage[key]?.[name] === 'string')
    if (!section) {
      appPackage[addTo] = { ...appPackage[addTo], [name]: value }
      entries.push({ name, value, action: 'add' })
    } else if (appPackage[section][name] === value) {
      entries.push({ name, value, action: 'same' })
    } else if (force) {
      entries.push({ name, value, action: 'replace', had: appPackage[section][name], section })
      appPackage[section][name] = value
    } else {
      entries.push({ name, value, action: 'skip', had: appPackage[section][name], section })
    }
  }
  return entries
}

function sortKeys(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b, 'en')))
}

// Keeps the file's own indentation, line endings, and final newline.
function formatLike(original, value) {
  const indent = /^([ \t]+)"/m.exec(original)?.[1] ?? '  '
  let text = JSON.stringify(value, null, indent)
  if (original.endsWith('\n')) text += '\n'
  return original.includes('\r\n') ? text.replace(/\n/g, '\r\n') : text
}

function planGitignore(kitRoot, appRoot) {
  const kitPath = join(kitRoot, '.gitignore')
  if (!existsSync(kitPath)) throw new InstallError(`This repository has no .gitignore to read lines from.`)
  const isPattern = (line) => line !== '' && !line.startsWith('#')
  const wanted = readFileSync(kitPath, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(isPattern)
  const appPath = join(appRoot, '.gitignore')
  const original = existsSync(appPath) ? readFileSync(appPath, 'utf8') : ''
  const present = new Set(original.split(/\r?\n/).map((line) => line.trim()))
  const missing = [...new Set(wanted)].filter((line) => !present.has(line))
  if (missing.length === 0) return { missing, text: original }
  let text = original
  if (text !== '' && !text.endsWith('\n')) text += '\n'
  if (text !== '') text += '\n'
  text += `${GITIGNORE_HEADING}\n${missing.join('\n')}\n`
  return { missing, text }
}

// Installs the kit into `appDir`. Returns a report of what was done, or of
// what would be done when `dryRun` is set.
export function install(appDir, { dryRun = false, force = false, kitRoot = KIT_ROOT } = {}) {
  const appRoot = resolve(appDir)
  if (kindOf(appRoot) !== 'folder') throw new InstallError(`${appRoot} is not a folder.`)
  const packagePath = join(appRoot, 'package.json')
  if (kindOf(packagePath) !== 'file') {
    throw new InstallError(`${appRoot} has no package.json. Give the root folder of an existing app.`)
  }
  if (isInside(realpathSync(kitRoot), realpathSync(appRoot))) {
    throw new InstallError(
      `${appRoot} is inside this repository. Copy the app to a folder outside it first. For the example app, scripts/test-example.mjs does that.`,
    )
  }

  const lists = readInstallLists(kitRoot)

  // Plan everything before the first write, so a problem stops the install
  // while the app is still untouched.
  const files = planFiles(kitRoot, appRoot, lists.copyPaths, force)

  const packageText = readFileSync(packagePath, 'utf8')
  let appPackage
  try {
    appPackage = JSON.parse(packageText)
  } catch (error) {
    throw new InstallError(`${packagePath} is not valid JSON: ${error.message}`)
  }
  if (appPackage === null || typeof appPackage !== 'object' || Array.isArray(appPackage)) {
    throw new InstallError(`${packagePath} does not hold a JSON object.`)
  }
  const devDependencies = planPackageEntries(
    appPackage,
    lists.devDependencies,
    ['devDependencies', 'dependencies', 'optionalDependencies'],
    'devDependencies',
    force,
  )
  if (devDependencies.some((entry) => entry.action === 'add')) {
    appPackage.devDependencies = sortKeys(appPackage.devDependencies)
  }
  const scripts = planPackageEntries(appPackage, lists.scripts, ['scripts'], 'scripts', force)
  const packageChanged = [...devDependencies, ...scripts].some(
    (entry) => entry.action === 'add' || entry.action === 'replace',
  )

  const gitignore = planGitignore(kitRoot, appRoot)

  if (!dryRun) {
    for (const { file, action } of files) {
      if (action !== 'add' && action !== 'replace') continue
      const target = join(appRoot, file)
      try {
        mkdirSync(dirname(target), { recursive: true })
        // copyFileSync keeps the file mode, so the hook stays executable.
        copyFileSync(join(kitRoot, file), target)
      } catch (error) {
        throw new InstallError(`Could not write ${target}: ${error.message}`)
      }
    }
    if (packageChanged) writeFileSync(packagePath, formatLike(packageText, appPackage))
    if (gitignore.missing.length > 0) writeFileSync(join(appRoot, '.gitignore'), gitignore.text)
  }

  return { appRoot, dryRun, force, files, devDependencies, scripts, gitignoreLines: gitignore.missing }
}

// Turns the report into the text the command prints.
export function formatReport(report) {
  const { dryRun } = report
  const verb = dryRun
    ? { add: 'would add', replace: 'would replace', skip: 'would skip' }
    : { add: 'added', replace: 'replaced', skip: 'skipped' }
  const total = dryRun
    ? { add: 'to add', replace: 'to replace', skip: 'to skip' }
    : { add: 'added', replace: 'replaced', skip: 'skipped' }
  const count = (list, action) => list.filter((entry) => entry.action === action).length
  const totals = (list) =>
    `  ${count(list, 'add')} ${total.add}, ${count(list, 'replace')} ${total.replace}, ` +
    `${count(list, 'same')} already the same, ${count(list, 'skip')} ${total.skip}`
  const row = (action, text) => `  ${verb[action].padEnd(14)}${text}`

  const out = [
    dryRun
      ? `Dry run. Nothing is written. An install into ${report.appRoot} would do this:`
      : `Installed the Cursor QA agent kit into ${report.appRoot}`,
    '',
    'Files',
  ]
  for (const { file, action, note } of report.files) {
    if (action !== 'same') out.push(row(action, note ? `${file} (${note})` : file))
  }
  out.push(totals(report.files))

  const packageSection = (title, entries, describe) => {
    out.push('', title)
    for (const entry of entries) {
      if (entry.action === 'add') out.push(row('add', describe(entry)))
      if (entry.action === 'replace') out.push(row('replace', `${describe(entry)} (your app had ${entry.had})`))
      if (entry.action === 'skip') {
        out.push(row('skip', `${entry.name} (your app has ${entry.had}, the kit uses ${entry.value})`))
      }
    }
    out.push(totals(entries))
  }
  packageSection('package.json devDependencies', report.devDependencies, (entry) => `${entry.name} ${entry.value}`)
  packageSection('package.json scripts', report.scripts, (entry) => `${entry.name}: ${entry.value}`)

  out.push('', '.gitignore')
  for (const line of report.gitignoreLines) out.push(row('add', line))
  out.push(`  ${report.gitignoreLines.length} ${dryRun ? 'lines to add' : 'lines added'}`)

  const skipped = [report.files, report.devDependencies, report.scripts]
    .map((list) => count(list, 'skip'))
    .reduce((sum, value) => sum + value, 0)
  if (skipped > 0) {
    out.push(
      '',
      `${skipped} skipped. Your app already has ${skipped === 1 ? 'that item' : 'those items'} with different content.`,
      "Merge each one by hand, or run again with --force to take the kit's version.",
    )
    if (report.files.some((entry) => entry.note)) {
      out.push('--force does not remove a file or folder that is in the way. Move it yourself.')
    }
    if (count(report.devDependencies, 'skip') > 0) {
      out.push(
        "A range that was left alone can clash with the kit's packages. If `npm install` stops with ERESOLVE,",
        "change that range in package.json to the kit's.",
      )
    }
  }
  if (!dryRun) {
    out.push('', 'Next, in the app folder:', '  npm install', '  npx playwright install chromium')
  }
  return out.join('\n')
}

function main(argv) {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        'dry-run': { type: 'boolean', default: false },
        force: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    })
  } catch (error) {
    console.error(`${error.message}\n\n${USAGE}`)
    return 1
  }
  if (parsed.values.help) {
    console.log(USAGE)
    return 0
  }
  if (parsed.positionals.length !== 1) {
    console.error(`Give exactly one app folder.\n\n${USAGE}`)
    return 1
  }
  try {
    const report = install(parsed.positionals[0], {
      dryRun: parsed.values['dry-run'],
      force: parsed.values.force,
    })
    console.log(formatReport(report))
    return 0
  } catch (error) {
    if (!(error instanceof InstallError)) throw error
    console.error(`Install stopped: ${error.message}`)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2))
}
