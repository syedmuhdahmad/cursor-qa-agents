#!/usr/bin/env node
// Checks the kit in the React Native example, the way a new user of a React
// Native or Expo app sets it up. Written for CI. It also runs on a maintainer's
// machine.
//
//   node scripts/test-rn-example.mjs [--keep]
//
//   --keep  Keep the temporary folder when the run ends.
//
// It copies examples/expo-app to a temporary folder, prints the folder path,
// and runs these stages there. It stops at the first failure and exits with 1.
//
//    1. node scripts/install-into.mjs <folder>   (the README's install steps)
//    2. check what the installer did in a React Native app
//    3. ask the installed hook about the commands of /qa-rn-unit
//    4. npm ci
//    5. npm run test:rn-unit
//    6. the run command of /qa-rn-unit, on one reference test
//    7. the verdict line for a skipped test and for a path with no test
//    8. npx tsc --noEmit, with the kit and the tests in place
//
// Stage 2 is there because the installer leaves out the web files in a React
// Native app. A web file that slips in would load packages the app does not
// have, and stage 8 would report it.
//
// Stage 7 is there because Jest exits with 0 for a skipped test, and ends
// without calling a reporter when no test file matches. The kit's line must
// say FAIL in both cases, in a real React Native test environment.
//
// The copy keeps the example's package-lock.json, and npm ci installs from
// it. The installer takes the ranges of the React Native dev dependencies from
// examples/expo-app/package.json, so it adds nothing there that the lockfile
// lacks. It needs a network connection.
//
// Node built-ins only.

import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { KIT_ROOT, RN_TEST_SCRIPTS, WEB_ONLY } from './install-into.mjs'

const EXAMPLE = join(KIT_ROOT, 'examples', 'expo-app')
const INSTALLER = fileURLToPath(new URL('./install-into.mjs', import.meta.url))
const MINUTE = 60_000
const WINDOWS = process.platform === 'win32'

// Generated files a maintainer may have in examples/expo-app. A clean checkout
// has none of them, so they are not copied. The names are matched at the top
// of the example only: test/mobile/elements/android/ is copied.
const NOT_COPIED_FROM_EXAMPLE = new Set(['node_modules', 'android', 'ios', '.expo', 'dist', 'coverage'])

// Files a React Native app must have after the install.
const INSTALLED_FILES = [
  '.cursor/hooks.json',
  '.cursor/hooks/guard-test-writes.py',
  '.cursor/qa/jest.config.cjs',
  '.cursor/qa/jest-verdict.mjs',
  '.cursor/skills/qa-rn-unit/SKILL.md',
  '.cursor/skills/qa-rn-unit/templates/component.test.ts',
  '.cursor/skills/qa-mobile-generate/SKILL.md',
  '.cursor/skills/security-audit/SKILL.md',
  '.cursorignore',
  'AGENTS.md',
]

// The run command of /qa-rn-unit, with one reference test of the example.
const SKILL_COMMAND = 'RTK_DISABLED=1 npx jest --config .cursor/qa/jest.config.cjs --ci test/unit/components/SignIn.test.ts'
const JEST = ['--no-install', 'jest', '--config', '.cursor/qa/jest.config.cjs', '--ci']

// Two throwaway tests for stage 7.
const SKIPPED_PROBE = 'test/unit/skipped-probe.test.ts'
const SKIPPED_PROBE_TEXT = "it('runs', () => {\n  expect(1).toBe(1)\n})\n\nit.skip('is skipped', () => {\n  expect(1).toBe(2)\n})\n"
const MISSING_PROBE = 'test/unit/no-such-probe.test.ts'

const USAGE = `Usage: node scripts/test-rn-example.mjs [--keep]

  --keep  Keep the temporary folder when the run ends.`

// A stage did not pass. Printed without a stack trace.
class StageError extends Error {}

let appDir = ''
let keepFolder = false
let stageNumber = 0

function startStage(title) {
  stageNumber += 1
  console.log(`\n== Stage ${stageNumber}: ${title}`)
  return Date.now()
}

