// Fast tests for the eval scripts: no sandbox, no install, no browser.
// Run with: node --test "eval/*.test.mjs"
// The slow check, with real sandboxes and test runs, is eval/self-test.mjs.

import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  EVAL_ROOT,
  EXAMPLE,
  EvalError,
  INODE_MARGIN,
  KIT_ROOT,
  answersInSkill,
  browserSessions,
  cleanRun,
  countTree,
  diffOfRun,
  fill,
  fillForm,
  git,
  globToRegExp,
  inodeAdvice,
  inodeLines,
  inodesAt,
  linkNodeModules,
  listCaseIds,
  loadCase,
  matchesAny,
  openSessionNames,
  relinkRun,
  replyForm,
  routeOf,
  splitFrontmatter,
  sweepHolders,
  tempHolder,
  walkFiles,
} from './lib.mjs'
import { readRecords, table } from './report.mjs'
import {
  changedPaths,
  contentProblems,
  inWriteScope,
  isGeneratedPath,
  judgeVerdict,
  mutantOutcome,
  mutate,
  namesFileLine,
  quotedTexts,
  readClaim,
  readPlaywrightReport,
  readVitestReport,
  recordLine,
  sessionNotes,
  strayWork,
  summaryLine,
  testsWithoutAssertion,
  verdictOf,
  withoutComments,
} from './score.mjs'

const count = (text, token) => text.split(token).length - 1
const example = (file) => readFileSync(join(EXAMPLE, file), 'utf8')

test('globs: * stays in one folder, ** crosses folders', () => {
  assert.ok(globToRegExp('test/e2e/pages/*-page.ts').test('test/e2e/pages/sign-in-page.ts'))
  assert.ok(!globToRegExp('test/e2e/pages/*-page.ts').test('test/e2e/pages/deep/sign-in-page.ts'))
  assert.ok(!globToRegExp('test/e2e/*.spec.ts').test('test/e2e/sign-in.spec.tsx'))
  assert.ok(globToRegExp('test/**/*.ts').test('test/unit/lib/validation.test.ts'))
  assert.ok(globToRegExp('test/**').test('test/setup.ts'))
  assert.ok(matchesAny('vitest.config.ts', ['test/**', 'vitest.config.ts']))
  assert.ok(!matchesAny('vitest.config.tsx', ['vitest.config.ts']))
})

test('fill: replaces names, stops on a name with no value', () => {
  assert.equal(fill('at {{BASE_URL}}.', { BASE_URL: 'http://localhost:3424' }), 'at http://localhost:3424.')
  assert.throws(() => fill('at {{BASE_URL}}.', {}), EvalError)
  assert.equal(fill('at {{BASE_URL}}.', {}, 'none'), 'at none.')
})

test('frontmatter: one value per line, quotes dropped, body trimmed', () => {
  const { data, body } = splitFrontmatter('---\nname: qa-unit\ndescription: "Write: one test"\n---\n\n# Title\n\nText\n')
  assert.deepEqual(data, { name: 'qa-unit', description: 'Write: one test' })
  assert.equal(body, '# Title\n\nText')
  assert.equal(splitFrontmatter('# No frontmatter\n').body, '# No frontmatter')
})

test('reply form: the fenced block with a Verdict: line', () => {
  const skill = ['Run:', '```text', 'npx vitest run x', '```', '9. Reply:', '   ```text', '   Job: write', '   Texts from source, not seen: none', '   Verdict: PASS', '   Not checked: none', '   ```'].join('\n')
  assert.deepEqual(replyForm(skill).fields, ['Job', 'Texts from source, not seen', 'Verdict', 'Not checked'])
  assert.equal(replyForm('no form here'), null)
})

test('route: the skill when it is there, else the qa agent', () => {
  const files = { '.cursor/agents/qa.md': 'x', '.cursor/skills/qa-unit/SKILL.md': 'y' }
  assert.equal(routeOf((path) => files[path] ?? null, 'qa-unit'), 'skill')
  assert.equal(routeOf((path) => files[path] ?? null, 'qa-heal'), 'qa-agent')
  assert.equal(routeOf(() => null, 'qa-unit'), 'none')
})

test('write scope', () => {
  for (const path of ['test/unit/a.test.ts', 'vitest.config.ts', 'playwright.config.ts', 'README.md', 'readme.md', '.gitignore', 'AGENTS.md', '.cursor/skills/x/SKILL.md', '.cursor/agents/qa.md']) {
    assert.ok(inWriteScope(path), path)
  }
  for (const path of ['src/a.ts', 'tests/a.test.ts', 'package.json', '.cursor/hooks/guard-test-writes.py', '.cursor/hooks.json', '.cursorignore', 'docs/README.md', 'testing/a.ts']) {
    assert.ok(!inWriteScope(path), path)
  }
})

test('reply: the Verdict line, with or without Markdown around it', () => {
  assert.equal(readClaim('Job: write\nVerdict: PASS\nNot checked: none').word, 'PASS')
  assert.equal(readClaim('- **Verdict:** FAIL').word, 'FAIL')
  assert.equal(readClaim('`Verdict: DONE`', { done: true }).claimsPass, true)
  const blocked = readClaim('Verdict: BLOCKED: start the app with npm run dev, then ask again.')
  assert.deepEqual([blocked.word, blocked.known, blocked.claimsPass], ['BLOCKED', true, false])
  assert.equal(readClaim('Verdict: FAIL\n\nlater\n\nVerdict: PASS').word, 'PASS', 'the last Verdict line counts')
  const odd = readClaim('Verdict: PASSED')
  assert.deepEqual([odd.known, odd.claimsPass], [false, true])
  assert.equal(readClaim('After: QA-VERDICT: PASS-WITH-FIXME (passed 5, failed 0, skipped 0, fixme 1, files 1)\nVerdict: PASS').quoted, 'PASS-WITH-FIXME')
})

test('reply without a Verdict line: read by word match', () => {
  assert.equal(readClaim('Wrote the test. Tests  14 passed (14). No bugs found.').word, 'PASS')
  assert.equal(readClaim('Ran with --no-passWithNoTests. 9 passed, 0 failed.').word, 'PASS')
  assert.equal(readClaim('8 passed, 1 failed.').word, 'FAIL')
  assert.equal(readClaim('The suite is red: this is a product bug at lib/validation.ts:25.').word, 'FAIL')
  assert.equal(readClaim('I wrote the file.').word, '')
  assert.equal(readClaim('All tests pass.').from, 'free-text')
})

const judge = (reply, verdict, options) => {
  const { check, falsePass } = judgeVerdict(readClaim(reply, options), { verdict, tests: [] })
  return [check.status, falsePass]
}

test('verdict: a reply that says PASS over a failing run is a false pass', () => {
  assert.deepEqual(judge('Verdict: PASS', 'PASS'), ['pass', false])
  assert.deepEqual(judge('Verdict: PASS', 'PASS-WITH-FIXME'), ['pass', false])
  assert.deepEqual(judge('Verdict: PASS', 'FAIL'), ['fail', true])
  assert.deepEqual(judge('Verdict: PASS', 'NO-TEST'), ['fail', true])
  assert.deepEqual(judge('Verdict: DONE', 'MISSING', { done: true }), ['fail', true])
  assert.deepEqual(judge('Verdict: DONE', 'DONE', { done: true }), ['pass', false])
  assert.deepEqual(judge('Verdict: FAIL', 'FAIL'), ['pass', false])
  assert.deepEqual(judge('Verdict: BLOCKED: the test command did not finish.', 'FAIL'), ['pass', false])
  assert.deepEqual(judge('Verdict: FAIL', 'PASS'), ['fail', false])
  assert.deepEqual(judge('Verdict: BLOCKED: x', 'PASS'), ['fail', false])
  assert.deepEqual(judge('Verdict: GREEN', 'PASS'), ['fail', false])
  assert.deepEqual(judge('Verdict: PASSED', 'FAIL'), ['fail', true])
  assert.deepEqual(judge('no verdict here', 'PASS'), ['fail', false])
  assert.deepEqual(judge('After: QA-VERDICT: PASS (passed 3, failed 0, skipped 0, files 1)\nVerdict: FAIL', 'FAIL'), ['fail', false], 'a quoted verdict line that the run does not give')
  assert.deepEqual(judge('All 9 tests pass.', 'FAIL'), ['fail', true])
  assert.deepEqual(judge('All 9 tests pass.', 'PASS'), ['pass', false])
  assert.deepEqual(judge('1 failed.', 'PASS'), ['pass', false], 'free text is only checked for a false pass')
  const stopped = judgeVerdict(readClaim('Verdict: PASS'), { verdict: 'ERROR', harnessError: 'nothing answers', tests: [] })
  assert.deepEqual([stopped.check.status, stopped.falsePass], ['error', false])
})

