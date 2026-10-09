// Tests for playwright-verdict.mjs. Run: node --test ".cursor/qa/*.test.mjs"
// The fake tests below have the shapes Playwright 1.64 passes to a reporter.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import PlaywrightVerdictReporter, { REASONS, countPlaywrightRun, playwrightVerdict } from './playwright-verdict.mjs'
import { REASONS as VITEST_REASONS, vitestVerdict } from './vitest-verdict.mjs'

const LINE =
  /^QA-VERDICT: (PASS|FAIL|PASS-WITH-FIXME) \(passed \d+, failed \d+, skipped \d+(, flaky \d+)?(, fixme \d+)?, files \d+\)( reason: \S.*)?$/
const ONLY_MESSAGE =
  'Error: item focused with \'.only\' is not allowed due to the \'forbidOnly\' option in \'../../playwright.config.ts\': "a.spec.ts home page loads"'
const NO_TESTS_MESSAGE =
  'Error: No tests found.\nMake sure that arguments are regular expressions matching test files.\nYou may need to escape symbols like "$" or "*" and quote the arguments.'

function fakeTest(outcome, extra = {}) {
  return {
    outcome: () => outcome,
    annotations: (extra.annotations ?? []).map((type) => ({ type })),
    location: { file: extra.file ?? '/app/test/e2e/a.spec.ts', line: 4, column: 5 },
    results: (extra.statuses ?? [outcome === 'skipped' ? 'skipped' : 'passed']).map((status) => ({ status })),
  }
}

