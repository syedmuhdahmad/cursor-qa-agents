// Tests for vitest-verdict.mjs. Run: node --test ".cursor/qa/*.test.mjs"
// The fake modules below have the shapes Vitest 5.0.3 passes to a reporter.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import VitestVerdictReporter, { REASONS, countVitestRun, heldVerdict, vitestVerdict } from './vitest-verdict.mjs'

const LINE = /^QA-VERDICT: (PASS|FAIL) \(passed \d+, failed \d+, skipped \d+(, flaky \d+)?, files \d+\)( reason: \S.*)?$/
const ONLY_MESSAGE = '[Vitest] Unexpected .only modifier. Remove it or pass --allowOnly argument to bypass this error'

function fakeTest(name, state = 'passed', extra = {}) {
  return {
    type: 'test',
    name,
    location: extra.line ? { line: extra.line, column: 1 } : undefined,
    result: () => ({ state, errors: (extra.errors ?? []).map((message) => ({ message })) }),
    diagnostic: () => (state === 'passed' || state === 'failed' ? { flaky: extra.flaky === true } : undefined),
  }
}

function fakeSuite(name, tests, extra = {}) {
  return {
    type: 'suite',
    name,
    tests,
    location: extra.line ? { line: extra.line, column: 1 } : undefined,
    errors: () => (extra.errors ?? []).map((message) => ({ message })),
  }
}

function fakeModule({ state = 'passed', errors = [], children = [], pattern } = {}) {
  const project = { config: { testNamePattern: pattern } }
  const testModule = { type: 'module', project, state: () => state, errors: () => errors.map((message) => ({ message })) }
  const tests = []
  const suites = []
  const adopt = (parent, prefix, nodes) => {
    for (const node of nodes) {
      node.parent = parent
      node.project = project
      node.fullName = prefix ? `${prefix} > ${node.name}` : node.name
      if (node.type === 'suite') {
        suites.push(node)
        adopt(node, node.fullName, node.tests)
      } else {
        tests.push(node)
      }
    }
  }
  adopt(testModule, '', children)
  testModule.children = { allTests: () => tests, allSuites: () => suites }
  return testModule
}

