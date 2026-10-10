#!/usr/bin/env node
// Scores one finished sandbox and the agent's final reply. It reads files,
// runs the test itself, and asks the sandbox's own hook. No model is involved,
// so the same sandbox and reply always give the same score.
//
//   node eval/score.mjs <run-folder> --reply <file> [--model <name>] [--label <text>]
//                       [--record <file.jsonl>] [--json] [--no-mutants] [--clean]
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
// as test-results/. With --clean it then writes <run-folder>/changes.diff and
// removes node_modules and .next from the sandbox, which frees their inodes.
//
// After the checks it prints a `note` line when a browser that the agent
// opened with playwright-cli is still open. A note is not a check and does not
// change the score: the answer depends on when the run is scored, because
// playwright-cli closes a browser that has been idle for long. --clean closes
// it at once.
//
// Node built-ins only.

import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { devNull } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import {
  DEFAULT_BUG_PORT,
  EvalError,
  GENERATED,
  SANDBOX_NAME,
  answersInSkill,
  askHook,
  breath,
  browserSessions,
  cleanReport,
  cleanRun,
  dropHolder,
  git,
  loadCase,
  matchesAny,
  readRun,
  replyForm,
  responds,
  routeOf,
  run,
  tempHolder,
  walkFiles,
} from './lib.mjs'

const USAGE = `Usage: node eval/score.mjs <run-folder> --reply <file> [options]

  <run-folder>       The --out folder of make-sandbox.mjs.
  --reply <file>     The agent's last message, as a text file.
  --model <name>     Recorded with the score, for example composer-2.5.
  --label <text>     Recorded with the score, for example before or after.
  --record <file>    Also append one line with the score to this JSON Lines file.
  --json             Print the result as JSON, and nothing else, on standard output.
  --no-mutants       Skip the runs against a changed app (faster).
  --clean            After scoring, write changes.diff and remove node_modules and
                     .next from the sandbox. Frees about 16,000 inodes on a tmpfs.`

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

// Folders that a tool may write next to any file, not only in the project
// root. playwright-cli saves its snapshots in the folder it is started from.
const GENERATED_ANYWHERE = ['node_modules', '__pycache__', '.playwright-cli']

// True for a path that a tool wrote and the agent did not.
export function isGeneratedPath(path) {
  const parts = path.split('/')
  return GENERATED.has(parts[0]) || GENERATED_ANYWHERE.some((name) => parts.includes(name))
}

