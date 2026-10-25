// Tests for jest-verdict.mjs and jest.config.cjs. Run: node --test ".cursor/qa/*.test.mjs"
// The fake results below have the shapes Jest 30.5 passes to a reporter's onRunComplete.
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import JestVerdictReporter, { MARK, REASONS, countJestRun, jestVerdict } from './jest-verdict.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const LINE = /^QA-VERDICT: (PASS|FAIL) \(passed \d+, failed \d+, skipped \d+(, flaky \d+)?, files \d+\)( reason: \S.*)?$/

function fakeTest(title, status = 'passed', extra = {}) {
  return { title, fullName: title, status, invocations: extra.invocations ?? 1, retryReasons: extra.retryReasons ?? [] }
}

function fakeFile(tests = [], extra = {}) {
  return { testFilePath: extra.path ?? '/app/test/unit/a.test.ts', testExecError: extra.error, testResults: tests }
}

function fakeRun(files = [], extra = {}) {
  return {
    testResults: files,
    wasInterrupted: extra.interrupted ?? false,
    runExecError: extra.runExecError,
    snapshot: { added: extra.added ?? 0, updated: extra.updated ?? 0 },
  }
}

describe('jestVerdict: counts in, line out', () => {
  const cases = [
    ['all pass', { passed: 3, files: 1 }, 'QA-VERDICT: PASS (passed 3, failed 0, skipped 0, files 1)'],
    ['one failing assertion', { passed: 2, failed: 1, files: 1 }, 'QA-VERDICT: FAIL (passed 2, failed 1, skipped 0, files 1)'],
    [
      'a skipped test next to a passing one',
      { passed: 1, skipped: 2, files: 1 },
      `QA-VERDICT: FAIL (passed 1, failed 0, skipped 2, files 1) reason: ${REASONS.skipped}`,
    ],
    ['no tests', { files: 0 }, `QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: ${REASONS.noTests}`],
    [
      'a file that could not run',
      { files: 1, errors: 1 },
      `QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 1) reason: ${REASONS.error}`,
    ],
    [
      'a test that passed on a retry',
      { passed: 2, flaky: 1, files: 1 },
      `QA-VERDICT: FAIL (passed 2, failed 0, skipped 0, flaky 1, files 1) reason: ${REASONS.flaky}`,
    ],
    [
      'an interrupted run',
      { passed: 1, files: 1, interrupted: true },
      `QA-VERDICT: FAIL (passed 1, failed 0, skipped 0, files 1) reason: ${REASONS.interrupted}`,
    ],
    [
      'a written snapshot',
      { passed: 1, files: 1, snapshots: 1 },
      `QA-VERDICT: FAIL (passed 1, failed 0, skipped 0, files 1) reason: ${REASONS.snapshot}`,
    ],
  ]
  for (const [name, input, expected] of cases) {
    it(name, () => assert.equal(jestVerdict(input), expected))
  }

  it('gives no reason when a failed test explains the FAIL', () => {
    assert.equal(jestVerdict({ failed: 1, skipped: 1, errors: 1, files: 2 }), 'QA-VERDICT: FAIL (passed 0, failed 1, skipped 1, files 2)')
  })

  it('treats a count that is not a positive whole number as 0', () => {
    const line = jestVerdict({ passed: -1, failed: 1.5, skipped: '2', files: Number.NaN })
    assert.ok(line.startsWith('QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0)'))
  })

  it('keeps one format for every combination of counts', () => {
    for (const passed of [0, 1]) {
      for (const failed of [0, 1]) {
        for (const skipped of [0, 1]) {
          for (const flaky of [0, 1]) {
            for (const errors of [0, 1]) {
              assert.match(jestVerdict({ passed, failed, skipped, flaky, errors, files: 1 }), LINE)
            }
          }
        }
      }
    }
  })
})

