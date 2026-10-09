// Shared by the eval scripts in this folder. Node built-ins only.

import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
  statfsSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { devNull, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const EVAL_ROOT = dirname(fileURLToPath(import.meta.url))
export const KIT_ROOT = resolve(EVAL_ROOT, '..')
export const EXAMPLE = join(KIT_ROOT, 'examples', 'next-app')
export const CASES_DIR = join(EVAL_ROOT, 'cases')

// The folder make-sandbox.mjs writes: <run>/sandbox is the app the agent works
// in, <run>/meta.json says how it was built.
export const SANDBOX_NAME = 'sandbox'
export const META_NAME = 'meta.json'

export const DEFAULT_APP_PORT = 3424
export const DEFAULT_BUG_PORT = 3425

// A problem the person running the eval can fix. Printed without a stack trace.
export class EvalError extends Error {}

// Runs a command to its end. Never throws for a failing command: the caller
// reads `status`.
export function run(command, args, { cwd, env, input, timeoutMs = 120_000, inherit = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    input,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    stdio: inherit ? ['ignore', 'inherit', 'inherit'] : ['pipe', 'pipe', 'pipe'],
  })
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
    timedOut: result.error?.code === 'ETIMEDOUT',
  }
}

// Runs git in `cwd` and returns stdout. Throws when git fails.
export function git(cwd, args, { input, env } = {}) {
  const result = run('git', args, { cwd, input, env })
  if (result.status !== 0) {
    throw new EvalError(`git ${args.join(' ')} failed in ${cwd}: ${(result.stderr || result.error?.message || '').trim()}`)
  }
  return result.stdout
}

export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new EvalError(`Could not read ${path}: ${error.message}`)
  }
}

