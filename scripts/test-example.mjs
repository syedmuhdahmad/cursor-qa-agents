#!/usr/bin/env node
// Checks the kit end to end against the example app, the way a new user sets
// it up. Written for CI. It also runs on a maintainer's machine.
//
//   node scripts/test-example.mjs [--port <n>] [--keep] [--no-browse]
//
//   --port <n>   Port for the app during the end-to-end tests. Default 3000.
//   --keep       Keep the temporary folder when the run ends.
//   --no-browse  Leave out stage 13, on a machine without Google Chrome.
//
// It copies examples/next-app to a temporary folder, prints the folder path,
// and runs these stages there. It stops at the first failure and exits with 1.
//
//    1. node scripts/install-into.mjs <folder>   (the README's install steps)
//    2. check the installed files and the hook
//    3. npm install
//    4. npx --no-install playwright-cli --help, and check that it has every
//       command the skills use
//    5. npx playwright install chromium
//    6. npm run build
//    7. npm run test:unit
//    8. npm run test:integration
//    9. npx vitest run --coverage on one test file
//   10. npx vitest run on two throwaway tests that use the `@/` import alias
//   11. npx tsc --noEmit -p test
//   12. npm run test:e2e
//   13. open the sign-in page with playwright-cli, read the snapshot, close
//
// Stages 2, 4, and 9 are there because the installer copies only what the
// README lists. Without them a path or package dropped from the README would
// go unnoticed, because no test command needs it.
//
// Stage 13 is there because /qa-plan and /qa-generate look at the app through
// playwright-cli, and no test command starts it. It runs the commands those
// skills teach against the running app. Stage 2 asks the installed hook about
// the same commands, because in Cursor a command the hook denies never runs.
// playwright-cli starts Google Chrome, which is not the browser that stage 5
// installs. Stage 13 says so when Chrome is missing.
//
// Stages 10 and 11 are there because the example's tsconfig.json has `test` in
// "exclude". The reference tests import by relative path, so they pass with or
// without test/tsconfig.json. Stage 10 fails without that file. Stage 11 is the
// only type check of the tests, because `next build` no longer sees them.
//
// With the default port, Playwright starts the app itself in stage 12, as
// playwright.config.ts does for a user. With any other port this script starts
// `npm run dev` on that port, loads each page once, sets BASE_URL, and stops
// the app afterwards. Stage 13 always starts and stops the app itself.
//
// Node built-ins only.

import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { KIT_ROOT, TEST_TSCONFIG, listFiles, readInstallLists } from './install-into.mjs'

const EXAMPLE = join(KIT_ROOT, 'examples', 'next-app')
const INSTALLER = fileURLToPath(new URL('./install-into.mjs', import.meta.url))
const DEFAULT_PORT = 3000
const MINUTE = 60_000
const WINDOWS = process.platform === 'win32'

// Generated files a maintainer may have in examples/next-app. A clean checkout
// has none of them, so they are not copied.
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
])

// Files an app must have after the README's install steps. They are named
// here, apart from the README, so that a path dropped from the README's copy
// list fails stage 2.
const INSTALLED_FILES = [
  '.cursor/hooks.json',
  '.cursor/hooks/guard-test-writes.py',
  '.cursor/mcp.json',
  '.cursor/skills/playwright-cli/LICENSE',
  '.cursor/skills/playwright-cli/SKILL.md',
  '.cursorignore',
  'AGENTS.md',
  'playwright.config.ts',
  'test/e2e/seed.spec.ts',
  'test/setup.ts',
  'vitest.config.ts',
]