function endStage(startedAt) {
  console.log(`-- Stage ${stageNumber} passed in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
}

function lastLines(text, count) {
  return text.split(/\r?\n/).slice(-count).join('\n')
}

// Runs a command in the app folder to its end. Returns its exit code and its output.
function run(command, args, { env = process.env, minutes = 10, quiet = false } = {}) {
  console.log(`$ ${[command, ...args].join(' ')}`)
  return new Promise((done) => {
    const child = spawn(command, args, { cwd: appDir, env, shell: WINDOWS, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    const collect = (stream) => (chunk) => {
      output += chunk
      if (!quiet) stream.write(chunk)
    }
    child.stdout.on('data', collect(process.stdout))
    child.stderr.on('data', collect(process.stderr))
    const timer = setTimeout(() => child.kill('SIGKILL'), minutes * MINUTE)
    child.once('error', (error) => {
      clearTimeout(timer)
      done({ code: null, output: `${output}\n${error.message}` })
    })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      done({ code: code ?? signal, output })
    })
  })
}

async function mustPass(command, args, options) {
  const result = await run(command, args, options)
  if (result.code !== 0) {
    if (options?.quiet) console.log(lastLines(result.output, 30))
    throw new StageError(`\`${[command, ...args].join(' ')}\` exited with ${result.code}.`)
  }
  return result.output
}

// The output's lines, without colour codes and blank lines.
function outputLines(output) {
  return output
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

// The last line must be the verdict line, and it must match `expected`.
function requireVerdict(output, expected) {
  const lines = outputLines(output)
  const verdicts = lines.filter((line) => line.startsWith('QA-VERDICT: '))
  if (verdicts.length !== 1) {
    throw new StageError(`The output has ${verdicts.length} lines that start with "QA-VERDICT: ", and must have one.`)
  }
  if (lines.at(-1) !== verdicts[0]) {
    throw new StageError(`The verdict line must be the last line of output, but this line came after it: ${lines.at(-1)}`)
  }
  if (!expected.test(verdicts[0])) throw new StageError(`The verdict line is not the expected one: ${verdicts[0]}`)
  console.log(`The last line is the verdict line: ${verdicts[0]}`)
  return verdicts[0]
}

// Asks the installed hook about one shell command, the way Cursor does.
function askHook(shellCommand) {
  const hooks = JSON.parse(readFileSync(join(appDir, '.cursor', 'hooks.json'), 'utf8'))
  const hookCommand = hooks.hooks?.beforeShellExecution?.[0]?.command
  if (typeof hookCommand !== 'string') throw new StageError('.cursor/hooks.json has no hooks.beforeShellExecution[0].command.')
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
    throw new StageError(`The hook did not answer with JSON for \`${shellCommand}\`. stderr: ${result.stderr || '(empty)'}`)
  }
  console.log(`hook: \`${shellCommand}\` -> ${answer.permission}`)
  return answer.permission
}

function checkInstall(output) {
  const problems = []
  if (!/^App: a React Native app, because package\.json lists expo\.$/m.test(output)) {
    problems.push('The installer did not say that it found a React Native app.')
  }
  for (const file of INSTALLED_FILES) {
    if (!existsSync(join(appDir, file))) problems.push(`${file} is missing.`)
  }
  for (const file of WEB_ONLY) {
    if (existsSync(join(appDir, file))) problems.push(`${file} is there, and a React Native app should not get it.`)
  }
  const appPackage = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'))
  for (const [name, command] of Object.entries(RN_TEST_SCRIPTS)) {
    if (appPackage.scripts?.[name] !== command) problems.push(`package.json has no script "${name}": "${command}".`)
  }
  for (const name of ['test:unit', 'test:e2e']) {
    if (appPackage.scripts?.[name]) problems.push(`package.json got the web script "${name}".`)
  }
  if (problems.length > 0) throw new StageError(problems.join('\n'))
  console.log('The kit is in place, without the web files, and package.json has the test:rn-unit script.')
}