export function listCaseIds() {
  return readdirSync(CASES_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .sort()
}

const KINDS = ['unit', 'integration', 'plan', 'e2e']
const OUTCOMES = ['pass', 'fail-kept', 'fixme', 'plan']
const SERVERS = [null, 'normal', 'bug']

// Reads one case and checks its shape, so a typing mistake in a case file
// stops the run with a message instead of a wrong score.
export function loadCase(id) {
  const path = join(CASES_DIR, `${id}.json`)
  if (!existsSync(path)) {
    throw new EvalError(`No case "${id}". The cases are: ${listCaseIds().join(', ')}.`)
  }
  const found = readJson(path)
  const problems = []
  const text = (key) => {
    if (typeof found[key] !== 'string' || found[key] === '') problems.push(`"${key}" must be a text`)
  }
  if (found.id !== id) problems.push(`"id" must be "${id}", the file name`)
  for (const key of ['title', 'skill', 'user', 'userOld']) text(key)
  if (!KINDS.includes(found.kind)) problems.push(`"kind" must be one of ${KINDS.join(', ')}`)
  if (!SERVERS.includes(found.server ?? null)) problems.push('"server" must be null, "normal", or "bug"')
  if ((found.kind === 'plan' || found.kind === 'e2e') && !found.server) {
    problems.push('a plan or e2e case needs "server"')
  }
  const expect = found.expect
  if (expect === null || typeof expect !== 'object') {
    problems.push('"expect" must be an object')
  } else {
    if (!OUTCOMES.includes(expect.outcome)) problems.push(`"expect.outcome" must be one of ${OUTCOMES.join(', ')}`)
    if (typeof expect.file !== 'string') problems.push('"expect.file" must be a path')
    if (!Array.isArray(expect.mayWrite)) problems.push('"expect.mayWrite" must be a list of globs')
    if (expect.outcome === 'plan' && (expect.plan === null || typeof expect.plan !== 'object')) {
      problems.push('a plan case needs "expect.plan"')
    }
    if ((expect.outcome === 'fail-kept' || expect.outcome === 'fixme') && typeof expect.bug?.file !== 'string') {
      problems.push('a product-bug case needs "expect.bug" with "file" and "line"')
    }
    if (expect.bugServer !== undefined) {
      const titles = expect.bugServer?.mustFail
      if (!Array.isArray(titles) || titles.length === 0 || typeof expect.bugServer.note !== 'string') {
        problems.push('"expect.bugServer" needs "mustFail", a list of test titles, and "note", a text')
      }
      if (found.kind !== 'e2e' || expect.outcome !== 'pass') problems.push('"expect.bugServer" is for an e2e case that wants a passing spec')
    }
    if (expect.mutants !== undefined && (found.kind === 'e2e' || found.kind === 'plan')) {
      problems.push('"expect.mutants" is for a Vitest case. An e2e case uses "expect.bugServer"')
    }
    for (const rule of expect.content ?? []) {
      const known = ['glob', 'exists', 'firstLine', 'absent', 'assertsInEveryTest', 'inCode', 'why']
      const unknown = Object.keys(rule).filter((key) => !known.includes(key))
      if (unknown.length > 0) problems.push(`a content rule has the unknown key ${unknown.join(', ')}. The keys are ${known.join(', ')}`)
      if (typeof rule.glob !== 'string' && !Array.isArray(rule.glob)) problems.push('every content rule needs "glob"')
    }
  }
  for (const edit of found.setup?.edits ?? []) {
    for (const key of ['file', 'find', 'replace']) {
      if (typeof edit[key] !== 'string') problems.push(`every "setup.edits" entry needs "${key}"`)
    }
  }
  if (problems.length > 0) throw new EvalError(`${path}: ${problems.join('; ')}.`)
  return { ...found, server: found.server ?? null, setup: { remove: [], edits: [], ...found.setup } }
}

// Reads <run>/meta.json and returns it with the sandbox path.
export function readRun(runDir) {
  const root = resolve(runDir)
  const metaPath = join(root, META_NAME)
  if (!existsSync(metaPath)) {
    throw new EvalError(`${root} has no ${META_NAME}. Give the folder that make-sandbox.mjs wrote with --out.`)
  }
  const meta = readJson(metaPath)
  const sandbox = join(root, SANDBOX_NAME)
  if (!existsSync(sandbox)) throw new EvalError(`${root} has no ${SANDBOX_NAME}/ folder.`)
  return { root, meta, sandbox }
}

// Fills {{BASE_URL}} and {{SANDBOX}} in a case text or an environment note.
// A name with no value stops the run, unless `missing` gives a word to use.
export function fill(text, values, missing = null) {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (whole, name) => {
    if (values[name] != null) return String(values[name])
    if (missing !== null) return missing
    throw new EvalError(`The text uses {{${name}}}, but this run has no value for it.`)
  })
}

// Turns a glob into a pattern. `*` stays inside one folder, `**` crosses folders.
export function globToRegExp(glob) {
  let source = ''
  for (let at = 0; at < glob.length; at += 1) {
    const char = glob[at]
    if (char === '*' && glob[at + 1] === '*') {
      source += '.*'
      at += glob[at + 2] === '/' ? 2 : 1
    } else if (char === '*') {
      source += '[^/]*'
    } else {
      source += char.replace(/[\\^$+?.()|[\]{}]/g, '\\$&')
    }
  }
  return new RegExp(`^${source}$`)
}

export function matchesAny(path, globs) {
  return globs.some((glob) => globToRegExp(glob).test(path))
}

