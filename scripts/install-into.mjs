#!/usr/bin/env node
// Installs the kit into an existing app. It performs the steps under
// "Add it to your app" in README.md:
//
//   1. Copy the paths in the README's copy list into the app.
//   2. Add the README's dev dependencies and the four test:* scripts to the
//      app's package.json.
//   3. Add the lines of the kit's .gitignore that the app's .gitignore lacks.
//   4. Add test/tsconfig.json when the app has a tsconfig.json and no
//      test/tsconfig.json. See TEST_TSCONFIG_TEXT below for what it is for.
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
// What it does with a file the app already has:
//
//   - The same bytes: nothing. If the kit's file is executable and the app's
//     copy is not, the executable bit is set again.
//   - .cursor/hooks.json and .cursor/mcp.json with other content: merged. The
//     app's own entries stay and the kit's entries that are missing are
//     added. A file that cannot be merged is skipped, with a warning that
//     says what does not work as a result.
//   - Any other file with other content: skipped, or replaced with --force.
//   - A symbolic link at the path, or at a folder above it inside the app:
//     skipped, with and without --force. The installer never writes through
//     a link.
//
// The copy list and the dev dependency list are read from the two fenced
// blocks in README.md that follow the marker comments below. The README is
// the only place those lists are kept, so a path or package missing from the
// README is also missing from every install this script performs.
//
// It never deletes anything in the app and never runs `npm install`. When the
// app still has the Playwright MCP server that earlier versions of the kit
// installed, it says so in a NOTE and leaves the entries where they are.
// Node built-ins only.

import {
  chmodSync,
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual, parseArgs } from 'node:util'

// The repository this script sits in.
export const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const COPY_MARKER = '<!-- install:copy -->'
export const DEV_DEPENDENCIES_MARKER = '<!-- install:dev-dependencies -->'

// "The four test:* scripts" in the README.
export const TEST_SCRIPTS = ['test:unit', 'test:integration', 'test:e2e', 'test:e2e:list']

// The two files that are merged into the app's own file when the app has one.
export const HOOKS_FILE = '.cursor/hooks.json'
export const MCP_FILE = '.cursor/mcp.json'

// The two runner configs, and the reporter each one loads. An app that keeps
// its own config without that reporter gets no line that starts with QA-VERDICT:.
export const VERDICT_CONFIGS = [
  { file: 'vitest.config.ts', reporter: '.cursor/qa/vitest-verdict.mjs', runner: 'Vitest' },
  { file: 'playwright.config.ts', reporter: '.cursor/qa/playwright-verdict.mjs', runner: 'Playwright' },
]

// The installer writes this file when the app has a tsconfig.json and no
// test/tsconfig.json. It is not in the kit's own test/ folder, because in an
// app without a tsconfig.json it would stop every Vitest run with
// "Failed to load tsconfig".
export const TEST_TSCONFIG = 'test/tsconfig.json'
export const TEST_TSCONFIG_TEXT = `{
  // Makes the "paths" of ../tsconfig.json apply to the files under test/, also
  // when that file has "test" in "exclude". Vitest reads the paths of a
  // tsconfig.json only for the files it includes. Without this file an import
  // such as \`@/lib/db\` does not resolve in a test, and \`vi.mock('@/lib/db')\`
  // replaces nothing.
  "extends": "../tsconfig.json",
  "include": ["**/*.ts"],
  "exclude": []
}
`

// The package of the Playwright MCP server. Earlier versions of the kit listed
// it as a dev dependency and started it from .cursor/mcp.json. This version
// opens the browser with playwright-cli commands. See findNotes below.
export const RETIRED_PACKAGE = '@playwright/mcp'

// Generated files that may sit inside a copied folder. They are never copied.
const NEVER_COPIED = new Set(['node_modules', '__pycache__', '.pytest_cache', '.DS_Store'])

const GITIGNORE_HEADING = '# Added with the Cursor QA agent kit'

const USAGE = `Usage: node scripts/install-into.mjs <app-dir> [--dry-run] [--force]

  --dry-run  Print what would change. Write nothing.
  --force    Replace files, dependency ranges, and scripts that the app already
             has with the kit's. Without it they are left alone and listed.

.cursor/hooks.json and .cursor/mcp.json are merged into the app's own files.
A symbolic link in the app is never written through, also with --force.
Nothing in the app is deleted. A NOTE at the end names what an earlier
version of the kit left in the app and this version no longer uses.`

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