// Two throwaway tests for the alias stage. The first imports with the `@/` alias.
// The second names a module with the alias in vi.mock and imports the same
// module by its relative path. When the alias does not resolve in a test file,
// the first cannot be loaded and the second gets the real module.
const ALIAS_PROBES = {
  'test/unit/alias-probe.test.ts': `import { expect, it } from 'vitest'
import { validateEmail } from '@/lib/validation'

it('resolves the @/ alias in a test file', () => {
  expect(validateEmail('ada@example.com')).toBeNull()
})
`,
  'test/integration/alias-probe.test.ts': `import { expect, it, vi } from 'vitest'
import { findUserByEmail } from '../../lib/db'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ findUserByEmail: async () => 'from the mock' }))

it('replaces the module that vi.mock names with the @/ alias', async () => {
  expect(await findUserByEmail('ada@example.com')).toBe('from the mock')
})
`,
}

// The skills whose steps run playwright-cli, and the commands they may use.
// Stage 4 fails when the installed playwright-cli lacks one of these, or one
// that a skill names. A new version of the CLI can rename a command.
const CLI_SKILLS = ['qa-plan', 'qa-generate', 'qa-heal']
const CLI_COMMANDS = [
  'open', 'goto', 'snapshot', 'find', 'generate-locator',
  'click', 'fill', 'type', 'press', 'select', 'check', 'uncheck', 'hover',
  'close', 'attach', 'pause-at', 'resume',
]
const CLI = ['--no-install', 'playwright-cli']
const CLI_TEXT = `npx ${CLI.join(' ')}`
// Once a day playwright-cli asks the npm registry for a newer version and
// prints a notice between its output. This variable turns that off, so that a
// stage does not depend on the network or on the day.
const CLI_ENV = { ...process.env, NO_UPDATE_NOTIFIER: '1' }

const USAGE = `Usage: node scripts/test-example.mjs [--port <n>] [--keep] [--no-browse]

  --port <n>   Port for the app during the end-to-end tests. Default ${DEFAULT_PORT}.
  --keep       Keep the temporary folder when the run ends.
  --no-browse  Leave out the last stage, which opens the app with playwright-cli.
               It needs Google Chrome on this machine.`

// A stage did not pass. Printed without a stack trace.
class StageError extends Error {}

const running = new Set()
let appDir = ''
let keepFolder = false
let stageNumber = 0
let stageTitle = ''

function startStage(title) {
  stageNumber += 1
  stageTitle = title
  console.log(`\n== Stage ${stageNumber}: ${title}`)
  return Date.now()
}

function endStage(startedAt) {
  console.log(`-- Stage ${stageNumber} passed in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
}

// Stops a process and everything it started.
function stop(child, signal = 'SIGTERM') {
  if (child.exitCode !== null || child.signalCode !== null) return
  try {
    if (WINDOWS) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'])
    else process.kill(-child.pid, signal)
  } catch {
    // It ended in the meantime.
  }
}

// Starts a command in the app folder. Each command gets its own process group,
// so that `stop` reaches the processes npm starts.
function start(command, args, { env = process.env, quiet = false } = {}) {
  const child = spawn(command, args, {
    cwd: appDir,
    env,
    detached: !WINDOWS,
    shell: WINDOWS,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.output = ''
  const collect = (stream) => (chunk) => {
    child.output += chunk
    if (!quiet) stream.write(chunk)
  }
  child.stdout.on('data', collect(process.stdout))
  child.stderr.on('data', collect(process.stderr))
  child.ended = new Promise((done) => {
    child.once('error', (error) => done({ code: null, error }))
    child.once('close', (code, signal) => done({ code, signal }))
  })
  running.add(child)
  child.ended.then(() => running.delete(child))
  return child
}

// Runs a command to its end and fails the stage unless it exits with 0. The
// error of a command that exits with another code carries its output.
// `quiet` keeps a long output off the screen.
async function run(command, args, { env, minutes = 10, quiet = false } = {}) {
  const line = [command, ...args].join(' ')
  console.log(`$ ${line}`)
  const child = start(command, args, { env, quiet })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    stop(child, 'SIGKILL')
  }, minutes * MINUTE)
  const { code, signal, error } = await child.ended
  clearTimeout(timer)
  if (timedOut) throw new StageError(`\`${line}\` did not finish in ${minutes} minutes.`)
  if (error) throw new StageError(`\`${line}\` could not start: ${error.message}`)
  if (code !== 0) {
    if (quiet) console.log(lastLines(child.output, 30))
    throw Object.assign(new StageError(`\`${line}\` exited with ${code ?? signal}.`), { output: child.output })
  }
  return child.output
}