describe('playwrightVerdict: counts in, line out', () => {
  const cases = [
    ['all pass', { passed: 3, files: 1 }, 'QA-VERDICT: PASS (passed 3, failed 0, skipped 0, files 1)'],
    ['one failing assertion', { passed: 2, failed: 1, files: 1, status: 'failed' }, 'QA-VERDICT: FAIL (passed 2, failed 1, skipped 0, files 1)'],
    [
      'every test is test.skip()',
      { skipped: 2, files: 1 },
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 2, files 1) reason: skipped or todo tests count as a failure',
    ],
    [
      'one test.skip() next to a pass',
      { passed: 1, skipped: 1, files: 1 },
      'QA-VERDICT: FAIL (passed 1, failed 0, skipped 1, files 1) reason: skipped or todo tests count as a failure',
    ],
    ['one test.fixme() next to passes', { passed: 5, fixme: 1, files: 1 }, 'QA-VERDICT: PASS-WITH-FIXME (passed 5, failed 0, skipped 0, fixme 1, files 1)'],
    ['only a test.fixme()', { fixme: 1, files: 1 }, 'QA-VERDICT: PASS-WITH-FIXME (passed 0, failed 0, skipped 0, fixme 1, files 1)'],
    [
      'a test.fixme() next to a test.skip()',
      { passed: 1, skipped: 1, fixme: 1, files: 1 },
      'QA-VERDICT: FAIL (passed 1, failed 0, skipped 1, fixme 1, files 1) reason: skipped or todo tests count as a failure',
    ],
    ['a test.fixme() next to a failure', { failed: 1, fixme: 1, files: 1, status: 'failed' }, 'QA-VERDICT: FAIL (passed 0, failed 1, skipped 0, fixme 1, files 1)'],
    [
      'an empty or missing file',
      { files: 0, status: 'failed' },
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: no tests ran',
    ],
    [
      'no tests with --pass-with-no-tests',
      { files: 0, status: 'passed' },
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: no tests ran',
    ],
    [
      'an import error',
      { files: 0, errors: 1, status: 'failed' },
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: an error happened outside a test',
    ],
    [
      'a stray test.only',
      { files: 0, only: true, status: 'failed' },
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: .only is not allowed',
    ],
    [
      'a flaky test',
      { flaky: 1, files: 1 },
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, flaky 1, files 1) reason: a test passed only on a retry',
    ],
    ['--repeat-each=3 on two passing tests', { passed: 6, files: 1 }, 'QA-VERDICT: PASS (passed 6, failed 0, skipped 0, files 1)'],
    [
      '--repeat-each=3 on one passing and one failing test',
      { passed: 3, failed: 3, files: 1, status: 'failed' },
      'QA-VERDICT: FAIL (passed 3, failed 3, skipped 0, files 1)',
    ],
    [
      'an interrupted run',
      { passed: 1, files: 1, status: 'interrupted' },
      'QA-VERDICT: FAIL (passed 1, failed 0, skipped 0, files 1) reason: the run was interrupted',
    ],
    ['a global timeout', { files: 0, status: 'timedout' }, 'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: the run timed out'],
    [
      'a run Playwright reports as failed with nothing else wrong',
      { passed: 1, files: 1, status: 'failed' },
      'QA-VERDICT: FAIL (passed 1, failed 0, skipped 0, files 1) reason: the runner reported a failure',
    ],
    ['no input at all', undefined, 'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: no tests ran'],
  ]
  for (const [name, counts, expected] of cases) {
    it(name, () => {
      assert.equal(playwrightVerdict(counts), expected)
    })
  }

  it('gives no reason when a failed test explains the FAIL', () => {
    const line = playwrightVerdict({ passed: 1, failed: 1, skipped: 1, flaky: 1, fixme: 1, files: 2, errors: 1, status: 'interrupted' })
    assert.equal(line, 'QA-VERDICT: FAIL (passed 1, failed 1, skipped 1, flaky 1, fixme 1, files 2)')
  })

  it('names the more serious cause first', () => {
    assert.match(playwrightVerdict({ skipped: 1, files: 1, errors: 1 }), /reason: an error happened outside a test$/)
    assert.match(playwrightVerdict({ skipped: 1, flaky: 1, files: 1 }), /reason: a test passed only on a retry$/)
    assert.match(playwrightVerdict({ fixme: 1, flaky: 1, files: 1 }), /^QA-VERDICT: FAIL .* reason: a test passed only on a retry$/)
  })

  it('treats a count that is not a positive whole number as 0', () => {
    assert.equal(
      playwrightVerdict({ passed: 2, failed: -1, skipped: 'x', fixme: undefined, flaky: 0.5, files: null }),
      'QA-VERDICT: PASS (passed 2, failed 0, skipped 0, files 0)',
    )
  })

  it('keeps one format for every combination of counts', () => {
    const values = [0, 1, 4]
    for (const passed of values) {
      for (const failed of values) {
        for (const skipped of values) {
          for (const fixme of values) {
            for (const flaky of [0, 2]) {
              for (const status of ['passed', 'failed']) {
                const line = playwrightVerdict({ passed, failed, skipped, fixme, flaky, status, files: 1 })
                assert.match(line, LINE)
                assert.ok(!line.includes('\n'))
                const word = line.slice('QA-VERDICT: '.length, line.indexOf(' ('))
                const clean = failed === 0 && skipped === 0 && flaky === 0 && status === 'passed' && passed + fixme > 0
                if (clean) assert.equal(word, fixme > 0 ? 'PASS-WITH-FIXME' : 'PASS', line)
                else assert.equal(word, 'FAIL', line)
                if (word !== 'FAIL') assert.ok(!line.includes('reason:'), line)
                if (word === 'FAIL' && failed === 0) assert.ok(line.includes(' reason: '), line)
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
      'the run timed out',
      'an error happened outside a test',
      'no tests ran',
      'a test passed only on a retry',
      'skipped or todo tests count as a failure',
      'the runner reported a failure',
      'the verdict reporter failed',
    ])
  })
})

describe('both reporters word the same fact the same way', () => {
  it('prints the same line for the same counts', () => {
    const shared = [
      { passed: 3, files: 1 },
      { passed: 2, failed: 1, files: 1 },
      { skipped: 2, files: 1 },
      { files: 0 },
      { flaky: 1, files: 1 },
      { passed: 1, files: 1, errors: 1 },
      { skipped: 1, files: 1, only: true },
    ]
    for (const counts of shared) assert.equal(playwrightVerdict(counts), vitestVerdict(counts))
  })

  it('shares every reason Vitest has', () => {
    for (const [key, reason] of Object.entries(VITEST_REASONS)) assert.equal(REASONS[key], reason, key)
  })
})

describe('countPlaywrightRun: reporter data in, counts out', () => {
  const verdictOf = (...args) => playwrightVerdict(countPlaywrightRun(...args))

  it('all pass', () => {
    assert.equal(verdictOf([fakeTest('expected'), fakeTest('expected')], [], 'passed'), 'QA-VERDICT: PASS (passed 2, failed 0, skipped 0, files 1)')
  })

  it('one failing assertion', () => {
    const tests = [fakeTest('unexpected', { statuses: ['failed'] }), fakeTest('expected')]
    assert.equal(verdictOf(tests, [], 'failed'), 'QA-VERDICT: FAIL (passed 1, failed 1, skipped 0, files 1)')
  })

  it('test.skip() is FAIL', () => {
    assert.equal(
      verdictOf([fakeTest('skipped', { annotations: ['skip'] })], [], 'passed'),
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 1, files 1) reason: skipped or todo tests count as a failure',
    )
  })

  it('test.fixme() next to a passing test is PASS-WITH-FIXME', () => {
    assert.equal(
      verdictOf([fakeTest('skipped', { annotations: ['fixme'] }), fakeTest('expected')], [], 'passed'),
      'QA-VERDICT: PASS-WITH-FIXME (passed 1, failed 0, skipped 0, fixme 1, files 1)',
    )
  })

  it('a test.fixme() inside a skipped group counts as skipped', () => {
    assert.equal(countPlaywrightRun([fakeTest('skipped', { annotations: ['skip', 'fixme'] })]).skipped, 1)
  })

  it('a test skipped with no annotation counts as skipped', () => {
    const counts = countPlaywrightRun([fakeTest('unexpected', { statuses: ['failed'] }), fakeTest('skipped')], [], 'failed')
    assert.deepEqual([counts.failed, counts.skipped, counts.fixme], [1, 1, 0])
  })

  it('a flaky test is FAIL', () => {
    assert.equal(
      verdictOf([fakeTest('flaky', { statuses: ['failed', 'passed'] })], [], 'passed'),
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, flaky 1, files 1) reason: a test passed only on a retry',
    )
  })

  it('an empty or missing file reaches the reporter as a "No tests found" error', () => {
    assert.equal(
      verdictOf([], [{ message: NO_TESTS_MESSAGE }], 'failed'),
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: no tests ran',
    )
    assert.equal(
      verdictOf([], [{ message: 'Error: No tests found' }], 'failed'),
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: no tests ran',
    )
  })

  it('an import error comes with a "No tests found" error and wins over it', () => {
    const errors = [{ message: "Error: Cannot find module './pages/does-not-exist'" }, { message: NO_TESTS_MESSAGE }]
    assert.equal(
      verdictOf([], errors, 'failed'),
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: an error happened outside a test',
    )
  })

  it('a stray test.only is FAIL', () => {
    assert.equal(
      verdictOf([], [{ message: ONLY_MESSAGE }], 'failed'),
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: .only is not allowed',
    )
  })

  it('counts every repeat and every file', () => {
    const tests = []
    for (let repeat = 0; repeat < 3; repeat += 1) {
      tests.push(fakeTest('expected', { file: '/app/test/e2e/a.spec.ts' }))
      tests.push(fakeTest('unexpected', { file: '/app/test/e2e/b.spec.ts', statuses: ['failed'] }))
    }
    assert.equal(verdictOf(tests, [], 'failed'), 'QA-VERDICT: FAIL (passed 3, failed 3, skipped 0, files 2)')
  })

  it('a test cut short by Ctrl+C is not counted as skipped', () => {
    assert.equal(
      verdictOf([fakeTest('skipped', { statuses: ['interrupted'] })], [], 'interrupted'),
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 1) reason: the run was interrupted',
    )
  })

  it('a global timeout with no finished test', () => {
    assert.equal(verdictOf([], [], 'timedout'), 'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: the run timed out')
  })
})