// Every path that differs from the baseline commit, tracked or not. Paths that
// tools write (test-results/, .playwright-cli/, and so on) are set aside. That
// does not rest on the sandbox's .gitignore, which the agent may edit: git is
// told to skip only the two large folders named here, so a file the agent
// hides behind a new .gitignore line is still listed.
const NEVER_LISTED = ['node_modules', '.next']
export function changedPaths(sandbox, baseline) {
  const changed = []
  const fields = git(sandbox, [...QUIET, 'diff', '--name-status', '--no-renames', '-z', baseline]).split('\0')
  for (let at = 0; at + 1 < fields.length; at += 2) {
    const status = { A: 'added', D: 'deleted' }[fields[at][0]] ?? 'modified'
    changed.push({ path: fields[at + 1], status })
  }
  for (const path of git(sandbox, [...QUIET, 'ls-files', '--others', ...NEVER_LISTED.map((name) => `--exclude=${name}`), '-z']).split('\0')) {
    if (path !== '' && !changed.some((entry) => entry.path === path)) changed.push({ path, status: 'added' })
  }
  changed.sort((a, b) => (a.path < b.path ? -1 : 1))
  return {
    changed: changed.filter((entry) => !isGeneratedPath(entry.path)),
    ignored: changed.filter((entry) => isGeneratedPath(entry.path)).map((entry) => entry.path),
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

const stripAnsi = (text) => text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')

// The first line of a text that is not empty.
const firstLine = (text) => stripAnsi(String(text ?? '')).split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? ''

function lastLine(result) {
  return stripAnsi(`${result.stdout}\n${result.stderr}`).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) ?? '(no output)'
}

function describeRun(found) {
  if (found.harnessError) return `not run: ${found.harnessError}`
  const numbers = `passed ${found.passed}, failed ${found.failed}, skipped ${found.skipped}`
  const more = (found.fixme ? `, fixme ${found.fixme}` : '') + (found.flaky ? `, flaky ${found.flaky}` : '')
  return `${found.verdict} (${numbers}${more})${found.reason ? ` reason: ${found.reason}` : ''}`
}

const noCounts = () => ({ verdict: 'FAIL', reason: '', incomplete: false, passed: 0, failed: 0, skipped: 0, todo: 0, fixme: 0, flaky: 0, tests: [] })

// A run that gave no result to read. `incomplete` tells it apart from a run
// whose tests failed.
const noResult = (reason) => ({ ...noCounts(), incomplete: true, reason })

// The first line of an error that Vitest caught outside every test. Its
// default reporter prints the error under a heading.
function unhandledLine(output) {
  const match = /Unhandled (?:Rejection|Error)[^\S\n]*[^\w\n]*\n\s*([^\n]+)/.exec(stripAnsi(output))
  return match ? match[1].trim() : null
}

const VITEST_TIMEOUT = /^(Error: )?(Test|Hook) timed out in \d+ ?ms/

// Works out the verdict of a Vitest run from its JSON report and its exit
// code. The rows are the kit's verdict rules, written again here so that the
// scorer does not trust the code it checks (.cursor/qa/vitest-verdict.mjs):
// a failed test, an error outside a test, no tests, a test that passed only
// on a retry, and a skipped or todo test are each a FAIL.
//
// The JSON report alone is not enough for two of them. It calls a retried
// test `passed` and keeps the first failure in `failureMessages`. And it has
// no place for an error outside a test, such as a check that rejects after
// its test has ended: `success` stays true and only the exit code says so.
export function readVitestReport(json, { exitCode = 0, output = '' } = {}) {
  const found = noCounts()
  let notLoaded = null
  let outside = null
  for (const fileResult of json.testResults ?? []) {
    const results = fileResult.assertionResults ?? []
    for (const test of results) {
      const messages = test.failureMessages ?? []
      const status =
        test.status === 'passed' ? (messages.length > 0 ? 'flaky' : 'passed')
        : test.status === 'failed' ? 'failed'
        : test.status === 'todo' ? 'todo' : 'skipped'
      const entry = { title: test.title, fullName: test.fullName, status }
      if (messages.length > 0) {
        entry.failure = firstLine(messages[0])
        entry.timedOut = messages.every((message) => VITEST_TIMEOUT.test(firstLine(message)))
      }
      found.tests.push(entry)
    }
    if (fileResult.status === 'failed' && !results.some((test) => test.status === 'failed')) {
      if (results.length === 0) notLoaded ??= firstLine(fileResult.message) || 'the report gives no message'
      else outside ??= firstLine(fileResult.message) || 'a hook failed'
    }
  }
  for (const key of ['passed', 'failed', 'skipped', 'todo', 'flaky']) {
    found[key] = found.tests.filter((test) => test.status === key).length
  }
  const exited = exitCode === null ? 'the runner was stopped before it could exit' : `the runner exited with code ${exitCode}`
  if (found.failed > 0) found.reason = ''
  else if (notLoaded !== null) found.reason = `the file did not load: ${notLoaded}`
  else if (outside !== null) found.reason = `an error happened outside a test: ${outside}`
  else if (found.tests.length === 0) found.reason = 'no tests ran'
  else if (exitCode !== 0) found.reason = `an error happened outside a test: ${unhandledLine(output) ?? exited}`
  else if (found.flaky > 0) found.reason = 'a test passed only on a retry'
  else if (found.skipped + found.todo > 0) found.reason = 'skipped or todo tests count as a failure'
  else if (json.success !== true) found.reason = 'the runner reports no success'
  else found.verdict = 'PASS'
  found.skipped += found.todo
  return found
}

// Runs Vitest on one file, or on a list of files, and works out a verdict.
// The kit's verdict reporter is not used: --reporter replaces the reporters
// of the config. The default reporter is there for one thing: it prints an
// error that happened outside a test, which the JSON report leaves out.
export function runVitest(cwd, files, timeoutMs = 180_000) {
  const list = [files].flat()
  const holder = tempHolder('run')
  const report = join(holder, 'vitest.json')
  const args = ['--no-install', 'vitest', 'run', ...list, '--reporter=json', '--reporter=default', `--outputFile=${report}`]
  const result = run('npx', args, { cwd, env: cleanEnv(), timeoutMs })
  const base = { runner: 'vitest', command: `npx vitest run ${list.join(' ')} --reporter=json --reporter=default`, exitCode: result.status }
  try {
    if (result.timedOut) return { ...base, ...noResult(`the run did not finish in ${timeoutMs / 1000} seconds`) }
    if (!existsSync(report)) {
      const output = stripAnsi(`${result.stdout}\n${result.stderr}`)
      if (/No test files found/.test(output)) return { ...base, ...noCounts(), reason: 'no tests ran' }
      return { ...base, ...noResult(`the runner wrote no report: ${lastLine(result)}`) }
    }
    let json
    try {
      json = JSON.parse(readFileSync(report, 'utf8'))
    } catch (error) {
      return { ...base, ...noResult(`the runner's report is not JSON: ${error.message}`) }
    }
    return { ...base, ...readVitestReport(json, { exitCode: result.status, output: `${result.stdout}\n${result.stderr}` }) }
  } finally {
    dropHolder(holder)
  }
}

// Playwright reports "No tests found" as an error. It means there was nothing to run.
const NOTHING_TO_RUN = /^(Error: )?No tests found/

// Works out the verdict of a Playwright run from its JSON report and its exit
// code. The rows are the kit's verdict rules, written again here
// (.cursor/qa/playwright-verdict.mjs). A test marked fixme is counted apart
// from a skipped test. Each test also says whether an `expect` failed in it.
export function readPlaywrightReport(json, { exitCode = 0 } = {}) {
  const found = noCounts()
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const notes = (test.annotations ?? []).map((note) => note.type)
        const status =
          test.status === 'expected' ? 'passed'
          : test.status === 'unexpected' ? 'failed'
          : test.status === 'flaky' ? 'flaky'
          : notes.includes('fixme') && !notes.includes('skip') ? 'fixme' : 'skipped'
        const entry = { title: spec.title, fullName: spec.title, status, line: spec.line }
        const errors = (test.results ?? [])
          .flatMap((result) => [result.error, ...(result.errors ?? [])])
          .map((error) => stripAnsi(String(error?.message ?? '')))
          .filter(Boolean)
        if (errors.length > 0) {
          entry.failure = firstLine(errors[0])
          entry.assertion = errors.some((message) => /\bexpect\(/.test(message))
        }
        found.tests.push(entry)
      }
    }
    for (const child of suite.suites ?? []) visit(child)
  }
  for (const suite of json.suites ?? []) visit(suite)
  for (const key of ['passed', 'failed', 'skipped', 'fixme', 'flaky']) {
    found[key] = found.tests.filter((test) => test.status === key).length
  }
  const errors = (json.errors ?? []).map((error) => firstLine(error.message)).filter((line) => !NOTHING_TO_RUN.test(line))
  const exited = exitCode === null ? 'the runner was stopped before it could exit' : `the runner exited with code ${exitCode}`
  if (found.failed > 0) found.reason = ''
  else if (errors.length > 0) found.reason = `an error happened outside a test: ${errors[0] || 'the runner reports an error'}`
  else if (found.tests.length === 0) found.reason = 'no tests ran'
  else if (exitCode !== 0) found.reason = `an error happened outside a test: ${exited}`
  else if (found.flaky > 0) found.reason = 'a test passed only on a retry'
  else if (found.skipped > 0) found.reason = 'skipped tests count as a failure'
  else if (found.passed === 0) found.reason = 'no test passed'
  else found.verdict = found.fixme > 0 ? 'PASS-WITH-FIXME' : 'PASS'
  return found
}