// The kit's reporters end every test run with one line such as
//   QA-VERDICT: PASS (passed 3, failed 0, skipped 0, files 1)
// An exit code of 0 is not enough: a run with only skipped tests exits with 0.
function requirePassVerdict(output) {
  const lines = output
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
  const verdicts = lines.filter((line) => line.startsWith('QA-VERDICT: '))
  const verdict = verdicts.at(-1)
  if (!verdict) {
    throw new StageError('The output has no line that starts with "QA-VERDICT: ". The verdict reporter did not run.')
  }
  if (!/^QA-VERDICT: PASS( |$)/.test(verdict)) {
    throw new StageError(`The verdict is not PASS: ${verdict}`)
  }
  if (lines.at(-1) !== verdict) {
    throw new StageError(`The verdict line must be the last line of output, but this line came after it: ${lines.at(-1)}`)
  }
  console.log('The verdict line is the last line of output and says PASS.')
}

// Asks the installed hook about one shell command, the way Cursor does:
// the command from .cursor/hooks.json, run in the app folder, JSON on stdin.
function askHook(shellCommand) {
  const hooks = JSON.parse(readFileSync(join(appDir, '.cursor', 'hooks.json'), 'utf8'))
  const hookCommand = hooks.hooks?.beforeShellExecution?.[0]?.command
  if (typeof hookCommand !== 'string') {
    throw new StageError('.cursor/hooks.json has no hooks.beforeShellExecution[0].command.')
  }
  const result = spawnSync(hookCommand, {
    cwd: appDir,
    shell: true,
    encoding: 'utf8',
    timeout: MINUTE,
    input: JSON.stringify({ hook_event_name: 'beforeShellExecution', command: shellCommand, cwd: appDir }),
  })
  let answer
  try {
    answer = JSON.parse(result.stdout)
  } catch {
    throw new StageError(
      `The hook did not answer with JSON for \`${shellCommand}\`. Exit code ${result.status}. ` +
        `stdout: ${result.stdout || '(empty)'} stderr: ${result.stderr || result.error?.message || '(empty)'}`,
    )
  }
  console.log(`hook: \`${shellCommand}\` -> ${answer.permission}`)
  return answer.permission
}

// The commands of stage 13, in order: what /qa-plan runs to look at one page.
function browseSteps(port) {
  return [['open', `http://localhost:${port}/sign-in`], ['snapshot'], ['close']]
}

