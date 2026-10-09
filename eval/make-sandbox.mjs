#!/usr/bin/env node
// Builds one sandbox for one eval case: a copy of examples/next-app with the
// kit installed, the case's start state applied, and one baseline commit in
// its own git repository, so score.mjs can see what an agent changed.
//
//   node eval/make-sandbox.mjs --case unit-ui --out ../runs/unit-ui
//   node eval/make-sandbox.mjs --case unit-ui --out ../runs/unit-ui-before --kit-ref origin/main
//   node eval/make-sandbox.mjs --server normal --out ../runs/server-normal
//   node eval/make-sandbox.mjs --server bug --out ../runs/server-bug
//   node eval/make-sandbox.mjs --clean ../runs/unit-ui
//   node eval/make-sandbox.mjs --relink ../runs/unit-ui
//   node eval/make-sandbox.mjs --list
//
// --out must be outside this repository. For a case it becomes:
//
//   <out>/sandbox/    the app the agent works in
//   <out>/meta.json   how the sandbox was built; score.mjs and prompt.mjs read it
//
// The kit comes from the working tree, uncommitted changes included, or from
// a git ref with --kit-ref. node_modules is installed once per set of
// dependencies in a base folder and hard-linked into every sandbox.
//
// --clean <run-folder> is for a run that has been scored. It writes the
// agent's changes to <run-folder>/changes.diff and removes node_modules and
// .next from the sandbox. meta.json, the reply, and score.json stay.
// --relink <run-folder> puts node_modules back, to score the run again.
//
// Node built-ins only. The only git commands that write run inside the sandbox.