// Runs one Playwright spec, or a list of specs, against the app at `baseUrl`.
// `outputDir` moves Playwright's own output (test-results/) out of the sandbox.
export function runPlaywright(cwd, files, baseUrl, { timeoutMs = 300_000, outputDir = null } = {}) {
  const list = [files].flat()
  const holder = tempHolder('run')
  const report = join(holder, 'playwright.json')
  const args = ['--no-install', 'playwright', 'test', ...list, '--reporter=json', '--retries=0']
  if (outputDir !== null) args.push(`--output=${outputDir}`)
  const env = cleanEnv({ PLAYWRIGHT_JSON_OUTPUT_NAME: report, BASE_URL: baseUrl })
  const result = run('npx', args, { cwd, env, timeoutMs })
  const base = { runner: 'playwright', command: `BASE_URL=${baseUrl} npx playwright test ${list.join(' ')} --reporter=json --retries=0`, exitCode: result.status }
  try {
    if (result.timedOut) return { ...base, ...noResult(`the run did not finish in ${timeoutMs / 1000} seconds`) }
    if (!existsSync(report)) return { ...base, ...noResult(`the runner wrote no report: ${lastLine(result)}`) }
    let json
    try {
      json = JSON.parse(readFileSync(report, 'utf8'))
    } catch (error) {
      return { ...base, ...noResult(`the runner's report is not JSON: ${error.message}`) }
    }
    return { ...base, ...readPlaywrightReport(json, { exitCode: result.status }) }
  } finally {
    dropHolder(holder)
  }
}

// --- The reply --------------------------------------------------------------

// The words a reply form may put after `Verdict:`. DONE belongs to a job that
// runs no test and ends with a file, such as a plan: there the skill's form
// says `Verdict: DONE`. In every other job DONE says nothing about a test run.
const VERDICT_WORDS = ['PASS', 'FAIL', 'BLOCKED']
export const verdictWords = (done) => (done ? [...VERDICT_WORDS, 'DONE'] : VERDICT_WORDS)