describe('vitestVerdict: counts in, line out', () => {
  const cases = [
    ['all pass', { passed: 3, files: 1 }, 'QA-VERDICT: PASS (passed 3, failed 0, skipped 0, files 1)'],
    ['one failing assertion', { passed: 2, failed: 1, files: 1 }, 'QA-VERDICT: FAIL (passed 2, failed 1, skipped 0, files 1)'],
    [
      'all skipped',
      { skipped: 2, files: 1 },
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 2, files 1) reason: skipped or todo tests count as a failure',
    ],
    [
      'a todo next to a pass',
      { passed: 1, skipped: 1, files: 1 },
      'QA-VERDICT: FAIL (passed 1, failed 0, skipped 1, files 1) reason: skipped or todo tests count as a failure',
    ],
    ['an empty file', { files: 1 }, 'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 1) reason: no tests ran'],
    ['a missing file', { files: 0, runFailed: true }, 'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: no tests ran'],
    [
      'an import error',
      { files: 1, errors: 1, runFailed: true },
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 1) reason: an error happened outside a test',
    ],
    [
      'an unhandled error after every test passed',
      { passed: 1, files: 1, errors: 1 },
      'QA-VERDICT: FAIL (passed 1, failed 0, skipped 0, files 1) reason: an error happened outside a test',
    ],
    [
      'a stray it.only',
      { failed: 1, skipped: 1, files: 1, only: true, runFailed: true },
      'QA-VERDICT: FAIL (passed 0, failed 1, skipped 1, files 1) reason: .only is not allowed',
    ],
    [
      'a stray describe.only',
      { skipped: 2, files: 1, only: true, runFailed: true },
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 2, files 1) reason: .only is not allowed',
    ],
    [
      'a flaky test',
      { flaky: 1, files: 1 },
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, flaky 1, files 1) reason: a test passed only on a retry',
    ],
    [
      'an interrupted run',
      { passed: 1, files: 2, interrupted: true },
      'QA-VERDICT: FAIL (passed 1, failed 0, skipped 0, files 2) reason: the run was interrupted',
    ],
    [
      'a run Vitest reports as failed with nothing else wrong',
      { passed: 1, files: 1, runFailed: true },
      'QA-VERDICT: FAIL (passed 1, failed 0, skipped 0, files 1) reason: the runner reported a failure',
    ],
    ['no input at all', undefined, 'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: no tests ran'],
  ]
  for (const [name, counts, expected] of cases) {
    it(name, () => {
      assert.equal(vitestVerdict(counts), expected)
    })
  }

  it('gives no reason when a failed test explains the FAIL', () => {
    const line = vitestVerdict({ passed: 1, failed: 1, skipped: 1, flaky: 1, files: 2, errors: 1, interrupted: true })
    assert.equal(line, 'QA-VERDICT: FAIL (passed 1, failed 1, skipped 1, flaky 1, files 2)')
  })

  it('names the more serious cause first', () => {
    assert.match(vitestVerdict({ skipped: 1, files: 1, errors: 1 }), /reason: an error happened outside a test$/)
    assert.match(vitestVerdict({ skipped: 1, flaky: 1, files: 1 }), /reason: a test passed only on a retry$/)
    assert.match(vitestVerdict({ skipped: 1, files: 1, errors: 1, interrupted: true }), /reason: the run was interrupted$/)
  })

  it('treats a count that is not a positive whole number as 0', () => {
    assert.equal(
      vitestVerdict({ passed: 2, failed: -1, skipped: 'x', flaky: 0.5, files: null }),
      'QA-VERDICT: PASS (passed 2, failed 0, skipped 0, files 0)',
    )
  })

  it('keeps one format for every combination of counts', () => {
    const values = [0, 1, 4]
    for (const passed of values) {
      for (const failed of values) {
        for (const skipped of values) {
          for (const flaky of values) {
            for (const errors of [0, 1]) {
              for (const only of [false, true]) {
                const line = vitestVerdict({ passed, failed, skipped, flaky, errors, only, files: 1 })
                assert.match(line, LINE)
                assert.ok(!line.includes('\n'))
                const pass = line.startsWith('QA-VERDICT: PASS ')
                const everyTestPassed = passed > 0 && failed === 0 && skipped === 0 && flaky === 0
                assert.equal(pass, everyTestPassed && errors === 0 && !only, line)
                if (pass) assert.ok(!line.includes('reason:'), line)
                if (!pass && failed === 0) assert.ok(line.includes(' reason: '), line)
              }
            }
          }
        }
      }
    }
  })

  it('uses only the listed reasons', () => {
    assert.deepEqual(Object.values(REASONS), [
      '.only is not allowed',
      'the run was interrupted',
      'an error happened outside a test',
      'no tests ran',
      'a test passed only on a retry',
      'skipped or todo tests count as a failure',
      'the runner reported a failure',
      'the verdict reporter failed',
    ])
  })
})

describe('heldVerdict: a held line and the exit code in, the line to print out', () => {
  const PASS = 'QA-VERDICT: PASS (passed 3, failed 0, skipped 0, files 1)'

  it('turns PASS into FAIL with a reason when the exit code is a failure', () => {
    for (const exitCode of [1, 2, 130, '1']) {
      const line = heldVerdict(PASS, exitCode)
      assert.equal(line, 'QA-VERDICT: FAIL (passed 3, failed 0, skipped 0, files 1) reason: the runner reported a failure')
      assert.match(line, LINE)
    }
  })

  it('leaves PASS alone when the exit code is 0, not set, or not a number', () => {
    for (const exitCode of [undefined, null, 0, '0', '', 'x', Number.NaN, 1.5]) {
      assert.equal(heldVerdict(PASS, exitCode), PASS, String(exitCode))
    }
  })

  it('leaves a FAIL line as it is', () => {
    for (const line of [
      'QA-VERDICT: FAIL (passed 2, failed 1, skipped 0, files 1)',
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 2, files 1) reason: skipped or todo tests count as a failure',
    ]) {
      assert.equal(heldVerdict(line, 1), line)
    }
  })
})