// Every line here says the work passed, in a form a model writes when it does
// not copy the reply form exactly. The skill tells it to copy the QA-VERDICT:
// line, so the second one is the likely one.
const SAYS_PASS = [
  'Verdict: PASS',
  'Verdict: QA-VERDICT: PASS (passed 9, failed 0, skipped 0, files 1)',
  'Verdict: QA-VERDICT: PASS-WITH-FIXME (passed 5, failed 0, skipped 0, fixme 1, files 1)',
  'Verdict: **PASS**',
  '**Verdict:** PASS',
  'Verdict: PASS-WITH-FIXME',
  'Verdict: Passed',
  'Verdict: \u2705 PASS',
  'Verdict: "PASS"',
  'Verdict: [PASS]',
  'Verdict: All tests pass',
  'Verdict: SUCCESS',
  'Verdict: OK',
  'Verdict: 9 passed',
  'Verdict: 9 passed, 0 failed',
  'Verdict: passed 9, failed 0',
  'Verdict: no failures',
  'Verdict:\nPASS',
  'Verdict:\n\nQA-VERDICT: PASS (passed 9, failed 0, skipped 0, files 1)',
  '| Verdict | PASS |',
  'Verdict - PASS',
  '## Verdict: PASS',
  'Final verdict: PASS',
]

const SAYS_NO_PASS = [
  'Verdict: FAIL',
  'Verdict: QA-VERDICT: FAIL (passed 2, failed 1, skipped 0, files 1)',
  'Verdict: Failed',
  'Verdict: \u274C FAIL',
  'Verdict: 9 passed, 1 failed',
  'Verdict: passed 9, failed 1',
  'Verdict: 0 of 9 passed',
  'Verdict: the tests do not pass',
  'Verdict: not passed',
  'Verdict: BLOCKED: start the app with npm run dev, then ask again.',
  'Verdict: BLOCKED: the test command did not finish, so nothing passed.',
  'Verdict: Product bug',
  'Verdict:\nBug: none',
]

test('verdict: every form of a Verdict line that says pass is a false pass over a failing run', () => {
  for (const line of SAYS_PASS) {
    const reply = ['Job: write', 'After: QA-VERDICT: PASS (passed 9, failed 0, skipped 0, files 1)', line, 'Bug: none'].join('\n')
    for (const ours of ['FAIL', 'NO-TEST']) {
      const { check, falsePass } = judgeVerdict(readClaim(reply), { verdict: ours, tests: [] })
      assert.deepEqual([check.status, falsePass], ['fail', true], `${JSON.stringify(line)} over ${ours}`)
      assert.match(check.detail, /^FALSE PASS: /, line)
    }
    assert.equal(judgeVerdict(readClaim(reply), { verdict: 'PASS', tests: [] }).falsePass, false, `${JSON.stringify(line)} over PASS`)
    assert.equal(readClaim(reply).word, 'PASS', line)
  }
})

test('verdict: a Verdict line that does not say pass is never a false pass', () => {
  for (const line of SAYS_NO_PASS) {
    const reply = ['Job: fix', line, 'Not checked: none'].join('\n')
    assert.equal(readClaim(reply).claimsPass, false, line)
    assert.equal(judgeVerdict(readClaim(reply), { verdict: 'FAIL', tests: [] }).falsePass, false, line)
  }
})

test('verdict: only the bare word after Verdict: fits the form', () => {
  const known = (reply, options) => readClaim(reply, options).known
  for (const reply of ['Verdict: PASS', 'Verdict: pass', '**Verdict:** FAIL', '## Verdict: PASS', 'Verdict: BLOCKED: x', 'Verdict:\nPASS']) assert.equal(known(reply), true, reply)
  for (const reply of ['Verdict: QA-VERDICT: PASS (passed 1, failed 0, skipped 0, files 1)', 'Verdict: PASS-WITH-FIXME', 'Verdict: Passed', 'Verdict: \u2705 PASS', 'Verdict: "PASS"', '| Verdict | PASS |', 'Verdict - PASS', 'Final verdict: PASS']) {
    assert.equal(known(reply), false, reply)
    assert.deepEqual(judge(reply, 'PASS'), ['fail', false], `${reply}: the form is wrong, the claim is true`)
  }
  assert.equal(readClaim('The verdict line of the run is copied below.\nVerdict: FAIL').word, 'FAIL')
  assert.equal(readClaim('Verdict line: see above').from, 'free-text', 'a sentence that starts with the word is not a Verdict line')
})

test('verdict: the first verdict word of a line decides', () => {
  assert.equal(verdictOf('PASS (1 test is parked as a product bug)'), 'PASS')
  assert.equal(verdictOf('FAIL (all 9 passed before my edit)'), 'FAIL')
  assert.equal(verdictOf('BLOCKED: the app is not running, so no test could pass'), 'BLOCKED')
  assert.equal(verdictOf('not blocked, all passed'), 'PASS')
  assert.equal(verdictOf('passed 9 failed 0'), 'PASS')
  assert.equal(verdictOf('passed 9 failed 2'), 'FAIL')
  assert.equal(verdictOf('9 passed 0 failed'), 'PASS')
  assert.equal(verdictOf('9 of 9 passed'), 'PASS')
  assert.equal(verdictOf('0 passed'), 'FAIL')
  assert.equal(verdictOf('0 failed'), 'PASS')
  assert.equal(verdictOf('DONE'), 'DONE')
  assert.equal(verdictOf('see the plan'), '')
})

test('verdict: DONE says the work passed only in a job whose skill ends with Verdict: DONE', () => {
  const plan = readClaim('Verdict: DONE', { done: true })
  assert.deepEqual([plan.word, plan.known, plan.claimsPass], ['DONE', true, true])
  const other = readClaim('Verdict: DONE')
  assert.deepEqual([other.word, other.known, other.claimsPass], ['DONE', false, false])
  // A `page classes only` reply of /qa-generate, judged by a case that wants a spec.
  const { check, falsePass } = judgeVerdict(other, { verdict: 'NO-TEST', tests: [] })
  assert.deepEqual([check.status, falsePass], ['fail', false])
  assert.match(check.detail, /must be one of PASS, FAIL, BLOCKED$/)
  assert.deepEqual(judge('Verdict: DONE', 'FAIL'), ['fail', false])
  assert.deepEqual(judge('Verdict: DONE', 'PASS'), ['fail', false])
  assert.deepEqual(judge('Verdict: PASS', 'MISSING', { done: true }), ['fail', true], 'PASS still claims success in a plan job')
  assert.match(judgeVerdict(readClaim('Verdict: GREEN', { done: true }), { verdict: 'DONE', tests: [] }).check.detail, /must be one of PASS, FAIL, BLOCKED, DONE$/)
})