function checkHook() {
  const expected = [
    [SKILL_COMMAND, 'allow'],
    ['npm run test:rn-unit', 'allow'],
    ['npx jest test/unit/components/SignIn.test.ts', 'deny'],
    ['npx jest --config .cursor/qa/jest.config.cjs test/unit/components/SignIn.test.ts', 'deny'],
    ['npx jest --config .cursor/qa/jest.config.cjs -u test/unit/components/SignIn.test.ts', 'deny'],
  ]
  const wrong = expected.filter(([command, decision]) => askHook(command) !== decision)
  if (wrong.length > 0) {
    throw new StageError(wrong.map(([command, decision]) => `The hook should ${decision} \`${command}\`.`).join('\n'))
  }
}

async function runStages() {
  let startedAt = startStage('install the kit')
  const install = await mustPass(process.execPath, [INSTALLER, appDir])
  endStage(startedAt)

  startedAt = startStage('check the install')
  checkInstall(install)
  endStage(startedAt)

  startedAt = startStage('ask the hook about the commands of /qa-rn-unit')
  checkHook()
  endStage(startedAt)

  startedAt = startStage('npm ci')
  await mustPass('npm', ['ci', '--no-audit', '--no-fund'], { minutes: 15, quiet: true })
  endStage(startedAt)

  startedAt = startStage('npm run test:rn-unit')
  requireVerdict(await mustPass('npm', ['run', 'test:rn-unit']), /^QA-VERDICT: PASS \(passed \d+, failed 0, skipped 0, files 2\)$/)
  endStage(startedAt)

  startedAt = startStage('the run command of /qa-rn-unit')
  requireVerdict(
    await mustPass('npx', [...JEST, 'test/unit/components/SignIn.test.ts'], { env: { ...process.env, RTK_DISABLED: '1' } }),
    /^QA-VERDICT: PASS \(passed \d+, failed 0, skipped 0, files 1\)$/,
  )
  endStage(startedAt)

  startedAt = startStage('the verdict line for a skipped test and for a path with no test')
  writeFileSync(join(appDir, SKIPPED_PROBE), SKIPPED_PROBE_TEXT)
  try {
    const skipped = await run('npx', [...JEST, SKIPPED_PROBE])
    requireVerdict(skipped.output, /^QA-VERDICT: FAIL \(passed 1, failed 0, skipped 1, files 1\) reason: skipped or todo tests count as a failure$/)
    if (skipped.code !== 0) throw new StageError(`Jest exited with ${skipped.code} for a skipped test. Jest 30 exits with 0 there.`)
  } finally {
    rmSync(join(appDir, SKIPPED_PROBE), { force: true })
  }
  const missing = await run('npx', [...JEST, MISSING_PROBE])
  requireVerdict(missing.output, /^QA-VERDICT: FAIL \(passed 0, failed 0, skipped 0, files 0\) reason: no tests ran$/)
  if (missing.code === 0) throw new StageError('Jest exited with 0 for a path with no test.')
  endStage(startedAt)

  startedAt = startStage('npx tsc --noEmit')
  await mustPass('npx', ['--no-install', 'tsc', '--noEmit'])
  endStage(startedAt)
}

async function main(argv) {
  let parsed
  try {
    parsed = parseArgs({ args: argv, options: { keep: { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h' } } })
  } catch (error) {
    console.error(`${error.message}\n\n${USAGE}`)
    return 1
  }
  if (parsed.values.help) {
    console.log(USAGE)
    return 0
  }
  keepFolder = parsed.values.keep
  appDir = join(mkdtempSync(join(tmpdir(), 'qa-kit-rn-example-')), basename(EXAMPLE))
  const topName = (source) => relative(EXAMPLE, source).split(sep)[0]
  cpSync(EXAMPLE, appDir, { recursive: true, filter: (source) => !NOT_COPIED_FROM_EXAMPLE.has(topName(source)) })
  console.log(`Copied ${EXAMPLE} to ${appDir}`)
  try {
    await runStages()
    console.log(`\nAll ${stageNumber} stages passed.`)
    return 0
  } catch (error) {
    if (!(error instanceof StageError)) throw error
    console.error(`\nStage ${stageNumber} failed:\n${error.message}`)
    return 1
  } finally {
    if (keepFolder) console.log(`Kept ${appDir}`)
    else rmSync(join(appDir, '..'), { recursive: true, force: true })
  }
}

process.exitCode = await main(process.argv.slice(2))