function checkInstalledKit(port) {
  const problems = []

  for (const file of INSTALLED_FILES) {
    if (!existsSync(join(appDir, file))) {
      problems.push(`${file} is missing. Is it covered by the copy list in README.md?`)
    }
  }
  if (problems.length === 0) console.log(`All ${INSTALLED_FILES.length} required files are there.`)

  // The example must not shadow a kit file. If it did, the installer would
  // skip the kit's file and the stages below would test the example's copy.
  let compared = 0
  for (const path of readInstallLists().copyPaths) {
    for (const file of listFiles(KIT_ROOT, path)) {
      compared += 1
      const installed = join(appDir, file)
      if (!existsSync(installed)) {
        problems.push(`${file} was not copied.`)
      } else if (!readFileSync(installed).equals(readFileSync(join(KIT_ROOT, file)))) {
        problems.push(`${file} differs from the kit's file. The example app must not have its own ${basename(file)}.`)
      }
    }
  }
  console.log(`Compared ${compared} files from the README's copy list with the kit.`)

  if (existsSync(join(appDir, '.cursor', 'hooks.json'))) {
    // An allow first, so that a hook that denies everything does not pass.
    if (askHook('cat package.json') !== 'allow') {
      problems.push('The hook did not allow `cat package.json`.')
    }
    if (askHook('cat package-lock.json') !== 'deny') {
      problems.push('The hook did not deny `cat package-lock.json`.')
    }
    // The hook has a built-in list of lockfiles for an app without .cursorignore.
    // Test reports are only on the list in .cursorignore, so this answer shows
    // that the file was installed and that the hook reads it.
    if (askHook('cat playwright-report/index.html') !== 'deny') {
      problems.push(
        'The hook did not deny `cat playwright-report/index.html`. It denies that only when it finds .cursorignore in the app.',
      )
    }
    // /qa-plan and /qa-generate look at the app with playwright-cli. In Cursor a
    // command the hook denies never runs, so the hook must allow what stage 13
    // runs, in the form the skills give it: `open` and `snapshot` as one
    // command, then `close`. And it must not let the browser leave this machine.
    const [open, snapshot, close] = browseSteps(port).map((step) => `${CLI_TEXT} ${step.join(' ')}`)
    for (const command of [`${open} && ${snapshot}`, close]) {
      if (askHook(command) !== 'allow') problems.push(`The hook did not allow \`${command}\`. The skills teach that command.`)
    }
    const outside = `${CLI_TEXT} open https://example.com`
    if (askHook(outside) !== 'deny') {
      problems.push(`The hook did not deny \`${outside}\`. Only a page on http://localhost or http://127.0.0.1 may be opened.`)
    }
  }

  if (problems.length > 0) throw new StageError(problems.join('\n'))
}

// The playwright-cli commands that the installed skills name, such as `open`
// in `npx --no-install playwright-cli open http://localhost:3000/profile`.
// A session option in front of the command is stepped over.
function cliCommandsInSkills() {
  const pattern = /npx --no-install playwright-cli((?:\s+(?:-s=\S+|-s\s+\S+|--session=\S+))*)\s+([a-z][a-z-]*)/g
  const named = new Set()
  for (const skill of CLI_SKILLS) {
    const path = join(appDir, '.cursor', 'skills', skill, 'SKILL.md')
    if (!existsSync(path)) throw new StageError(`.cursor/skills/${skill}/SKILL.md is missing from the installed kit.`)
    for (const match of readFileSync(path, 'utf8').matchAll(pattern)) named.add(match[2])
  }
  return [...named]
}

// Checks the output of `playwright-cli --help` for every command the skills use.
function checkCliCommands(help) {
  // A command line of the help text: two spaces, the name, then its arguments or its description.
  const has = new Set([...help.matchAll(/^ {2}([a-z][a-z-]*)(?= )/gm)].map((match) => match[1]))
  if (has.size === 0) throw new StageError('The output of `playwright-cli --help` lists no commands. Its format changed.')
  const inSkills = cliCommandsInSkills()
  const wanted = [...new Set([...CLI_COMMANDS, ...inSkills])]
  const missing = wanted.filter((name) => !has.has(name))
  if (missing.length > 0) {
    throw new StageError(
      `The installed playwright-cli has no command named: ${missing.join(', ')}. ` +
        `The skills ${CLI_SKILLS.join(', ')} or the list in this script use ${missing.length === 1 ? 'it' : 'them'}.`,
    )
  }
  console.log(`playwright-cli lists ${has.size} commands. All ${wanted.length} that the skills use are among them.`)
  console.log(`The installed skills name: ${inSkills.sort().join(', ') || '(none)'}.`)
}

// Runs the two alias probes and removes them again.
async function checkAlias() {
  if (!existsSync(join(appDir, TEST_TSCONFIG))) {
    throw new StageError(`${TEST_TSCONFIG} is missing. The example app must have it, because its tsconfig.json leaves out test/.`)
  }
  const probes = Object.keys(ALIAS_PROBES)
  try {
    for (const [file, text] of Object.entries(ALIAS_PROBES)) {
      mkdirSync(dirname(join(appDir, file)), { recursive: true })
      writeFileSync(join(appDir, file), text, { flag: 'wx' })
    }
    requirePassVerdict(await run('npx', ['vitest', 'run', ...probes]))
  } finally {
    for (const file of probes) rmSync(join(appDir, file), { force: true })
  }
}