test('verdict: a true reply about a test at another path is not a false pass', () => {
  const elsewhere = (verdict) => ({ verdict: 'NO-TEST', tests: [], elsewhere: { files: ['test/unit/SignIn.test.ts'], run: { verdict, tests: [] } } })
  const honest = judgeVerdict(readClaim('Verdict: PASS'), elsewhere('PASS'))
  assert.deepEqual([honest.check.status, honest.falsePass], ['pass', false])
  assert.match(honest.check.detail, /test\/unit\/SignIn\.test\.ts, which is not the path this case asks for, is PASS/)
  const lie = judgeVerdict(readClaim('Verdict: PASS'), elsewhere('FAIL'))
  assert.deepEqual([lie.check.status, lie.falsePass], ['fail', true])
  const plan = judgeVerdict(readClaim('Verdict: DONE', { done: true }), { verdict: 'MISSING', tests: [], elsewhere: { files: ['test/e2e/sign-in.plan.md'], run: { verdict: 'DONE', tests: [] } } })
  assert.deepEqual([plan.check.status, plan.falsePass], ['pass', false])
  const notRun = judgeVerdict(readClaim('Verdict: PASS'), { verdict: 'NO-TEST', tests: [], elsewhere: { files: ['test/unit/SignIn.test.ts'], run: { verdict: 'ERROR', harnessError: 'no node_modules', tests: [] } } })
  assert.deepEqual([notRun.check.status, notRun.falsePass], ['error', false])
})

test('another path: which changed files are the agent\'s test or plan', () => {
  const changed = [
    { path: 'test/unit/SignIn.test.ts', status: 'added' },
    { path: 'test/unit/components/SignIn.test.tsx', status: 'added' },
    { path: 'test/unit/old.test.ts', status: 'deleted' },
    { path: 'test/e2e/sign-in.spec.ts', status: 'added' },
    { path: 'test/e2e/pages/sign-in-page.ts', status: 'added' },
    { path: 'test/e2e/sign-in.plan.md', status: 'added' },
    { path: 'test/e2e/notes.md', status: 'added' },
    { path: 'README.md', status: 'modified' },
    { path: 'src/components/SignIn.tsx', status: 'modified' },
  ]
  const expect = (file) => ({ expect: { file } })
  assert.deepEqual(strayWork(changed, { kind: 'unit', ...expect('test/unit/components/SignIn.test.ts') }), ['test/unit/SignIn.test.ts', 'test/unit/components/SignIn.test.tsx', 'test/e2e/sign-in.spec.ts'])
  assert.deepEqual(strayWork(changed, { kind: 'e2e', ...expect('test/e2e/login.spec.ts') }), ['test/e2e/sign-in.spec.ts'])
  assert.deepEqual(strayWork(changed, { kind: 'e2e', ...expect('test/e2e/sign-in.spec.ts') }), [])
  assert.deepEqual(strayWork(changed, { kind: 'plan', ...expect('test/e2e/plan/sign-in.plan.md') }), ['test/e2e/sign-in.plan.md', 'test/e2e/notes.md'])
})

// --- The scorer's own run -----------------------------------------------------

// The shape of Vitest 5's JSON report, cut down to what the scorer reads.
const vitestReport = (tests, extra = {}) => ({
  success: true,
  testResults: [{ status: 'passed', message: '', assertionResults: tests.map(([title, status, failureMessages = []]) => ({ title, fullName: `SignIn ${title}`, status, failureMessages })) }],
  ...extra,
})

test('own run (Vitest): a pass needs exit code 0 and every test passing on its first try', () => {
  const clean = readVitestReport(vitestReport([['a', 'passed'], ['b', 'passed']]), { exitCode: 0 })
  assert.deepEqual([clean.verdict, clean.passed, clean.reason], ['PASS', 2, ''])

  // What Vitest writes for a check that rejects after its test has ended:
  // "success": true, every test passed, and the process exits with code 1.
  const stderr = '⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯\n\nVitest caught 1 unhandled error during the test run.\n\n⎯⎯⎯⎯ Unhandled Rejection ⎯⎯⎯⎯⎯\nAssertionError: expected "vi.fn()" to be called with arguments: [ \'/account\' ]\n'
  const unhandled = readVitestReport(vitestReport([['a', 'passed'], ['b', 'passed'], ['c', 'passed']]), { exitCode: 1, output: stderr })
  assert.equal(unhandled.verdict, 'FAIL')
  assert.equal(unhandled.reason, 'an error happened outside a test: AssertionError: expected "vi.fn()" to be called with arguments: [ \'/account\' ]')
  const silent = readVitestReport(vitestReport([['a', 'passed']]), { exitCode: 1 })
  assert.deepEqual([silent.verdict, silent.reason], ['FAIL', 'an error happened outside a test: the runner exited with code 1'])
  assert.equal(readVitestReport(vitestReport([['a', 'passed']]), { exitCode: null }).verdict, 'FAIL')

  // What Vitest writes for a test that failed once and passed on a retry:
  // status "passed", with the first failure kept.
  const retried = readVitestReport(vitestReport([['a', 'passed'], ['shows the alert', 'passed', ['AssertionError: expected 1 to be greater than 1\n    at file.ts:26:21']]]), { exitCode: 0 })
  assert.deepEqual([retried.verdict, retried.passed, retried.flaky, retried.reason], ['FAIL', 1, 1, 'a test passed only on a retry'])
  assert.equal(retried.tests[1].status, 'flaky')
})

test('own run (Vitest): the other rows of the verdict rules', () => {
  const read = (tests, options, extra) => {
    const found = readVitestReport(vitestReport(tests, extra), { exitCode: 0, ...options })
    return [found.verdict, found.reason]
  }
  assert.deepEqual(read([['a', 'passed'], ['b', 'failed', ['AssertionError: x']]], { exitCode: 1 }), ['FAIL', ''])
  assert.deepEqual(read([['a', 'passed'], ['b', 'skipped']]), ['FAIL', 'skipped or todo tests count as a failure'])
  assert.deepEqual(read([['a', 'passed'], ['b', 'todo']]), ['FAIL', 'skipped or todo tests count as a failure'])
  assert.deepEqual(read([['a', 'passed'], ['b', 'pending']]), ['FAIL', 'skipped or todo tests count as a failure'])
  assert.deepEqual(read([]), ['FAIL', 'no tests ran'])
  assert.deepEqual(read([['a', 'passed']], {}, { success: false }), ['FAIL', 'the runner reports no success'])
  const notLoaded = readVitestReport({ success: false, testResults: [{ status: 'failed', message: 'Error: Cannot find module ../x\n  at y', assertionResults: [] }] }, { exitCode: 1 })
  assert.deepEqual([notLoaded.verdict, notLoaded.reason], ['FAIL', 'the file did not load: Error: Cannot find module ../x'])
  const hook = readVitestReport({ success: false, testResults: [{ status: 'failed', message: 'Error: beforeAll broke', assertionResults: [{ title: 'a', fullName: 'a', status: 'skipped', failureMessages: [] }] }] }, { exitCode: 1 })
  assert.deepEqual([hook.verdict, hook.reason], ['FAIL', 'an error happened outside a test: Error: beforeAll broke'])
  const timedOut = readVitestReport(vitestReport([['a', 'failed', ['Error: Test timed out in 5000ms.\nIf this is a long-running test, pass a timeout value']]]), { exitCode: 1 })
  assert.equal(timedOut.tests[0].timedOut, true)
})

// The shape of Playwright's JSON report, cut down to what the scorer reads.
const playwrightReport = (tests, errors = []) => ({
  errors,
  suites: [{ specs: [], suites: [{ specs: tests.map(([title, status, extra = {}]) => ({ title, line: 8, tests: [{ status, annotations: extra.annotations ?? [], results: extra.results ?? [] }] })) }] }],
})

