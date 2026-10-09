#!/usr/bin/env node
// Checks the kit end to end against the example app, the way a new user sets
// it up. Written for CI. It also runs on a maintainer's machine.
//
//   node scripts/test-example.mjs [--port <n>] [--keep]
//
//   --port <n>  Port for the app during the end-to-end tests. Default 3000.
//   --keep      Keep the temporary folder when the run ends.
//
// It copies examples/next-app to a temporary folder, prints the folder path,
// and runs these stages there. It stops at the first failure and exits with 1.
//
//    1. node scripts/install-into.mjs <folder>   (the README's install steps)
//    2. check the installed files and the hook
//    3. npm install
//    4. check that the tools the agent starts are installed
//    5. npx playwright install chromium
//    6. npm run build
//    7. npm run test:unit
//    8. npm run test:integration
//    9. npx vitest run --coverage on one test file
//   10. npm run test:e2e
//
// Stages 2, 4, and 9 are there because the installer copies only what the
// README lists. Without them a path or package dropped from the README would
// go unnoticed, because no test command needs it.
//
// With the default port, Playwright starts the app itself, as playwright.config.ts
// does for a user. With any other port this script starts `npm run dev` on that
// port, sets BASE_URL, and stops the app afterwards.
//
// Node built-ins only.

import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { KIT_ROOT, listFiles, readInstallLists } from './install-into.mjs'

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
  '.cursorignore',
  'AGENTS.md',
  'playwright.config.ts',
  'test/e2e/seed.spec.ts',
  'test/setup.ts',
  'vitest.config.ts',
]

const USAGE = `Usage: node scripts/test-example.mjs [--port <n>] [--keep]

  --port <n>  Port for the app during the end-to-end tests. Default ${DEFAULT_PORT}.
  --keep      Keep the temporary folder when the run ends.`

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

// Runs a command to its end and fails the stage unless it exits with 0.
async function run(command, args, { env, minutes = 10 } = {}) {
  const line = [command, ...args].join(' ')
  console.log(`$ ${line}`)
  const child = start(command, args, { env })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    stop(child, 'SIGKILL')
  }, minutes * MINUTE)
  const { code, signal, error } = await child.ended
  clearTimeout(timer)
  if (timedOut) throw new StageError(`\`${line}\` did not finish in ${minutes} minutes.`)
  if (error) throw new StageError(`\`${line}\` could not start: ${error.message}`)
  if (code !== 0) throw new StageError(`\`${line}\` exited with ${code ?? signal}.`)
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

function checkInstalledKit() {
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
  }

  if (problems.length > 0) throw new StageError(problems.join('\n'))
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

async function responds(url) {
  try {
    await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
    return true
  } catch {
    return false
  }
}

function lastLines(text, count) {
  return text.trimEnd().split(/\r?\n/).slice(-count).join('\n')
}

async function runEndToEnd(port) {
  const env = { ...process.env }
  delete env.BASE_URL

  if (await portInUse(port)) {
    throw new StageError(`Port ${port} is in use. Stop that server, or pass --port with a free port.`)
  }

  if (port === DEFAULT_PORT) {
    // No BASE_URL: playwright.config.ts starts `npm run dev` and stops it.
    requirePassVerdict(await run('npm', ['run', 'test:e2e'], { env }))
    return
  }

  const url = `http://localhost:${port}`
  const devArgs = ['run', 'dev', '--', '--port', String(port)]
  console.log(`$ npm ${devArgs.join(' ')}   (in the background)`)
  const server = start('npm', devArgs, { env, quiet: true })
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
    try {
      requirePassVerdict(await run('npm', ['run', 'test:e2e'], { env: { ...env, BASE_URL: url } }))
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

async function runStages(port) {
  let at = startStage('install the kit with scripts/install-into.mjs')
  await run(process.execPath, [INSTALLER, appDir])
  endStage(at)

  at = startStage('check the installed files and the hook')
  checkInstalledKit()
  endStage(at)

  at = startStage('npm install')
  await run('npm', ['install'], { minutes: 15 })
  endStage(at)

  at = startStage('check that the tools the agent starts are installed')
  await run('npx', ['--no-install', 'playwright-cli', '--version'], { minutes: 2 })
  await run('npx', ['--no-install', '@playwright/mcp', '--version'], { minutes: 2 })
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

  at = startStage('npm run test:e2e')
  await runEndToEnd(port)
  // The example sets `agentRules: false` so that `next dev` leaves AGENTS.md alone.
  if (!readFileSync(join(appDir, 'AGENTS.md')).equals(readFileSync(join(KIT_ROOT, 'AGENTS.md')))) {
    throw new StageError('AGENTS.md in the app changed during the run. It must stay the same as the kit\'s file.')
  }
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
    await runStages(port)
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