import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs'
import { devNull, tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import {
  COPY_MARKER,
  DEV_DEPENDENCIES_MARKER,
  InstallError,
  install,
} from '../scripts/install-into.mjs'
import {
  DEFAULT_APP_PORT,
  DEFAULT_BUG_PORT,
  EXAMPLE,
  EvalError,
  KIT_ROOT,
  META_NAME,
  SANDBOX_NAME,
  answersInSkill,
  askHook,
  cleanReport,
  cleanRun,
  git,
  linkNodeModules,
  listCaseIds,
  loadCase,
  relinkRun,
  responds,
  routeOf,
  run,
} from './lib.mjs'

const USAGE = `Usage:
  node eval/make-sandbox.mjs --case <id> --out <folder> [options]
  node eval/make-sandbox.mjs --server normal|bug --out <folder> [options]
  node eval/make-sandbox.mjs --clean <run-folder>
  node eval/make-sandbox.mjs --relink <run-folder>
  node eval/make-sandbox.mjs --list

  --case <id>       The case to build a sandbox for. --list prints the ids.
  --out <folder>    Where to build. Must be outside this repository.
  --kit-ref <ref>   Install the kit as it is at this git ref, for example
                    origin/main. Without it the working tree is installed.
  --base <folder>   Where the shared node_modules are kept.
                    Default: .eval-base next to --out.
  --app-port <n>    Port of the server for the normal app. Default ${DEFAULT_APP_PORT}.
  --bug-port <n>    Port of the server for the product-bug app. Default ${DEFAULT_BUG_PORT}.
  --server <which>  Build an app copy to run a server from, not a sandbox.
  --skip-browser    Do not run \`npx playwright install chromium\` after a new base install.
  --force           Replace --out if it exists.
  --clean <folder>  For a scored run: write its changes to changes.diff, then remove
                    node_modules and .next from its sandbox. Frees about 16,000 inodes.
  --relink <folder> Put node_modules back into a cleaned run, to score it again.`

// Generated files a maintainer may have in examples/next-app, and two files
// that would tell the agent about the reference tests.
const NOT_COPIED_FROM_EXAMPLE = new Set([
  'node_modules',
  '.next',
  'out',
  'package-lock.json',
  'next-env.d.ts',
  'tsconfig.tsbuildinfo',
  'coverage',
  'test-results',
  'playwright-report',
  'README.md',
  '.markdownlint-cli2.jsonc',
])

const DEFAULT_URL = 'http://localhost:3000'

const log = (line) => console.log(line)

function isInside(parent, child) {
  const path = relative(parent, child)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

// The folder that will hold `path`, with links resolved, even when `path`
// does not exist yet.
function realParent(path) {
  let current = resolve(path)
  while (!existsSync(current)) current = dirname(current)
  return join(realpathSync(current), relative(current, resolve(path)))
}

function prepareOut(out, force) {
  const target = resolve(out)
  if (isInside(realpathSync(KIT_ROOT), realParent(target))) {
    throw new EvalError(`${target} is inside this repository. Give --out a folder outside it.`)
  }
  if (existsSync(target) && readdirSync(target).length > 0) {
    if (!force) throw new EvalError(`${target} exists and is not empty. Pass --force to replace it.`)
    rmSync(target, { recursive: true, force: true })
  }
  mkdirSync(target, { recursive: true })
  return target
}

function copyExample(target) {
  if (!existsSync(join(EXAMPLE, 'package.json'))) {
    throw new EvalError(`${EXAMPLE} has no package.json. The example app is missing from this working tree.`)
  }
  cpSync(EXAMPLE, target, {
    recursive: true,
    filter: (source) => {
      const path = relative(EXAMPLE, source)
      return !NOT_COPIED_FROM_EXAMPLE.has(path.split(sep)[0])
    },
  })
}

// --- The kit to install -----------------------------------------------------

function describeWorkingTree() {
  const commit = git(KIT_ROOT, ['rev-parse', 'HEAD']).trim()
  const dirty = git(KIT_ROOT, ['status', '--porcelain']).trim() !== ''
  return { source: 'working-tree', ref: null, commit, dirty, root: KIT_ROOT }
}

// Unpacks the repository as it is at `ref` into a temporary folder.
function extractRef(ref) {
  const commit = git(KIT_ROOT, ['rev-parse', '--verify', `${ref}^{commit}`]).trim()
  const holder = mkdtempSync(join(tmpdir(), 'cursor-qa-eval-kit-'))
  const root = join(holder, 'kit')
  mkdirSync(root)
  const tar = join(holder, 'kit.tar')
  git(KIT_ROOT, ['archive', '--format=tar', '-o', tar, commit])
  const unpacked = run('tar', ['-xf', tar, '-C', root])
  if (unpacked.status !== 0) {
    throw new EvalError(`Could not unpack the kit at ${ref}: ${unpacked.stderr.trim() || unpacked.error?.message}`)
  }
  return { source: 'ref', ref, commit, dirty: false, root, holder }
}

// A ref from before scripts/install-into.mjs has no install markers in its
// README. Its install steps were: copy the paths in the first code block under
// "Add it to your app", and add every devDependency of its package.json. This
// writes those two lists, with markers, into the temporary copy's README, so
// the installer performs that README's steps. The README is not a file the
// installer copies.
function addInstallMarkers(kitRoot) {
  const path = join(kitRoot, 'README.md')
  const readme = readFileSync(path, 'utf8')
  if (readme.includes(COPY_MARKER) && readme.includes(DEV_DEPENDENCIES_MARKER)) return null
  const lines = readme.split(/\r?\n/)
  const heading = lines.findIndex((line) => /^##\s+Add it to your app\s*$/.test(line))
  const fence = heading === -1 ? -1 : lines.findIndex((line, index) => index > heading && /^```/.test(line))
  if (fence === -1) {
    throw new EvalError(
      `The README at this ref has no install markers and no code block under "## Add it to your app", so the copy list is unknown.`,
    )
  }
  const copyList = lines[fence + 1].trim()
  const devDependencies = Object.keys(JSON.parse(readFileSync(join(kitRoot, 'package.json'), 'utf8')).devDependencies ?? {})
  lines.splice(fence, 0, COPY_MARKER, '')
  lines.push('', DEV_DEPENDENCIES_MARKER, '', '```text', ...devDependencies, '```', '')
  writeFileSync(path, lines.join('\n'))
  return `The README at this ref has no install markers. Used its own steps: copy "${copyList}", add every devDependency of its package.json.`
}

function installKit(appDir, kit) {
  const note = kit.source === 'ref' ? addInstallMarkers(kit.root) : null
  let report
  try {
    report = install(appDir, { kitRoot: kit.root })
  } catch (error) {
    if (error instanceof InstallError) throw new EvalError(`The kit could not be installed: ${error.message}`)
    throw error
  }
  const count = (list, action) => list.filter((entry) => entry.action === action).length
  const skipped = [
    ...report.files.filter((entry) => entry.action === 'skip').map((entry) => entry.file),
    ...report.devDependencies.filter((entry) => entry.action === 'skip').map((entry) => entry.name),
    ...report.scripts.filter((entry) => entry.action === 'skip').map((entry) => entry.name),
  ]
  return {
    note,
    filesAdded: count(report.files, 'add'),
    devDependenciesAdded: count(report.devDependencies, 'add'),
    scriptsAdded: count(report.scripts, 'add'),
    skipped,
  }
}

// --- Shared node_modules ----------------------------------------------------

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

// Installs the dependencies of `packagePath` once and returns the folder that
// holds them. Two sandboxes with the same dependencies share one folder.
function ensureBase(baseRoot, packagePath, { browser }) {
  const packageText = readFileSync(packagePath, 'utf8')
  const packageJson = JSON.parse(packageText)
  const sorted = (object = {}) => Object.entries(object).sort(([a], [b]) => (a < b ? -1 : 1))
  const key = createHash('sha256')
    .update(JSON.stringify([sorted(packageJson.dependencies), sorted(packageJson.devDependencies)]))
    .digest('hex')
    .slice(0, 12)
  const dir = join(baseRoot, key)
  const done = join(dir, '.installed')
  if (existsSync(done)) return { dir, fresh: false }

  mkdirSync(baseRoot, { recursive: true })
  const lock = `${dir}.lock`
  for (let waited = 0; ; waited += 1) {
    try {
      mkdirSync(lock)
      break
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      if (waited === 0) log(`Another make-sandbox is installing into ${dir}. Waiting for it.`)
      if (waited > 900) throw new EvalError(`${lock} has been there for 15 minutes. Remove it and try again.`)
      sleepSync(1000)
      if (existsSync(done)) return { dir, fresh: false }
    }
  }
  try {
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), packageText)
    log(`Installing dependencies once into ${dir}`)
    const installed = run('npm', ['install', '--no-audit', '--no-fund'], { cwd: dir, inherit: true, timeoutMs: 15 * 60_000 })
    if (installed.status !== 0) throw new EvalError(`npm install failed in ${dir}.`)
    if (browser) {
      const chromium = run('npx', ['playwright', 'install', 'chromium'], { cwd: dir, inherit: true, timeoutMs: 15 * 60_000 })
      if (chromium.status !== 0) throw new EvalError(`npx playwright install chromium failed in ${dir}.`)
    }
    writeFileSync(done, `${new Date().toISOString()}\n`)
  } finally {
    rmdirSync(lock)
  }
  return { dir, fresh: true }
}

// Stops before the first link when the file system of `appDir` has too few
// free inodes, and warns when only a few more sandboxes fit.
function shareNodeModules(appDir, baseRoot, browser) {
  const base = ensureBase(baseRoot, join(appDir, 'package.json'), { browser })
  linkNodeModules(base.dir, appDir, log)
  const lockfile = join(base.dir, 'package-lock.json')
  if (existsSync(lockfile)) cpSync(lockfile, join(appDir, 'package-lock.json'))
  return base.dir
}

// --- The case's start state -------------------------------------------------

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length
}

// Replaces the one place where `find` occurs. A case edit that no longer
// matches means the example app or a reference test changed.
export function applyEdit(root, edit, caseId) {
  const path = join(root, edit.file)
  if (!existsSync(path)) throw new EvalError(`Case ${caseId}: ${edit.file} is not in the app. Update the case.`)
  const text = readFileSync(path, 'utf8')
  const found = text.split(edit.find).length - 1
  if (found !== 1) {
    throw new EvalError(
      `Case ${caseId}: the text to replace in ${edit.file} occurs ${found} times, not once. The file changed. Update the case.`,
    )
  }
  const at = text.indexOf(edit.find)
  if (typeof edit.line === 'number' && lineOf(text, at) !== edit.line) {
    throw new EvalError(
      `Case ${caseId}: the text to replace in ${edit.file} is on line ${lineOf(text, at)}, and the case says line ${edit.line}. Update the case.`,
    )
  }
  writeFileSync(path, text.slice(0, at) + edit.replace + text.slice(at + edit.find.length))
}

function removeEmptyFolders(root, folder) {
  let current = folder
  while (current !== '.' && current !== '' && isInside(root, join(root, current))) {
    const path = join(root, current)
    if (!existsSync(path) || readdirSync(path).length > 0) return
    rmdirSync(path)
    current = dirname(current)
  }
}

function applySetup(sandbox, testCase) {
  for (const file of testCase.setup.remove) {
    const path = join(sandbox, file)
    if (!existsSync(path)) {
      throw new EvalError(`Case ${testCase.id}: ${file} is not in the app, so it cannot be removed. Update the case.`)
    }
    rmSync(path)
    removeEmptyFolders(sandbox, dirname(file))
  }
  for (const edit of testCase.setup.edits) applyEdit(sandbox, edit, testCase.id)
}

// Makes the plain test command reach the server the person running the eval
// started: the default base URL in playwright.config.ts gets that server's port.
function pointPlaywrightAt(sandbox, url) {
  const path = join(sandbox, 'playwright.config.ts')
  if (!existsSync(path)) throw new EvalError('The installed kit has no playwright.config.ts.')
  const text = readFileSync(path, 'utf8')
  if (!text.includes(DEFAULT_URL)) {
    throw new EvalError(`playwright.config.ts does not contain ${DEFAULT_URL}, so its default base URL cannot be changed.`)
  }
  writeFileSync(path, text.split(DEFAULT_URL).join(url))
}

// The edits to application source of every case that uses the product-bug server.
function bugServerEdits() {
  const edits = new Map()
  for (const id of listCaseIds()) {
    const testCase = loadCase(id)
    if (testCase.server !== 'bug') continue
    for (const edit of testCase.setup.edits) {
      if (!edit.file.startsWith('test/')) edits.set(`${edit.file}\n${edit.find}`, { edit, id })
    }
  }
  return [...edits.values()]
}

// --- What is in the installed kit -------------------------------------------

const KIT_FILES = [
  'AGENTS.md',
  'vitest.config.ts',
  'playwright.config.ts',
  'test/setup.ts',
  'test/e2e/seed.spec.ts',
  '.cursorignore',
  '.cursor/hooks.json',
  '.cursor/hooks/guard-test-writes.py',
  '.cursor/mcp.json',
  '.cursor/qa/vitest-verdict.mjs',
  '.cursor/qa/playwright-verdict.mjs',
]

const TEST = `import { expect, it } from 'vitest'\n\nit('adds', () => {\n  expect(1 + 1).toBe(2)\n})\n`
const SPEC = `import { expect, test } from '@playwright/test'\n\ntest.fixme('home', async ({ page }) => {\n  await page.goto('/')\n  await expect(page).toHaveURL('/')\n})\n`

// Asks the installed hook a few fixed questions. The first two show that the
// guard is alive. The others show which of the newer rules it has.
function probeHook(sandbox) {
  const write = (file, content) => ({ tool_name: 'Write', tool_input: { file_path: join(sandbox, file), content } })
  const shell = (command) => ({ command, cwd: '' })
  const probes = [
    { name: 'allows a test file under test/', must: true, expected: 'allow', event: 'preToolUse', payload: write('test/unit/eval-probe.test.ts', TEST) },
    { name: 'denies a write to application source', must: true, expected: 'deny', event: 'preToolUse', payload: write('src/eval-probe.ts', 'export const probe = 1\n') },
    { name: 'denies a new .skip( in a test', expected: 'deny', event: 'preToolUse', payload: write('test/unit/eval-probe.test.ts', TEST.replace('it(', 'it.skip(')) },
    { name: 'denies a .tsx test file', expected: 'deny', event: 'preToolUse', payload: write('test/unit/eval-probe.test.tsx', TEST) },
    { name: 'denies test.fixme( without the product bug comment', expected: 'deny', event: 'preToolUse', payload: write('test/e2e/eval-probe.spec.ts', SPEC) },
    { name: 'allows the Vitest command the skills teach', expected: 'allow', event: 'beforeShellExecution', payload: shell('RTK_DISABLED=1 npx vitest run test/unit/lib/validation.test.ts') },
    { name: 'denies vitest without run', expected: 'deny', event: 'beforeShellExecution', payload: shell('RTK_DISABLED=1 npx vitest test/unit/lib/validation.test.ts') },
  ]
  return probes.map(({ name, must = false, expected, event, payload }) => {
    const answer = askHook(sandbox, event, payload)
    return { name, must, expected, got: answer.permission ?? `no answer: ${answer.problem}` }
  })
}

function reportKit(sandbox, testCase) {
  const read = (path) => (existsSync(join(sandbox, path)) ? readFileSync(join(sandbox, path), 'utf8') : null)
  const route = routeOf(read, testCase.skill)
  const missing = []

  if (route === 'none') {
    missing.push(`.cursor/skills/${testCase.skill}/SKILL.md and .cursor/agents/qa.md are both absent, so there is no prompt for this case`)
  }
  for (const file of KIT_FILES) {
    if (read(file) === null) missing.push(`${file} is not in the installed kit`)
  }
  if (route === 'skill') {
    const skill = read(`.cursor/skills/${testCase.skill}/SKILL.md`)
    const named = new Set([...skill.matchAll(/`(\.cursor\/[^`\s]+)`/g)].map((match) => match[1].replace(/\/$/, '')))
    for (const path of named) {
      if (!existsSync(join(sandbox, path))) missing.push(`the skill names ${path}, which is not in the installed kit`)
    }
  }

  const hookProbes = existsSync(join(sandbox, '.cursor', 'hooks.json')) ? probeHook(sandbox) : []
  for (const probe of hookProbes) {
    if (probe.got === probe.expected) continue
    missing.push(
      probe.must
        ? `the hook is not guarding writes: "${probe.name}" answered ${probe.got}`
        : `the hook has no rule for "${probe.name}" (answered ${probe.got})`,
    )
  }
  // A skill that prints the answer of this case makes the run say little.
  const answerInSkill = route === 'skill' ? answersInSkill(read(`.cursor/skills/${testCase.skill}/SKILL.md`), testCase) : []
  return { route, missing, hookProbes, answerInSkill }
}

// --- The two jobs -----------------------------------------------------------

// The commit message does not name the case: the agent can read the log.
function commitBaseline(sandbox) {
  const real = realpathSync(sandbox)
  if (isInside(realpathSync(KIT_ROOT), real)) throw new EvalError(`${real} is inside this repository.`)
  git(sandbox, ['init', '-q', '--initial-branch=main'])
  const top = realpathSync(git(sandbox, ['rev-parse', '--show-toplevel']).trim())
  if (top !== real) throw new EvalError(`git did not create a repository in ${real}. It reports ${top}.`)
  const quiet = ['-c', `core.excludesFile=${devNull}`, '-c', `core.hooksPath=${devNull}`, '-c', 'commit.gpgsign=false']
  git(sandbox, [...quiet, 'add', '-A'])
  git(sandbox, [
    ...quiet,
    '-c', 'user.name=qa-eval',
    '-c', 'user.email=qa-eval@example.invalid',
    'commit', '-q', '--no-verify', '-m', 'Baseline',
  ])
  return git(sandbox, ['rev-parse', 'HEAD']).trim()
}

async function buildSandbox(options) {
  const testCase = loadCase(options.case)
  const kit = options.kitRef ? extractRef(options.kitRef) : describeWorkingTree()
  let out
  let sandbox
  let installReport
  try {
    out = prepareOut(options.out, options.force)
    sandbox = join(out, SANDBOX_NAME)
    copyExample(sandbox)
    installReport = installKit(sandbox, kit)
  } finally {
    if (kit.holder) rmSync(kit.holder, { recursive: true, force: true })
  }
  const baseRoot = resolve(options.base ?? join(dirname(out), '.eval-base'))
  if (installReport.note) log(installReport.note)
  log(`Kit: ${installReport.filesAdded} files, ${installReport.devDependenciesAdded} dev dependencies, ${installReport.scriptsAdded} scripts added`)
  if (installReport.skipped.length > 0) log(`Kit: skipped because the example has its own: ${installReport.skipped.join(', ')}`)

  let base
  try {
    base = shareNodeModules(sandbox, baseRoot, !options.skipBrowser)
  } catch (error) {
    // Leave no half-built sandbox behind, for example when it does not fit.
    rmSync(out, { recursive: true, force: true })
    throw error
  }

  applySetup(sandbox, testCase)

  // Both URLs are recorded: a spec that passes on the normal app is also run
  // against the product-bug app by score.mjs.
  const servers = { normal: `http://localhost:${options.appPort}`, bug: `http://localhost:${options.bugPort}` }
  let server = null
  if (testCase.server) {
    server = { variant: testCase.server, url: servers[testCase.server] }
    pointPlaywrightAt(sandbox, server.url)
  }

  const kitReport = reportKit(sandbox, testCase)
  const baseline = commitBaseline(sandbox)

  const meta = {
    case: testCase.id,
    createdAt: new Date().toISOString(),
    kit: { source: kit.source, ref: kit.ref, commit: kit.commit, dirty: kit.dirty },
    route: kitReport.route,
    baseline,
    server,
    servers,
    base,
    install: installReport,
    missing: kitReport.missing,
    answerInSkill: kitReport.answerInSkill,
    hookProbes: kitReport.hookProbes,
    node: process.version,
  }
  writeFileSync(join(out, META_NAME), `${JSON.stringify(meta, null, 2)}\n`)

  const kitLine =
    kit.source === 'ref'
      ? `${kit.ref} at ${kit.commit.slice(0, 7)}`
      : `working tree at ${kit.commit.slice(0, 7)}${kit.dirty ? ' plus uncommitted changes' : ''}`
  log('')
  log(`Case:     ${testCase.id} (${testCase.title})`)
  log(`Kit:      ${kitLine}`)
  log(`Route:    ${kitReport.route === 'skill' ? `/${testCase.skill}` : kitReport.route === 'qa-agent' ? '/qa (the old route)' : 'none'}`)
  log(`Sandbox:  ${sandbox}`)
  log(`Baseline: ${baseline.slice(0, 7)}`)
  if (server) {
    const up = await responds(server.url, 2000)
    log(`Server:   ${server.url} must serve the ${server.variant === 'bug' ? 'product-bug' : 'normal'} app (make-sandbox.mjs --server ${server.variant})`)
    if (!up) log(`          Nothing answers there now. Start it before the agent runs.`)
  }
  if (testCase.setup.edits.length > 0 && sandbox.includes(testCase.id)) {
    log(`Warning:  the agent sees the path of its folder, and this one contains "${testCase.id}".`)
    log('          That can give the case away. Use a name such as run-01 for --out.')
  }
  if (kitReport.answerInSkill.length > 0) {
    log(`Warning:  the skill /${testCase.skill} prints the answer of this case: ${kitReport.answerInSkill.join(' and ')}.`)
    log('          A pass here does not show that the agent found the bug. Use an example from another screen in the skill.')
  }
  if (kitReport.missing.length === 0) {
    log('Missing:  nothing')
  } else {
    log('Missing:')
    for (const line of kitReport.missing) log(`  - ${line}`)
  }
  log('')
  log(`Next: node eval/prompt.mjs ${out}`)
}

function buildServer(options) {
  if (options.server !== 'normal' && options.server !== 'bug') {
    throw new EvalError('--server must be "normal" or "bug".')
  }
  const out = prepareOut(options.out, options.force)
  const baseRoot = resolve(options.base ?? join(dirname(out), '.eval-base'))
  copyExample(out)
  // The kit is installed only so that package.json lists the same
  // dependencies as a sandbox, and the same base node_modules fit.
  installKit(out, describeWorkingTree())
  try {
    shareNodeModules(out, baseRoot, !options.skipBrowser)
  } catch (error) {
    rmSync(out, { recursive: true, force: true })
    throw error
  }

  const edits = options.server === 'bug' ? bugServerEdits() : []
  for (const { edit, id } of edits) {
    applyEdit(out, edit, id)
    log(`Product bug from case ${id}: ${edit.file}:${edit.line ?? '?'} now has ${edit.replace}`)
  }
  const port = options.server === 'bug' ? options.bugPort : options.appPort
  log('')
  log(`App copy: ${out} (${options.server === 'bug' ? 'product-bug' : 'normal'} app)`)
  log(`Start it and leave it running:`)
  log(`  cd ${out} && npm run dev -- --port ${port}`)
}

function parsePort(text, flag) {
  const port = Number(text)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new EvalError(`${flag} must be a port number.`)
  return port
}

async function main(argv) {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        case: { type: 'string' },
        out: { type: 'string' },
        'kit-ref': { type: 'string' },
        base: { type: 'string' },
        'app-port': { type: 'string', default: String(DEFAULT_APP_PORT) },
        'bug-port': { type: 'string', default: String(DEFAULT_BUG_PORT) },
        server: { type: 'string' },
        'skip-browser': { type: 'boolean', default: false },
        force: { type: 'boolean', default: false },
        clean: { type: 'string' },
        relink: { type: 'string' },
        list: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    })
  } catch (error) {
    console.error(`${error.message}\n\n${USAGE}`)
    return 1
  }
  const { values } = parsed
  if (values.help) {
    log(USAGE)
    return 0
  }
  try {
    if (values.list) {
      for (const id of listCaseIds()) {
        const testCase = loadCase(id)
        log(`${id.padEnd(22)} /${testCase.skill.padEnd(12)} ${testCase.title}`)
      }
      return 0
    }
    if (values.clean || values.relink) {
      if (values.out || values.case || values.server || (values.clean && values.relink)) {
        console.error(`--clean and --relink take one run folder and no other action.\n\n${USAGE}`)
        return 1
      }
      if (values.clean) log(cleanReport(cleanRun(values.clean)))
      else {
        const linked = relinkRun(values.relink, log)
        log(`Relinked: ${linked.sandbox} has its node_modules again. Score it with: node eval/score.mjs ${linked.root} --reply <file>`)
      }
      return 0
    }
    if (!values.out || (!values.case && !values.server) || (values.case && values.server)) {
      console.error(`Give --out and one of --case or --server.\n\n${USAGE}`)
      return 1
    }
    const options = {
      case: values.case,
      out: values.out,
      kitRef: values['kit-ref'],
      base: values.base,
      appPort: parsePort(values['app-port'], '--app-port'),
      bugPort: parsePort(values['bug-port'], '--bug-port'),
      server: values.server,
      skipBrowser: values['skip-browser'],
      force: values.force,
    }
    if (options.server) buildServer(options)
    else await buildSandbox(options)
    return 0
  } catch (error) {
    if (!(error instanceof EvalError)) throw error
    console.error(`make-sandbox stopped: ${error.message}`)
    return 1
  }
}

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  process.exitCode = await main(process.argv.slice(2))
}