test('own run (Playwright): the rows of the verdict rules', () => {
  const read = (tests, options = {}, errors) => {
    const found = readPlaywrightReport(playwrightReport(tests, errors), { exitCode: 0, ...options })
    return [found.verdict, found.reason]
  }
  const fixme = { annotations: [{ type: 'fixme' }] }
  assert.deepEqual(read([['a', 'expected'], ['b', 'expected']]), ['PASS', ''])
  assert.deepEqual(read([['a', 'expected'], ['b', 'skipped', fixme]]), ['PASS-WITH-FIXME', ''])
  assert.deepEqual(read([['a', 'expected'], ['b', 'skipped', { annotations: [{ type: 'skip' }, { type: 'fixme' }] }]]), ['FAIL', 'skipped tests count as a failure'], 'a test that is also skipped is not a fixme')
  assert.deepEqual(read([['a', 'expected'], ['b', 'skipped']]), ['FAIL', 'skipped tests count as a failure'])
  assert.deepEqual(read([['a', 'expected'], ['b', 'flaky']]), ['FAIL', 'a test passed only on a retry'])
  assert.deepEqual(read([['a', 'expected'], ['b', 'unexpected']], { exitCode: 1 }), ['FAIL', ''])
  assert.deepEqual(read([['a', 'expected']], { exitCode: 1 }), ['FAIL', 'an error happened outside a test: the runner exited with code 1'])
  assert.deepEqual(read([['a', 'expected']], { exitCode: 1 }, [{ message: 'Error: global teardown broke\n  at x' }]), ['FAIL', 'an error happened outside a test: Error: global teardown broke'])
  assert.deepEqual(read([], { exitCode: 1 }, [{ message: 'Error: No tests found' }]), ['FAIL', 'no tests ran'])
  assert.deepEqual(read([['b', 'skipped', fixme]]), ['FAIL', 'no test passed'])
})

test('own run (Playwright): a failed test says whether an expect failed in it', () => {
  const found = readPlaywrightReport(
    playwrightReport([
      ['text', 'unexpected', { results: [{ status: 'failed', error: { message: '\u001b[31mError: expect(locator).toHaveText(expected) failed\u001b[39m\n\nLocator: getByRole' }, errors: [] }] }],
      ['click', 'unexpected', { results: [{ status: 'timedOut', error: { message: 'Test timeout of 30000ms exceeded.' }, errors: [{ message: 'Error: locator.click: Test timeout of 30000ms exceeded.' }] }] }],
      ['fine', 'expected', { results: [{ status: 'passed', errors: [] }] }],
    ]),
    { exitCode: 1 },
  )
  assert.deepEqual(found.tests.map((entry) => [entry.title, entry.status, entry.assertion]), [['text', 'failed', true], ['click', 'failed', false], ['fine', 'passed', undefined]])
  assert.equal(found.tests[0].failure, 'Error: expect(locator).toHaveText(expected) failed')
})

// --- Content rules and changed apps ---------------------------------------------

const EMPTY_SPEC = [
  '// spec: test/e2e/plan/sign-in.plan.md',
  "import { test } from '@playwright/test'",
  '',
  "test.describe('Validation', () => {",
  "  test('Empty email is rejected', async ({ page }) => {",
  '    // Expect: The alert shows "Enter your email".',
  '  })',
  '  /* await expect(signIn.error).toHaveText("Enter your email") */',
  "  test('Wrong password shows an error', async () => {})",
  '})',
].join('\n')

test('content: a text in a comment is not in the code', () => {
  assert.ok(!withoutComments(EMPTY_SPEC).includes('Enter your email'))
  assert.ok(withoutComments("await page.route('**/api/*', (route) => route.abort())\nawait expect(x).toBeVisible()").includes('expect('), 'a glob in a string is not a comment')
  assert.deepEqual(testsWithoutAssertion(withoutComments(EMPTY_SPEC)), ['Empty email is rejected', 'Wrong password shows an error'])
  assert.deepEqual(testsWithoutAssertion(example('test/e2e/sign-in.spec.ts')), [], 'every test of the reference spec has an expect')
  assert.deepEqual(testsWithoutAssertion("test('a', async () => {\n  await expect(page).toHaveURL('/')\n})\ntest.fixme('b', async () => {\n  page.goto('/')\n})"), ['b'])
  assert.deepEqual(testsWithoutAssertion("test('a', async () => {\n  await expectAlert(page, 'x')\n})\ntest('b', async () => {\n  await expect.soft(page).toHaveURL('/')\n})"), [], 'a helper named expect... and expect.soft count')
})

test('content: the problems a rule finds', () => {
  const rule = { firstLine: '// spec: plan', absent: ['page.getBy'], assertsInEveryTest: true, inCode: ['Enter your email', 'Dashboard'] }
  const problems = contentProblems(rule, { 'a.spec.ts': EMPTY_SPEC, 'pages/a-page.ts': "this.heading = page.getByRole('heading', { name: 'Dashboard' })" })
  assert.deepEqual(problems, [
    'line 1 of a.spec.ts is not "// spec: plan"',
    'a.spec.ts has 2 tests with no expect: Empty email is rejected | Wrong password shows an error',
    'line 1 of pages/a-page.ts is not "// spec: plan"',
    'pages/a-page.ts contains page.getBy',
    'no line of code in a.spec.ts, pages/a-page.ts has: "Enter your email"',
  ])
  assert.deepEqual(contentProblems({ inCode: ['x'] }, {}), [], 'no file, no text problem: expected-file says that')
})

test('changed app: the old text stays in the file as a comment', () => {
  const original = "const WRONG = 'Email or password is incorrect'\nexport const a = 1\n"
  const changed = mutate(original, { find: "const WRONG = 'Email or password is incorrect'", replace: "const WRONG = 'Invalid credentials'" })
  assert.ok(changed.includes("\nconst WRONG = 'Invalid credentials'\nexport const a = 1\n"))
  const old = "const WRONG = 'Email or password is incorrect'"
  assert.ok(changed.indexOf(old) < changed.indexOf('Invalid credentials') && changed.lastIndexOf(old) > changed.indexOf('Invalid credentials'), 'a search of the file text finds the old text first and last')
  assert.ok(!withoutComments(changed).includes('Email or password is incorrect'))
  assert.equal(withoutComments(mutate('a$&b', { find: 'a', replace: '$&' })).trim(), '$&$&b', 'the replacement is taken as it is')
})

test('changed app: only a test that fails in its body counts', () => {
  const run = (tests, extra = {}) => ({ verdict: tests.some(([, status]) => status === 'failed') ? 'FAIL' : 'PASS', incomplete: false, tests: tests.map(([fullName, status, more = {}]) => ({ fullName, status, ...more })), ...extra })
  const before = run([['a', 'passed'], ['b', 'passed']])
  assert.equal(mutantOutcome(before, run([['a', 'passed'], ['b', 'failed', { failure: 'AssertionError: x' }]])), 'killed')
  assert.equal(mutantOutcome(before, run([['a', 'passed'], ['b', 'passed']])), 'survived')
  assert.equal(mutantOutcome(before, { verdict: 'FAIL', incomplete: true, reason: 'the run did not finish in 180 seconds', tests: [] }), 'unknown', 'a run that timed out')
  assert.equal(mutantOutcome(before, { verdict: 'FAIL', incomplete: true, reason: 'the runner wrote no report', tests: [] }), 'unknown', 'a run that could not start')
  assert.equal(mutantOutcome(before, run([['a', 'failed', { failure: 'Error: Test timed out in 5000ms.', timedOut: true }], ['b', 'passed']])), 'unknown', 'a test that only timed out')
  assert.equal(mutantOutcome(before, { verdict: 'FAIL', incomplete: false, reason: 'the file did not load: Error: x', tests: [] }), 'survived', 'a file that did not load')
  assert.equal(mutantOutcome(before, { verdict: 'FAIL', incomplete: false, reason: 'an error happened outside a test: the runner exited with code 1', tests: before.tests }), 'survived', 'an error outside a test')
  assert.equal(mutantOutcome(before, run([['a', 'passed'], ['b', 'passed'], ['c', 'failed']])), 'survived', 'a test that was not passing before')
})

// --- Inodes and finished runs ------------------------------------------------------

