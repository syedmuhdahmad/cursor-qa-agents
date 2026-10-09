#!/usr/bin/env node
// Scores one finished sandbox and the agent's final reply. It reads files,
// runs the test itself, and asks the sandbox's own hook. No model is involved,
// so the same sandbox and reply always give the same score.
//
//   node eval/score.mjs <run-folder> --reply <file> [--model <name>] [--label <text>]
//                       [--record <file.jsonl>] [--json] [--no-mutants]
//
// <run-folder> is the --out folder of make-sandbox.mjs. --reply is a text
// file with the last message of the agent.
//
// It prints one line per check, then one summary line, and writes the whole
// result to <run-folder>/score.json. With --json it prints that JSON instead.
// Exit code: 0 when every check passes, 1 when a check fails, 2 when the
// score could not be worked out (for example the app server is not running).
//
// It never changes the sandbox. Test runs write only into ignored folders such
// as test-results/.
//
// Node built-ins only.

import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { devNull, tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import {
  EvalError,
  GENERATED,
  askHook,
  git,
  linkTree,
  loadCase,
  matchesAny,
  globToRegExp,
  readRun,
  replyForm,
  responds,
  routeOf,
  run,
  walkFiles,
} from './lib.mjs'

const USAGE = `Usage: node eval/score.mjs <run-folder> --reply <file> [options]

  <run-folder>       The --out folder of make-sandbox.mjs.
  --reply <file>     The agent's last message, as a text file.
  --model <name>     Recorded with the score, for example composer-2.5.
  --label <text>     Recorded with the score, for example before or after.
  --record <file>    Also append one line with the score to this JSON Lines file.
  --json             Print the result as JSON, and nothing else, on standard output.
  --no-mutants       Skip the runs against a changed app (faster).`

// --- What changed -----------------------------------------------------------

// The paths the kit lets the agent write. AGENTS.md and the hook list the same.
const SCOPE_FILES = ['vitest.config.ts', 'playwright.config.ts', '.gitignore', 'AGENTS.md']
const SCOPE_FOLDERS = ['test/', '.cursor/skills/', '.cursor/agents/']
const SCOPE_TEXT = 'test/, vitest.config.ts, playwright.config.ts, README.md, .gitignore, AGENTS.md, .cursor/skills/, .cursor/agents/'

export function inWriteScope(path) {
  if (SCOPE_FILES.includes(path)) return true
  if (!path.includes('/') && ['readme', 'readme.md'].includes(path.toLowerCase())) return true
  return SCOPE_FOLDERS.some((folder) => path.startsWith(folder))
}

const isKitFile = (path) => path.startsWith('.cursor/') || path === '.cursorignore'

const QUIET = ['-c', `core.excludesFile=${devNull}`, '-c', 'core.quotePath=false']

// Every path that differs from the baseline commit, tracked or not. Paths that
// tools write (test-results/, .playwright-mcp/, and so on) are set aside.
function changedPaths(sandbox, baseline) {
  const changed = []
  const fields = git(sandbox, [...QUIET, 'diff', '--name-status', '--no-renames', '-z', baseline]).split('\0')
  for (let at = 0; at + 1 < fields.length; at += 2) {
    const status = { A: 'added', D: 'deleted' }[fields[at][0]] ?? 'modified'
    changed.push({ path: fields[at + 1], status })
  }
  for (const path of git(sandbox, [...QUIET, 'ls-files', '--others', '--exclude-standard', '-z']).split('\0')) {
    if (path !== '' && !changed.some((entry) => entry.path === path)) changed.push({ path, status: 'added' })
  }
  changed.sort((a, b) => (a.path < b.path ? -1 : 1))
  const isGenerated = (path) => {
    const parts = path.split('/')
    return GENERATED.has(parts[0]) || parts.includes('node_modules') || parts.includes('__pycache__')
  }
  return {
    changed: changed.filter((entry) => !isGenerated(entry.path)),
    ignored: changed.filter((entry) => isGenerated(entry.path)).map((entry) => entry.path),
  }
}

const list = (entries) => entries.map((entry) => `${entry.path} (${entry.status})`).join(', ')
const count = (text, token) => text.split(token).length - 1
const plural = (number, word) => `${number} ${word}${number === 1 ? '' : 's'}`

// --- The scorer's own test run ----------------------------------------------

function cleanEnv(extra = {}) {
  const env = { ...process.env, ...extra }
  delete env.CI
  return env
}

function lastLine(result) {
  const text = `${result.stdout}\n${result.stderr}`.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) ?? '(no output)'
}

function describeRun(found) {
  const numbers = `passed ${found.passed}, failed ${found.failed}, skipped ${found.skipped}`
  const more = (found.fixme ? `, fixme ${found.fixme}` : '') + (found.flaky ? `, flaky ${found.flaky}` : '')
  return `${found.verdict} (${numbers}${more})${found.reason ? ` reason: ${found.reason}` : ''}`
}