// What sits at `path` itself. A symbolic link is a 'link', whatever it leads to.
function kindOf(path) {
  const stats = lstatSync(path, { throwIfNoEntry: false })
  if (!stats) return 'missing'
  if (stats.isSymbolicLink()) return 'link'
  if (stats.isDirectory()) return 'folder'
  return stats.isFile() ? 'file' : 'other'
}

// What `path` leads to, with links followed. Used only to read, never to write.
function followedKind(path) {
  const stats = statSync(path, { throwIfNoEntry: false })
  if (!stats) return 'missing'
  if (stats.isDirectory()) return 'folder'
  return stats.isFile() ? 'file' : 'other'
}

function isInside(parent, child) {
  const path = relative(parent, child)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Walks from the app root down to `file`. Returns `{ kind }` with 'missing' or
// 'file' when the installer may write there, and `{ skip }` when it may not:
// a symbolic link at the path or at a folder above it, or something else in
// the way. The app root itself is not looked at, so an app folder that is
// given as a link works.
function lookAt(appRoot, file) {
  const parts = file.split('/')
  for (let depth = 1; depth < parts.length; depth += 1) {
    const above = parts.slice(0, depth).join('/')
    const kind = kindOf(join(appRoot, above))
    if (kind === 'missing') return { kind: 'missing' }
    if (kind === 'link') {
      return { skip: { action: 'skip', reason: 'link', note: `${above} in your app is a symbolic link` } }
    }
    if (kind !== 'folder') {
      return { skip: { action: 'skip', reason: 'blocked', note: 'your app has a file where the kit needs a folder' } }
    }
  }
  const kind = kindOf(join(appRoot, file))
  if (kind === 'link') return { skip: { action: 'skip', reason: 'link', note: 'your app has a symbolic link here' } }
  if (kind === 'folder') return { skip: { action: 'skip', reason: 'blocked', note: 'your app has a folder with this name' } }
  if (kind === 'other') {
    return { skip: { action: 'skip', reason: 'blocked', note: 'your app has something here that is not a regular file' } }
  }
  return { kind }
}

// The same question for package.json and .gitignore, which the installer edits in place.
function rootFileProblem(appRoot, name) {
  const kind = kindOf(join(appRoot, name))
  if (kind === 'link') return { reason: 'link', note: `${name} in your app is a symbolic link` }
  if (kind === 'folder' || kind === 'other') return { reason: 'blocked', note: `${name} in your app is not a file` }
  return null
}

// True when the kit's file can be started as a program and the app's copy cannot.
function lacksExecutableBit(source, target) {
  return (statSync(source).mode & 0o100) !== 0 && (statSync(target).mode & 0o100) === 0
}

function readKitHooks(kitRoot) {
  const path = join(kitRoot, HOOKS_FILE)
  const kit = readJson(path)
  const isEntry = (entry) => isRecord(entry) && typeof entry.command === 'string'
  const isList = (entries) => Array.isArray(entries) && entries.every(isEntry)
  const known = isRecord(kit) && isRecord(kit.hooks) && Object.values(kit.hooks).every(isList)
  if (!known) {
    throw new InstallError(`${path} does not have the form {"version": 1, "hooks": {"<event>": [{"command": "..."}]}}.`)
  }
  return kit
}

function readKitMcp(kitRoot) {
  const path = join(kitRoot, MCP_FILE)
  const kit = readJson(path)
  if (!isRecord(kit) || !isRecord(kit.mcpServers)) {
    throw new InstallError(`${path} does not have the form {"mcpServers": {"<name>": {...}}}.`)
  }
  return kit
}

// True when `entry` starts the script of the kit's entry, also when the app's
// command adds an interpreter or writes the path another way, for example
// `python3 ./.cursor/hooks/guard-test-writes.py`. Such an entry counts as the
// kit's hook. A second entry for the same script would run the hook twice.
function startsSameHook(entry, kitEntry) {
  if (!isRecord(entry) || typeof entry.command !== 'string') return false
  const plain = (command) => command.replaceAll('\\', '/')
  return plain(entry.command).includes(plain(kitEntry.command).replace(/^\.\//, ''))
}

// The two merges below take the app's parsed file and the kit's. They return
// `{ problem }` when the app's file does not have the form they know, and
// otherwise the merged value with a phrase for what was added, what was
// replaced (only with --force), and what was kept although it differs.

// Adds the kit's hook to every event the kit registers it for, unless the
// event already starts it.
function mergeHooks(app, kit, force) {
  if (!isRecord(app)) return { problem: 'it does not hold a JSON object' }
  if (app.version !== undefined && app.version !== kit.version) {
    return { problem: `its "version" is ${JSON.stringify(app.version)}, and the kit's file has ${JSON.stringify(kit.version)}` }
  }
  if (app.hooks !== undefined && !isRecord(app.hooks)) return { problem: '"hooks" is not an object' }

  const hooks = { ...app.hooks }
  const added = new Set()
  const replaced = new Set()
  const kept = new Set()
  for (const [event, kitEntries] of Object.entries(kit.hooks)) {
    if (hooks[event] !== undefined && !Array.isArray(hooks[event])) return { problem: `"hooks.${event}" is not a list` }
    const entries = [...(hooks[event] ?? [])]
    for (const kitEntry of kitEntries) {
      if (entries.some((entry) => isDeepStrictEqual(entry, kitEntry))) continue
      const at = entries.findIndex((entry) => startsSameHook(entry, kitEntry))
      if (at === -1) {
        entries.push(kitEntry)
        added.add(event)
      } else if (force) {
        entries[at] = kitEntry
        replaced.add(event)
      } else {
        kept.add(event)
      }
    }
    hooks[event] = entries
  }

  const addVersion = app.version === undefined && kit.version !== undefined
  const names = (events) => [...events].join(', ')
  const addedParts = []
  if (added.size > 0) addedParts.push(`the kit's hook to ${names(added)}`)
  if (addVersion) addedParts.push(`"version": ${JSON.stringify(kit.version)}`)
  return {
    value: addVersion ? { version: kit.version, ...app, hooks } : { ...app, hooks },
    added: addedParts.length > 0 ? `added ${addedParts.join(' and ')}` : null,
    replaced: replaced.size > 0 ? `took the kit's entry for its hook in ${names(replaced)}` : null,
    kept: kept.size > 0 ? `kept your own entry for the kit's hook in ${names(kept)}` : null,
  }
}

// Adds the kit's MCP servers that the app's file does not name.
function mergeMcpServers(app, kit, force) {
  if (!isRecord(app)) return { problem: 'it does not hold a JSON object' }
  if (app.mcpServers !== undefined && !isRecord(app.mcpServers)) return { problem: '"mcpServers" is not an object' }

  const servers = { ...app.mcpServers }
  const added = []
  const replaced = []
  const kept = []
  for (const [name, server] of Object.entries(kit.mcpServers)) {
    if (!Object.hasOwn(servers, name)) {
      servers[name] = server
      added.push(name)
    } else if (isDeepStrictEqual(servers[name], server)) {
      continue
    } else if (force) {
      servers[name] = server
      replaced.push(name)
    } else {
      kept.push(name)
    }
  }
  return {
    value: { ...app, mcpServers: servers },
    added: added.length > 0 ? `added the server${added.length === 1 ? '' : 's'} ${added.join(', ')}` : null,
    replaced: replaced.length > 0 ? `took the kit's ${replaced.join(', ')}` : null,
    kept: kept.length > 0 ? `kept your own ${kept.join(', ')}, which differ${kept.length === 1 ? 's' : ''} from the kit's` : null,
  }
}

const MERGES = {
  [HOOKS_FILE]: { read: readKitHooks, merge: mergeHooks },
  [MCP_FILE]: { read: readKitMcp, merge: mergeMcpServers },
}

// Plans the merge of one of the two JSON files into the app's own file.
function planMerge(kitRoot, file, target, force) {
  const { read, merge } = MERGES[file]
  const kit = read(kitRoot)
  const appText = readFileSync(target, 'utf8')
  let result
  try {
    result = { app: JSON.parse(appText) }
  } catch (error) {
    result = { problem: `it is not valid JSON (${error.message})` }
  }
  if (!result.problem) result = merge(result.app, kit, force)
  if (result.problem) {
    const note = `it could not be merged, because ${result.problem}`
    return force ? { action: 'replace', note } : { action: 'skip', reason: 'unmergeable', note }
  }
  const changes = [result.added, result.replaced].filter(Boolean)
  if (changes.length === 0) {
    return result.kept ? { action: 'skip', reason: 'differs', note: result.kept } : { action: 'same' }
  }
  const note = result.kept ? [...changes, result.kept].join('; ') : `${changes.join('; ')}. Your own entries are kept`
  return { action: 'merge', note, text: formatLike(appText, result.value) }
}

// Decides what to do with one file of the copy list. Writes nothing.
function planFile(kitRoot, appRoot, file, force) {
  const found = lookAt(appRoot, file)
  if (found.skip) return found.skip
  if (found.kind === 'missing') return { action: 'add' }
  const source = join(kitRoot, file)
  const target = join(appRoot, file)
  if (readFileSync(target).equals(readFileSync(source))) {
    return lacksExecutableBit(source, target)
      ? { action: 'chmod', note: 'the content is the same, the executable bit was missing' }
      : { action: 'same' }
  }
  if (Object.hasOwn(MERGES, file)) return planMerge(kitRoot, file, target, force)
  return force ? { action: 'replace' } : { action: 'skip', reason: 'differs' }
}

function planFiles(kitRoot, appRoot, copyPaths, force) {
  const actions = []
  for (const path of copyPaths) {
    for (const file of listFiles(kitRoot, path)) {
      actions.push({ file, ...planFile(kitRoot, appRoot, file, force) })
    }
  }
  return actions
}

// test/tsconfig.json is added when the app has a tsconfig.json to extend. A
// test/tsconfig.json of the app's own is kept, also with --force.
function planTestTsconfig(appRoot) {
  const entry = { file: TEST_TSCONFIG }
  if (followedKind(join(appRoot, 'tsconfig.json')) !== 'file') return { ...entry, action: 'none' }
  const found = lookAt(appRoot, TEST_TSCONFIG)
  if (found.skip) return { ...entry, ...found.skip }
  if (found.kind === 'missing') return { ...entry, action: 'add' }
  const same = readFileSync(join(appRoot, TEST_TSCONFIG), 'utf8') === TEST_TSCONFIG_TEXT
  return { ...entry, action: same ? 'same' : 'keep' }
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
      entries.push({ name, value, action: 'skip', reason: 'differs', had: appPackage[section][name], section })
    }
  }
  return entries
}

// Turns every planned change into a skip, for a package.json the installer may not write.
function withoutWrites(entries, problem) {
  return entries.map((entry) =>
    entry.action === 'add' || entry.action === 'replace'
      ? { name: entry.name, value: entry.value, action: 'skip', ...problem }
      : entry,
  )
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
  const original = followedKind(appPath) === 'file' ? readFileSync(appPath, 'utf8') : ''
  const present = new Set(original.split(/\r?\n/).map((line) => line.trim()))
  const missing = [...new Set(wanted)].filter((line) => !present.has(line))
  const problem = rootFileProblem(appRoot, '.gitignore')
  if (problem) return { missing: [], skipped: missing, note: problem.note, reason: problem.reason, text: original }
  if (missing.length === 0) return { missing, skipped: [], text: original }
  let text = original
  if (text !== '' && !text.endsWith('\n')) text += '\n'
  if (text !== '') text += '\n'
  text += `${GITIGNORE_HEADING}\n${missing.join('\n')}\n`
  return { missing, skipped: [], text }
}

function readThrough(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

// True when the app's hooks file, read through any link, starts the kit's hook
// for every event the kit registers it for.
function hookIsRegistered(appRoot, kit) {
  let app
  try {
    app = JSON.parse(readFileSync(join(appRoot, HOOKS_FILE), 'utf8'))
  } catch {
    return false
  }
  return Object.entries(kit.hooks).every(([event, kitEntries]) => {
    const entries = app?.hooks?.[event]
    if (!Array.isArray(entries)) return false
    return kitEntries.every((kitEntry) => entries.some((entry) => startsSameHook(entry, kitEntry)))
  })
}

function missingServers(appRoot, kit) {
  let servers
  try {
    servers = JSON.parse(readFileSync(join(appRoot, MCP_FILE), 'utf8'))?.mcpServers
  } catch {
    servers = undefined
  }
  return Object.keys(kit.mcpServers).filter((name) => !isRecord(servers) || !Object.hasOwn(servers, name))
}

function howToFix(entry, kitFile) {
  if (entry.reason === 'unmergeable') {
    return (
      `correct the file and run the installer again, or copy the entries from ${kitFile} into it by hand. ` +
      "--force replaces your file with the kit's."
    )
  }
  if (entry.reason === 'link') {
    return (
      'replace the link with a real file or folder and run the installer again, ' +
      `or copy the entries from ${kitFile} into the file the link leads to.`
    )
  }
  return 'move what is in the way and run the installer again.'
}

// Which jobs need each of the kit's MCP servers. Used in the warning below.
// The web jobs need none: they open the browser with playwright-cli commands.
const SERVER_USERS = {
  maestro: '/qa-mobile-plan and /qa-mobile-heal read the device through the maestro server.',
}

// A skipped file can leave a part of the kit switched off. Each warning says
// which part, why, and what to do. They are printed last.
function findWarnings(kitRoot, appRoot, files) {
  const warnings = []
  const skipped = (file) => files.find((entry) => entry.file === file && entry.action === 'skip')

  const hooksEntry = skipped(HOOKS_FILE)
  if (hooksEntry) {
    const kit = readKitHooks(kitRoot)
    if (!hookIsRegistered(appRoot, kit)) {
      const commands = [...new Set(Object.values(kit.hooks).flat().map((entry) => entry.command))]
      warnings.push({
        id: 'hook',
        title: 'the hook is not registered, so nothing is guarded.',
        lines: [
          `${HOOKS_FILE} was skipped: ${hooksEntry.note}.`,
          `Cursor does not start ${commands.join(', ')}, ` +
            'so the agent can edit application source and run the commands the hook would deny.',
          `What to do: ${howToFix(hooksEntry, join(kitRoot, HOOKS_FILE))}`,
        ],
      })
    }
  }

  const configs = VERDICT_CONFIGS.filter(
    ({ file, reporter }) => skipped(file) && !readThrough(join(appRoot, file)).includes(reporter),
  )
  if (configs.length > 0) {
    const many = configs.length > 1
    warnings.push({
      id: 'verdict',
      title: `${configs.map(({ runner }) => runner).join(' and ')} runs print no QA-VERDICT line.`,
      lines: [
        ...configs.map(({ file, reporter }) => `${file} was skipped, and yours does not load ${reporter}.`),
        'The skills read the result of a test run from the line that starts with QA-VERDICT:. ' +
          'Without it they stop with BLOCKED.',
        `What to do: take the kit's ${configs.map(({ file }) => file).join(' and ')} ` +
          `and move your own settings into ${many ? 'them' : 'it'}. --force takes the kit's ${many ? 'files' : 'file'}. ` +
          "Or load the reporter in your own config the way the kit's file does.",
        'See "If your app already has these files" in the kit\'s README.',
      ],
    })
  }

  const mcpEntry = skipped(MCP_FILE)
  if (mcpEntry) {
    const missing = missingServers(appRoot, readKitMcp(kitRoot))
    if (missing.length > 0) {
      const one = missing.length === 1
      warnings.push({
        id: 'mcp',
        title: `the kit's MCP ${one ? 'server is' : 'servers are'} not registered: ${missing.join(', ')}.`,
        lines: [
          `${MCP_FILE} was skipped: ${mcpEntry.note}.`,
          ...missing.flatMap((name) => (Object.hasOwn(SERVER_USERS, name) ? [SERVER_USERS[name]] : [])),
          'Without their server these jobs stop with BLOCKED.',
          `What to do: ${howToFix(mcpEntry, join(kitRoot, MCP_FILE))}`,
        ],
      })
    }
  }
  return warnings
}

// True when an MCP server entry starts the retired package: the package name
// is its command or one of its arguments, with or without a version.
function startsRetiredPackage(server) {
  if (!isRecord(server)) return false
  const words = [server.command, ...(Array.isArray(server.args) ? server.args : [])]
  return words.some((word) => typeof word === 'string' && (word === RETIRED_PACKAGE || word.startsWith(`${RETIRED_PACKAGE}@`)))
}

// What the app still has of the Playwright MCP server, which this kit no
// longer uses. A note switches nothing off. It is there because the installer
// never removes anything, so an app that installed an earlier version of the
// kit keeps the server entry and the package until someone deletes them.
// Empty for a kit that still uses the package itself.
function findNotes(kitRoot, appRoot, lists, appPackage) {
  const kitMcp = existsSync(join(kitRoot, MCP_FILE)) ? readKitMcp(kitRoot) : { mcpServers: {} }
  const kitUsesIt = Object.hasOwn(lists.devDependencies, RETIRED_PACKAGE) || Object.values(kitMcp.mcpServers).some(startsRetiredPackage)
  if (kitUsesIt) return []

  let appServers
  try {
    appServers = JSON.parse(readFileSync(join(appRoot, MCP_FILE), 'utf8'))?.mcpServers
  } catch {
    appServers = undefined
  }
  const servers = isRecord(appServers) ? Object.keys(appServers).filter((name) => startsRetiredPackage(appServers[name])) : []
  const sections = ['devDependencies', 'dependencies', 'optionalDependencies'].filter(
    (section) => typeof appPackage[section]?.[RETIRED_PACKAGE] === 'string',
  )
  if (servers.length === 0 && sections.length === 0) return []

  const lines = []
  if (servers.length > 0) {
    const names = servers.map((name) => `"${name}"`).join(', ')
    lines.push(`${MCP_FILE} starts ${RETIRED_PACKAGE} as the server ${names}.`)
  }
  if (sections.length > 0) lines.push(`package.json lists ${RETIRED_PACKAGE} in ${sections.join(' and ')}.`)
  lines.push(
    '/qa-plan and /qa-generate now open the browser with playwright-cli commands. No job of the kit uses that server.',
    'What to do: if you do not use it yourself, delete ' +
      [servers.length > 0 ? `the server from ${MCP_FILE}` : null, sections.length > 0 ? 'the package from package.json' : null]
        .filter(Boolean)
        .join(' and ') +
      '. The installer never removes anything.',
  )
  return [{ id: 'playwright-mcp', title: 'the kit no longer uses the Playwright MCP server, and your app still has it.', lines }]
}

function writeFile(kitRoot, appRoot, { file, action, text }) {
  const source = join(kitRoot, file)
  const target = join(appRoot, file)
  try {
    if (action === 'add') {
      mkdirSync(dirname(target), { recursive: true })
      // COPYFILE_EXCL: stop if something appeared at the path after the plan was made.
      // copyFileSync keeps the file mode, so the hook stays executable.
      copyFileSync(source, target, constants.COPYFILE_EXCL)
    } else if (action === 'replace') {
      copyFileSync(source, target)
    } else if (action === 'merge') {
      writeFileSync(target, text)
    } else if (action === 'chmod') {
      chmodSync(target, statSync(target).mode | (statSync(source).mode & 0o111))
    }
  } catch (error) {
    throw new InstallError(`Could not write ${target}: ${error.message}`)
  }
}

// Installs the kit into `appDir`. Returns a report of what was done, or of
// what would be done when `dryRun` is set.
export function install(appDir, { dryRun = false, force = false, kitRoot = KIT_ROOT } = {}) {
  const appRoot = resolve(appDir)
  if (followedKind(appRoot) !== 'folder') throw new InstallError(`${appRoot} is not a folder.`)
  const packagePath = join(appRoot, 'package.json')
  if (followedKind(packagePath) !== 'file') {
    throw new InstallError(`${appRoot} has no package.json. Give the root folder of an existing app.`)
  }
  if (isInside(realpathSync(kitRoot), realpathSync(appRoot))) {
    throw new InstallError(
      `${appRoot} is inside this repository. Copy the app to a folder outside it first. ` +
        'For the example app, scripts/test-example.mjs does that.',
    )
  }

  const lists = readInstallLists(kitRoot)

  // Plan everything before the first write, so a problem stops the install
  // while the app is still untouched.
  const files = planFiles(kitRoot, appRoot, lists.copyPaths, force)
  const testTsconfig = planTestTsconfig(appRoot)

  const packageText = readFileSync(packagePath, 'utf8')
  let appPackage
  try {
    appPackage = JSON.parse(packageText)
  } catch (error) {
    throw new InstallError(`${packagePath} is not valid JSON: ${error.message}`)
  }
  if (!isRecord(appPackage)) {
    throw new InstallError(`${packagePath} does not hold a JSON object.`)
  }
  let devDependencies = planPackageEntries(
    appPackage,
    lists.devDependencies,
    ['devDependencies', 'dependencies', 'optionalDependencies'],
    'devDependencies',
    force,
  )
  if (devDependencies.some((entry) => entry.action === 'add')) {
    appPackage.devDependencies = sortKeys(appPackage.devDependencies)
  }
  let scripts = planPackageEntries(appPackage, lists.scripts, ['scripts'], 'scripts', force)
  const packageProblem = rootFileProblem(appRoot, 'package.json')
  if (packageProblem) {
    devDependencies = withoutWrites(devDependencies, packageProblem)
    scripts = withoutWrites(scripts, packageProblem)
  }
  const packageChanged = [...devDependencies, ...scripts].some(
    (entry) => entry.action === 'add' || entry.action === 'replace',
  )

  const gitignore = planGitignore(kitRoot, appRoot)
  const warnings = findWarnings(kitRoot, appRoot, files)
  const notes = findNotes(kitRoot, appRoot, lists, appPackage)

  if (!dryRun) {
    for (const entry of files) writeFile(kitRoot, appRoot, entry)
    if (testTsconfig.action === 'add') {
      const target = join(appRoot, TEST_TSCONFIG)
      try {
        mkdirSync(dirname(target), { recursive: true })
        // 'wx': stop if something appeared at the path after the plan was made.
        writeFileSync(target, TEST_TSCONFIG_TEXT, { flag: 'wx' })
      } catch (error) {
        throw new InstallError(`Could not write ${target}: ${error.message}`)
      }
    }
    if (packageChanged) writeFileSync(packagePath, formatLike(packageText, appPackage))
    if (gitignore.missing.length > 0) writeFileSync(join(appRoot, '.gitignore'), gitignore.text)
  }

  return {
    appRoot,
    dryRun,
    force,
    // The merged text is written above. The report has no use for it.
    files: files.map(({ text, ...entry }) => entry),
    testTsconfig,
    devDependencies,
    scripts,
    gitignoreLines: gitignore.missing,
    gitignoreSkipped: gitignore.skipped,
    gitignoreNote: gitignore.note,
    notes,
    warnings,
  }
}

// Turns the report into the text the command prints.
export function formatReport(report) {
  const { dryRun } = report
  const verb = dryRun
    ? { add: 'would add', replace: 'would replace', merge: 'would merge', chmod: 'would fix', keep: 'would keep', skip: 'would skip' }
    : { add: 'added', replace: 'replaced', merge: 'merged', chmod: 'fixed', keep: 'kept', skip: 'skipped' }
  const total = dryRun
    ? { add: 'to add', replace: 'to replace', merge: 'to merge', chmod: 'to fix', skip: 'to skip' }
    : { add: 'added', replace: 'replaced', merge: 'merged', chmod: 'fixed', skip: 'skipped' }
  const count = (list, action) => list.filter((entry) => entry.action === action).length
  // "merged" and "fixed" are named only when there is one. They occur for files only.
  const totals = (list) =>
    '  ' +
    [
      `${count(list, 'add')} ${total.add}`,
      `${count(list, 'replace')} ${total.replace}`,
      ...['merge', 'chmod'].filter((action) => count(list, action) > 0).map((action) => `${count(list, action)} ${total[action]}`),
      `${count(list, 'same')} already the same`,
      `${count(list, 'skip')} ${total.skip}`,
    ].join(', ')
  const row = (action, text) => `  ${verb[action].padEnd(14)}${text}`
  const withNote = (text, note) => (note ? `${text} (${note})` : text)

  const out = [
    dryRun
      ? `Dry run. Nothing is written. An install into ${report.appRoot} would do this:`
      : `Installed the Cursor QA agent kit into ${report.appRoot}`,
    '',
    'Files',
  ]
  for (const { file, action, note } of report.files) {
    if (action !== 'same') out.push(row(action, withNote(file, note)))
  }
  out.push(totals(report.files))

  const tsconfig = report.testTsconfig
  out.push('', TEST_TSCONFIG)
  if (tsconfig.action === 'none') {
    out.push('  not added: your app has no tsconfig.json to extend')
  } else if (tsconfig.action === 'same') {
    out.push('  already the same')
  } else if (tsconfig.action === 'keep') {
    out.push(row('keep', `${TEST_TSCONFIG} (your app has its own)`))
  } else {
    out.push(row(tsconfig.action, withNote(TEST_TSCONFIG, tsconfig.note)))
  }
  if (tsconfig.action === 'add') {
    out.push('  It extends ../tsconfig.json, so that an import alias such as @/lib/db resolves in a test file.')
  }

  const packageSection = (title, entries, describe) => {
    out.push('', title)
    for (const entry of entries) {
      if (entry.action === 'add') out.push(row('add', describe(entry)))
      if (entry.action === 'replace') out.push(row('replace', `${describe(entry)} (your app had ${entry.had})`))
      if (entry.action === 'skip' && entry.reason === 'differs') {
        out.push(row('skip', `${entry.name} (your app has ${entry.had}, the kit uses ${entry.value})`))
      } else if (entry.action === 'skip') {
        out.push(row('skip', withNote(describe(entry), entry.note)))
      }
    }
    out.push(totals(entries))
  }
  packageSection('package.json devDependencies', report.devDependencies, (entry) => `${entry.name} ${entry.value}`)
  packageSection('package.json scripts', report.scripts, (entry) => `${entry.name}: ${entry.value}`)

  out.push('', '.gitignore')
  for (const line of report.gitignoreLines) out.push(row('add', line))
  if (report.gitignoreSkipped.length > 0) {
    const lines = report.gitignoreSkipped.length === 1 ? '1 line' : `${report.gitignoreSkipped.length} lines`
    out.push(row('skip', `${lines} (${report.gitignoreNote})`))
  }
  out.push(`  ${report.gitignoreLines.length} ${dryRun ? 'lines to add' : 'lines added'}`)

  const reasons = [...report.files, tsconfig, ...report.devDependencies, ...report.scripts]
    .filter((entry) => entry.action === 'skip')
    .map((entry) => entry.reason)
  if (report.gitignoreSkipped.length > 0) reasons.push('link')
  if (reasons.length > 0) {
    const because = (reason) => reasons.filter((value) => value === reason).length
    out.push('', `${reasons.length} skipped.`)
    if (because('differs') > 0) {
      out.push(
        `  ${because('differs')} with other content in your app. Merge ${because('differs') === 1 ? 'it' : 'each one'} by hand, ` +
          "or run again with --force to take the kit's version.",
      )
    }
    if (because('unmergeable') > 0) {
      out.push(
        `  ${because('unmergeable')} that could not be merged. Correct the file and run again, ` +
          "or run again with --force to replace it with the kit's file.",
      )
    }
    if (because('link') > 0) {
      out.push(
        `  ${because('link')} behind a symbolic link in your app. The installer never writes through a link, also with --force.`,
        "  Replace the link with a real file or folder and run again, or copy the kit's files to where the link leads yourself.",
      )
    }
    if (because('blocked') > 0) {
      out.push(`  ${because('blocked')} with a file or folder in the way. --force does not remove it. Move it yourself.`)
    }
    if (report.devDependencies.some((entry) => entry.action === 'skip' && entry.reason === 'differs')) {
      out.push(
        "A range that was left alone can clash with the kit's packages. If `npm install` stops with ERESOLVE,",
        "change that range in package.json to the kit's.",
      )
    }
  }
  if (!dryRun) {
    out.push('', 'Next, in the app folder:', '  npm install', '  npx playwright install chromium')
  }
  // Notes come before warnings, so that a warning is the last thing printed.
  for (const note of report.notes) {
    out.push('', `NOTE: ${note.title}`, ...note.lines.map((line) => `  ${line}`))
  }
  for (const warning of report.warnings) {
    out.push('', `WARNING: ${warning.title}`, ...warning.lines.map((line) => `  ${line}`))
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