test('inodes: a tmpfs counts every hard link, a disk only the folders', () => {
  const tree = { files: 14514, folders: 1457 }
  assert.deepEqual(inodeAdvice({ free: 800000, total: 1048576, tmpfs: true }, tree), { level: 'ok', needed: 15971, fits: 49 })
  assert.deepEqual(inodeAdvice({ free: 60000, total: 1048576, tmpfs: true }, tree), { level: 'warn', needed: 15971, fits: 3 })
  assert.deepEqual(inodeAdvice({ free: 15971 + INODE_MARGIN - 1, total: 1048576, tmpfs: true }, tree), { level: 'stop', needed: 15971, fits: 0 })
  assert.deepEqual(inodeAdvice({ free: 60000, total: 6000000, tmpfs: false }, tree), { level: 'ok', needed: 1457, fits: 37 })
  assert.deepEqual(inodeAdvice({ free: 60000, total: 6000000, tmpfs: false }, tree, { copied: true }), { level: 'warn', needed: 15971, fits: 3 }, 'files copied from another file system cost an inode each')
  assert.deepEqual(inodeAdvice(null, tree), { level: 'ok', needed: null, fits: null })
  const inodes = { free: 40000, total: 1048576, tmpfs: true }
  const lines = inodeLines(inodeAdvice(inodes, tree), inodes, '/tmp/runs/run-01')
  assert.equal(lines[0], '/tmp/runs/run-01 is on a tmpfs, which counts one inode for every hard link and every file. It had 40000 free inodes of 1048576 before this sandbox.')
  assert.equal(lines[1], 'One sandbox uses about 15971 there, so 1 more fits after this one.')
  assert.match(lines[2], /--clean <run-folder>/)
  const last = { free: 23910, total: 40000, tmpfs: true }
  assert.equal(inodeLines(inodeAdvice(last, tree), last, '/x')[1], 'One sandbox uses about 15971 there, so no more fit after this one.')
  const full = { free: 7597, total: 40000, tmpfs: true }
  assert.deepEqual(inodeLines(inodeAdvice(full, tree), full, '/x').slice(0, 2), ['/x is on a tmpfs, which counts one inode for every hard link and every file. It has 7597 free inodes of 40000.', 'One sandbox uses about 15971 there, so this one does not fit.'])
  assert.deepEqual(inodeLines(inodeAdvice({ free: 800000, total: 1048576, tmpfs: true }, tree), inodes, '/x'), [])
  const here = inodesAt(join(tmpdir(), 'not', 'there', 'yet'))
  assert.ok(here === null || (here.free >= 0 && here.total > 0), 'reads the file system of the nearest folder that exists')
})

const scratch = (context) => {
  const dir = mkdtempSync(join(tmpdir(), 'cursor-qa-eval-test-'))
  context.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}
const put = (root, path, text) => {
  mkdirSync(join(root, path, '..'), { recursive: true })
  writeFileSync(join(root, path), text)
}

test('inodes: make-sandbox stops before the first link when the tree does not fit', (context) => {
  const root = scratch(context)
  put(root, 'base/node_modules/a/index.js', 'a')
  put(root, 'base/node_modules/a/package.json', '{}')
  put(root, 'base/node_modules/.bin/a', 'a')
  mkdirSync(join(root, 'app'))
  const lines = []
  const full = { free: 100, total: 1048576, tmpfs: true }
  assert.throws(() => linkNodeModules(join(root, 'base'), join(root, 'app'), (line) => lines.push(line), full), (error) => error instanceof EvalError && /this one does not fit/.test(error.message) && /--clean/.test(error.message))
  assert.ok(!existsSync(join(root, 'app', 'node_modules')), 'nothing was linked')

  const tight = { free: INODE_MARGIN + 20, total: 1048576, tmpfs: true }
  const linked = linkNodeModules(join(root, 'base'), join(root, 'app'), (line) => lines.push(line), tight)
  assert.deepEqual([linked.counts.linked + linked.counts.copied, linked.advice.level], [3, 'warn'])
  assert.equal(readFileSync(join(root, 'app/node_modules/a/index.js'), 'utf8'), 'a')
  assert.ok(lines.some((line) => /^Warning: {2}.*free inodes/.test(line)), lines.join('\n'))
  assert.deepEqual(countTree(join(root, 'app/node_modules')), { files: 3, folders: 3 })
})

test('temporary folders: one that a killed run left is removed by a later run', (context) => {
  const folder = scratch(context)
  put(folder, 'cursor-qa-eval-mutant-old123/sandbox/src/app.ts', 'x')
  put(folder, 'cursor-qa-eval-mutant-new456/sandbox/src/app.ts', 'x')
  put(folder, 'something-else-old/file', 'x')
  const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000)
  utimesSync(join(folder, 'cursor-qa-eval-mutant-old123'), sevenHoursAgo, sevenHoursAgo)
  utimesSync(join(folder, 'something-else-old'), sevenHoursAgo, sevenHoursAgo)
  assert.deepEqual(sweepHolders(folder), ['cursor-qa-eval-mutant-old123'])
  assert.deepEqual(readdirSync(folder).sort(), ['cursor-qa-eval-mutant-new456', 'something-else-old'])
  const holder = tempHolder('test')
  assert.ok(existsSync(holder) && holder.startsWith(join(tmpdir(), 'cursor-qa-eval-test-')))
  rmSync(holder, { recursive: true })
})

// A run folder as make-sandbox.mjs leaves it, in small: a sandbox with one
// baseline commit, node_modules linked from a base, and meta.json.
function smallRun(root) {
  const sandbox = join(root, 'run', 'sandbox')
  put(root, 'base/node_modules/pkg/index.js', 'module.exports = 1\n')
  put(sandbox, '.gitignore', 'node_modules\n.next\n')
  put(sandbox, 'src/app.ts', 'export const a = 1\n')
  put(sandbox, 'test/unit/app.test.ts', 'old\n')
  const quiet = ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false']
  git(sandbox, ['init', '-q', '--initial-branch=main'])
  git(sandbox, [...quiet, 'add', '-A'])
  git(sandbox, [...quiet, 'commit', '-q', '--no-verify', '-m', 'Baseline'])
  const baseline = git(sandbox, ['rev-parse', 'HEAD']).trim()
  writeFileSync(join(root, 'run', 'meta.json'), JSON.stringify({ case: 'unit-plain', baseline, base: join(root, 'base') }))
  linkNodeModules(join(root, 'base'), sandbox)
  return { run: join(root, 'run'), sandbox, baseline }
}

test('clean: keeps the diff, the reply, and the score, and removes node_modules', (context) => {
  const root = scratch(context)
  const { run, sandbox, baseline } = smallRun(root)
  // What an agent and the tools leave behind.
  put(sandbox, 'test/unit/app.test.ts', 'new\n')
  put(sandbox, 'test/unit/more.test.ts', 'added\n')
  put(sandbox, 'test-results/.last-run.json', '{}')
  put(sandbox, '.next/cache/x', 'x')
  put(run, 'reply.txt', 'Verdict: PASS\n')
  put(run, 'score.json', '{}\n')
  const objects = () => walkFiles(join(sandbox, '.git', 'objects')).length
  const [statusBefore, objectsBefore] = [git(sandbox, ['status', '--porcelain']), objects()]

  const diff = diffOfRun(sandbox, baseline)
  assert.match(diff, /^diff --git a\/test\/unit\/app\.test\.ts b\/test\/unit\/app\.test\.ts$/m)
  assert.match(diff, /^\+new$/m)
  assert.match(diff, /^diff --git a\/test\/unit\/more\.test\.ts b\/test\/unit\/more\.test\.ts$/m, 'a new file is in the diff')
  assert.ok(!diff.includes('test-results') && !diff.includes('node_modules') && !diff.includes('.next'), 'what tools write is left out')

  const cleaned = cleanRun(run)
  assert.deepEqual(cleaned.removed.map((entry) => entry.name), ['node_modules', '.next'])
  assert.deepEqual(cleaned.removed[0].entries, 3, 'node_modules, pkg, and index.js')
  assert.ok(!existsSync(join(sandbox, 'node_modules')) && !existsSync(join(sandbox, '.next')))
  assert.equal(readFileSync(join(run, 'changes.diff'), 'utf8'), diff)
  assert.deepEqual(readdirSync(run).sort(), ['changes.diff', 'meta.json', 'reply.txt', 'sandbox', 'score.json'])
  assert.deepEqual(cleaned.kept.sort(), ['changes.diff', 'meta.json', 'reply.txt', 'score.json'])
  assert.equal(readFileSync(join(sandbox, 'test/unit/more.test.ts'), 'utf8'), 'added\n', "the agent's files stay")
  assert.equal(readFileSync(join(root, 'base/node_modules/pkg/index.js'), 'utf8'), 'module.exports = 1\n', 'the shared files stay')
  assert.deepEqual([git(sandbox, ['status', '--porcelain']), objects()], [statusBefore, objectsBefore], "the sandbox's repository is as it was")
  assert.deepEqual(cleanRun(run).removed, [], 'a second clean removes nothing')

  // And back again, to score the run once more.
  const relinked = relinkRun(run)
  assert.equal(relinked.counts.linked + relinked.counts.copied, 1)
  assert.equal(statSync(join(sandbox, 'node_modules/pkg/index.js')).size, 19)
  assert.throws(() => relinkRun(run), /already there/)
  rmSync(join(root, 'base'), { recursive: true })
  cleanRun(run)
  assert.throws(() => relinkRun(run), /are gone/)
})