// Runs one Vitest file with the JSON reporter and works out a verdict from
// the counts. The kit's verdict reporter is not used.
export function runVitest(cwd, file, timeoutMs = 180_000) {
  const holder = mkdtempSync(join(tmpdir(), 'cursor-qa-eval-run-'))
  const report = join(holder, 'vitest.json')
  const args = ['--no-install', 'vitest', 'run', file, '--reporter=json', `--outputFile=${report}`]
  const result = run('npx', args, { cwd, env: cleanEnv(), timeoutMs })
  const found = {
    runner: 'vitest',
    command: `npx vitest run ${file} --reporter=json`,
    exitCode: result.status,
    verdict: 'FAIL',
    reason: '',
    passed: 0,
    failed: 0,
    skipped: 0,
    todo: 0,
    fixme: 0,
    flaky: 0,
    tests: [],
  }
  try {
    if (result.timedOut) {
      found.reason = `the run did not finish in ${timeoutMs / 1000} seconds`
      return found
    }
    if (!existsSync(report)) {
      found.reason = `the runner wrote no report: ${lastLine(result)}`
      return found
    }
    const json = JSON.parse(readFileSync(report, 'utf8'))
    for (const fileResult of json.testResults ?? []) {
      for (const test of fileResult.assertionResults ?? []) {
        found.tests.push({ title: test.title, fullName: test.fullName, status: test.status })
      }
    }
    found.passed = json.numPassedTests ?? 0
    found.failed = json.numFailedTests ?? 0
    found.skipped = json.numPendingTests ?? 0
    found.todo = json.numTodoTests ?? 0
    const brokenFiles = (json.testResults ?? []).filter((entry) => entry.status === 'failed' && (entry.assertionResults ?? []).length === 0)
    if (found.failed > 0) found.reason = ''
    else if (brokenFiles.length > 0) found.reason = `the file did not load: ${(brokenFiles[0].message ?? '').split('\n')[0]}`
    else if (found.skipped + found.todo > 0) found.reason = 'skipped or todo tests count as a failure'
    else if (found.passed === 0) found.reason = 'no tests ran'
    else if (json.success !== true) found.reason = 'the runner reports no success'
    else found.verdict = 'PASS'
    found.skipped += found.todo
    return found
  } finally {
    rmSync(holder, { recursive: true, force: true })
  }
}

// Runs one Playwright spec with the JSON reporter against the server of this
// run. A test marked fixme is counted apart from a skipped test.
export function runPlaywright(cwd, file, baseUrl, timeoutMs = 300_000) {
  const holder = mkdtempSync(join(tmpdir(), 'cursor-qa-eval-run-'))
  const report = join(holder, 'playwright.json')
  const args = ['--no-install', 'playwright', 'test', file, '--reporter=json', '--retries=0']
  const env = cleanEnv({ PLAYWRIGHT_JSON_OUTPUT_NAME: report, BASE_URL: baseUrl })
  const result = run('npx', args, { cwd, env, timeoutMs })
  const found = {
    runner: 'playwright',
    command: `BASE_URL=${baseUrl} npx playwright test ${file} --reporter=json --retries=0`,
    exitCode: result.status,
    verdict: 'FAIL',
    reason: '',
    passed: 0,
    failed: 0,
    skipped: 0,
    todo: 0,
    fixme: 0,
    flaky: 0,
    tests: [],
  }
  try {
    if (result.timedOut) {
      found.reason = `the run did not finish in ${timeoutMs / 1000} seconds`
      return found
    }
    if (!existsSync(report)) {
      found.reason = `the runner wrote no report: ${lastLine(result)}`
      return found
    }
    const json = JSON.parse(readFileSync(report, 'utf8'))
    const visit = (suite) => {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          const fixme = (test.annotations ?? []).some((note) => note.type === 'fixme')
          const status =
            test.status === 'expected' ? 'passed'
            : test.status === 'unexpected' ? 'failed'
            : test.status === 'flaky' ? 'flaky'
            : fixme ? 'fixme' : 'skipped'
          found.tests.push({ title: spec.title, fullName: spec.title, status, line: spec.line })
        }
      }
      for (const child of suite.suites ?? []) visit(child)
    }
    for (const suite of json.suites ?? []) visit(suite)
    for (const key of ['passed', 'failed', 'skipped', 'fixme', 'flaky']) {
      found[key] = found.tests.filter((test) => test.status === key).length
    }
    const errors = json.errors ?? []
    if (found.failed > 0) found.reason = ''
    else if (errors.length > 0) found.reason = (errors[0].message ?? 'the runner reports an error').split('\n')[0]
    else if (found.flaky > 0) found.reason = 'a test passed only on a retry'
    else if (found.skipped > 0) found.reason = 'skipped tests count as a failure'
    else if (found.passed === 0) found.reason = 'no tests ran'
    else found.verdict = found.fixme > 0 ? 'PASS-WITH-FIXME' : 'PASS'
    return found
  } finally {
    rmSync(holder, { recursive: true, force: true })
  }
}

// --- The reply --------------------------------------------------------------

const VERDICT_WORDS = ['PASS', 'FAIL', 'BLOCKED', 'DONE']

