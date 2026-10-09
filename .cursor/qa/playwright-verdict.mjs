// Playwright reporter for the QA kit. playwright.config.ts registers it after the list reporter.
// It prints one last line that states the result of the run:
//
//   QA-VERDICT: PASS (passed 3, failed 0, skipped 0, files 1)
//   QA-VERDICT: FAIL (passed 2, failed 1, skipped 0, files 1)
//   QA-VERDICT: FAIL (passed 0, failed 0, skipped 2, files 1) reason: skipped or todo tests count as a failure
//   QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: no tests ran
//   QA-VERDICT: PASS-WITH-FIXME (passed 5, failed 0, skipped 0, fixme 1, files 1)
//
// PASS means at least one test ran and every test passed on its first attempt.
// PASS-WITH-FIXME means the same, except for tests marked test.fixme().
// Anything else is FAIL. The line reports the run. It does not change the exit code.
// A --list run runs no test, so it prints no verdict line.
//
// This file is plain JavaScript with no imports, so it needs no build step and no dependency.
// Tests: node --test ".cursor/qa/*.test.mjs"

// Every reason the line can carry. A reason is present when the FAIL has a cause
// other than a failed test.
export const REASONS = Object.freeze({
  only: '.only is not allowed',
  interrupted: 'the run was interrupted',
  timedOut: 'the run timed out',
  error: 'an error happened outside a test',
  noTests: 'no tests ran',
  flaky: 'a test passed only on a retry',
  skipped: 'skipped or todo tests count as a failure',
  runner: 'the runner reported a failure',
  broken: 'the verdict reporter failed',
})

function count(value) {
  return Number.isInteger(value) && value > 0 ? value : 0
}

// Counts in, verdict line out. This is the only place that can say PASS or PASS-WITH-FIXME.
//
//   passed   tests that passed on the first attempt
//   failed   tests that failed
//   skipped  tests skipped with test.skip(), or not run because an earlier test in a serial group failed
//   fixme    tests marked test.fixme()
//   flaky    tests that failed first and passed on a retry
//   files    spec files with at least one test in the run
//   errors   errors outside a test, for example a spec that cannot be imported or a syntax error
//   only     true when Playwright refused a .only
//   status   what Playwright reported for the run: passed, failed, timedout, interrupted
//
// With --repeat-each=3 every repeat is one test in these counts.
export function playwrightVerdict(input = {}) {
  const passed = count(input.passed)
  const failed = count(input.failed)
  const skipped = count(input.skipped)
  const fixme = count(input.fixme)
  const flaky = count(input.flaky)
  const files = count(input.files)
  const status = input.status ?? 'passed'
  const total = passed + failed + skipped + fixme + flaky

  // The first matching row wins. `null` means FAIL with no reason: the failed count explains it.
  let reason
  if (input.only) reason = REASONS.only
  else if (failed > 0) reason = null
  else if (status === 'interrupted') reason = REASONS.interrupted
  else if (status === 'timedout') reason = REASONS.timedOut
  else if (count(input.errors) > 0) reason = REASONS.error
  else if (total === 0) reason = REASONS.noTests
  else if (flaky > 0) reason = REASONS.flaky
  else if (skipped > 0) reason = REASONS.skipped
  else if (status !== 'passed') reason = REASONS.runner

  let word = 'FAIL'
  if (reason === undefined) word = fixme > 0 ? 'PASS-WITH-FIXME' : 'PASS'
  const parts = [`passed ${passed}`, `failed ${failed}`, `skipped ${skipped}`]
  if (flaky > 0) parts.push(`flaky ${flaky}`)
  if (fixme > 0) parts.push(`fixme ${fixme}`)
  parts.push(`files ${files}`)
  return `QA-VERDICT: ${word} (${parts.join(', ')})${reason ? ` reason: ${reason}` : ''}`
}

const ONLY_ERROR = /focused with '\.only'/
// Playwright reports "No tests found" as an error. It means "nothing to run".
const NOTHING_TO_RUN = /^(Error: )?No tests found/

// A skipped test counts as fixme only when test.fixme() is the one thing that skipped it.
function isFixme(test) {
  const types = (test.annotations ?? []).map((annotation) => annotation.type)
  return types.includes('fixme') && !types.includes('skip')
}

// True when every attempt of the test was cut short, for example by Ctrl+C.
// Playwright gives such a test the outcome "skipped". The verdict does not count it.
function wasInterrupted(test) {
  const results = test.results ?? []
  return results.length > 0 && results.every((result) => result.status === 'interrupted')
}

// Turns what Playwright hands to the reporter into the counts `playwrightVerdict` takes.
//   tests   every test that reached `onTestEnd`, once each
//   errors  every error that reached `onError`
//   status  the status that reached `onEnd`
export function countPlaywrightRun(tests = [], errors = [], status = 'passed') {
  const counts = { passed: 0, failed: 0, skipped: 0, fixme: 0, flaky: 0, files: 0, errors: 0, only: false, status }
  const files = new Set()
  for (const test of tests) {
    files.add(test.location?.file)
    const outcome = test.outcome()
    if (outcome === 'expected') counts.passed += 1
    else if (outcome === 'unexpected') counts.failed += 1
    else if (outcome === 'flaky') counts.flaky += 1
    else if (wasInterrupted(test)) continue
    else if (isFixme(test)) counts.fixme += 1
    else counts.skipped += 1
  }
  counts.files = files.size
  for (const error of errors) {
    const message = String(error?.message ?? error ?? '')
    if (ONLY_ERROR.test(message)) counts.only = true
    else if (!NOTHING_TO_RUN.test(message)) counts.errors += 1
  }
  return counts
}

// The line is printed even when this file cannot read the run, for example after
// a Playwright upgrade that changes what a reporter receives. No PASS without a count.
function brokenLine(error) {
  const detail = String(error?.message ?? error).split('\n')[0]
  return `QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: ${REASONS.broken}: ${detail}`
}

export default class PlaywrightVerdictReporter {
  constructor(options = {}) {
    this.write = typeof options.write === 'function' ? options.write : (line) => process.stdout.write(`${line}\n`)
    // Playwright passes `_mode: 'list'` for a --list run. The argv check covers a version that stops doing so.
    this.listOnly = options._mode === 'list' || (options._mode === undefined && process.argv.includes('--list'))
    this.tests = new Set()
    this.errors = []
    this.status = 'passed'
  }

  // The list reporter owns the terminal. Saying so keeps Playwright's default output
  // when this reporter is the only one named on the command line.
  printsToStdio() {
    return false
  }

  // Called once per attempt. The Set keeps each test once, and outcome() covers all attempts.
  onTestEnd(test) {
    this.tests.add(test)
  }

  onError(error) {
    this.errors.push(error)
  }

  onEnd(result) {
    this.status = result?.status ?? 'passed'
  }

  // Runs after every reporter has printed its summary, so the line is the last one.
  onExit() {
    if (this.listOnly) return
    let line
    try {
      line = playwrightVerdict(countPlaywrightRun([...this.tests], this.errors, this.status))
    } catch (error) {
      line = brokenLine(error)
    }
    this.write(line)
  }
}