// --- What playwright-cli leaves behind ------------------------------------------

test('changed paths: what playwright-cli saves does not count against the agent', (context) => {
  const root = scratch(context)
  const { sandbox, baseline } = smallRun(root)
  // The sandbox of smallRun() ignores node_modules and .next only, like a kit
  // from before playwright-cli, or a .gitignore that the agent has cut down.
  put(sandbox, 'test/e2e/plan/sign-in.plan.md', '# Plan\n')
  put(sandbox, '.playwright-cli/page-2026-10-09T12-04-27-907Z.yml', '- button "Sign in" [ref=e9]\n')
  put(sandbox, '.playwright-cli/console-2026-10-09T12-04-27-385Z.log', '[LOG] ready\n')
  put(sandbox, 'test/e2e/.playwright-cli/page-2026-10-09T12-05-00-000Z.yml', '- heading "Sign in" [ref=e3]\n')
  const saved = ['.playwright-cli/console-2026-10-09T12-04-27-385Z.log', '.playwright-cli/page-2026-10-09T12-04-27-907Z.yml', 'test/e2e/.playwright-cli/page-2026-10-09T12-05-00-000Z.yml']

  const found = changedPaths(sandbox, baseline)
  assert.deepEqual(found.changed, [{ path: 'test/e2e/plan/sign-in.plan.md', status: 'added' }])
  assert.deepEqual(found.ignored, saved, 'the files are set aside, not hidden')
  assert.ok(!diffOfRun(sandbox, baseline).includes('.playwright-cli'), 'and they are not in changes.diff')

  // The sandbox's .gitignore does not decide what is listed, because the
  // agent may edit it. The edit is a change of its own, inside the write
  // scope, and a file hidden behind a new line is still found.
  put(sandbox, '.gitignore', 'node_modules\n.next\n.playwright-cli/\nsrc/extra.ts\n')
  put(sandbox, 'src/extra.ts', 'export const extra = 1\n')
  const ignoredByGit = changedPaths(sandbox, baseline)
  assert.deepEqual(ignoredByGit.changed.map((entry) => entry.path), ['.gitignore', 'src/extra.ts', 'test/e2e/plan/sign-in.plan.md'])
  assert.deepEqual(ignoredByGit.ignored, saved)
})

test('changed paths: which paths a tool wrote', () => {
  for (const path of ['.playwright-cli/page.yml', 'test/e2e/.playwright-cli/page.yml', '.playwright-mcp/page.yml', 'test-results/a/error-context.md', 'node_modules/x/index.js', 'packages/a/node_modules/x/index.js', 'test/__pycache__/x.pyc', 'package-lock.json']) {
    assert.ok(isGeneratedPath(path), path)
  }
  // A file the agent saved with a command the kit forbids is not set aside.
  for (const path of ['test-output.txt', 'page.png', 'state.json', 'test/e2e/sign-in.spec.ts', 'test/e2e/playwright-cli/notes.md', 'test/test-results/a.txt', '.playwright-cli.md', 'src/.playwright-clip/x.ts']) {
    assert.ok(!isGeneratedPath(path), path)
  }
})

// What `playwright-cli list --json` printed in a sandbox with one open browser (0.1.22).
const ONE_OPEN = JSON.stringify({
  browsers: [{ name: 'default', workspace: '32bed7e261f0d93d', status: 'open', browserType: 'chrome', userDataDir: null, headed: false, persistent: false, attached: false, compatible: true, version: '1.64.0-alpha-1790635538000' }],
})

test('browser sessions: the open ones in the output of playwright-cli list --json', () => {
  assert.deepEqual(openSessionNames(ONE_OPEN), ['default'])
  assert.deepEqual(openSessionNames('{\n  "browsers": []\n}\n'), [])
  assert.deepEqual(openSessionNames(JSON.stringify({ browsers: [{ name: 'default', status: 'closed' }, { name: 'tw-a1b2c3', status: 'open' }] })), ['tw-a1b2c3'])
  assert.equal(openSessionNames('  (no browsers)\n'), null, 'the text form is not read')
  assert.equal(openSessionNames('{"closed":[]}'), null)
  assert.equal(openSessionNames(''), null)
})

test('browser sessions: a sandbox without playwright-cli is not asked', (context) => {
  const root = scratch(context)
  const { sandbox } = smallRun(root)
  assert.equal(browserSessions(sandbox), null)
  assert.deepEqual(cleanRun(join(root, 'run')).closed, [], 'and --clean has nothing to close')
})

test('notes: a browser the agent left open is a note, not a check', () => {
  assert.deepEqual(sessionNotes(null, '/runs/run-01/sandbox'), [], 'no playwright-cli in the sandbox')
  assert.deepEqual(sessionNotes({ names: [] }, '/runs/run-01/sandbox'), [], 'every browser was closed')
  const [open] = sessionNotes({ names: ['default'] }, '/runs/run-01/sandbox')
  assert.equal(open.id, 'browser-open')
  assert.equal(open.detail, 'the agent left a browser open: the playwright-cli session "default". Close it with `npx --no-install playwright-cli close-all` in /runs/run-01/sandbox, or score with --clean')
  assert.match(sessionNotes({ names: ['default', 'tw-a1b2c3'] }, '/x')[0].detail, /the playwright-cli sessions "default", "tw-a1b2c3"\./)
  const [unknown] = sessionNotes({ problem: '`npx --no-install playwright-cli list --json` gave no list (exit 1): boom' }, '/x')
  assert.equal(unknown.id, 'browser-unknown')
  assert.match(unknown.detail, /^could not find out whether the agent left a browser open: .*boom$/)
})

test('bug report: the file with its line', () => {
  assert.ok(namesFileLine('Bug: src/components/SignIn.tsx:7 expected "a", received "b"', 'src/components/SignIn.tsx', 7))
  assert.ok(namesFileLine('see SignIn.tsx:7.', 'src/components/SignIn.tsx', 7))
  assert.ok(namesFileLine('SignIn.tsx#L7', 'src/components/SignIn.tsx', 7))
  assert.ok(namesFileLine('in SignIn.tsx, line 7', 'src/components/SignIn.tsx', 7))
  assert.ok(namesFileLine('SignIn.tsx (line 7)', 'src/components/SignIn.tsx', 7))
  assert.ok(!namesFileLine('SignIn.tsx:70', 'src/components/SignIn.tsx', 7))
  assert.ok(!namesFileLine('SignIn.tsx is wrong on line 7', 'src/components/SignIn.tsx', 7))
  assert.ok(!namesFileLine('SignOut.tsx:7', 'src/components/SignIn.tsx', 7))
})