// Splits a Markdown file into its frontmatter values and its body. Each
// frontmatter value is one line, the way Cursor's own parser reads it.
export function splitFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!match) return { data: {}, body: text.trim() }
  const data = {}
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(':')
    if (colon > 0 && !/^\s/.test(line)) {
      data[line.slice(0, colon).trim()] = line.slice(colon + 1).trim().replace(/^(["'])(.*)\1$/, '$2')
    }
  }
  return { data, body: text.slice(match[0].length).trim() }
}

// The reply form of a skill: the fenced block that has a `Verdict:` line.
// Returns the field names in order, and the example lines as written.
export function replyForm(skillText) {
  const lines = skillText.split(/\r?\n/)
  const blocks = []
  let open = null
  for (const line of lines) {
    const fence = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fence && open === null) {
      open = { fence: fence[1], lines: [] }
    } else if (fence && open !== null && line.trim().startsWith(open.fence)) {
      blocks.push(open.lines)
      open = null
    } else if (open !== null) {
      open.lines.push(line.trim())
    }
  }
  const block = blocks.filter((candidate) => candidate.some((line) => /^Verdict:/.test(line))).at(-1)
  if (!block) return null
  const fields = []
  for (const line of block) {
    const match = /^([A-Z][^:]*):(\s|$)/.exec(line)
    if (match && !fields.includes(match[1])) fields.push(match[1])
  }
  return { fields, lines: block.filter((line) => line !== '') }
}

// Every file under `root`, as paths with forward slashes. `skip` holds folder
// and file names that are never entered.
export function walkFiles(root, skip = new Set()) {
  const found = []
  const visit = (relative) => {
    for (const name of readdirSync(join(root, relative)).sort()) {
      if (skip.has(name)) continue
      const path = relative === '' ? name : `${relative}/${name}`
      const stats = statSync(join(root, path), { throwIfNoEntry: false })
      if (!stats) continue
      if (stats.isDirectory()) visit(path)
      else if (stats.isFile()) found.push(path)
    }
  }
  if (existsSync(root)) visit('')
  return found
}

// Recreates the folder tree of `from` in `to` with a hard link for every
// file, like `cp -al`. A file that cannot be linked is copied.
export function linkTree(from, to, counts = { linked: 0, copied: 0, folders: 0, symlinks: 0 }) {
  mkdirSync(to, { recursive: true })
  counts.folders += 1
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name)
    const target = join(to, entry.name)
    if (entry.isSymbolicLink()) {
      symlinkSync(readlinkSync(source), target)
      counts.symlinks += 1
    } else if (entry.isDirectory()) {
      linkTree(source, target, counts)
    } else if (entry.isFile()) {
      try {
        linkSync(source, target)
        counts.linked += 1
      } catch (error) {
        if (!['EXDEV', 'EPERM', 'EMLINK', 'ENOTSUP'].includes(error.code)) throw error
        copyFileSync(source, target)
        counts.copied += 1
      }
    }
  }
  return counts
}

// Folders and files that tools write and that are not the agent's work.
// .playwright-cli holds the page snapshots and console logs that playwright-cli
// saves while /qa-plan and /qa-generate look at the app. .playwright-mcp is
// what the Playwright MCP server saved for the kit before that.
export const GENERATED = new Set([
  'node_modules',
  '.git',
  '.next',
  'out',
  'coverage',
  'test-results',
  'playwright-report',
  'blob-report',
  '.vitest',
  '.playwright-cli',
  '.playwright',
  '.playwright-mcp',
  'next-env.d.ts',
  'tsconfig.tsbuildinfo',
  'package-lock.json',
  '__pycache__',
])

export async function responds(url, timeoutMs = 5000) {
  try {
    await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })
    return true
  } catch {
    return false
  }
}

// Asks the hook installed in `root` about one event, the way Cursor does: the
// command from .cursor/hooks.json, run in the project root, JSON on stdin.
// Returns { permission, message }, or { permission: null, problem }.
export function askHook(root, event, payload) {
  let command
  try {
    command = JSON.parse(readFileSync(join(root, '.cursor', 'hooks.json'), 'utf8')).hooks?.[event]?.[0]?.command
  } catch (error) {
    return { permission: null, problem: `could not read .cursor/hooks.json: ${error.message}` }
  }
  if (typeof command !== 'string') {
    return { permission: null, problem: `.cursor/hooks.json has no hooks.${event}[0].command` }
  }
  const result = spawnSync(command, {
    cwd: root,
    shell: true,
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 16 * 1024 * 1024,
    input: JSON.stringify({ hook_event_name: event, workspace_roots: [root], ...payload }),
  })
  try {
    const answer = JSON.parse(result.stdout)
    return { permission: answer.permission ?? null, message: answer.user_message ?? answer.agent_message ?? '' }
  } catch {
    const last = (result.stderr || result.stdout || result.error?.message || '').trim().split(/\r?\n/).at(-1)
    return { permission: null, problem: `the hook did not answer with JSON (exit ${result.status}): ${last}` }
  }
}