function canConnect(port, host) {
  return new Promise((done) => {
    const socket = connect({ port, host })
    socket.setTimeout(1000)
    socket.once('connect', () => {
      socket.destroy()
      done(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      done(false)
    })
    socket.once('error', () => done(false))
  })
}

async function portInUse(port) {
  return (await canConnect(port, '127.0.0.1')) || (await canConnect(port, '::1'))
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

// Resolves with false when the promise takes longer than `ms`.
function settledWithin(promise, ms) {
  return new Promise((done) => {
    const timer = setTimeout(() => done(false), ms)
    promise.then(() => {
      clearTimeout(timer)
      done(true)
    })
  })
}

async function waitUntil(check, ms) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (await check()) return true
    await sleep(500)
  }
  return false
}

async function responds(url, ms = 5000) {
  try {
    await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(ms) })
    return true
  } catch {
    return false
  }
}

function lastLines(text, count) {
  return text.trimEnd().split(/\r?\n/).slice(-count).join('\n')
}

// The environment for the app and its tests: this process's, without a
// BASE_URL that the person running the script may have set.
function appEnv() {
  const env = { ...process.env }
  delete env.BASE_URL
  return env
}

// Starts `npm run dev` on the port, waits until the app answers, calls `use`
// with the app's URL, and stops the app again, also when `use` fails.
async function withApp(port, use) {
  if (await portInUse(port)) {
    throw new StageError(`Port ${port} is in use. Stop that server, or pass --port with a free port.`)
  }
  const url = `http://localhost:${port}`
  const devArgs = ['run', 'dev', '--', '--port', String(port)]
  console.log(`$ npm ${devArgs.join(' ')}   (in the background)`)
  const server = start('npm', devArgs, { env: appEnv(), quiet: true })
  try {
    let exited = false
    server.ended.then(() => {
      exited = true
    })
    const up = await waitUntil(async () => exited || (await responds(url)), 2 * MINUTE)
    if (exited || !up) {
      throw new StageError(
        `The app did not answer at ${url}. Last lines from \`npm run dev\`:\n${lastLines(server.output, 30)}`,
      )
    }
    console.log(`The app answers at ${url}.`)
    // Load each page once. `next dev` compiles a page on its first request, and
    // on a busy machine that takes longer than a test waits for its result.
    for (const path of ['/sign-in', '/dashboard', '/api/session']) await responds(url + path, MINUTE)
    try {
      await use(url)
    } catch (error) {
      console.log(`Last lines from \`npm run dev\`:\n${lastLines(server.output, 30)}`)
      throw error
    }
  } finally {
    stop(server)
    if (!(await settledWithin(server.ended, 5000))) stop(server, 'SIGKILL')
    if (await waitUntil(async () => !(await portInUse(port)), 10_000)) {
      console.log(`Stopped the app. Port ${port} is free again.`)
    } else {
      console.log(`Warning: something still listens on port ${port}.`)
    }
  }
}

async function runEndToEnd(port) {
  if (port === DEFAULT_PORT) {
    if (await portInUse(port)) {
      throw new StageError(`Port ${port} is in use. Stop that server, or pass --port with a free port.`)
    }
    // No BASE_URL: playwright.config.ts starts `npm run dev` and stops it.
    requirePassVerdict(await run('npm', ['run', 'test:e2e'], { env: appEnv() }))
    return
  }
  await withApp(port, async (url) => {
    requirePassVerdict(await run('npm', ['run', 'test:e2e'], { env: { ...appEnv(), BASE_URL: url } }))
  })
}

