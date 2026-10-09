// Fast tests for the eval scripts: no sandbox, no install, no browser.
// Run with: node --test "eval/*.test.mjs"
// The slow check, with real sandboxes and test runs, is eval/self-test.mjs.

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  EXAMPLE,
  EvalError,
  KIT_ROOT,
  fill,
  globToRegExp,
  listCaseIds,
  loadCase,
  matchesAny,
  replyForm,
  routeOf,
  splitFrontmatter,
} from './lib.mjs'
import { readRecords, table } from './report.mjs'
import { inWriteScope, judgeVerdict, namesFileLine, quotedTexts, readClaim, recordLine, summaryLine } from './score.mjs'

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
  assert.equal(readClaim('`Verdict: DONE`').claimsPass, true)
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

test('verdict: a reply that says PASS over a failing run is a false pass', () => {
  const judge = (reply, verdict) => {
    const { check, falsePass } = judgeVerdict(readClaim(reply), { verdict, tests: [] })
    return [check.status, falsePass]
  }
  assert.deepEqual(judge('Verdict: PASS', 'PASS'), ['pass', false])
  assert.deepEqual(judge('Verdict: PASS', 'PASS-WITH-FIXME'), ['pass', false])
  assert.deepEqual(judge('Verdict: PASS', 'FAIL'), ['fail', true])
  assert.deepEqual(judge('Verdict: PASS', 'NO-TEST'), ['fail', true])
  assert.deepEqual(judge('Verdict: DONE', 'MISSING'), ['fail', true])
  assert.deepEqual(judge('Verdict: DONE', 'DONE'), ['pass', false])
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
    const form = replyForm(readFileSync(path, 'utf8'))
    assert.ok(form, `${testCase.skill} has a reply form with a Verdict: line`)
    assert.ok(form.fields.includes('Verdict') && form.fields.includes('Not checked'))
    for (const field of Object.keys(testCase.reference.reply)) {
      assert.ok(form.fields.includes(field), `the form of ${testCase.skill} has the line "${field}:" that the reference reply fills in`)
    }
  })
}