// How the agent reaches its instructions in this sandbox. `read` returns the
// text of a file in the sandbox, or null.
//   skill     Cursor inlines .cursor/skills/<skill>/SKILL.md for `/<skill> ...`.
//   qa-agent  The kit before the per-job skills: `/qa ...` goes to .cursor/agents/qa.md.
//   none      Neither file is there.
export function routeOf(read, skill) {
  if (read(`.cursor/skills/${skill}/SKILL.md`) !== null) return 'skill'
  if (read('.cursor/agents/qa.md') !== null) return 'qa-agent'
  return 'none'
}

// A skill's example form with some lines replaced. `overrides` maps a field
// name to the text for its line. A line that is not named stays as the skill
// wrote it.
export function fillForm(form, overrides, values = {}) {
  return form.lines
    .map((line) => {
      const field = /^([A-Z][^:]*):/.exec(line)?.[1]
      return field && field in overrides ? `${field}: ${fill(overrides[field], values)}` : line
    })
    .join('\n')
}

// What a skill text gives away of a product-bug case: the source line of the
// bug, or the wrong text the app shows. A run with such a skill cannot show
// that the agent found the bug.
export function answersInSkill(skillText, testCase) {
  const bug = testCase.expect?.bug
  if (!bug || typeof skillText !== 'string') return []
  const found = []
  if (skillText.includes(`${bug.file}:${bug.line}`)) found.push(`${bug.file}:${bug.line}`)
  if (typeof bug.got === 'string' && skillText.includes(bug.got)) found.push(`"${bug.got}"`)
  return found
}

// --- The browser an agent opened ----------------------------------------------

// The names of the open sessions in the output of `playwright-cli list --json`.
// Null when the text is not that output.
export function openSessionNames(text) {
  let listed
  try {
    listed = JSON.parse(text)
  } catch {
    return null
  }
  if (!Array.isArray(listed?.browsers)) return null
  return listed.browsers.filter((browser) => browser?.status === 'open').map((browser) => String(browser.name))
}

const CLI = ['--no-install', 'playwright-cli']
const hasCli = (sandbox) => existsSync(join(sandbox, 'node_modules', '@playwright', 'cli', 'package.json'))
// Once a day playwright-cli asks the npm registry for a newer version and
// prints a notice. This variable turns that off for the harness's own calls.
const cliEnv = () => ({ ...process.env, NO_UPDATE_NOTIFIER: '1' })

// The playwright-cli sessions of a sandbox that are still open: the browsers
// its agent started and did not close. playwright-cli keeps its sessions per
// project folder, so the answer holds only this sandbox's. It is asked with
// the sandbox's own copy of the CLI, because the copy is what names the
// project. Returns { names } or { problem }, and null when the sandbox has no
// playwright-cli, for example after --clean.
export function browserSessions(sandbox) {
  if (!hasCli(sandbox)) return null
  const listed = run('npx', [...CLI, 'list', '--json'], { cwd: sandbox, env: cliEnv(), timeoutMs: 60_000 })
  const names = listed.status === 0 ? openSessionNames(listed.stdout) : null
  if (names === null) {
    const last = (listed.stderr || listed.stdout || listed.error?.message || '').trim().split(/\r?\n/).at(-1)
    return { problem: `\`npx ${CLI.join(' ')} list --json\` gave no list (exit ${listed.status}): ${last}` }
  }
  return { names }
}