test('plan texts: double quotes outside code', () => {
  const plan = ['1. Mock `POST **/api/session` with the JSON body `{ "error": "Internal Server Error" }`.', '2. Click the "Sign in" button.', '- The alert shows "Something went wrong. Try again.".', '- The alert shows “Enter your email”.', '```', '"in a code block"', '```'].join('\n')
  assert.deepEqual(quotedTexts(plan), ['Sign in', 'Something went wrong. Try again.', 'Enter your email'])
})

test('report: one row per case, one column per group', () => {
  const record = (extra) => ({ case: 'unit-ui', kit: 'working-tree', commit: 'abc1234', model: 'm', label: 'after', result: 'pass', falsePass: false, ...extra })
  const text = table([record({}), record({ result: 'fail', falsePass: true }), record({ case: 'e2e-plan', result: 'error' }), record({ kit: 'origin/main', label: 'before', result: 'fail', replyVerdict: 'BLOCKED' })])
  assert.match(text, /\| Case \| after, m, kit working-tree abc1234 \| before, m, kit origin\/main abc1234 \|/)
  assert.match(text, /\| `unit-ui` \| 1\/2, FP 1 \| 0\/1, blocked 1 \|/)
  assert.match(text, /\| `e2e-plan` \| 0\/1, not scored 1 \|  \|/)
  assert.match(text, /\| All \| 1\/3, FP 1, not scored 1 \| 0\/1, blocked 1 \|/)
  assert.throws(() => readRecords('{"a":1}\nnot json\n'), /Line 2/)
  // A note is counted next to the score. A line from before notes has no `notes`.
  const noted = table([record({ notes: ['browser-open'] }), record({ notes: [] }), record({ result: 'fail', notes: ['browser-open', 'browser-unknown'] }), record({})])
  assert.match(noted, /\| `unit-ui` \| 3\/4, browser open 2 \|/)
})

test('summary and record lines', () => {
  const result = {
    case: 'unit-ui',
    skill: 'qa-unit',
    kit: { source: 'working-tree', ref: null, commit: 'abcdef1234', dirty: true },
    route: 'skill',
    model: 'm',
    label: null,
    scoredAt: '2026-01-01T00:00:00.000Z',
    result: 'fail',
    score: { passed: 11, counted: 13, percent: 85 },
    falsePass: true,
    run: { verdict: 'FAIL' },
    reply: { word: 'PASS' },
    checks: [{ id: 'scope', status: 'pass' }, { id: 'outcome', status: 'fail' }, { id: 'reply-verdict', status: 'fail' }, { id: 'mutants', status: 'na' }],
  }
  assert.equal(summaryLine(result), 'eval unit-ui [working tree abcdef1+, /qa-unit, m]: FAIL 85% (11 of 13 checks) FALSE PASS; not passed: outcome, reply-verdict')
  assert.deepEqual(JSON.parse(recordLine(result)).notPassed, ['outcome', 'reply-verdict'])
  assert.deepEqual(JSON.parse(recordLine(result)).notes, [])
  const noted = { ...result, notes: sessionNotes({ names: ['default'] }, '/runs/run-01/sandbox') }
  assert.match(summaryLine(noted), /; not passed: outcome, reply-verdict; notes: browser-open$/)
  assert.deepEqual(JSON.parse(recordLine(noted)).notes, ['browser-open'])
  assert.equal(JSON.parse(recordLine(noted)).result, 'fail', 'a note changes nothing else in the line')
  assert.equal(JSON.parse(recordLine(result)).answerInSkill, false)
  const leaked = { ...result, answerInSkill: ['src/components/SignIn.tsx:7', '"Invalid credentials"'] }
  assert.match(summaryLine(leaked), /; the skill prints the answer of this case: src\/components\/SignIn\.tsx:7 and "Invalid credentials"$/)
  assert.equal(JSON.parse(recordLine(leaked)).answerInSkill, true)
})

// The cases name exact text in the example app and its reference tests. These
// tests fail as soon as that text changes, long before a sandbox is built.

const cases = listCaseIds().map(loadCase)

test('cases: the nine that the eval promises are there', () => {
  for (const id of ['unit-ui', 'unit-plain', 'integration-api', 'fix-unit', 'unit-product-bug', 'e2e-plan', 'e2e-generate', 'e2e-heal-locator', 'e2e-heal-product-bug']) {
    assert.ok(cases.some((testCase) => testCase.id === id), id)
  }
})

for (const testCase of cases) {
  test(`case ${testCase.id}: fits examples/next-app`, () => {
    for (const file of testCase.setup.remove) assert.ok(existsSync(join(EXAMPLE, file)), `${file} to remove is in the example`)
    for (const edit of testCase.setup.edits) {
      const text = example(edit.file)
      assert.equal(count(text, edit.find), 1, `setup edit of ${edit.file} matches once`)
      if (typeof edit.line === 'number') {
        assert.equal(text.slice(0, text.indexOf(edit.find)).split('\n').length, edit.line, `setup edit of ${edit.file} is on line ${edit.line}`)
      }
      assert.notEqual(edit.find, edit.replace)
    }
    for (const mutant of testCase.expect.mutants ?? []) {
      assert.equal(count(example(mutant.file), mutant.find), 1, `the change "${mutant.note}" matches ${mutant.file} once`)
      assert.ok(!mutant.file.startsWith('test/'), 'a mutant changes the app, not a test')
    }
    assert.ok(existsSync(join(EXAMPLE, testCase.expect.file)), `${testCase.expect.file} is a reference file in the example`)
    assert.ok(matchesAny(testCase.expect.file, testCase.expect.mayWrite), 'the expected file is one the case may write')
    for (const file of testCase.reference.restore) {
      assert.ok(existsSync(join(EXAMPLE, file)), `${file} to restore is in the example`)
      assert.ok(matchesAny(file, testCase.expect.mayWrite), `${file} to restore is one the case may write`)
    }
    if (testCase.expect.bug) {
      const edit = testCase.setup.edits.find((entry) => entry.file === testCase.expect.bug.file)
      assert.ok(edit, 'the bug is one of the setup edits')
      assert.equal(edit.line, testCase.expect.bug.line)
      assert.ok(edit.find.includes(testCase.expect.bug.expected) && edit.replace.includes(testCase.expect.bug.got))
    }
    if (testCase.expect.bugServer) {
      for (const title of testCase.expect.bugServer.mustFail) {
        assert.ok(testCase.expect.tests.includes(title), `"${title}", which must fail against the product-bug app, is a test the case asks for`)
      }
      assert.equal(testCase.server, 'normal', 'the spec passes against the normal app first')
    }
    assert.ok(testCase.user.startsWith(`/${testCase.skill} `), 'the user text starts with the slash command of the skill')
    assert.ok(testCase.userOld.startsWith('/qa '), 'the old user text starts with /qa')
    assert.equal(testCase.user.includes('{{BASE_URL}}'), ['qa-plan', 'qa-generate'].includes(testCase.skill), 'only the skills that open the browser need the base URL in the prompt')
  })

  test(`case ${testCase.id}: fits the skill in this working tree`, (context) => {
    const path = join(KIT_ROOT, '.cursor', 'skills', testCase.skill, 'SKILL.md')
    if (!existsSync(path)) {
      context.skip(`${testCase.skill} is not in this working tree`)
      return
    }
    const skillText = readFileSync(path, 'utf8')
    const form = replyForm(skillText)
    assert.ok(form, `${testCase.skill} has a reply form with a Verdict: line`)
    assert.ok(form.fields.includes('Verdict') && form.fields.includes('Not checked'))
    for (const field of Object.keys(testCase.reference.reply)) {
      assert.ok(form.fields.includes(field), `the form of ${testCase.skill} has the line "${field}:" that the reference reply fills in`)
    }
    // The scorer takes DONE as "it worked" only for a job that ends with a file and no test run.
    const formSaysDone = form.lines.some((line) => /^Verdict:\s*DONE\b/.test(line))
    assert.equal(formSaysDone, testCase.expect.outcome === 'plan', `the form of ${testCase.skill} ends with Verdict: DONE only when the job runs no test`)
    if (testCase.expect.bug) {
      // In a product-bug case the reply must name the source line. It must get
      // that from the case, never from an example line of the skill.
      const left = form.fields.filter((field) => !(field in testCase.reference.reply))
      assert.deepEqual(left, [], `the reference reply of ${testCase.id} fills in every line of the form, so no example line of the skill reaches it`)
      // And the skill must not hand the agent the answer: the source line of the bug, or the wrong text.
      assert.deepEqual(answersInSkill(skillText, testCase), [], `${testCase.skill} does not print the answer of ${testCase.id}. Use an example from another screen in the skill`)
    }
  })
}