describe('countVitestRun: reporter data in, counts out', () => {
  const verdictOf = (...args) => vitestVerdict(countVitestRun(...args))

  it('all pass, with a describe block', () => {
    const testModule = fakeModule({
      children: [fakeSuite('group', [fakeTest('first passes'), fakeTest('second passes')]), fakeTest('third passes')],
    })
    assert.equal(verdictOf([testModule], [], 'passed'), 'QA-VERDICT: PASS (passed 3, failed 0, skipped 0, files 1)')
  })

  it('one failing assertion', () => {
    const testModule = fakeModule({
      state: 'failed',
      children: [fakeTest('accepts'), fakeTest('rejects', 'failed', { errors: ["expected 'a' to be 'b'"] })],
    })
    assert.equal(verdictOf([testModule], [], 'failed'), 'QA-VERDICT: FAIL (passed 1, failed 1, skipped 0, files 1)')
  })

  it('it.skip and it.todo both count as skipped', () => {
    const testModule = fakeModule({ state: 'skipped', children: [fakeTest('is skipped', 'skipped'), fakeTest('todo', 'skipped')] })
    assert.equal(
      verdictOf([testModule], [], 'passed'),
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 2, files 1) reason: skipped or todo tests count as a failure',
    )
  })

  it('a test that never finished counts as skipped', () => {
    const testModule = fakeModule({ children: [fakeTest('passes'), fakeTest('still pending', 'pending')] })
    assert.deepEqual(countVitestRun([testModule]).skipped, 1)
  })

  it('an empty file is "no tests ran", not an error', () => {
    const testModule = fakeModule({ state: 'failed', errors: ['No test suite found in file /app/test/unit/empty.test.ts'] })
    assert.equal(verdictOf([testModule], [], 'failed'), 'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 1) reason: no tests ran')
  })

  it('a missing file gives no modules', () => {
    assert.equal(verdictOf([], [], 'failed'), 'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: no tests ran')
  })

  it('an import error or a syntax error is an error outside a test', () => {
    const importError = fakeModule({ state: 'failed', errors: ["Cannot find module '../lib/nope' imported from /app/test/unit/a.test.ts"] })
    const syntaxError = fakeModule({ state: 'failed', errors: ['Transform failed with 1 error:\n[PARSE_ERROR] Expected `,` or `)` but found `}`'] })
    for (const testModule of [importError, syntaxError]) {
      assert.equal(
        verdictOf([testModule], [], 'failed'),
        'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 1) reason: an error happened outside a test',
      )
    }
  })

  it('a failing beforeAll is an error outside a test', () => {
    const testModule = fakeModule({ state: 'failed', errors: ['setup broke'], children: [fakeTest('never runs', 'skipped')] })
    assert.equal(
      verdictOf([testModule], [], 'failed'),
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 1, files 1) reason: an error happened outside a test',
    )
  })

  it('a failing hook inside a describe block is an error outside a test', () => {
    const testModule = fakeModule({
      state: 'failed',
      children: [fakeSuite('group', [fakeTest('never runs', 'skipped')], { errors: ['hook broke'] })],
    })
    assert.equal(countVitestRun([testModule], [], 'failed').errors, 1)
  })

  it('an unhandled error fails a run in which every test passed', () => {
    const testModule = fakeModule({ children: [fakeTest('passes')] })
    assert.equal(
      verdictOf([testModule], [{ message: 'nobody caught this' }], 'passed'),
      'QA-VERDICT: FAIL (passed 1, failed 0, skipped 0, files 1) reason: an error happened outside a test',
    )
  })

  it('a stray it.only: Vitest fails that test and skips the rest', () => {
    const testModule = fakeModule({
      state: 'failed',
      children: [fakeTest('runs alone', 'failed', { errors: [ONLY_MESSAGE] }), fakeTest('hidden', 'skipped')],
    })
    assert.equal(
      verdictOf([testModule], [], 'failed'),
      'QA-VERDICT: FAIL (passed 0, failed 1, skipped 1, files 1) reason: .only is not allowed',
    )
  })

  it('a stray describe.only: Vitest fails the group and skips every test', () => {
    const testModule = fakeModule({
      state: 'failed',
      children: [fakeSuite('focused group', [fakeTest('runs', 'skipped')], { errors: [ONLY_MESSAGE] }), fakeTest('hidden', 'skipped')],
    })
    assert.equal(
      verdictOf([testModule], [], 'failed'),
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 2, files 1) reason: .only is not allowed',
    )
  })

  it('a test that passed on a retry is flaky, not passed', () => {
    const testModule = fakeModule({ children: [fakeTest('second attempt', 'passed', { flaky: true, errors: ['expected 1 to be 2'] })] })
    assert.equal(
      verdictOf([testModule], [], 'passed'),
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, flaky 1, files 1) reason: a test passed only on a retry',
    )
  })

  it('-t "name" leaves the other tests out of the count', () => {
    const testModule = fakeModule({
      pattern: /second/,
      children: [fakeSuite('group', [fakeTest('first passes', 'skipped'), fakeTest('second passes')]), fakeTest('third passes', 'skipped')],
    })
    assert.equal(verdictOf([testModule], [], 'passed'), 'QA-VERDICT: PASS (passed 1, failed 0, skipped 0, files 1)')
  })

  it('-t "name" still counts a matching it.skip', () => {
    const testModule = fakeModule({
      state: 'skipped',
      pattern: /is skipped/,
      children: [fakeTest('passes', 'skipped'), fakeTest('is skipped', 'skipped')],
    })
    assert.equal(
      verdictOf([testModule], [], 'passed'),
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 1, files 1) reason: skipped or todo tests count as a failure',
    )
  })

  it('-t "name" that matches nothing is "no tests ran"', () => {
    const testModule = fakeModule({ state: 'skipped', pattern: 'zzz', children: [fakeTest('passes', 'skipped')] })
    assert.equal(verdictOf([testModule], [], 'passed'), 'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 1) reason: no tests ran')
  })

  it('file.test.ts:4 leaves the tests on other lines out of the count', () => {
    const testModule = fakeModule({
      children: [
        fakeSuite('group', [fakeTest('first', 'passed', { line: 4 }), fakeTest('second', 'skipped', { line: 8 })], { line: 3 }),
        fakeTest('third', 'skipped', { line: 13 }),
      ],
    })
    const lineFilters = new Map([[testModule, [4]]])
    assert.equal(verdictOf([testModule], [], 'passed', lineFilters), 'QA-VERDICT: PASS (passed 1, failed 0, skipped 0, files 1)')
  })

  it('file.test.ts:3 on a describe line still counts an it.skip inside it', () => {
    const testModule = fakeModule({
      children: [fakeSuite('group', [fakeTest('first', 'passed', { line: 4 }), fakeTest('second', 'skipped', { line: 8 })], { line: 3 })],
    })
    const lineFilters = new Map([[testModule, [3]]])
    assert.equal(countVitestRun([testModule], [], 'passed', lineFilters).skipped, 1)
  })

  it('file.test.ts:99 that names no test is "no tests ran"', () => {
    const testModule = fakeModule({
      state: 'skipped',
      errors: ['No test found in test/unit/a.test.ts in line 99'],
      children: [fakeTest('first', 'skipped', { line: 4 })],
    })
    const lineFilters = new Map([[testModule, [99]]])
    assert.equal(
      verdictOf([testModule], [], 'failed', lineFilters),
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 1) reason: no tests ran',
    )
  })

  it('counts every file of the run', () => {
    const first = fakeModule({ children: [fakeTest('a'), fakeTest('b')] })
    const second = fakeModule({ state: 'failed', children: [fakeTest('c'), fakeTest('d', 'failed')] })
    assert.equal(verdictOf([first, second], [], 'failed'), 'QA-VERDICT: FAIL (passed 3, failed 1, skipped 0, files 2)')
  })

  it('an interrupted run is a FAIL with its own reason', () => {
    const testModule = fakeModule({ children: [fakeTest('a')] })
    assert.equal(
      verdictOf([testModule], [], 'interrupted'),
      'QA-VERDICT: FAIL (passed 1, failed 0, skipped 0, files 1) reason: the run was interrupted',
    )
  })
})