// A reply line without the Markdown a model may put around it: a list or
// quote mark, heading marks, table bars, bold, and code marks.
const plainLine = (line) =>
  line
    .replace(/^[\s>#|]*(?:[-*+]\s+|\d+[.)]\s+)?/, '')
    .replace(/[*_`]/g, '')
    .replace(/^[\s|]+|[\s|]+$/g, '')

// `Verdict: PASS`, and the forms a model writes in its place: `Verdict - PASS`,
// `Final verdict: PASS`, a table row, or `Verdict:` with the word on the next line.
const VERDICT_LINE = /^(?:(?:final|overall)\s+)?verdict\s*(?:[:=|]|\s[-–—]\s|$)\s*(.*)$/i

const SUCCESS_WORDS = new Set(['pass', 'passed', 'passes', 'passing', 'pass-with-fixme', 'success', 'successful', 'succeeded', 'succeeds', 'ok', 'okay', 'green'])
const FAILURE_WORDS = new Set(['fail', 'failed', 'fails', 'failing', 'failure', 'failures', 'red', 'error', 'errors', 'broken'])
const NEGATIONS = new Set(['not', 'no', 'never', 'none', 'nothing', 'zero', 'cannot', "can't", "couldn't", "didn't", "doesn't", "don't", "isn't", "wasn't", "won't", 'unable', 'without'])

const isNumber = (token) => token !== undefined && /^\d+$/.test(token)

// The number that belongs to the count word at `at`: `9 passed`, `passed 9`,
// or `0 of 9 passed`. Null when the word has no number next to it.
function countFor(tokens, at, style) {
  const before = tokens[at - 1]
  const after = tokens[at + 1]
  if (isNumber(before) && tokens[at - 2] === 'of' && isNumber(tokens[at - 3])) return { number: Number(tokens[at - 3]), style: 'before' }
  if (isNumber(before) && isNumber(after)) return { number: Number(style === 'after' ? after : before), style: style ?? 'before' }
  if (isNumber(before)) return { number: Number(before), style: 'before' }
  if (isNumber(after)) return { number: Number(after), style: 'after' }
  const earlier = tokens.slice(0, at).find(isNumber)
  return earlier === undefined ? null : { number: Number(earlier), style }
}

// What a line says about the result, decided by its first verdict word:
// PASS, FAIL, BLOCKED, DONE, or '' when it has none. So
// `QA-VERDICT: PASS (passed 9, failed 0, ...)`, `"PASS"`, `Passed`,
// `PASS-WITH-FIXME`, `All tests pass`, and `9 passed` all read as PASS.
// A word with `not`, `no`, or a count of 0 in front is turned around:
// `did not pass` and `0 passed` read as FAIL, and `no failures` as PASS.
// `9 passed, 1 failed` reads as FAIL.
export function verdictOf(text) {
  const parts = text.toLowerCase().replace(/’/g, "'").split(/[,;()\n]/)
  let noFailure = false
  for (let index = 0; index < parts.length; index += 1) {
    const tokens = parts[index].match(/[a-z]+(?:['-][a-z]+)*|\d+/g) ?? []
    let style
    for (let at = 0; at < tokens.length; at += 1) {
      const token = tokens[at]
      const negated = tokens.slice(0, at).some((earlier) => NEGATIONS.has(earlier))
      if (token === 'blocked' && !negated) return 'BLOCKED'
      if (token === 'done') return negated ? 'FAIL' : 'DONE'
      const success = SUCCESS_WORDS.has(token)
      if (!success && !FAILURE_WORDS.has(token)) continue
      const counted = countFor(tokens, at, style)
      style = counted?.style ?? style
      const turned = negated || counted?.number === 0
      if (!success && turned) {
        noFailure = true
        continue
      }
      if (!success || turned) return 'FAIL'
      // `9 passed` is a pass only when no later count names a failed test.
      if (counted !== null) {
        const rest = parts.slice(index).join(',').match(/[a-z]+(?:['-][a-z]+)*|\d+/g) ?? []
        let restStyle = style
        for (let later = 0; later < rest.length; later += 1) {
          if (!FAILURE_WORDS.has(rest[later])) continue
          const failures = countFor(rest, later, restStyle)
          restStyle = failures?.style ?? restStyle
          if (failures !== null && failures.number > 0) return 'FAIL'
        }
      }
      return 'PASS'
    }
  }
  return noFailure ? 'PASS' : ''
}

// What the reply says about the result. A reply in the kit's form has a
// `Verdict:` line, and the last one counts. `known` is true when the word
// after `Verdict:` is one of the words the form allows for this job. A line in
// another form is read by its first verdict word, so that it can still be a
// false pass. A reply without a `Verdict:` line is read by word match, which
// is a guess and is marked as one.
//
// `done` is true for a job whose skill ends with `Verdict: DONE`.
export function readClaim(reply, { done = false } = {}) {
  const lines = reply.split(/\r?\n/).map(plainLine)
  const quoted = [...reply.matchAll(/QA-VERDICT:\s*(PASS-WITH-FIXME|PASS|FAIL)/g)].at(-1)?.[1] ?? null
  const words = verdictWords(done)
  const at = lines.findLastIndex((line) => VERDICT_LINE.test(line))
  if (at !== -1) {
    let line = lines[at]
    let rest = VERDICT_LINE.exec(line)[1].trim()
    if (rest === '') {
      // The word may be on the next line. Another line of the form is not it.
      const next = lines.slice(at + 1).find((later) => later !== '') ?? ''
      if (!next.includes(':') || /^QA-VERDICT:/i.test(next)) rest = next
      line = `${line} ${rest}`.trim()
    }
    const first = (/^verdict\s*:\s*([A-Za-z]+(?:-[A-Za-z]+)*)/i.exec(line)?.[1] ?? '').toUpperCase()
    const known = words.includes(first)
    const word = known ? first : verdictOf(rest)
    return { from: 'verdict-line', line, word, known, claimsPass: word === 'PASS' || (word === 'DONE' && done), quoted, words }
  }
  const text = reply
    .toLowerCase()
    .replace(/\b(0|no|zero) (tests? )?fail(ed|ures?|ing)?\b|\bfail(ed|ures?)?:? 0\b|\bnothing (failed|fails)\b/g, ' ')
  const notPass = /\b(fail(s|ed|ing|ure|ures)?|blocked|red|product bug|did not pass|does not pass|do not pass|not passing|could not|cannot|unable to)\b/.exec(text)
  const pass = /\b(\d+ passed|all (\d+ )?(tests? )?pass(ed|es|ing)?|tests? pass(ed|es)?|passes|passing|passed|green|pass)\b/.exec(text)
  if (notPass) return { from: 'free-text', line: notPass[0], word: 'FAIL', known: true, claimsPass: false, quoted, words }
  if (pass) return { from: 'free-text', line: pass[0], word: 'PASS', known: true, claimsPass: true, quoted, words }
  return { from: 'free-text', line: '', word: '', known: false, claimsPass: false, quoted, words }
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
  const holder = tempHolder('hook')
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
    dropHolder(holder)
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

  // A test or a plan at another path does not count here: the path is part of the job.
  const other = found.elsewhere ? `. The agent's work is at ${found.elsewhere.files.join(', ')}` : ''
  if (expect.outcome === 'plan') {
    return found.verdict === 'DONE' ? pass(`${expect.file} is there`) : fail(`${expect.file} is missing${other}`)
  }
  if (found.verdict === 'NO-TEST') {
    return fail(`${expect.file} does not exist, so no test ran there${other}${found.elsewhere ? `, and the scorer's run of it: ${describeRun(found.elsewhere.run)}` : ''}`)
  }
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

// The lines the agent added plus the lines it removed, over every changed file.
// A new file counts with all of its lines. A binary file counts as one line.
export function changedLineCount(sandbox, baseline, changed) {
  let total = 0
  for (const { path } of changed) {
    const stat = git(sandbox, [...QUIET, 'diff', '--numstat', '--no-renames', baseline, '--', path]).trim()
    if (stat !== '') {
      const [added, removed] = stat.split('\t')
      total += added === '-' ? 1 : Number(added) + Number(removed)
    } else if (existsSync(join(sandbox, path))) {
      // Not tracked at the baseline, so git has no diff for it. Like git, take
      // a file with a NUL byte in its first 8,000 bytes as binary.
      const bytes = readFileSync(join(sandbox, path))
      total += bytes.subarray(0, 8000).includes(0) ? 1 : bytes.toString('utf8').replace(/\r?\n$/, '').split('\n').length
    }
  }
  return total
}

function checkSmallChange({ testCase, sandbox, meta, changed }) {
  const limit = testCase.expect.maxChangedLines
  const lines = changedLineCount(sandbox, meta.baseline, changed)
  const detail = `${plural(lines, 'line')} added or removed, the case allows ${limit}`
  return lines > limit ? fail(`${detail}. A fix changes the lines that caused the failure and no others`) : pass(detail)
}

// Code without its comments: lines that are only a `//` comment, and `/* */`
// blocks that start a line. A text that is only in a comment is not checked
// by anything.
export function withoutComments(text) {
  return text
    .replace(/^[^\S\n]*\/\*[\s\S]*?\*\/[^\S\n]*$/gm, '')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
}

// The titles of the tests in a file that hold no `expect`. A call to a helper
// of the file whose name starts with `expect`, such as `expectAlert(`, counts
// as one.
export function testsWithoutAssertion(code) {
  const starts = [...code.matchAll(/\b(?:test|it)(?:\.(?:fixme|skip|only|fail|slow|concurrent))?\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)]
  return starts
    .filter((match, index) => !/\bexpect\w*\s*[.(]/.test(code.slice(match.index, starts[index + 1]?.index ?? code.length)))
    .map((match) => match[2])
}

// The problems one content rule finds. `texts` maps each matching path to its text.
//   firstLine           line 1 of each file must be this text
//   absent              texts that must not be in a file
//   assertsInEveryTest  every test in a file must hold an `expect`
//   inCode              texts that must be in the code of at least one of the files, outside comments
export function contentProblems(rule, texts) {
  const problems = []
  for (const [path, text] of Object.entries(texts)) {
    if (rule.firstLine && text.split(/\r?\n/)[0].trim() !== rule.firstLine) {
      problems.push(`line 1 of ${path} is not "${rule.firstLine}"`)
    }
    for (const token of rule.absent ?? []) {
      if (text.includes(token)) problems.push(`${path} contains ${token}`)
    }
    if (rule.assertsInEveryTest) {
      const empty = testsWithoutAssertion(withoutComments(text))
      if (empty.length > 0) problems.push(`${path} has ${plural(empty.length, 'test')} with no expect: ${empty.join(' | ')}`)
    }
  }
  if (rule.inCode && Object.keys(texts).length > 0) {
    const code = Object.values(texts).map(withoutComments).join('\n')
    const missing = rule.inCode.filter((wanted) => !code.includes(wanted))
    if (missing.length > 0) {
      problems.push(`no line of code in ${Object.keys(texts).join(', ')} has: ${missing.map((wanted) => `"${wanted}"`).join(' ')}`)
    }
  }
  return problems
}

function checkContent({ testCase, sandbox, read }) {
  const files = walkFiles(sandbox, GENERATED)
  const failed = []
  for (const rule of testCase.expect.content) {
    const globs = [rule.glob].flat()
    const matched = files.filter((path) => matchesAny(path, globs))
    const problems = contentProblems(rule, Object.fromEntries(matched.map((path) => [path, read(path) ?? ''])))
    if (rule.exists && matched.length === 0) problems.unshift(`no file matches ${globs.join(', ')}`)
    if (problems.length > 0) failed.push(`${problems.join(' | ')}${rule.why ? ` (the rule: ${rule.why})` : ''}`)
  }
  if (failed.length > 0) return fail(failed.join(' | '))
  return pass(testCase.expect.content.map((rule) => rule.why).filter(Boolean).join('; ') || 'the content rules hold')
}

// Appended to a source file to find out whether the test loads it at all.
const CANARY = "\n;throw new Error('cursor-qa-eval: this file was loaded')\n"

// The text of a source file with one change. The old text stays in the file
// as a comment, at the start and at the end. So a test that searches the file
// as text, and never runs it, still finds what it looks for, as its first
// match and as its last, and does not notice the change.
export function mutate(original, mutant) {
  const kept = mutant.find.split(/\r?\n/).map((line) => `// ${line}`).join('\n')
  return `// The text before the change:\n${kept}\n${original.replace(mutant.find, () => mutant.replace)}\n// The text before the change:\n${kept}\n`
}

// What a run against a changed app says about the change.
//   killed    a test that passed against the unchanged app now fails in its body
//   survived  the run finished and no such test failed
//   unknown   the run did not finish, or a test only timed out
// A run that broke in another way, such as a file that did not load or an
// error outside a test, is not a kill: no check of a test caught the change.
export function mutantOutcome(before, after) {
  if (after.incomplete) return 'unknown'
  const passedBefore = new Set(before.tests.filter((test) => test.status === 'passed').map((test) => test.fullName))
  const failed = after.tests.filter((test) => test.status === 'failed' && passedBefore.has(test.fullName))
  if (failed.some((test) => !test.timedOut)) return 'killed'
  return failed.length > 0 ? 'unknown' : 'survived'
}

// Breaks the app in a copy of the sandbox, one change at a time, and runs the
// test again. A test that still passes did not check that behavior.
//
// The copy shares the sandbox's node_modules through one link, so it costs
// about 340 inodes, not the 16,000 of a hard-linked tree. Two runs come before
// the first change:
//   1. The unchanged copy. It must pass, or a failing run later says nothing.
//   2. The source file with a `throw` at its end. A test that still passes
//      never loads the file.
// Then one run for each change.
async function checkMutants({ testCase, sandbox, found, skipMutants }) {
  const { mutants, minKilled = 1, file } = testCase.expect
  if (skipMutants) return notApplicable('skipped with --no-mutants')
  if (found.verdict !== 'PASS') return notApplicable('the test does not pass, so it was not run against a changed app')
  const holder = tempHolder('mutant')
  try {
    const copy = join(holder, SANDBOX_NAME)
    // .git is small and goes along: the copy should differ from the sandbox as little as it can.
    const skip = (source) => source !== sandbox && source.split(sep).at(-1) !== '.git' && GENERATED.has(source.split(sep).at(-1))
    cpSync(sandbox, copy, { recursive: true, filter: (source) => !skip(source) })
    symlinkSync(join(sandbox, 'node_modules'), join(copy, 'node_modules'), 'junction')

    const unchanged = runVitest(copy, file)
    await breath()
    if (unchanged.verdict !== 'PASS') {
      return broken(`the test passes in the sandbox and not in an unchanged copy of it, so a run against a changed app would say nothing. The run in the copy: ${describeRun(unchanged)}`)
    }

    // Each run is followed by a pause, so that Ctrl+C stops the scorer here.
    const withChange = async (path, text) => {
      const original = readFileSync(path, 'utf8')
      writeFileSync(path, text(original))
      try {
        return runVitest(copy, file)
      } finally {
        writeFileSync(path, original)
        await breath()
      }
    }

    for (const source of [...new Set(mutants.map((mutant) => mutant.file))]) {
      const loaded = await withChange(join(copy, source), (original) => original + CANARY)
      if (loaded.incomplete) return broken(`the run that shows whether the test loads ${source} did not finish: ${loaded.reason}`)
      if (loaded.verdict === 'PASS') {
        return fail(`the test never loads ${source}: it still passes when that file throws an error as soon as it is loaded. A test that reads the source as text, or replaces it with a mock, checks nothing`)
      }
    }

    const survived = []
    for (const mutant of mutants) {
      const path = join(copy, mutant.file)
      if (count(readFileSync(path, 'utf8'), mutant.find) !== 1) return broken(`the change "${mutant.note}" no longer fits ${mutant.file}. Update the case.`)
      const again = await withChange(path, (original) => mutate(original, mutant))
      const outcome = mutantOutcome(unchanged, again)
      if (outcome === 'unknown') return broken(`the run against the change "${mutant.note}" gave no result to read: ${describeRun(again)}`)
      if (outcome === 'survived') survived.push(mutant.note)
    }
    const killed = mutants.length - survived.length
    const detail = `a test fails for ${killed} of ${mutants.length} changes to the app, wanted at least ${minKilled}`
    const rest = survived.length > 0 ? `. No test fails when: ${survived.join(' | ')}` : ''
    return killed >= minKilled ? pass(detail + rest) : fail(detail + rest)
  } finally {
    dropHolder(holder)
  }
}

// The same idea for a spec: run it against the product-bug app. The tests the
// case names must fail there, each with a failed `expect`. A spec of empty
// tests, or one that only checks that an alert is visible, passes against
// both apps and so shows nothing.
async function checkBugServer({ testCase, sandbox, meta, found, skipMutants }) {
  const { bugServer, file } = testCase.expect
  if (skipMutants) return notApplicable('skipped with --no-mutants')
  if (found.verdict !== 'PASS') return notApplicable('the spec does not pass, so it was not run against the product-bug app')
  const url = meta.servers?.bug ?? `http://localhost:${DEFAULT_BUG_PORT}`
  if (!(await responds(url))) {
    const guessed = meta.servers?.bug ? '' : ' (meta.json names no product-bug server, so this is the default port)'
    return broken(`nothing answers at ${url}${guessed}. Start the server for the product-bug app, then score again`)
  }
  const holder = tempHolder('bug-run')
  try {
    const again = runPlaywright(sandbox, file, url, { outputDir: join(holder, 'test-results') })
    if (again.incomplete) return broken(`the run against the product-bug app at ${url} gave no result to read: ${again.reason}`)
    const missed = []
    for (const title of bugServer.mustFail) {
      const test = again.tests.find((entry) => entry.title === title)
      if (!test) missed.push(`"${title}" did not run`)
      else if (test.status !== 'failed') missed.push(`"${title}" ${test.status === 'passed' ? 'still passes' : `ended as ${test.status}`}`)
      else if (!test.assertion) missed.push(`"${title}" failed without a failed expect: ${test.failure}`)
    }
    const what = `against the product-bug app at ${url}, where ${bugServer.note}`
    if (missed.length > 0) return fail(`${what}: ${missed.join(' | ')}`)
    return pass(`${what}, an expect fails in: ${bugServer.mustFail.join(' | ')}`)
  } finally {
    dropHolder(holder)
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
// check and whether this is a false pass: the reply says it worked and it did
// not. When the agent saved its test or plan at another path than the case
// asks for, the reply is judged against that file. The path is then wrong,
// and other checks say so, but a reply that tells the truth is no false pass.
export function judgeVerdict(claim, found) {
  const judged = found.elsewhere?.run ?? found
  const ours = judged.verdict
  const oursIsPass = ours === 'PASS' || ours === 'PASS-WITH-FIXME' || ours === 'DONE'
  const said = claim.from === 'verdict-line' ? `the reply says "${claim.line}"` : `the reply reads as ${claim.word || 'neither pass nor fail'} (free text, matched "${claim.line}")`
  const where = found.elsewhere ? ` for ${found.elsewhere.files.join(', ')}, which is not the path this case asks for,` : ''
  const mine = `the scorer's own result${where} is ${ours}`

  if (judged.harnessError) return { check: broken(judged.harnessError), falsePass: false }
  if (claim.from === 'verdict-line' && !claim.known) {
    const falsePass = claim.claimsPass && !oursIsPass
    const form = `The word after Verdict: must be one of ${(claim.words ?? VERDICT_WORDS).join(', ')}`
    return { check: fail(falsePass ? `FALSE PASS: ${said}, and ${mine}. ${form}` : `${said}. ${form}`), falsePass }
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

// --- Notes --------------------------------------------------------------------

// A note says something about the run that is worth knowing and is not part
// of the score. `sessions` is what browserSessions() returned for the sandbox.
//   browser-open     a browser the agent opened with playwright-cli is still open
//   browser-unknown  playwright-cli is there and did not say which browsers are open
export function sessionNotes(sessions, sandbox) {
  if (sessions === null) return []
  if (sessions.problem) return [{ id: 'browser-unknown', detail: `could not find out whether the agent left a browser open: ${sessions.problem}` }]
  if (sessions.names.length === 0) return []
  const which = sessions.names.length === 1 ? `the playwright-cli session "${sessions.names[0]}"` : `the playwright-cli sessions ${sessions.names.map((name) => `"${name}"`).join(', ')}`
  return [
    {
      id: 'browser-open',
      detail:
        `the agent left a browser open: ${which}. ` +
        `Close it with \`npx --no-install playwright-cli close-all\` in ${sandbox}, or score with --clean`,
    },
  ]
}

// --- One run ----------------------------------------------------------------

// Test files, or plans, that the agent wrote at another path than the case asks for.
export function strayWork(changed, testCase) {
  const isWork =
    testCase.kind === 'plan' ? (path) => path.endsWith('.plan.md') || (path.startsWith('test/') && path.endsWith('.md'))
    : testCase.kind === 'e2e' ? (path) => /\.spec\.[cm]?[jt]sx?$/.test(path)
    : (path) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(path)
  return changed.filter((entry) => entry.status !== 'deleted' && entry.path !== testCase.expect.file && isWork(entry.path)).map((entry) => entry.path)
}

// Runs the given test files the way the case needs: Vitest, or Playwright
// against the server of this run.
async function runFiles({ testCase, sandbox, meta }, files) {
  const none = { runner: testCase.kind === 'e2e' ? 'playwright' : 'vitest', ...noCounts() }
  if (!existsSync(join(sandbox, 'node_modules'))) {
    return {
      ...none,
      verdict: 'ERROR',
      harnessError: `${sandbox} has no node_modules, so the scorer cannot run the test. If --clean removed it, put it back with: node eval/make-sandbox.mjs --relink <run-folder>`,
    }
  }
  if (testCase.kind !== 'e2e') return runVitest(sandbox, files)
  const url = meta.server?.url
  if (!url) return { ...none, verdict: 'ERROR', harnessError: 'meta.json names no server for this e2e case' }
  if (!(await responds(url))) {
    const which = meta.server.variant === 'bug' ? 'product-bug' : 'normal'
    return { ...none, verdict: 'ERROR', harnessError: `nothing answers at ${url}. Start the server for the ${which} app, then score again` }
  }
  return runPlaywright(sandbox, files, url)
}

// The scorer's own result. When the file the case asks for is not there, the
// result is NO-TEST (or MISSING for a plan), and `elsewhere` holds the run of
// what the agent wrote at another path. Only the reply is judged against that.
async function ownRun(context) {
  const { testCase, read, changed } = context
  const file = testCase.expect.file
  const isPlan = testCase.kind === 'plan'
  if (read(file) !== null) {
    return isPlan ? { runner: 'none', ...noCounts(), verdict: 'DONE' } : runFiles(context, file)
  }
  const missing = {
    runner: isPlan ? 'none' : testCase.kind === 'e2e' ? 'playwright' : 'vitest',
    ...noCounts(),
    verdict: isPlan ? 'MISSING' : 'NO-TEST',
    reason: `${file} does not exist`,
  }
  const files = strayWork(changed, testCase)
  if (files.length === 0) return missing
  const run = isPlan ? { runner: 'none', ...noCounts(), verdict: 'DONE' } : await runFiles(context, files)
  return { ...missing, elsewhere: { files, run } }
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
  // Asked first, before the scorer's own test runs take their time.
  const notes = sessionNotes(browserSessions(sandbox), sandbox)

  const found = await ownRun(context)
  await breath()
  context.found = found
  const claim = readClaim(reply, { done: testCase.expect.outcome === 'plan' })
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
  if (typeof expect.maxChangedLines === 'number') add('small-change', checkSmallChange(context))
  if (expect.content) add('content', checkContent(context))
  if (expect.mutants) add('mutants', await checkMutants(context))
  if (expect.bugServer) add('mutants', await checkBugServer(context))
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
    // Not empty when the skill in the sandbox prints the answer of this case.
    answerInSkill: answersInSkill(skillText, testCase),
    run: found,
    reply: { from: claim.from, word: claim.word, line: claim.line, quoted: claim.quoted },
    changed,
    ignored,
    checks,
    notes,
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
    (failed.length > 0 ? `; not passed: ${failed.join(', ')}` : '') +
    (result.answerInSkill?.length > 0 ? `; the skill prints the answer of this case: ${result.answerInSkill.join(' and ')}` : '') +
    (result.notes?.length > 0 ? `; notes: ${result.notes.map((note) => note.id).join(', ')}` : '')
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
    answerInSkill: (result.answerInSkill ?? []).length > 0,
    notPassed: result.checks.filter((check) => check.status === 'fail' || check.status === 'error').map((check) => check.id),
    run: result.run.verdict,
    replyVerdict: result.reply.word,
    notes: (result.notes ?? []).map((note) => note.id),
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
        clean: { type: 'boolean', default: false },
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
      for (const note of result.notes) console.log(`${'note'.padEnd(5)} ${note.id.padEnd(20)} ${note.detail}`)
      console.log(summaryLine(result))
    }
    // A run that could not be scored keeps its node_modules: it will be scored again.
    if (values.clean && result.result !== 'error') (values.json ? console.error : console.log)(cleanReport(cleanRun(positionals[0])))
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