// Closes the open sessions of a sandbox and returns their names. `close-all`
// reaches only the sessions of the folder it runs in.
export function closeBrowserSessions(sandbox) {
  const open = browserSessions(sandbox)
  if (!open?.names || open.names.length === 0) return []
  run('npx', [...CLI, 'close-all'], { cwd: sandbox, env: cliEnv(), timeoutMs: 60_000 })
  const left = browserSessions(sandbox)?.names ?? []
  return open.names.filter((name) => !left.includes(name))
}

// --- Temporary folders ------------------------------------------------------

const HOLDER_PREFIX = 'cursor-qa-eval-'
const STALE_AFTER_MS = 6 * 60 * 60 * 1000
const holders = new Set()
let holdersHooked = false

// Removes holders that an earlier run left in `folder` because it was killed.
// Only ones that nothing has written to for six hours: no run takes that long.
export function sweepHolders(folder = tmpdir(), now = Date.now()) {
  const swept = []
  let names = []
  try {
    names = readdirSync(folder)
  } catch {
    return swept
  }
  for (const name of names) {
    if (!name.startsWith(HOLDER_PREFIX)) continue
    const path = join(folder, name)
    try {
      const stats = statSync(path)
      if (!stats.isDirectory() || now - stats.mtimeMs < STALE_AFTER_MS) continue
      rmSync(path, { recursive: true, force: true })
      swept.push(name)
    } catch {
      // Someone else's folder, or it went away in the meantime.
    }
  }
  return swept
}

// A new folder in the system's temporary folder. `dropHolder` removes it. One
// that is still there when the process ends is removed then. So is one that
// is there when Ctrl+C or a TERM signal arrives: the signal is handled as soon
// as the script waits, see `breath`.
export function tempHolder(name) {
  if (!holdersHooked) {
    holdersHooked = true
    sweepHolders()
    const dropAll = () => {
      for (const holder of [...holders]) dropHolder(holder)
    }
    process.once('exit', dropAll)
    for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
      process.once(signal, () => {
        dropAll()
        process.exit(code)
      })
    }
  }
  const holder = mkdtempSync(join(tmpdir(), `${HOLDER_PREFIX}${name}-`))
  holders.add(holder)
  return holder
}

export function dropHolder(holder) {
  holders.delete(holder)
  rmSync(holder, { recursive: true, force: true })
}

// Lets a signal that arrived during a command be handled. A script that runs
// one command after another without a pause never sees Ctrl+C. Await this
// between two commands.
export const breath = () => new Promise((resolve) => setImmediate(resolve))

// --- Inodes -----------------------------------------------------------------

// A file system has a fixed number of inodes: one for each file, folder, and
// link. A tmpfs, which is what /tmp is on many Linux systems, also counts one
// for every hard link. So a hard-linked node_modules costs as many inodes
// there as it has files, and a few dozen sandboxes use them all up. Then
// every write fails with "no space left on device", with gigabytes free.

const TMPFS_MAGIC = 0x01021994

// The free inodes of the file system that holds `path`. Null when the system
// does not say: Windows, or a file system without a fixed number.
export function inodesAt(path) {
  let current = resolve(path)
  while (!existsSync(current) && dirname(current) !== current) current = dirname(current)
  try {
    const stats = statfsSync(current)
    if (!(Number(stats.files) > 0)) return null
    return { free: Number(stats.ffree), total: Number(stats.files), tmpfs: Number(stats.type) === TMPFS_MAGIC }
  } catch {
    return null
  }
}

// The files and folders under `root`. A link counts as a file and is not followed.
export function countTree(root, counts = { files: 0, folders: 0 }) {
  counts.folders += 1
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) countTree(join(root, entry.name), counts)
    else counts.files += 1
  }
  return counts
}

// Room that must stay free after a new hard-linked tree: the sandbox's own
// files, test output, and whatever else is using the file system.
export const INODE_MARGIN = 5000