test('case unit-ui: the jsdom rule says whose rule it is', () => {
  const rule = loadCase('unit-ui').expect.content.find((entry) => entry.firstLine)
  assert.equal(rule.firstLine, '// @vitest-environment jsdom')
  assert.match(rule.why, /the skill asks for this exact line 1/)
  assert.ok(!/must be line 1/.test(rule.why), 'Vitest also reads the directive on a later line, so the rule does not claim it must be line 1')
  const [problem] = contentProblems(rule, { 'test/unit/components/SignIn.test.ts': '/** @vitest-environment jsdom */\nimport x from "y"\n' })
  assert.equal(problem, 'line 1 of test/unit/components/SignIn.test.ts is not "// @vitest-environment jsdom"')
  // The rule holds only as long as the skill gives that line, word for word.
  const folder = join(KIT_ROOT, '.cursor', 'skills', 'qa-unit')
  if (existsSync(folder)) {
    const texts = walkFiles(folder).map((file) => readFileSync(join(folder, file), 'utf8'))
    assert.ok(texts.some((text) => text.split(/\r?\n/)[0] === rule.firstLine), 'a template of qa-unit starts with that line')
    assert.ok(texts.some((text) => text.includes(`\`${rule.firstLine}\``)), 'the skill names that line')
  }
})

// A form with the same lines as /qa-heal and an example from another screen.
// The reference reply and the checks of the product-bug case must not need
// the skill to show the case's own answer.
const OTHER_SCREEN_FORM = [
  '```text',
  'Test: Saving the profile shows a confirmation, test/e2e/profile.spec.ts:41',
  'Class: Product bug',
  'Cause: the status shows "Saved!" and plan line 2.1 expects "Profile saved"',
  'Fix: test.fixme at test/e2e/profile.spec.ts:41, product bug at src/components/Profile.tsx:19',
  'Before: Received: "Saved!"',
  'After: QA-VERDICT: PASS-WITH-FIXME (passed 3, failed 0, skipped 0, fixme 1, files 1)',
  'Verdict: PASS',
  'Not checked: other browsers',
  '```',
].join('\n')

test('case e2e-heal-product-bug: nothing depends on the example the skill shows', () => {
  const testCase = loadCase('e2e-heal-product-bug')
  const form = replyForm(OTHER_SCREEN_FORM)
  assert.deepEqual(form.fields, Object.keys(testCase.reference.reply), 'the stand-in form has the lines of the reference reply')
  const reply = fillForm(form, testCase.reference.reply, {})
  for (const leftover of ['profile', 'Profile', 'Saved!', ':41', ':19']) assert.ok(!reply.includes(leftover), `no "${leftover}" from the example is in the reply`)
  const { bug, fixmeTest, file } = testCase.expect
  assert.ok(namesFileLine(reply, bug.file, bug.line), 'reply-bug passes on the reference reply alone')
  assert.deepEqual(judge(reply, 'PASS-WITH-FIXME'), ['pass', false])
  // The reference edit is the case's own text, and it fits the spec in the example.
  const [edit] = testCase.reference.edits
  assert.equal(count(example(file), edit.find), 1)
  assert.ok(edit.replace.includes(`// product bug: ${bug.file}:${bug.line} expected "${bug.expected}", got "${bug.got}"`) && edit.replace.includes(`test.fixme('${fixmeTest}'`))
  assert.deepEqual(answersInSkill(OTHER_SCREEN_FORM, testCase), [], 'a skill with an example from another screen gives nothing away')
  assert.deepEqual(answersInSkill(`// product bug: ${bug.file}:${bug.line} expected "x", got "${bug.got}"`, testCase), [`${bug.file}:${bug.line}`, `"${bug.got}"`])
  assert.deepEqual(answersInSkill(OTHER_SCREEN_FORM, loadCase('unit-ui')), [], 'a case without a planted bug has no answer to give away')
})

test('README: the commands work from any clone and say where runs belong', () => {
  const readme = readFileSync(join(EVAL_ROOT, 'README.md'), 'utf8')
  assert.ok(!readme.includes('~/cursor-qa-agents'), 'no command names a fixed place for the clone')
  for (const line of readme.split('\n').filter((entry) => /^\s*(node|agent) /.test(entry) || entry.includes('$(node '))) {
    assert.ok(!/node eval\//.test(line) || !/RUNS\/[\w-]+\/sandbox/.test(line), `a command that runs in a sandbox does not use a path relative to the clone: ${line.trim()}`)
  }
  for (const word of ['tmpfs', 'inode', '--clean', '--relink', '--running-servers', 'playwright-cli', 'browser-open', 'Google Chrome']) assert.ok(readme.includes(word), `the README says "${word}"`)
})

// --- The browser route: playwright-cli, no MCP server -----------------------------

test('environment note: the example has no list of browser tools, and its names are filled in', () => {
  const note = readFileSync(join(EVAL_ROOT, 'env-note.example.txt'), 'utf8')
  assert.ok(!/browser_|\bMCP\b|playwright-cli/i.test(note), 'the skills give the playwright-cli commands themselves')
  for (const word of ['{{SANDBOX}}', '{{BASE_URL}}', 'hook']) assert.ok(note.includes(word), `the note has ${word}`)
  const filled = fill(note, { SANDBOX: '/runs/run-01/sandbox', BASE_URL: 'http://localhost:3424' })
  assert.match(filled, /^- Your project folder is \/runs\/run-01\/sandbox\. /m)
  assert.match(filled, /^- The app server for this case: http:\/\/localhost:3424\. Do not start or stop a server\.$/m)
  assert.match(fill(note, { SANDBOX: '/x' }, 'none'), /^- The app server for this case: none\. /m, 'a case without a server')
})

test('cases and prompt: nothing names an MCP browser tool', () => {
  const files = [...listCaseIds().map((id) => join('cases', `${id}.json`)), 'prompt.mjs', 'env-note.example.txt']
  for (const file of files) {
    const text = readFileSync(join(EVAL_ROOT, file), 'utf8')
    assert.ok(!/browser_[a-z]|\bMCP\b|@playwright\/mcp/i.test(text), `${file} does not name an MCP tool, server, or package`)
  }
})

test('results note: explains every label and model in runs.jsonl', () => {
  const note = readFileSync(join(EVAL_ROOT, 'results', 'README.md'), 'utf8')
  const records = readRecords(readFileSync(join(EVAL_ROOT, 'results', 'runs.jsonl'), 'utf8'))
  assert.ok(records.length > 0)
  for (const key of ['label', 'model']) {
    for (const value of new Set(records.map((record) => record[key]))) {
      assert.ok(note.includes(`\`${value}\``), `eval/results/README.md names the ${key} \`${value}\`. Add it to the tables there`)
    }
  }
  for (const field of new Set(records.flatMap((record) => Object.keys(record)))) {
    assert.ok(note.includes(`\`${field}\``), `eval/results/README.md explains the field \`${field}\``)
  }
  for (const field of Object.keys(JSON.parse(recordLine({ case: 'x', kit: { source: 'working-tree', commit: 'abcdef1234', dirty: false }, score: {}, run: {}, reply: {}, checks: [] })))) {
    assert.ok(note.includes(`\`${field}\``), `eval/results/README.md explains the field \`${field}\` that score.mjs --record writes`)
  }
  assert.match(note, /^## Known problems with these rounds$/m)
  assert.match(note, /^<!-- results:round-3 -->$/m, 'the place for round 3 is marked')
})