describe('countJestRun: reporter data in, counts out', () => {
  it('all pass, in two files', () => {
    const run = fakeRun([fakeFile([fakeTest('a'), fakeTest('b')]), fakeFile([fakeTest('c')], { path: '/app/test/unit/b.test.ts' })])
    assert.equal(jestVerdict(countJestRun(run)), 'QA-VERDICT: PASS (passed 3, failed 0, skipped 0, files 2)')
  })

  it('a failed test', () => {
    const run = fakeRun([fakeFile([fakeTest('a'), fakeTest('b', 'failed')])])
    assert.equal(jestVerdict(countJestRun(run)), 'QA-VERDICT: FAIL (passed 1, failed 1, skipped 0, files 1)')
  })

  it('test.skip, xit, and test.todo count as skipped, though Jest exits with 0', () => {
    const run = fakeRun([fakeFile([fakeTest('a'), fakeTest('b', 'pending'), fakeTest('c', 'todo'), fakeTest('d', 'pending')])])
    assert.deepEqual(countJestRun(run), { passed: 1, failed: 0, skipped: 3, flaky: 0, files: 1, errors: 0, snapshots: 0, interrupted: false })
  })

  it('a stray test.only: Jest skips the other tests of that file', () => {
    const run = fakeRun([fakeFile([fakeTest('a'), fakeTest('b', 'pending')])])
    assert.match(jestVerdict(countJestRun(run)), new RegExp(`reason: ${REASONS.skipped}$`))
  })

  it('a test that passed on its second invocation is flaky, not passed', () => {
    const run = fakeRun([fakeFile([fakeTest('a', 'passed', { invocations: 2 })])])
    assert.equal(jestVerdict(countJestRun(run)), `QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, flaky 1, files 1) reason: ${REASONS.flaky}`)
  })

  it('a test with retry reasons is flaky too', () => {
    const run = fakeRun([fakeFile([fakeTest('a', 'passed', { retryReasons: ['expected 2, got 1'] })])])
    assert.equal(countJestRun(run).flaky, 1)
  })

  it('an import error, a syntax error, or a file with no test is an error outside a test', () => {
    for (const message of ['Cannot find module', 'SyntaxError: Unexpected token', 'Your test suite must contain at least one test.']) {
      const run = fakeRun([fakeFile([], { error: { message } })])
      assert.equal(jestVerdict(countJestRun(run)), `QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 1) reason: ${REASONS.error}`)
    }
  })

  it('a failing afterAll fails a file whose tests all passed', () => {
    const run = fakeRun([fakeFile([fakeTest('a')], { error: { message: 'afterAll failed' } })])
    assert.match(jestVerdict(countJestRun(run)), new RegExp(`reason: ${REASONS.error}$`))
  })

  it('an error of the run itself counts as an error', () => {
    const run = fakeRun([fakeFile([fakeTest('a')])], { runExecError: { message: 'globalSetup failed' } })
    assert.match(jestVerdict(countJestRun(run)), new RegExp(`reason: ${REASONS.error}$`))
  })

  it('a snapshot that was added or updated', () => {
    assert.equal(countJestRun(fakeRun([fakeFile([fakeTest('a')])], { added: 1, updated: 2 })).snapshots, 3)
  })

  it('an interrupted run', () => {
    assert.equal(countJestRun(fakeRun([], { interrupted: true })).interrupted, true)
  })

  it('no results at all', () => {
    assert.equal(jestVerdict(countJestRun({})), `QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: ${REASONS.noTests}`)
  })
})

describe('JestVerdictReporter', () => {
  function reporter() {
    const lines = []
    const exits = []
    const instance = new JestVerdictReporter({}, { write: (line) => lines.push(line), atExit: (print) => exits.push(print) })
    return { instance, lines, exits }
  }

  it('has the methods Jest calls', () => {
    const { instance } = reporter()
    assert.equal(typeof instance.onRunComplete, 'function')
    assert.equal(instance.getLastError(), undefined)
  })

  it('holds the line until the process exits, then prints exactly one', () => {
    const { instance, lines, exits } = reporter()
    instance.onRunComplete(new Set(), fakeRun([fakeFile([fakeTest('a')])]))
    assert.deepEqual(lines, [])
    assert.equal(exits.length, 1)
    exits[0]()
    assert.deepEqual(lines, ['QA-VERDICT: PASS (passed 1, failed 0, skipped 0, files 1)'])
  })

  it('marks globalThis, so jest.config.cjs prints no line of its own', () => {
    delete globalThis[MARK]
    reporter().instance.onRunComplete(new Set(), fakeRun([]))
    assert.equal(globalThis[MARK], true)
    delete globalThis[MARK]
  })

  it('prints a FAIL line when it cannot read the run', () => {
    const { instance, lines, exits } = reporter()
    instance.onRunComplete(new Set(), { testResults: [null] })
    exits[0]()
    assert.match(lines[0], new RegExp(`^QA-VERDICT: FAIL \\(passed 0, failed 0, skipped 0, files 0\\) reason: ${REASONS.broken}: `))
  })

  it('takes options that are not an object as no options', () => {
    assert.equal(typeof new JestVerdictReporter({}, undefined).write, 'function')
    assert.equal(typeof new JestVerdictReporter({}, 'x').atExit, 'function')
  })
})