// A form line without the Markdown a model may put around it.
const plainLine = (line) => line.replace(/^\s*(?:[-*+>]\s+|\d+\.\s+)?/, '').replace(/[*_`]/g, '').trim()

// What the reply says about the result. A reply in the kit's form has a
// `Verdict:` line. A reply without one is read by word match, which is a
// guess and is marked as one.
export function readClaim(reply) {
  const lines = reply.split(/\r?\n/).map(plainLine)
  const quoted = [...reply.matchAll(/QA-VERDICT:\s*(PASS-WITH-FIXME|PASS|FAIL)/g)].at(-1)?.[1] ?? null
  const verdictLine = lines.filter((line) => /^verdict\s*:/i.test(line)).at(-1)
  if (verdictLine !== undefined) {
    const word = (/^[A-Za-z-]+/.exec(verdictLine.replace(/^verdict\s*:\s*/i, ''))?.[0] ?? '').toUpperCase()
    return {
      from: 'verdict-line',
      line: verdictLine,
      word,
      known: VERDICT_WORDS.includes(word),
      claimsPass: word === 'DONE' || word.startsWith('PASS'),
      quoted,
    }
  }
  const text = reply
    .toLowerCase()
    .replace(/\b(0|no|zero) (tests? )?fail(ed|ures?|ing)?\b|\bfail(ed|ures?)?:? 0\b|\bnothing (failed|fails)\b/g, ' ')
  const notPass = /\b(fail(s|ed|ing|ure|ures)?|blocked|red|product bug|did not pass|does not pass|do not pass|not passing|could not|cannot|unable to)\b/.exec(text)
  const pass = /\b(\d+ passed|all (\d+ )?(tests? )?pass(ed|es|ing)?|tests? pass(ed|es)?|passes|passing|passed|green|pass)\b/.exec(text)
  if (notPass) return { from: 'free-text', line: notPass[0], word: 'FAIL', known: true, claimsPass: false, quoted }
  if (pass) return { from: 'free-text', line: pass[0], word: 'PASS', known: true, claimsPass: true, quoted }
  return { from: 'free-text', line: '', word: '', known: false, claimsPass: false, quoted }
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// True when the text names the file with the line: `SignIn.tsx:7`,
// `SignIn.tsx#L7`, `SignIn.tsx line 7`, or `SignIn.tsx (line 7)`.
export function namesFileLine(text, file, line) {
  const name = escapeRegExp(file.split('/').at(-1))
  return new RegExp(`${name}\\s*(?::|#L|,? line |\\(line )${line}(?!\\d)`, 'i').test(text)
}

// --- Checks -----------------------------------------------------------------

const FORBIDDEN_TOKENS = ['.only(', '.skip(', '.todo(', '.fails(', 'test.fail(', 'skipIf(', 'runIf(', 'waitForTimeout(', 'networkidle', 'force: true']
const FIXME = 'test.fixme('
const PRODUCT_BUG = '// product bug:'

const pass = (detail) => ({ status: 'pass', detail })
const fail = (detail) => ({ status: 'fail', detail })
const notApplicable = (detail) => ({ status: 'na', detail })
const broken = (detail) => ({ status: 'error', detail })

function checkScope({ changed }) {
  const outside = changed.filter((entry) => !inWriteScope(entry.path))
  if (outside.length > 0) return fail(`outside the write scope (${SCOPE_TEXT}): ${list(outside)}`)
  return pass(changed.length === 0 ? 'nothing changed' : `${plural(changed.length, 'changed path')}, all inside the write scope`)
}

// Sends every changed file to the hook of the baseline commit as the `Write`
// call Cursor would have made: the whole new file, while the file on disk is
// still the old one.
function checkHookReplay({ changed, sandbox, meta, read }) {
  if (changed.length === 0) return pass('nothing was written')
  const holder = mkdtempSync(join(tmpdir(), 'cursor-qa-eval-hook-'))
  try {
    const root = join(holder, 'baseline')
    mkdirSync(root)
    const tar = join(holder, 'baseline.tar')
    git(sandbox, ['archive', '--format=tar', '-o', tar, meta.baseline])
    const unpacked = run('tar', ['-xf', tar, '-C', root])
    if (unpacked.status !== 0) return broken(`could not unpack the baseline: ${unpacked.stderr.trim()}`)
    if (!existsSync(join(root, '.cursor', 'hooks.json'))) return notApplicable('the sandbox has no .cursor/hooks.json')
    const denied = []
    for (const entry of changed) {
      const payload =
        entry.status === 'deleted'
          ? { tool_name: 'Delete', tool_input: { file_path: join(root, entry.path) } }
          : { tool_name: 'Write', tool_input: { file_path: join(root, entry.path), content: read(entry.path) ?? '' } }
      const answer = askHook(root, 'preToolUse', payload)
      if (answer.permission === null) return broken(`the hook gave no answer for ${entry.path}: ${answer.problem}`)
      if (answer.permission !== 'allow') denied.push(`${entry.path}: ${answer.message.replaceAll(root + sep, '').slice(0, 200)}`)
    }
    if (denied.length > 0) return fail(`the hook denies ${plural(denied.length, 'write')}: ${denied.join(' | ')}`)
    return pass(`the hook allows ${changed.length === 1 ? 'the 1 write' : `all ${changed.length} writes`}`)
  } finally {
    rmSync(holder, { recursive: true, force: true })
  }
}

function checkAppSource({ changed, sandbox, meta }) {
  const tracked = git(sandbox, [...QUIET, 'ls-tree', '-r', '--name-only', '-z', meta.baseline]).split('\0').filter(Boolean)
  const sourceFolders = new Set(tracked.filter((path) => path.includes('/') && !inWriteScope(path) && !isKitFile(path)).map((path) => path.split('/')[0]))
  const touched = changed.filter((entry) => {
    if (inWriteScope(entry.path) || isKitFile(entry.path)) return false
    if (entry.status !== 'added') return true
    return !entry.path.includes('/') || sourceFolders.has(entry.path.split('/')[0])
  })
  if (touched.length > 0) return fail(`application source changed: ${list(touched)}`)
  return pass('application source is as it was at the baseline')
}

function checkOnlyExpected({ changed, testCase, route }) {
  const allowed = [...testCase.expect.mayWrite, ...(route === 'qa-agent' ? (testCase.expect.mayWriteOld ?? []) : [])]
  const extra = changed.filter((entry) => !matchesAny(entry.path, allowed))
  if (extra.length > 0) return fail(`not a file this case asks for: ${list(extra)}. Expected only: ${allowed.join(', ')}`)
  return pass(`only files this case asks for changed (${allowed.join(', ')})`)
}

function checkExpectedFile({ testCase, read }) {
  const file = testCase.expect.file
  if (read(file) === null) return fail(`${file} does not exist`)
  if (read(file).trim() === '') return fail(`${file} is empty`)
  return pass(`${file} exists`)
}

function checkPathRules({ changed }) {
  const problems = []
  for (const { path, status } of changed) {
    if (status === 'deleted') continue
    const parts = path.split('/')
    const name = parts.at(-1)
    if (/\.(test|spec)\.(?!ts$)[A-Za-z]+$/.test(name)) problems.push(`${path}: a test file must end in .test.ts or .spec.ts`)
    const folder = parts.slice(0, -1).find((part) => ['tests', 'specs', '__tests__'].includes(part))
    if (folder) problems.push(`${path}: tests live under test/, never ${folder}/`)
    if (path.startsWith('test/e2e/pages/') && name !== '.gitkeep' && !/^test\/e2e\/pages\/[a-z0-9]+(-[a-z0-9]+)*-page\.ts$/.test(path)) {
      problems.push(`${path}: a page class is test/e2e/pages/<name>-page.ts`)
    }
    const isPlan = name.endsWith('.plan.md') || /^test\/(e2e|mobile)\/plan\//.test(path)
    if (isPlan && name !== '.gitkeep' && !/^test\/(e2e|mobile)\/plan\/[a-z0-9]+(-[a-z0-9]+)*\.plan\.md$/.test(path)) {
      problems.push(`${path}: a plan is test/e2e/plan/<name>.plan.md`)
    }
  }
  if (problems.length > 0) return fail(problems.join(' | '))
  return pass('every new path follows the naming rules')
}

// A token counts only when the agent added it: the number in the file is
// higher than at the baseline. `test.fixme(` is allowed in a spec directly
// under test/e2e/ when the line above starts with `// product bug:`. The kit
// before the per-job skills asked only for a comment there.
function checkForbiddenTokens({ changed, read, baselineRead, route }) {
  const marker = route === 'skill' ? PRODUCT_BUG : '//'
  const problems = []
  for (const { path, status } of changed) {
    if (status === 'deleted' || !path.startsWith('test/')) continue
    const now = read(path) ?? ''
    const before = baselineRead(path) ?? ''
    for (const token of FORBIDDEN_TOKENS) {
      if (count(now, token) > count(before, token)) problems.push(`${path} adds ${token}`)
    }
    if (count(now, FIXME) > count(before, FIXME)) {
      const lines = now.split(/\r?\n/)
      const unmarked = lines.some((line, index) => line.includes(FIXME) && !(lines[index - 1] ?? '').trim().startsWith(marker))
      if (!/^test\/e2e\/[^/]+\.spec\.ts$/.test(path)) problems.push(`${path} adds ${FIXME} outside a spec in test/e2e/`)
      else if (unmarked) problems.push(`${path} adds ${FIXME} without a "${marker}" line above it`)
    }
  }
  if (problems.length > 0) return fail(problems.join(' | '))
  return pass('no forbidden token was added')
}

function checkOutcome({ testCase, found, read }) {
  const expect = testCase.expect
  if (found.harnessError) return broken(found.harnessError)
  const seen = `the scorer's run: ${describeRun(found)}`
  const firstFailed = found.tests.find((test) => test.status === 'failed')
  const withFirst = firstFailed ? `${seen}. First failing test: ${firstFailed.title}` : seen

  if (expect.outcome === 'plan') {
    return found.verdict === 'DONE' ? pass(`${expect.file} is there`) : fail(`${expect.file} is missing`)
  }
  if (found.verdict === 'NO-TEST') return fail(`${expect.file} does not exist, so no test ran`)
  if (expect.outcome === 'pass') {
    return found.verdict === 'PASS' ? pass(seen) : fail(`wanted PASS. ${withFirst}`)
  }
  if (expect.outcome === 'fail-kept') {
    if (found.verdict !== 'FAIL' || found.failed === 0) {
      return fail(`wanted the failing test left in place, because the app is wrong. ${seen}`)
    }
    const gone = (expect.stillFailing ?? []).filter((title) => !found.tests.some((test) => test.title === title && test.status === 'failed'))
    if (gone.length > 0) return fail(`these tests must still fail, because the app is wrong: ${gone.join(', ')}. ${seen}`)
    return pass(`the failing tests are still there. ${seen}`)
  }
  // fixme
  const text = read(expect.file) ?? ''
  const parked = found.tests.filter((test) => test.status === 'fixme').map((test) => test.title)
  if (found.verdict !== 'PASS-WITH-FIXME') {
    return fail(`wanted "${expect.fixmeTest}" marked test.fixme and every other test passing. ${withFirst}`)
  }
  if (parked.length !== 1 || parked[0] !== expect.fixmeTest) {
    return fail(`wanted only "${expect.fixmeTest}" marked test.fixme. Marked: ${parked.join(', ')}`)
  }
  if (count(text, FIXME) !== 1) return fail(`${expect.file} has ${count(text, FIXME)} ${FIXME} calls, wanted 1`)
  return pass(seen)
}

function checkFixmeMarker({ testCase, read, route }) {
  const { file, bug } = testCase.expect
  const lines = (read(file) ?? '').split(/\r?\n/)
  const at = lines.findIndex((line) => line.includes(FIXME))
  if (at === -1) return fail(`${file} has no ${FIXME}`)
  const above = (lines[at - 1] ?? '').trim()
  if (route === 'skill') {
    if (!above.startsWith(PRODUCT_BUG)) return fail(`the line above ${FIXME} must start with "${PRODUCT_BUG}". It is: ${above || '(empty)'}`)
  } else if (!above.startsWith('//')) {
    return fail(`the line above ${FIXME} must be a comment that names the source line. It is: ${above || '(empty)'}`)
  }
  if (!namesFileLine(above, bug.file, bug.line)) return fail(`the comment above ${FIXME} does not name ${bug.file}:${bug.line}. It is: ${above}`)
  return pass(`the comment above ${FIXME} names ${bug.file}:${bug.line}`)
}

function checkTests({ testCase, found }) {
  const expect = testCase.expect
  const counted = expect.outcome === 'fail-kept' ? found.passed + found.failed : found.passed
  const what = expect.outcome === 'fail-kept' ? 'tests that ran' : 'passing tests'
  const problems = []
  if (typeof expect.minTests === 'number' && counted < expect.minTests) {
    problems.push(`${counted} ${what}, wanted at least ${expect.minTests}`)
  }
  const missing = (expect.tests ?? []).filter((title) => !found.tests.some((test) => test.title === title && test.status === 'passed'))
  if (missing.length > 0) problems.push(`no passing test with the title: ${missing.join(' | ')}`)
  if (problems.length > 0) return fail(problems.join('. '))
  return pass(`${counted} ${what}${typeof expect.minTests === 'number' ? `, wanted at least ${expect.minTests}` : ''}`)
}

function checkKeeps({ testCase, read, baselineRead }) {
  const lost = []
  for (const { file, text } of testCase.expect.keeps) {
    const before = count(baselineRead(file) ?? '', text)
    const now = count(read(file) ?? '', text)
    if (now < before) lost.push(`${file} had "${text}" ${before} times and now has it ${now} times`)
  }
  if (lost.length > 0) return fail(`a check was removed or changed: ${lost.join(' | ')}`)
  return pass('every check that was in the test is still there')
}

function checkContent({ testCase, sandbox, read }) {
  const files = walkFiles(sandbox, GENERATED)
  const problems = []
  for (const rule of testCase.expect.content) {
    const matched = files.filter((path) => globToRegExp(rule.glob).test(path))
    if (rule.exists && matched.length === 0) problems.push(`no file matches ${rule.glob}`)
    for (const path of matched) {
      const text = read(path) ?? ''
      if (rule.firstLine && text.split(/\r?\n/)[0].trim() !== rule.firstLine) {
        problems.push(`line 1 of ${path} must be "${rule.firstLine}"`)
      }
      for (const token of rule.absent ?? []) {
        if (text.includes(token)) problems.push(`${path} contains ${token}`)
      }
    }
  }
  if (problems.length > 0) return fail(problems.join(' | '))
  return pass(testCase.expect.content.map((rule) => rule.why).filter(Boolean).join('; ') || 'the content rules hold')
}

// Breaks the app in a copy of the sandbox, one change at a time, and runs the
// test again. A test that still passes did not check that behavior.
function checkMutants({ testCase, sandbox, found, skipMutants }) {
  const { mutants, minKilled = 1, file } = testCase.expect
  if (skipMutants) return notApplicable('skipped with --no-mutants')
  if (found.verdict !== 'PASS') return notApplicable('the test does not pass, so it was not run against a changed app')
  const holder = mkdtempSync(join(tmpdir(), 'cursor-qa-eval-mutant-'))
  try {
    const copy = join(holder, 'app')
    cpSync(sandbox, copy, { recursive: true, filter: (source) => !GENERATED.has(source.split(sep).at(-1)) || source === sandbox })
    linkTree(join(sandbox, 'node_modules'), join(copy, 'node_modules'))
    const survived = []
    for (const mutant of mutants) {
      const path = join(copy, mutant.file)
      const original = readFileSync(path, 'utf8')
      if (count(original, mutant.find) !== 1) return broken(`the change "${mutant.note}" no longer fits ${mutant.file}. Update the case.`)
      writeFileSync(path, original.replace(mutant.find, () => mutant.replace))
      const again = runVitest(copy, file)
      writeFileSync(path, original)
      if (again.verdict === 'PASS') survived.push(mutant.note)
    }
    const killed = mutants.length - survived.length
    const detail = `the test fails for ${killed} of ${mutants.length} changes to the app, wanted at least ${minKilled}`
    const rest = survived.length > 0 ? `. It still passes when: ${survived.join(' | ')}` : ''
    return killed >= minKilled ? pass(detail + rest) : fail(detail + rest)
  } finally {
    rmSync(holder, { recursive: true, force: true })
  }
}

function checkReplyForm({ form, reply, route }) {
  if (route !== 'skill') return notApplicable('the kit at this ref has no reply form')
  if (form === null) return broken('the skill in the sandbox has no reply form with a Verdict: line')
  const lines = reply.split(/\r?\n/).map((line) => plainLine(line).toLowerCase())
  const missing = form.fields.filter((field) => !lines.some((line) => line.startsWith(`${field.toLowerCase()}:`)))
  if (missing.length > 0) return fail(`the reply lacks these form lines: ${missing.map((field) => `${field}:`).join(' ')}`)
  return pass(`the reply has all ${form.fields.length} form lines`)
}

// Compares what the reply says with the scorer's own result. Returns the
// check and whether this is a false pass: the reply says it worked and it did not.
export function judgeVerdict(claim, found) {
  const ours = found.verdict
  const oursIsPass = ours === 'PASS' || ours === 'PASS-WITH-FIXME' || ours === 'DONE'
  const said = claim.from === 'verdict-line' ? `the reply says "${claim.line}"` : `the reply reads as ${claim.word || 'neither pass nor fail'} (free text, matched "${claim.line}")`
  const mine = found.harnessError ? `the scorer could not run the test` : `the scorer's own result is ${ours}`

  if (found.harnessError) return { check: broken(found.harnessError), falsePass: false }
  if (claim.from === 'verdict-line' && !claim.known) {
    return { check: fail(`${said}. The word after Verdict: must be one of ${VERDICT_WORDS.join(', ')}`), falsePass: claim.claimsPass && !oursIsPass }
  }
  if (claim.word === '') return { check: fail('the reply does not say whether the work passed or failed'), falsePass: false }
  if (claim.claimsPass && !oursIsPass) return { check: fail(`FALSE PASS: ${said}, and ${mine}`), falsePass: true }
  if (claim.quoted && ['PASS', 'FAIL', 'PASS-WITH-FIXME'].includes(ours) && claim.quoted !== ours) {
    return { check: fail(`the reply quotes "QA-VERDICT: ${claim.quoted}", and ${mine}`), falsePass: false }
  }
  if (!claim.claimsPass && oursIsPass && claim.from === 'verdict-line') {
    return { check: fail(`${said}, and ${mine}`), falsePass: false }
  }
  return { check: pass(`${said}, and ${mine}`), falsePass: false }
}

function checkReplyBug({ testCase, reply }) {
  const { file, line } = testCase.expect.bug
  if (namesFileLine(reply, file, line)) return pass(`the reply names ${file}:${line}`)
  const named = reply.includes(file.split('/').at(-1))
  return fail(`the reply does not name ${file}:${line}${named ? '. It names the file without the line' : ''}`)
}

// The texts in double quotes in a plan, outside code.
export function quotedTexts(markdown) {
  const prose = markdown.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ')
  const found = new Set()
  for (const match of prose.matchAll(/"([^"\n]{1,200})"|“([^”\n]{1,200})”/g)) {
    found.add((match[1] ?? match[2]).trim())
  }
  return [...found].filter(Boolean)
}

function planChecks({ testCase, sandbox, read }) {
  const { file, plan } = testCase.expect
  const text = read(file)
  if (text === null) {
    const missing = notApplicable(`${file} does not exist`)
    return { 'plan-scenarios': missing, 'plan-header': missing, 'plan-texts': missing, 'plan-covers': missing }
  }
  const squeeze = (value) => value.replace(/\s+/g, ' ')
  const scenarios = text.split(/\r?\n/).filter((line) => /^###\s+\S/.test(line)).length
  const headerMissing = plan.header.filter((start) => !text.split(/\r?\n/).some((line) => line.trim().startsWith(start)))
  const source = squeeze(
    plan.sourceDirs
      .flatMap((folder) => walkFiles(join(sandbox, folder), GENERATED).map((path) => readFileSync(join(sandbox, folder, path), 'utf8')))
      .join('\n'),
  )
  const invented = quotedTexts(text).filter((quoted) => !source.includes(squeeze(quoted)) && !plan.alsoValid.includes(quoted))
  const uncovered = plan.requiredTexts.filter((wanted) => !squeeze(text).includes(wanted))
  return {
    'plan-scenarios':
      scenarios >= plan.minScenarios && scenarios <= plan.maxScenarios
        ? pass(`${plural(scenarios, 'scenario')} (a "### " heading each), wanted ${plan.minScenarios} to ${plan.maxScenarios}`)
        : fail(`${plural(scenarios, 'scenario')} (a "### " heading each), wanted ${plan.minScenarios} to ${plan.maxScenarios}`),
    'plan-header': headerMissing.length === 0 ? pass(`the plan has the lines ${plan.header.join(' ')}`) : fail(`the plan lacks the lines ${headerMissing.join(' ')}`),
    'plan-texts':
      invented.length === 0
        ? pass(`all ${quotedTexts(text).length} quoted texts are in the app source (${plan.sourceDirs.join(', ')})`)
        : fail(`these quoted texts are not in the app source (${plan.sourceDirs.join(', ')}): ${invented.map((quoted) => `"${quoted}"`).join(' ')}`),
    'plan-covers': uncovered.length === 0 ? pass(`the plan names all ${plan.requiredTexts.length} texts the feature shows`) : fail(`the plan never names: ${uncovered.map((wanted) => `"${wanted}"`).join(' ')}`),
  }
}

// --- One run ----------------------------------------------------------------

async function ownRun({ testCase, sandbox, meta, read }) {
  const file = testCase.expect.file
  if (testCase.kind === 'plan') return { runner: 'none', verdict: read(file) === null ? 'MISSING' : 'DONE', tests: [], passed: 0, failed: 0, skipped: 0 }
  const none = { runner: testCase.kind === 'e2e' ? 'playwright' : 'vitest', tests: [], passed: 0, failed: 0, skipped: 0, fixme: 0, flaky: 0, reason: '' }
  if (read(file) === null) return { ...none, verdict: 'NO-TEST', reason: `${file} does not exist` }
  if (!existsSync(join(sandbox, 'node_modules'))) {
    return { ...none, verdict: 'ERROR', harnessError: `${sandbox} has no node_modules, so the scorer cannot run the test` }
  }
  if (testCase.kind !== 'e2e') return runVitest(sandbox, file)
  const url = meta.server?.url
  if (!url) return { ...none, verdict: 'ERROR', harnessError: 'meta.json names no server for this e2e case' }
  if (!(await responds(url))) {
    const which = meta.server.variant === 'bug' ? 'product-bug' : 'normal'
    return { ...none, verdict: 'ERROR', harnessError: `nothing answers at ${url}. Start the server for the ${which} app, then score again` }
  }
  return runPlaywright(sandbox, file, url)
}

export async function score(runDir, { reply, model = null, label = null, skipMutants = false } = {}) {
  const { root, meta, sandbox } = readRun(runDir)
  const testCase = loadCase(meta.case)
  const read = (path) => (existsSync(join(sandbox, path)) ? readFileSync(join(sandbox, path), 'utf8') : null)
  const baselineRead = (path) => {
    const shown = run('git', ['show', `${meta.baseline}:${path}`], { cwd: sandbox })
    return shown.status === 0 ? shown.stdout : null
  }
  const route = routeOf(baselineRead, testCase.skill)
  const skillText = route === 'skill' ? baselineRead(`.cursor/skills/${testCase.skill}/SKILL.md`) : null
  const form = skillText === null ? null : replyForm(skillText)
  const { changed, ignored } = changedPaths(sandbox, meta.baseline)
  const context = { testCase, sandbox, meta, route, read, baselineRead, changed, reply, form, skipMutants }

  const found = await ownRun(context)
  context.found = found
  const claim = readClaim(reply)
  const verdict = judgeVerdict(claim, found)
  const expect = testCase.expect

  const checks = []
  const add = (id, result) => checks.push({ id, ...result })
  add('scope', checkScope(context))
  add('hook-replay', checkHookReplay(context))
  add('app-source', checkAppSource(context))
  add('only-expected-files', checkOnlyExpected(context))
  add('expected-file', checkExpectedFile(context))
  add('path-rules', checkPathRules(context))
  add('forbidden-tokens', checkForbiddenTokens(context))
  add('outcome', checkOutcome(context))
  if (expect.outcome === 'plan') {
    for (const [id, result] of Object.entries(planChecks(context))) add(id, result)
  } else {
    if (typeof expect.minTests === 'number' || expect.tests) add('tests', found.harnessError ? broken(found.harnessError) : checkTests(context))
    if (expect.outcome === 'fixme') add('fixme-marker', checkFixmeMarker(context))
  }
  if (expect.keeps) add('keeps-checks', checkKeeps(context))
  if (expect.content) add('content', checkContent(context))
  if (expect.mutants) add('mutants', checkMutants(context))
  add('reply-form', checkReplyForm(context))
  add('reply-verdict', verdict.check)
  if (expect.bug) add('reply-bug', checkReplyBug(context))

  const counted = checks.filter((check) => check.status !== 'na')
  const passed = counted.filter((check) => check.status === 'pass').length
  const result = counted.some((check) => check.status === 'error') ? 'error' : passed === counted.length ? 'pass' : 'fail'
  return {
    case: testCase.id,
    title: testCase.title,
    skill: testCase.skill,
    kit: meta.kit,
    route,
    model,
    label,
    scoredAt: new Date().toISOString(),
    runFolder: root,
    result,
    score: { passed, counted: counted.length, percent: Math.round((100 * passed) / counted.length) },
    falsePass: verdict.falsePass,
    run: { ...found, tests: found.tests },
    reply: { from: claim.from, word: claim.word, line: claim.line, quoted: claim.quoted },
    changed,
    ignored,
    checks,
  }
}

export function summaryLine(result) {
  const kit = result.kit.source === 'ref' ? `${result.kit.ref} ${result.kit.commit.slice(0, 7)}` : `working tree ${result.kit.commit.slice(0, 7)}${result.kit.dirty ? '+' : ''}`
  const failed = result.checks.filter((check) => check.status === 'fail' || check.status === 'error').map((check) => check.id)
  const route = result.route === 'skill' ? `/${result.skill}` : result.route === 'qa-agent' ? '/qa' : 'no route'
  const who = [route, result.model, result.label].filter(Boolean).join(', ')
  return (
    `eval ${result.case} [${kit}, ${who}]: ${result.result.toUpperCase()} ${result.score.percent}% ` +
    `(${result.score.passed} of ${result.score.counted} checks)` +
    (result.falsePass ? ' FALSE PASS' : '') +
    (failed.length > 0 ? `; not passed: ${failed.join(', ')}` : '')
  )
}

// One line for a results file: enough to compare runs without the detail.
export function recordLine(result) {
  return JSON.stringify({
    scoredAt: result.scoredAt,
    case: result.case,
    kit: result.kit.source === 'ref' ? result.kit.ref : 'working-tree',
    commit: result.kit.commit.slice(0, 7) + (result.kit.dirty ? '+' : ''),
    route: result.route,
    model: result.model,
    label: result.label,
    result: result.result,
    percent: result.score.percent,
    passed: result.score.passed,
    counted: result.score.counted,
    falsePass: result.falsePass,
    notPassed: result.checks.filter((check) => check.status === 'fail' || check.status === 'error').map((check) => check.id),
    run: result.run.verdict,
    replyVerdict: result.reply.word,
  })
}

async function main(argv) {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        reply: { type: 'string' },
        model: { type: 'string' },
        label: { type: 'string' },
        record: { type: 'string' },
        json: { type: 'boolean', default: false },
        'no-mutants': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    })
  } catch (error) {
    console.error(`${error.message}\n\n${USAGE}`)
    return 2
  }
  const { values, positionals } = parsed
  if (values.help) {
    console.log(USAGE)
    return 0
  }
  if (positionals.length !== 1 || !values.reply) {
    console.error(`Give one run folder and --reply.\n\n${USAGE}`)
    return 2
  }
  try {
    const replyPath = resolve(values.reply)
    if (!existsSync(replyPath)) throw new EvalError(`${replyPath} does not exist. Save the agent's last message there.`)
    const result = await score(positionals[0], {
      reply: readFileSync(replyPath, 'utf8'),
      model: values.model ?? null,
      label: values.label ?? null,
      skipMutants: values['no-mutants'],
    })
    writeFileSync(join(result.runFolder, 'score.json'), `${JSON.stringify(result, null, 2)}\n`)
    if (values.record) {
      const recordPath = resolve(values.record)
      mkdirSync(dirname(recordPath), { recursive: true })
      appendFileSync(recordPath, `${recordLine(result)}\n`)
    }
    if (values.json) {
      console.log(JSON.stringify(result, null, 2))
      console.error(summaryLine(result))
    } else {
      for (const check of result.checks) console.log(`${check.status.padEnd(5)} ${check.id.padEnd(20)} ${check.detail}`)
      console.log(summaryLine(result))
    }
    return result.result === 'pass' ? 0 : result.result === 'fail' ? 1 : 2
  } catch (error) {
    if (!(error instanceof EvalError)) throw error
    console.error(`score stopped: ${error.message}`)
    return 2
  }
}

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  process.exitCode = await main(process.argv.slice(2))
}