// Says whether one more hard-linked copy of a tree fits.
//   inodes  what inodesAt() returned
//   tree    what countTree() returned for the tree to link
//   copied  true when the tree is on another file system, so every file is
//           copied and costs an inode on any kind of file system
// Returns { level, needed, fits }. `fits` is how many copies fit, this one
// included. `level` is `stop` when this copy does not fit, `warn` when fewer
// than three more fit after it, and `ok` otherwise.
export function inodeAdvice(inodes, tree, { copied = false } = {}) {
  if (inodes === null) return { level: 'ok', needed: null, fits: null }
  const needed = inodes.tmpfs || copied ? tree.files + tree.folders : tree.folders
  const fits = Math.max(0, Math.floor((inodes.free - INODE_MARGIN) / needed))
  return { level: fits < 1 ? 'stop' : fits < 4 ? 'warn' : 'ok', needed, fits }
}

// The lines to print for an advice that is not `ok`. A `stop` is printed in
// place of the links. A `warn` is printed after them, and `inodes` is what
// was free before.
export function inodeLines(advice, inodes, where) {
  if (advice.level === 'ok') return []
  const kind = inodes.tmpfs ? 'a tmpfs, which counts one inode for every hard link and every file' : 'a file system with few free inodes'
  const after = advice.fits - 1
  const room = after === 0 ? 'no more fit' : after === 1 ? '1 more fits' : `${after} more fit`
  return [
    advice.level === 'stop'
      ? `${where} is on ${kind}. It has ${inodes.free} free inodes of ${inodes.total}.`
      : `${where} is on ${kind}. It had ${inodes.free} free inodes of ${inodes.total} before this sandbox.`,
    `One sandbox uses about ${advice.needed} there, so ${advice.level === 'stop' ? 'this one does not fit' : `${room} after this one`}.`,
    'Give --out a folder on a disk, or free the inodes of finished runs: node eval/make-sandbox.mjs --clean <run-folder>',
  ]
}