// The playwright-cli sessions of the app folder that are open, by name.
async function openBrowsers() {
  const output = await run('npx', [...CLI, 'list', '--json'], { env: CLI_ENV, minutes: 2, quiet: true })
  let listed
  try {
    // The JSON object, without a warning that npm may print around it.
    listed = JSON.parse(output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1))
  } catch {
    throw new StageError(`\`${CLI_TEXT} list --json\` did not print JSON:\n${lastLines(output, 10)}`)
  }
  return (listed.browsers ?? []).filter((browser) => browser.status === 'open').map((browser) => browser.name)
}

// Looks at the running app the way /qa-plan and /qa-generate do: open the
// page, print the snapshot, close the browser. Stage 2 has put the same
// commands to the installed hook.
async function browse(port) {
  const [open, snapshotStep, close] = browseSteps(port)
  const page = open[1]
  try {
    try {
      await run('npx', [...CLI, ...open], { env: CLI_ENV, minutes: 3 })
    } catch (error) {
      if (/is not found|is not installed/.test(error.output ?? '')) {
        throw new StageError(
          `${error.message}\nplaywright-cli starts Google Chrome unless a config file names another browser. ` +
            'It does not use the Chromium that `npx playwright install chromium` installs for test runs. ' +
            'Install Google Chrome on this machine, then run this script again.',
        )
      }
      throw error
    }
    const snapshot = await run('npx', [...CLI, ...snapshotStep], { env: CLI_ENV, minutes: 2 })
    // One element per line, with the text a user sees and a ref to act on.
    for (const line of [/heading "Sign in" \[level=1\] \[ref=e\d+\]/, /textbox "Email" \[ref=e\d+\]/, /button "Sign in" \[ref=e\d+\]/]) {
      if (!line.test(snapshot)) throw new StageError(`The snapshot of ${page} has no line that matches ${line}.`)
    }
    console.log('The snapshot has the heading, the Email field, and the Sign in button, each with a ref.')
  } finally {
    // Close also after a failure: `open` leaves the browser running when the page did not load.
    await run('npx', [...CLI, ...close], { env: CLI_ENV, minutes: 2 }).catch((error) => console.log(`Could not close the browser: ${error.message}`))
  }

  const left = await openBrowsers()
  if (left.length > 0) throw new StageError(`A browser is still open after \`close\`: ${left.join(', ')}.`)
  console.log('No browser is left open.')

  // What the CLI saved must stay out of the app's repository.
  const saved = existsSync(join(appDir, '.playwright-cli')) ? readdirSync(join(appDir, '.playwright-cli')) : []
  const ignored = readFileSync(join(appDir, '.gitignore'), 'utf8').split(/\r?\n/).some((line) => line.trim() === '.playwright-cli/')
  if (saved.length === 0) throw new StageError('playwright-cli saved nothing in .playwright-cli/. Where it keeps its snapshots has changed.')
  if (!ignored) throw new StageError('The installed .gitignore has no line `.playwright-cli/`, so the files playwright-cli saves would show up in git.')
  console.log(`playwright-cli saved ${saved.length} files in .playwright-cli/, which the installed .gitignore ignores.`)
}