describe('PlaywrightVerdictReporter', () => {
  function reporterWith(options = {}) {
    const lines = []
    const reporter = new PlaywrightVerdictReporter({ write: (line) => lines.push(line), ...options })
    return { reporter, lines }
  }

  it('has the hooks Playwright calls', () => {
    for (const hook of ['onTestEnd', 'onError', 'onEnd', 'onExit', 'printsToStdio']) {
      assert.equal(typeof PlaywrightVerdictReporter.prototype[hook], 'function', hook)
    }
  })

  it('leaves the terminal to the list reporter', () => {
    assert.equal(new PlaywrightVerdictReporter().printsToStdio(), false)
  })

  it('prints exactly one line, at exit and not before', () => {
    const { reporter, lines } = reporterWith({ _mode: 'test' })
    reporter.onTestEnd(fakeTest('expected'))
    reporter.onEnd({ status: 'passed' })
    assert.deepEqual(lines, [])
    reporter.onExit()
    assert.deepEqual(lines, ['QA-VERDICT: PASS (passed 1, failed 0, skipped 0, files 1)'])
  })

  it('counts a retried test once', () => {
    const { reporter, lines } = reporterWith({ _mode: 'test' })
    const flaky = fakeTest('flaky', { statuses: ['failed', 'passed'] })
    reporter.onTestEnd(flaky)
    reporter.onTestEnd(flaky)
    reporter.onEnd({ status: 'passed' })
    reporter.onExit()
    assert.deepEqual(lines, ['QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, flaky 1, files 1) reason: a test passed only on a retry'])
  })

  it('reports the errors Playwright sends outside a test', () => {
    const { reporter, lines } = reporterWith({ _mode: 'test' })
    reporter.onError({ message: ONLY_MESSAGE })
    reporter.onEnd({ status: 'failed' })
    reporter.onExit()
    assert.deepEqual(lines, ['QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: .only is not allowed'])
  })

  it('prints a FAIL line when it cannot read the run', () => {
    const { reporter, lines } = reporterWith({ _mode: 'test' })
    reporter.onTestEnd({ location: { file: '/app/test/e2e/a.spec.ts' } })
    reporter.onEnd({ status: 'passed' })
    reporter.onExit()
    assert.deepEqual(lines, [
      'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: the verdict reporter failed: test.outcome is not a function',
    ])
    assert.match(lines[0], LINE)
  })

  it('prints nothing for a --list run', () => {
    const { reporter, lines } = reporterWith({ _mode: 'list' })
    reporter.onEnd({ status: 'passed' })
    reporter.onExit()
    assert.deepEqual(lines, [])
  })

  it('falls back to the --list argument when Playwright passes no mode', (t) => {
    t.mock.property(process, 'argv', ['node', 'playwright', 'test', '--list'])
    const { reporter, lines } = reporterWith()
    reporter.onEnd({ status: 'passed' })
    reporter.onExit()
    assert.deepEqual(lines, [])
  })

  it('writes to stdout with one newline by default', (t) => {
    const written = []
    t.mock.method(process.stdout, 'write', (chunk) => {
      written.push(chunk)
      return true
    })
    const reporter = new PlaywrightVerdictReporter({ _mode: 'test' })
    reporter.onTestEnd(fakeTest('expected'))
    reporter.onEnd({ status: 'passed' })
    reporter.onExit()
    t.mock.restoreAll()
    assert.deepEqual(written, ['QA-VERDICT: PASS (passed 1, failed 0, skipped 0, files 1)\n'])
  })
})