describe('VitestVerdictReporter', () => {
  const passing = () => fakeModule({ children: [fakeTest('passes')] })
  const failing = () => fakeModule({ state: 'failed', children: [fakeTest('fails', 'failed')] })

  // `exitCode` stands in for process.exitCode, which the reporter reads by default.
  function reporterWith(config = {}, exitCode = () => undefined) {
    const lines = []
    const reporter = new VitestVerdictReporter({ write: (line) => lines.push(line), exitCode })
    reporter.onInit({ config })
    return { reporter, lines }
  }

  it('has the hooks Vitest calls', () => {
    for (const hook of ['onInit', 'onTestRunStart', 'onTestRunEnd', 'onFinishedReportCoverage']) {
      assert.equal(typeof VitestVerdictReporter.prototype[hook], 'function', hook)
    }
  })

  it('prints exactly one line when the run ends', () => {
    const { reporter, lines } = reporterWith({ coverage: { enabled: false } })
    reporter.onTestRunStart([])
    reporter.onTestRunEnd([passing()], [], 'passed')
    assert.deepEqual(lines, ['QA-VERDICT: PASS (passed 1, failed 0, skipped 0, files 1)'])
  })

  it('works when Vitest never called onInit or onTestRunStart', () => {
    const lines = []
    const reporter = new VitestVerdictReporter({ write: (line) => lines.push(line) })
    reporter.onTestRunEnd([], [], 'failed')
    assert.deepEqual(lines, ['QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: no tests ran'])
  })

  it('reads the line numbers of the command from the specifications', () => {
    const { reporter, lines } = reporterWith({})
    const testModule = fakeModule({ children: [fakeTest('first', 'passed', { line: 4 }), fakeTest('second', 'skipped', { line: 8 })] })
    reporter.onTestRunStart([{ testModule, testLines: [4] }])
    reporter.onTestRunEnd([testModule], [], 'passed')
    assert.deepEqual(lines, ['QA-VERDICT: PASS (passed 1, failed 0, skipped 0, files 1)'])
  })

  it('with --coverage, holds the line until the coverage table is out', () => {
    const { reporter, lines } = reporterWith({ coverage: { enabled: true, reportOnFailure: false } })
    reporter.onTestRunStart([])
    reporter.onTestRunEnd([passing()], [], 'passed')
    assert.deepEqual(lines, [])
    reporter.onFinishedReportCoverage()
    assert.deepEqual(lines, ['QA-VERDICT: PASS (passed 1, failed 0, skipped 0, files 1)'])
    reporter.onFinishedReportCoverage()
    assert.equal(lines.length, 1)
  })

  it('with --coverage and a failed test, prints at once because Vitest prints no table', () => {
    const { reporter, lines } = reporterWith({ coverage: { enabled: true, reportOnFailure: false } })
    reporter.onTestRunEnd([failing()], [], 'failed')
    assert.deepEqual(lines, ['QA-VERDICT: FAIL (passed 0, failed 1, skipped 0, files 1)'])
  })

  it('with coverage.reportOnFailure, holds the line after a failed test too', () => {
    const { reporter, lines } = reporterWith({ coverage: { enabled: true, reportOnFailure: true } })
    reporter.onTestRunEnd([failing()], [], 'failed')
    assert.deepEqual(lines, [])
    reporter.onFinishedReportCoverage()
    assert.deepEqual(lines, ['QA-VERDICT: FAIL (passed 0, failed 1, skipped 0, files 1)'])
  })

  it('with --coverage, says FAIL when Vitest set a failing exit code after the tests passed', () => {
    // This is what a coverage threshold does: Vitest checks it after onTestRunEnd.
    let exitCode
    const { reporter, lines } = reporterWith({ coverage: { enabled: true } }, () => exitCode)
    reporter.onTestRunStart([])
    reporter.onTestRunEnd([passing()], [], 'passed')
    exitCode = 1
    reporter.onFinishedReportCoverage()
    assert.deepEqual(lines, ['QA-VERDICT: FAIL (passed 1, failed 0, skipped 0, files 1) reason: the runner reported a failure'])
    assert.match(lines[0], LINE)
  })

  it('with --coverage, keeps PASS when the exit code is 0 or not set', () => {
    for (const exitCode of [undefined, null, 0, '0']) {
      const { reporter, lines } = reporterWith({ coverage: { enabled: true } }, () => exitCode)
      reporter.onTestRunStart([])
      reporter.onTestRunEnd([passing()], [], 'passed')
      reporter.onFinishedReportCoverage()
      assert.deepEqual(lines, ['QA-VERDICT: PASS (passed 1, failed 0, skipped 0, files 1)'], String(exitCode))
    }
  })

  it('with --coverage, says FAIL when the held line is printed as the process ends', () => {
    let exitCode
    const { reporter, lines } = reporterWith({ coverage: { enabled: true } }, () => exitCode)
    reporter.onTestRunEnd([passing()], [], 'passed')
    exitCode = 1
    reporter.flush()
    assert.deepEqual(lines, ['QA-VERDICT: FAIL (passed 1, failed 0, skipped 0, files 1) reason: the runner reported a failure'])
  })

  it('keeps PASS for a run that started after the exit code was already failing, as in watch mode', () => {
    const { reporter, lines } = reporterWith({ coverage: { enabled: true } }, () => 1)
    reporter.onTestRunStart([])
    reporter.onTestRunEnd([passing()], [], 'passed')
    reporter.onFinishedReportCoverage()
    assert.deepEqual(lines, ['QA-VERDICT: PASS (passed 1, failed 0, skipped 0, files 1)'])
  })

  it('reads process.exitCode when it is given no other source', () => {
    const lines = []
    const reporter = new VitestVerdictReporter({ write: (line) => lines.push(line) })
    reporter.onInit({ config: { coverage: { enabled: true } } })
    const before = process.exitCode
    try {
      process.exitCode = undefined
      reporter.onTestRunStart([])
      reporter.onTestRunEnd([passing()], [], 'passed')
      process.exitCode = 1
      reporter.onFinishedReportCoverage()
    } finally {
      process.exitCode = before
    }
    assert.deepEqual(lines, ['QA-VERDICT: FAIL (passed 1, failed 0, skipped 0, files 1) reason: the runner reported a failure'])
  })

  it('prints a held line before the next run starts', () => {
    const { reporter, lines } = reporterWith({ coverage: { enabled: true } })
    reporter.onTestRunEnd([passing()], [], 'passed')
    reporter.onTestRunStart([])
    assert.equal(lines.length, 1)
  })

  it('prints a FAIL line when it cannot read the run', () => {
    const { reporter, lines } = reporterWith({ coverage: { enabled: true } })
    const unreadable = {
      state: () => 'passed',
      errors: () => {
        throw new TypeError('testModule.errors is not a function\nsecond line')
      },
    }
    reporter.onTestRunEnd([unreadable], [], 'passed')
    assert.deepEqual(lines, [
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: the verdict reporter failed: testModule.errors is not a function',
    ])
    assert.match(lines[0], LINE)
  })

  it('writes to stdout with one newline by default', (t) => {
    const written = []
    t.mock.method(process.stdout, 'write', (chunk) => {
      written.push(chunk)
      return true
    })
    const reporter = new VitestVerdictReporter()
    reporter.onTestRunEnd([passing()], [], 'passed')
    t.mock.restoreAll()
    assert.deepEqual(written, ['QA-VERDICT: PASS (passed 1, failed 0, skipped 0, files 1)\n'])
  })
})