describe('jest.config.cjs', () => {
  // Builds <project>/.cursor/qa/ with the two kit files and the given files at the project root.
  function project(files = {}) {
    const root = mkdtempSync(join(tmpdir(), 'qa-jest-config-'))
    mkdirSync(join(root, '.cursor', 'qa'), { recursive: true })
    for (const name of ['jest.config.cjs', 'jest-verdict.mjs']) copyFileSync(join(HERE, name), join(root, '.cursor', 'qa', name))
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, name)), { recursive: true })
      writeFileSync(join(root, name), text)
    }
    return root
  }

  function load(root) {
    const require = createRequire(join(root, 'index.js'))
    return require(join(root, '.cursor', 'qa', 'jest.config.cjs'))()
  }

  it('keeps the preset and options from "jest" in package.json, and sets the tests and reporter of the kit', async (t) => {
    const root = project({
      'package.json': JSON.stringify({
        jest: { preset: 'jest-expo', testRegex: 'x', testResultsProcessor: 'y', collectCoverage: true, transformIgnorePatterns: ['z'] },
      }),
    })
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const config = await load(root)
    assert.equal(config.preset, 'jest-expo')
    assert.deepEqual(config.transformIgnorePatterns, ['z'])
    assert.equal(config.rootDir, root)
    assert.deepEqual(config.roots, [root])
    assert.deepEqual(config.testMatch, [`${root}/test/unit/**/*.test.ts`, `${root}/test/integration/**/*.test.ts`])
    assert.deepEqual(config.reporters, ['default', join(root, '.cursor', 'qa', 'jest-verdict.mjs')])
    assert.equal(config.passWithNoTests, false)
    assert.equal(config.collectCoverage, false)
    assert.equal('ci' in config, false, 'Jest 30.5 ignores ci in a config file, so the command passes --ci')
    assert.equal('testRegex' in config, false)
    assert.equal('testResultsProcessor' in config, false)
  })

  it('reads jest.config.js, also when it exports a function, and adds test/jest.setup.ts last', async (t) => {
    const root = project({
      'package.json': '{}',
      'jest.config.js': "module.exports = async () => ({ preset: 'react-native', setupFilesAfterEnv: ['./own-setup.js'] })\n",
      'test/jest.setup.ts': '\n',
    })
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const config = await load(root)
    assert.equal(config.preset, 'react-native')
    assert.deepEqual(config.setupFilesAfterEnv, ['./own-setup.js', join(root, 'test', 'jest.setup.ts')])
  })

  it('works for an app with no Jest config at all', async (t) => {
    const root = project({ 'package.json': '{}' })
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const config = await load(root)
    assert.equal(config.preset, undefined)
    assert.deepEqual(config.setupFilesAfterEnv, [])
  })

  it('stops with a message for a config in TypeScript, and for projects', async (t) => {
    const typescript = project({ 'package.json': '{}', 'jest.config.ts': 'export default {}\n' })
    const projects = project({ 'package.json': JSON.stringify({ jest: { projects: ['a', 'b'] } }) })
    t.after(() => {
      rmSync(typescript, { recursive: true, force: true })
      rmSync(projects, { recursive: true, force: true })
    })
    await assert.rejects(load(typescript), /QA kit, \.cursor\/qa\/jest\.config\.cjs: the app's Jest config is jest\.config\.ts/)
    await assert.rejects(load(projects), /has `projects`/)
  })
})
