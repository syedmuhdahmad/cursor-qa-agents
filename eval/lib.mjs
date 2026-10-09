// Shared by the eval scripts in this folder. Node built-ins only.

import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  statSync,
  symlinkSync,
} from 'node:fs'
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
export function git(cwd, args, { input } = {}) {
  const result = run('git', args, { cwd, input })
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
export function linkTree(from, to, counts = { linked: 0, copied: 0 }) {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name)
    const target = join(to, entry.name)
    if (entry.isSymbolicLink()) {
      symlinkSync(readlinkSync(source), target)
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
