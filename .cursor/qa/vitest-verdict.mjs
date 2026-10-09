// Vitest reporter for the QA kit. vitest.config.ts registers it after Vitest's own reporter.
// It prints one last line that states the result of the run:
//
//   QA-VERDICT: PASS (passed 3, failed 0, skipped 0, files 1)
//   QA-VERDICT: FAIL (passed 2, failed 1, skipped 0, files 1)
//   QA-VERDICT: FAIL (passed 0, failed 0, skipped 2, files 1) reason: skipped or todo tests count as a failure
//   QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: no tests ran
//
// PASS means at least one test ran and every test passed on its first attempt.
// Anything else is FAIL. The line reports the run. It does not change the exit code.
//
// With --coverage the line is printed after the coverage table. By then Vitest has
// checked the coverage thresholds, and has set a failing exit code when coverage is
// below one. A PASS then becomes FAIL with the reason "the runner reported a failure".
// Vitest's own error line above it names the threshold.
//
// This file is plain JavaScript with no imports, so it needs no build step and no dependency.
// Tests: node --test ".cursor/qa/*.test.mjs"

// Every reason the line can carry. A reason is present when the FAIL has a cause
// other than a failed test.
export const REASONS = Object.freeze({
  only: '.only is not allowed',
  interrupted: 'the run was interrupted',
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

// Counts in, verdict line out. This is the only place that can say PASS.
//
//   passed       tests that passed on the first attempt
//   failed       tests that failed
//   skipped      tests marked skip or todo, or skipped while running
//   flaky        tests that failed first and passed on a retry
//   files        test files in the run
//   errors       errors outside a test: a file that cannot be imported, a syntax
//                error, a failing hook, an unhandled rejection
//   only         true when Vitest refused a .only
//   interrupted  true when the run was stopped before it finished
//   runFailed    true when Vitest itself reported the run as failed
export function vitestVerdict(input = {}) {
  const passed = count(input.passed)
  const failed = count(input.failed)
  const skipped = count(input.skipped)
  const flaky = count(input.flaky)
  const files = count(input.files)
  const total = passed + failed + skipped + flaky

  // The first matching row wins. `null` means FAIL with no reason: the failed count explains it.
  let reason
  if (input.only) reason = REASONS.only
  else if (failed > 0) reason = null
  else if (input.interrupted) reason = REASONS.interrupted
  else if (count(input.errors) > 0) reason = REASONS.error
  else if (total === 0) reason = REASONS.noTests
  else if (flaky > 0) reason = REASONS.flaky
  else if (skipped > 0) reason = REASONS.skipped
  else if (input.runFailed) reason = REASONS.runner

  const word = reason === undefined ? 'PASS' : 'FAIL'
  const parts = [`passed ${passed}`, `failed ${failed}`, `skipped ${skipped}`]
  if (flaky > 0) parts.push(`flaky ${flaky}`)
  parts.push(`files ${files}`)
  return `QA-VERDICT: ${word} (${parts.join(', ')})${reason ? ` reason: ${reason}` : ''}`
}

const ONLY_ERROR = /Unexpected \.only modifier/
// Vitest reports these two as file errors. They mean "nothing to run", not "the file is broken".
const NOTHING_TO_RUN = /^No test suite found in file|^No test found in .* in lines? \d/

function messages(errors) {
  return (errors ?? []).map((error) => String(error?.message ?? error ?? ''))
}

// True when the test did not run because the command asked for other tests:
// `-t "name"` did not match it, or `file.test.ts:12` named another line.
// Vitest reports such a test as skipped. The verdict does not count it.
function leftOutByFilter(test, lines) {
  const pattern = test.project?.config?.testNamePattern
  if (pattern && !String(test.fullName).match(pattern)) return true
  if (!lines || lines.length === 0) return false
  for (let node = test; node && node.type !== 'module'; node = node.parent) {
    if (node.location && lines.includes(node.location.line)) return false
  }
  return true
}

// Turns what Vitest hands to `onTestRunEnd` into the counts `vitestVerdict` takes.
// `lineFilters` maps a test module to the line numbers given on the command line.
export function countVitestRun(testModules = [], unhandledErrors = [], reason = 'passed', lineFilters = new Map()) {
  const counts = {
    passed: 0,
    failed: 0,
    skipped: 0,
    flaky: 0,
    files: testModules.length,
    errors: unhandledErrors.length,
    only: false,
    interrupted: reason === 'interrupted',
    runFailed: reason === 'failed',
  }
  const outsideTest = (message) => {
    if (ONLY_ERROR.test(message)) counts.only = true
    else if (!NOTHING_TO_RUN.test(message)) counts.errors += 1
  }
  for (const testModule of testModules) {
    messages(testModule.errors()).forEach(outsideTest)
    for (const suite of testModule.children.allSuites()) messages(suite.errors()).forEach(outsideTest)
    const lines = lineFilters.get(testModule)
    for (const test of testModule.children.allTests()) {
      const result = test.result()
      if (result.state === 'passed') {
        if (test.diagnostic()?.flaky) counts.flaky += 1
        else counts.passed += 1
      } else if (result.state === 'failed') {
        // Vitest reports a refused .only as a failed test. Keep its count and add the reason.
        if (messages(result.errors).some((message) => ONLY_ERROR.test(message))) counts.only = true
        counts.failed += 1
      } else if (!leftOutByFilter(test, lines)) {
        counts.skipped += 1
      }
    }
  }
  return counts
}

function isFailingExitCode(value) {
  if (value === undefined || value === null || value === '') return false
  const code = Number(value)
  return Number.isInteger(code) && code !== 0
}

// A line that was held back for the coverage table, and the exit code of the process
// at the time the line is printed. Returns the line to print.
export function heldVerdict(line, exitCode) {
  if (!line.startsWith('QA-VERDICT: PASS ') || !isFailingExitCode(exitCode)) return line
  return `${line.replace('QA-VERDICT: PASS ', 'QA-VERDICT: FAIL ')} reason: ${REASONS.runner}`
}

// The line is printed even when this file cannot read the run, for example after
// a Vitest upgrade that changes what a reporter receives. No PASS without a count.
function brokenLine(error) {
  const detail = String(error?.message ?? error).split('\n')[0]
  return `QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: ${REASONS.broken}: ${detail}`
}

export default class VitestVerdictReporter {
  constructor(options = {}) {
    this.write = typeof options.write === 'function' ? options.write : (line) => process.stdout.write(`${line}\n`)
    this.exitCode = typeof options.exitCode === 'function' ? options.exitCode : () => process.exitCode
    this.specifications = []
    this.held = undefined
    // In watch mode the exit code of an earlier run stays set. A run that starts
    // with a failing exit code is judged by its tests alone.
    this.failingAtStart = false
    this.flush = () => {
      if (this.held === undefined) return
      const line = this.held
      this.held = undefined
      this.write(this.failingAtStart ? line : heldVerdict(line, this.exitCode()))
    }
  }

  onInit(vitest) {
    this.vitest = vitest
  }

  onTestRunStart(specifications) {
    this.flush()
    this.specifications = specifications ?? []
    this.failingAtStart = isFailingExitCode(this.exitCode())
  }

  onTestRunEnd(testModules, unhandledErrors, reason) {
    let line
    let held = false
    try {
      const lineFilters = new Map()
      for (const specification of this.specifications) {
        if (specification.testModule) lineFilters.set(specification.testModule, specification.testLines)
      }
      line = vitestVerdict(countVitestRun(testModules, unhandledErrors, reason, lineFilters))
      held = this.coverageTableFollows(testModules)
    } catch (error) {
      line = brokenLine(error)
    }
    if (!held) {
      this.write(line)
      return
    }
    // With --coverage, Vitest prints the coverage table after this hook.
    // Hold the line until the table is out so that it stays the last line.
    this.held = line
    if (!this.flushOnExit) {
      this.flushOnExit = true
      process.once('exit', this.flush)
    }
  }

  // Vitest calls this after it has written the coverage report and checked the thresholds.
  onFinishedReportCoverage() {
    this.flush()
  }

  // Vitest skips the coverage report when a test failed, unless coverage.reportOnFailure is set.
  coverageTableFollows(testModules) {
    const coverage = this.vitest?.config?.coverage
    if (!coverage?.enabled) return false
    const failed = testModules.some((testModule) => testModule.state() === 'failed')
    return !failed || coverage.reportOnFailure === true
  }
}
