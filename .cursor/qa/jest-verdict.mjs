// Jest reporter for the QA kit. .cursor/qa/jest.config.cjs registers it after Jest's own reporter.
// It prints one last line that states the result of the run:
//
//   QA-VERDICT: PASS (passed 3, failed 0, skipped 0, files 1)
//   QA-VERDICT: FAIL (passed 2, failed 1, skipped 0, files 1)
//   QA-VERDICT: FAIL (passed 1, failed 0, skipped 2, files 1) reason: skipped or todo tests count as a failure
//   QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 1) reason: an error happened outside a test
//
// PASS means at least one test ran and every test passed on its first attempt.
// Anything else is FAIL. The line reports the run. It does not change the exit code.
//
// Jest exits with 0 when a test is skipped, is a todo, or was left out by a
// stray .only, and when a test passed only on a retry. This line says FAIL for
// each of them.
//
// Jest prints its own summary to stderr after the reporters are done, so the
// line is held and printed as the process exits. That keeps it the last line.
// It is written straight to file descriptor 1: when Jest ends, its exit helper
// replaces process.stdout.write with a function that drops the text.
//
// When no test file matches the command, Jest ends before it calls any
// reporter. jest.config.cjs then prints the "no tests ran" line itself, as the
// process exits. MARK tells it that this reporter has a line to print.
//
// This file is plain JavaScript that imports only Node's own fs module, so it
// needs no build step and no dependency.
// Tests: node --test ".cursor/qa/*.test.mjs"

import { writeSync } from 'node:fs'

// Every reason the line can carry. A reason is present when the FAIL has a cause
// other than a failed test. The wording is the one vitest-verdict.mjs uses.
export const REASONS = Object.freeze({
  interrupted: 'the run was interrupted',
  error: 'an error happened outside a test',
  noTests: 'no tests ran',
  flaky: 'a test passed only on a retry',
  skipped: 'skipped or todo tests count as a failure',
  snapshot: 'a snapshot was written or updated',
  broken: 'the verdict reporter failed',
})

// The key, on globalThis, that this reporter sets once it has a line to print.
export const MARK = Symbol.for('qa-agent-kit.jest-verdict.printed')

// Writes one line to standard output in a way that also works while the process exits.
export function writeLine(line) {
  try {
    writeSync(1, `${line}\n`)
  } catch {
    process.stdout.write(`${line}\n`)
  }
}

function count(value) {
  return Number.isInteger(value) && value > 0 ? value : 0
}

// Counts in, verdict line out. This is the only place that can say PASS.
//
//   passed       tests that passed on the first attempt
//   failed       tests that failed
//   skipped      tests marked skip or todo, or left out by a .only in their file
//   flaky        tests that failed first and passed on a retry
//   files        test files in the run
//   errors       test files that could not run: an import error, a syntax error,
//                a failing hook outside a test, a file with no test in it
//   snapshots    snapshots that the run wrote or updated
//   interrupted  true when the run was stopped before it finished
export function jestVerdict(input = {}) {
  const passed = count(input.passed)
  const failed = count(input.failed)
  const skipped = count(input.skipped)
  const flaky = count(input.flaky)
  const files = count(input.files)
  const total = passed + failed + skipped + flaky

  // The first matching row wins. `null` means FAIL with no reason: the failed count explains it.
  let reason
  if (failed > 0) reason = null
  else if (input.interrupted) reason = REASONS.interrupted
  else if (count(input.errors) > 0) reason = REASONS.error
  else if (total === 0) reason = REASONS.noTests
  else if (flaky > 0) reason = REASONS.flaky
  else if (skipped > 0) reason = REASONS.skipped
  else if (count(input.snapshots) > 0) reason = REASONS.snapshot

  const word = reason === undefined ? 'PASS' : 'FAIL'
  const parts = [`passed ${passed}`, `failed ${failed}`, `skipped ${skipped}`]
  if (flaky > 0) parts.push(`flaky ${flaky}`)
  parts.push(`files ${files}`)
  return `QA-VERDICT: ${word} (${parts.join(', ')})${reason ? ` reason: ${reason}` : ''}`
}

// The status of a test in Jest's results, for each status that is not a pass or a failure.
const NOT_RUN = new Set(['pending', 'skipped', 'todo', 'disabled', 'focused'])

// Turns the aggregated results Jest hands to `onRunComplete` into the counts `jestVerdict` takes.
export function countJestRun(results = {}) {
  const counts = {
    passed: 0,
    failed: 0,
    skipped: 0,
    flaky: 0,
    files: 0,
    errors: 0,
    snapshots: count(results.snapshot?.added) + count(results.snapshot?.updated),
    interrupted: results.wasInterrupted === true,
  }
  if (results.runExecError) counts.errors += 1
  for (const file of results.testResults ?? []) {
    counts.files += 1
    // A file that could not run has no tests and a testExecError. Jest also
    // puts a failing beforeAll or afterAll there, next to the tests it ran.
    if (file.testExecError) counts.errors += 1
    for (const test of file.testResults ?? []) {
      if (test.status === 'passed') {
        const retried = count(test.invocations) > 1 || (test.retryReasons ?? []).length > 0
        if (retried) counts.flaky += 1
        else counts.passed += 1
      } else if (test.status === 'failed') {
        counts.failed += 1
      } else if (NOT_RUN.has(test.status)) {
        counts.skipped += 1
      }
    }
  }
  return counts
}

// The line is printed even when this file cannot read the run, for example after
// a Jest upgrade that changes what a reporter receives. No PASS without a count.
function brokenLine(error) {
  const detail = String(error?.message ?? error).split('\n')[0]
  return `QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: ${REASONS.broken}: ${detail}`
}

export default class JestVerdictReporter {
  // Jest passes the global config and this reporter's options. A test may pass
  // { write, atExit }: atExit gets the function to run as the process exits.
  constructor(globalConfig, options = {}) {
    const given = options && typeof options === 'object' ? options : {}
    this.write = typeof given.write === 'function' ? given.write : writeLine
    this.atExit = typeof given.atExit === 'function' ? given.atExit : (print) => process.once('exit', print)
  }

  onRunComplete(testContexts, results) {
    let line
    try {
      line = jestVerdict(countJestRun(results))
    } catch (error) {
      line = brokenLine(error)
    }
    globalThis[MARK] = true
    this.atExit(() => this.write(line))
  }

  // Jest asks every reporter for an error to fail the run with. This one never fails a run.
  getLastError() {
    return undefined
  }
}