async function runStages(port, { browseToo }) {
  let at = startStage('install the kit with scripts/install-into.mjs')
  await run(process.execPath, [INSTALLER, appDir])
  endStage(at)

  at = startStage('check the installed files and the hook')
  checkInstalledKit(port)
  endStage(at)

  at = startStage('npm install')
  await run('npm', ['install'], { minutes: 15 })
  endStage(at)

  at = startStage('check that playwright-cli is installed and has the commands the skills use')
  checkCliCommands(await run('npx', [...CLI, '--help'], { env: CLI_ENV, minutes: 2, quiet: true }))
  endStage(at)

  at = startStage('npx playwright install chromium')
  await run('npx', ['playwright', 'install', 'chromium'], { minutes: 20 })
  endStage(at)

  at = startStage('npm run build')
  await run('npm', ['run', 'build'])
  endStage(at)

  at = startStage('npm run test:unit')
  requirePassVerdict(await run('npm', ['run', 'test:unit']))
  endStage(at)

  at = startStage('npm run test:integration')
  requirePassVerdict(await run('npm', ['run', 'test:integration']))
  endStage(at)

  at = startStage('coverage with the v8 provider')
  requirePassVerdict(await run('npx', ['vitest', 'run', '--coverage', 'test/unit/lib/validation.test.ts']))
  endStage(at)

  at = startStage('the @/ import alias in a test file, in an import and in vi.mock')
  await checkAlias()
  endStage(at)

  at = startStage('type check of the tests: npx tsc --noEmit -p test')
  await run('npx', ['tsc', '--noEmit', '-p', 'test'], { minutes: 5 })
  endStage(at)

  at = startStage('npm run test:e2e')
  await runEndToEnd(port)
  // The example sets `agentRules: false` so that `next dev` leaves AGENTS.md alone.
  if (!readFileSync(join(appDir, 'AGENTS.md')).equals(readFileSync(join(KIT_ROOT, 'AGENTS.md')))) {
    throw new StageError('AGENTS.md in the app changed during the run. It must stay the same as the kit\'s file.')
  }
  endStage(at)

  if (!browseToo) {
    console.log('\nLeft out with --no-browse: open the sign-in page with playwright-cli.')
    return
  }
  at = startStage('open the sign-in page with playwright-cli, as /qa-plan and /qa-generate do')
  await withApp(port, () => browse(port))
  endStage(at)
}

async function main(argv) {
  let options
  try {
    options = parseArgs({
      args: argv,
      options: {
        port: { type: 'string', default: String(DEFAULT_PORT) },
        keep: { type: 'boolean', default: false },
        'no-browse': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    }).values
  } catch (error) {
    console.error(`${error.message}\n\n${USAGE}`)
    return 1
  }
  if (options.help) {
    console.log(USAGE)
    return 0
  }
  const port = Number(options.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`--port needs a number from 1 to 65535. Got "${options.port}".\n\n${USAGE}`)
    return 1
  }
  if (await portInUse(port)) {
    console.error(`Port ${port} is in use. Stop that server, or pass --port with a free port.`)
    return 1
  }

  keepFolder = options.keep
  appDir = mkdtempSync(join(tmpdir(), 'cursor-qa-example-'))
  console.log(`Folder: ${appDir}`)
  cpSync(EXAMPLE, appDir, {
    recursive: true,
    filter: (source) => !NOT_COPIED_FROM_EXAMPLE.has(basename(source)),
  })
  console.log('Copied examples/next-app into it.')

  let exitCode = 0
  const startedAt = Date.now()
  try {
    await runStages(port, { browseToo: !options['no-browse'] })
    console.log(`\nAll ${stageNumber} stages passed in ${((Date.now() - startedAt) / 1000).toFixed(0)}s.`)
  } catch (error) {
    if (!(error instanceof StageError)) throw error
    console.error(`\nFAILED at stage ${stageNumber} (${stageTitle}):\n${error.message}`)
    exitCode = 1
  } finally {
    cleanUp()
    if (exitCode !== 0 && !keepFolder) console.log('Run again with --keep to look at the folder.')
  }
  return exitCode
}

function cleanUp() {
  for (const child of running) stop(child, 'SIGKILL')
  if (appDir === '') return
  // A browser that stage 13 opened and could not close, for example after
  // Ctrl+C. playwright-cli keeps it running on its own, outside `running`.
  if (existsSync(join(appDir, '.playwright-cli'))) {
    spawnSync('npx', [...CLI, 'close-all'], { cwd: appDir, env: CLI_ENV, shell: WINDOWS, stdio: 'ignore', timeout: MINUTE })
  }
  if (keepFolder) {
    console.log(`Kept the folder: ${appDir}`)
  } else {
    rmSync(appDir, { recursive: true, force: true, maxRetries: 3 })
    console.log(`Removed the folder: ${appDir}`)
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    cleanUp()
    process.exit(130)
  })
}

process.exitCode = await main(process.argv.slice(2))