// Hard-links the node_modules of `baseDir` into `appDir`. Stops before the
// first link when the file system of `appDir` has too few free inodes for it.
// `inodes` is what inodesAt() gives for `appDir`. A test passes its own.
export function linkNodeModules(baseDir, appDir, log = () => {}, inodes = inodesAt(appDir)) {
  const source = join(baseDir, 'node_modules')
  const target = join(appDir, 'node_modules')
  // A hard link cannot cross file systems. linkTree() then copies each file.
  const copied = statSync(source).dev !== statSync(appDir).dev
  const advice = inodeAdvice(inodes, inodes === null ? { files: 0, folders: 0 } : countTree(source), { copied })
  const lines = inodeLines(advice, inodes, appDir)
  if (advice.level === 'stop') throw new EvalError(lines.join('\n  '))
  const started = Date.now()
  const counts = linkTree(source, target)
  const how = counts.copied === 0 ? `${counts.linked} hard links` : `${counts.linked} hard links and ${counts.copied} copies`
  log(`node_modules: ${how} from ${baseDir} in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  if (counts.copied > 0) {
    log('Files were copied because --base is on another file system than --out. Put them on the same one to save time and space.')
  }
  if (lines.length > 0) log(`Warning:  ${lines.join('\n          ')}`)
  else if (inodes?.tmpfs) log(`Inodes:   about ${advice.needed} used on this tmpfs, which counts every hard link. ${advice.fits - 1} more sandboxes fit.`)
  return { counts, advice, inodes }
}

// --- A finished run ---------------------------------------------------------

// Everything the agent changed in a sandbox, as one patch against the
// baseline commit: tracked and new files, without what tools generate. It is
// worked out with an index and an object folder of its own, so the sandbox's
// repository stays as it is.
export function diffOfRun(sandbox, baseline) {
  const holder = tempHolder('diff')
  try {
    const objects = join(holder, 'objects')
    mkdirSync(objects)
    const gitDir = git(sandbox, ['rev-parse', '--absolute-git-dir']).trim()
    const env = {
      ...process.env,
      GIT_INDEX_FILE: join(holder, 'index'),
      GIT_OBJECT_DIRECTORY: objects,
      GIT_ALTERNATE_OBJECT_DIRECTORIES: join(gitDir, 'objects'),
    }
    const quiet = ['-c', `core.excludesFile=${devNull}`, '-c', 'core.quotePath=false', '-c', 'core.autocrlf=false']
    const paths = ['--', '.', ...[...GENERATED].flatMap((name) => [`:(exclude,glob)**/${name}/**`, `:(exclude,glob)**/${name}`])]
    git(sandbox, [...quiet, 'read-tree', baseline], { env })
    git(sandbox, [...quiet, 'add', '-A', ...paths], { env })
    return git(sandbox, [...quiet, 'diff', '--cached', '--binary', '--no-renames', '--no-color', '--no-ext-diff', baseline, ...paths], { env })
  } finally {
    dropHolder(holder)
  }
}

// What --clean removes from a sandbox. Both can be built again.
export const REBUILDABLE = ['node_modules', '.next']
export const DIFF_NAME = 'changes.diff'

// Frees the inodes and the space of a finished run. Writes the agent's
// changes to <run>/changes.diff, then removes node_modules and .next from the
// sandbox. The sandbox's own files, its git repository, meta.json, the reply,
// and score.json stay.
//
// A browser that the agent left open is closed first. Once node_modules is
// gone, the sandbox has no playwright-cli to close it with, and the browser
// would run until playwright-cli closes it for being idle.
export function cleanRun(runDir) {
  const { root, meta, sandbox } = readRun(runDir)
  const diff = diffOfRun(sandbox, meta.baseline)
  writeFileSync(join(root, DIFF_NAME), diff)
  const closed = closeBrowserSessions(sandbox)
  const removed = []
  for (const name of REBUILDABLE) {
    const path = join(sandbox, name)
    const stats = statSync(path, { throwIfNoEntry: false })
    if (!stats) continue
    const tree = stats.isDirectory() ? countTree(path) : { files: 1, folders: 0 }
    rmSync(path, { recursive: true, force: true })
    removed.push({ name, entries: tree.files + tree.folders })
  }
  const kept = [META_NAME, DIFF_NAME, ...readdirSync(root).filter((name) => /^(reply.*\.txt|score\.json|prompt\.txt)$/.test(name))]
  return { root, sandbox, removed, kept, closed, diffBytes: Buffer.byteLength(diff) }
}

// One line for what cleanRun() did.
export function cleanReport(cleaned) {
  const gone = cleaned.removed.map((entry) => `${entry.name} (${entry.entries} files and folders)`).join(', ')
  const closed = (cleaned.closed ?? []).length > 0 ? ` Closed the browser the agent left open: ${cleaned.closed.join(', ')}.` : ''
  return `Cleaned:  ${cleaned.root}.${closed} Removed from the sandbox: ${gone || 'nothing, it was clean'}. Kept: ${cleaned.kept.join(', ')}, and the sandbox's own files.`
}

// Puts node_modules back into a sandbox that --clean emptied, from the shared
// folder that meta.json names, so the run can be scored again.
export function relinkRun(runDir, log = () => {}) {
  const { root, meta, sandbox } = readRun(runDir)
  if (existsSync(join(sandbox, 'node_modules'))) throw new EvalError(`${join(sandbox, 'node_modules')} is already there.`)
  if (typeof meta.base !== 'string' || !existsSync(join(meta.base, 'node_modules'))) {
    throw new EvalError(`The shared node_modules of this run are gone (${meta.base ?? 'meta.json names no base'}). Build a new sandbox.`)
  }
  return { root, sandbox, ...linkNodeModules(meta.base, sandbox, log) }
}
