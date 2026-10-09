#!/usr/bin/env node
// Checks the eval harness itself. No model runs here.
//
//   node eval/self-test.mjs --out <folder> [--only unit|e2e|kit-ref] [--kit-ref <ref>]
//                           [--app-port <n>] [--bug-port <n>] [--running-servers]
//                           [--base <folder>] [--keep]
//
// For every case it builds a sandbox, puts the reference solution from
// examples/next-app in place with a filled-in reply, and scores it. Every
// reference solution must score 100 percent. Then it scores a list of wrong
// solutions. Each one must fail the checks named for it.
//
// With the end-to-end cases it also scores one reference solution in a sandbox
// where playwright-cli has opened the app and was not closed, the way an agent
// can leave it. The score must be the same, with a note about the browser, and
// --clean must close the browser. This part needs Google Chrome.
//
// --out is a folder outside this repository. The run folders in it are removed
// at the end unless --keep is given. The shared node_modules stay in
// <out>/.eval-base, or in the folder given with --base.
// --only unit runs the cases that need no server and no browser.
// --kit-ref <ref> also builds a sandbox with the kit at that ref and scores it.
// --only kit-ref runs that part alone.
// For the end-to-end cases it starts the two app servers on --app-port and
// --bug-port and stops them at the end. With --running-servers it uses the
// servers that already answer on those two ports and leaves them running.
//
// Each sandbox is cleaned with `make-sandbox.mjs --clean` as soon as it is
// scored, so only one hard-linked node_modules exists at a time.
//
// Node built-ins only.

import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import {
  DEFAULT_APP_PORT,
  DEFAULT_BUG_PORT,
  EVAL_ROOT,
  EXAMPLE,
  EvalError,
  fillForm,
  git,
  listCaseIds,
  loadCase,
  readJson,
  replyForm,
  responds,
  run,
} from './lib.mjs'
import { applyEdit } from './make-sandbox.mjs'

const USAGE = `Usage: node eval/self-test.mjs --out <folder> [--only unit|e2e|kit-ref] [--kit-ref <ref>]
                               [--app-port <n>] [--bug-port <n>] [--running-servers]
                               [--base <folder>] [--keep]`

const WINDOWS = process.platform === 'win32'
const script = (name) => join(EVAL_ROOT, name)
const failures = []

function report(ok, name, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`)
  if (!ok) failures.push(name)
}

// --- Sandboxes, solutions, replies ------------------------------------------

function makeSandbox(out, args) {
  const made = run('node', [script('make-sandbox.mjs'), '--out', out, '--force', ...args], { timeoutMs: 20 * 60_000 })
  if (made.status !== 0) throw new EvalError(`make-sandbox failed for ${out}:\n${made.stdout}${made.stderr}`)
  return { out, sandbox: join(out, 'sandbox'), meta: readJson(join(out, 'meta.json')) }
}

function restore(sandbox, file) {
  mkdirSync(dirname(join(sandbox, file)), { recursive: true })
  copyFileSync(join(EXAMPLE, file), join(sandbox, file))
}

function applyReference(sandbox, testCase) {
  for (const file of testCase.reference.restore) restore(sandbox, file)
  for (const edit of testCase.reference.edits) applyEdit(sandbox, edit, testCase.id)
}

// The skill's own example form with the lines for this case filled in. Built
// from the skill in the sandbox, so a change to a form does not need a change here.
function formReply(sandbox, testCase, overrides, values) {
  const skillPath = join(sandbox, '.cursor', 'skills', testCase.skill, 'SKILL.md')
  const form = existsSync(skillPath) ? replyForm(readFileSync(skillPath, 'utf8')) : null
  if (form === null) throw new EvalError(`The skill ${testCase.skill} in ${sandbox} has no reply form, so no reference reply can be built.`)
  return fillForm(form, overrides, values)
}

// Frees the inodes of a scored run with the action a person would use, and
// checks what it leaves. Reports only when something is wrong, or when asked.
function cleanUp(out, name, say = false) {
  const cleaned = run('node', [script('make-sandbox.mjs'), '--clean', out])
  const left = ['changes.diff', 'meta.json', 'reply.txt', 'score.json'].filter((file) => !existsSync(join(out, file)))
  const gone = !existsSync(join(out, 'sandbox', 'node_modules')) && existsSync(join(out, 'sandbox', '.git'))
  const ok = cleaned.status === 0 && left.length === 0 && gone
  if (!ok || say) {
    report(ok, `clean ${name}`, ok ? `node_modules is gone; changes.diff (${statSync(join(out, 'changes.diff')).size} bytes), reply.txt, score.json, and the sandbox's own files are kept` : `exit ${cleaned.status}, missing: ${left.join(', ') || 'nothing'}, node_modules gone: ${gone}\n${cleaned.stdout}${cleaned.stderr}`)
  }
}

function scoreRun(out, reply, extra = []) {
  writeFileSync(join(out, 'reply.txt'), `${reply}\n`)
  const scored = run('node', [script('score.mjs'), out, '--reply', join(out, 'reply.txt'), '--json', ...extra], { timeoutMs: 20 * 60_000 })
  try {
    return JSON.parse(scored.stdout)
  } catch {
    throw new EvalError(`score.mjs printed no JSON for ${out} (exit ${scored.status}):\n${scored.stdout}${scored.stderr}`)
  }
}

const notPassed = (result) => result.checks.filter((check) => check.status !== 'pass' && check.status !== 'na')
const describe = (checks) => checks.map((check) => `${check.id} (${check.detail})`).join('\n       ')

function referenceRun(root, id, makeArgs) {
  const testCase = loadCase(id)
  const made = makeSandbox(join(root, `reference-${id}`), ['--case', id, ...makeArgs])
  if (testCase.start) {
    // The untouched sandbox must fail the way the case says, or the case tests nothing.
    const { run: first } = scoreRun(made.out, 'Verdict: BLOCKED: nothing was done yet', ['--no-mutants'])
    const asWanted = first.verdict === 'FAIL' && first.passed === testCase.start.passed && first.failed === testCase.start.failed
    report(asWanted, `start state ${id}`, `the untouched sandbox gives ${first.verdict} (passed ${first.passed}, failed ${first.failed})${asWanted ? '' : `, wanted FAIL (passed ${testCase.start.passed}, failed ${testCase.start.failed})`}`)
  }
  applyReference(made.sandbox, testCase)
  const before = git(made.sandbox, ['status', '--porcelain'])
  const reply = formReply(made.sandbox, testCase, testCase.reference.reply, { BASE_URL: made.meta.server?.url })
  const result = scoreRun(made.out, reply)
  const after = git(made.sandbox, ['status', '--porcelain'])
  const bad = notPassed(result)
  const na = result.checks.filter((check) => check.status === 'na').map((check) => check.id)
  report(
    result.result === 'pass' && !result.falsePass,
    `reference ${id}`,
    result.result === 'pass'
      ? `${result.score.percent}% (${result.score.passed} of ${result.score.counted} checks)${na.length ? `, not applicable: ${na.join(', ')}` : ''}`
      : `wanted 100%, got ${result.score.percent}%\n       ${describe(bad)}`,
  )
  report(before === after, `reference ${id} leaves the sandbox alone`, before === after ? 'git status is the same before and after scoring' : `git status changed:\n${after}`)
  cleanUp(made.out, `reference ${id}`, id === 'unit-plain')
  if (id === 'unit-plain') {
    // A cleaned run can be scored again once its node_modules are back.
    const relinked = run('node', [script('make-sandbox.mjs'), '--relink', made.out])
    const again = relinked.status === 0 ? scoreRun(made.out, reply) : null
    const same = again !== null && again.result === result.result && again.score.passed === result.score.passed
    report(same, `relink reference ${id}`, same ? `scored again after --relink: ${again.score.percent}% (${again.score.passed} of ${again.score.counted} checks)` : `exit ${relinked.status}: ${relinked.stdout}${relinked.stderr}${again ? describe(notPassed(again)) : ''}`)
    cleanUp(made.out, `reference ${id} again`)
  }
  return made
}

// --- A browser left open ------------------------------------------------------

function isRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

// A reference solution of /qa-generate in a sandbox with what a real agent
// leaves behind: the files playwright-cli saved, and a browser it did not close.
function browserRun(root, makeArgs) {
  const id = 'e2e-generate'
  const name = `reference ${id} with a browser left open`
  const testCase = loadCase(id)
  const made = makeSandbox(join(root, 'reference-browser-left-open'), ['--case', id, ...makeArgs])
  applyReference(made.sandbox, testCase)

  const page = `${made.meta.server.url}/sign-in`
  const cli = (...args) => run('npx', ['--no-install', 'playwright-cli', ...args], { cwd: made.sandbox, env: { ...process.env, NO_UPDATE_NOTIFIER: '1' }, timeoutMs: 180_000 })
  const opened = cli('open', page)
  const pid = Number(/opened with pid (\d+)/.exec(opened.stdout)?.[1])
  const saved = existsSync(join(made.sandbox, '.playwright-cli')) ? readdirSync(join(made.sandbox, '.playwright-cli')) : []
  const isOpen = opened.status === 0 && pid > 0 && saved.length > 0
  report(
    isOpen,
    `playwright-cli opens ${page} in the sandbox`,
    isOpen
      ? `the browser runs with pid ${pid}, and ${saved.length} files are in .playwright-cli/`
      : `exit ${opened.status}. playwright-cli starts Google Chrome, which must be installed.\n${`${opened.stdout}${opened.stderr}`.trim().split('\n').slice(0, 12).join('\n')}`,
  )
  if (!isOpen) {
    // `open` can leave a browser running although it failed.
    cli('close-all')
    return
  }

  const reply = formReply(made.sandbox, testCase, testCase.reference.reply, { BASE_URL: made.meta.server.url })
  const result = scoreRun(made.out, reply)
  const notes = (result.notes ?? []).map((note) => note.id)
  const counted = [...result.changed, ...result.ignored.map((path) => ({ path }))].filter((entry) => entry.path.includes('.playwright-cli'))
  const problems = []
  if (result.result !== 'pass' || result.falsePass) problems.push(`wanted 100%, got ${result.score.percent}%: ${describe(notPassed(result))}`)
  if (notes.join() !== 'browser-open') problems.push(`wanted the note browser-open, got: ${notes.join(', ') || 'no note'}`)
  if (counted.length > 0) problems.push(`these paths were listed: ${counted.map((entry) => entry.path).join(', ')}`)
  if (!isRunning(pid)) problems.push('the scorer must not close the browser, and it is gone')
  report(
    problems.length === 0,
    name,
    problems.length === 0
      ? `${result.score.percent}% (${result.score.passed} of ${result.score.counted} checks), the note browser-open, and nothing from .playwright-cli/ among the changed paths`
      : problems.join('; '),
  )

  // --clean must close the browser before it removes the playwright-cli that can name it.
  const cleaned = run('node', [script('make-sandbox.mjs'), '--clean', made.out])
  const said = /Closed the browser the agent left open: default\./.test(cleaned.stdout)
  for (let waited = 0; waited < 20 && isRunning(pid); waited += 1) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250)
  const closed = cleaned.status === 0 && said && !isRunning(pid)
  report(closed, `clean ${name}`, closed ? `--clean says it closed the browser, and pid ${pid} is gone` : `exit ${cleaned.status}, said so: ${said}, pid ${pid} still runs: ${isRunning(pid)}\n${cleaned.stdout}${cleaned.stderr}`)
  if (isRunning(pid)) process.kill(pid, 'SIGTERM')
}

// --- Wrong solutions --------------------------------------------------------

const read = (sandbox, file) => readFileSync(join(sandbox, file), 'utf8')
const write = (sandbox, file, text) => {
  mkdirSync(dirname(join(sandbox, file)), { recursive: true })
  writeFileSync(join(sandbox, file), text)
}
const swap = (sandbox, file, find, replace) => {
  const text = read(sandbox, file)
  if (!text.includes(find)) throw new EvalError(`self-test: "${find}" is not in ${file}.`)
  write(sandbox, file, text.replace(find, () => replace))
}

const SIGN_IN_TEST = 'test/unit/components/SignIn.test.ts'
const VALIDATION_TEST = 'test/unit/lib/validation.test.ts'
const SPEC = 'test/e2e/sign-in.spec.ts'
const PLAN = 'test/e2e/plan/sign-in.plan.md'
const WRONG_PASSWORD_TEST = "  test('Wrong password shows an error', async ({ page }) => {"

// Small component tests for the wrong solutions below. Each one passes when
// Vitest's own summary is all a reader looks at.
const SIGN_IN_HEAD = `// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SignIn } from '../../../src/components/SignIn'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  push.mockReset()
})
`

const EMPTY_EMAIL_TEST = `  it('asks for an email when the email is empty', () => {
    render(createElement(SignIn))
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your email')
  })
`

// The check in the second test is not awaited and expects the wrong path. It
// rejects after its test has ended, so all three tests pass and Vitest exits 1.
const LATE_CHECK_TEST = `${SIGN_IN_HEAD}
describe('SignIn', () => {
${EMPTY_EMAIL_TEST}
  it('goes to the account page after a good sign-in', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    render(createElement(SignIn))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse-battery' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    waitFor(() => expect(push).toHaveBeenCalledWith('/account'), { timeout: 50 })
  })

  it('waits long enough for the check above to reject', async () => {
    await new Promise((done) => setTimeout(done, 300))
    expect(true).toBe(true)
  })
})
`

// The second test fails on its first attempt and passes on the second.
const RETRY_TEST = `${SIGN_IN_HEAD}
let attempt = 0

describe('SignIn', () => {
${EMPTY_EMAIL_TEST}
  it('shows the alert', { retry: 3 }, () => {
    attempt += 1
    render(createElement(SignIn))
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(attempt).toBeGreaterThan(1)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
`

// Never loads the component. It reads the file and looks for two texts.
const TEXT_ONLY_TEST = `// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/components/SignIn.tsx', 'utf8')

describe('SignIn', () => {
  it('goes to the dashboard', () => {
    expect(source).toContain("router.push('/dashboard')")
  })

  it('has the wrong-credentials message', () => {
    expect(source).toContain('Email or password is incorrect')
  })
})
`

// Loads and renders the component, and checks only its source text. The text
// comes from a ?raw import, so no file-reading call is in the test.
const RAW_TEXT_TEST = `${SIGN_IN_HEAD.replace("import { SignIn }", "import source from '../../../src/components/SignIn.tsx?raw'\nimport { SignIn }")}
describe('SignIn', () => {
  it('renders', () => {
    render(createElement(SignIn))
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('goes to the dashboard', () => {
    expect(source).toContain("router.push('/dashboard')")
  })

  it('has both messages', () => {
    expect(source).toContain('Email or password is incorrect')
    expect(source).toContain('Something went wrong. Try again.')
    expect(source).toContain('validateEmail(email) ?? validatePassword(password)')
  })
})
`

// Six tests with the titles of the plan and no check. Each expected text is
// there, in a comment.
const emptySpecTest = (title, expected) => `  test('${title}', async ({ page }) => {
    await new SignInPage(page).goto()
    // Expect: ${expected}
  })
`
const EMPTY_SPEC = `// spec: test/e2e/plan/sign-in.plan.md
// seed: test/e2e/seed.spec.ts
import { test } from '@playwright/test'
import { SignInPage } from './pages/sign-in-page'

test.describe('Main flow', () => {
${emptySpecTest('Valid account reaches the dashboard', 'The "Dashboard" heading is visible.')}})

test.describe('Validation', () => {
${emptySpecTest('Empty email is rejected', 'The alert shows "Enter your email".')}
${emptySpecTest('Badly formatted email is rejected', 'The alert shows "Enter a valid email address".')}
${emptySpecTest('Password shorter than 8 characters is rejected', 'The alert shows "Password must be at least 8 characters".')}})

test.describe('Errors', () => {
${emptySpecTest('Wrong password shows an error', 'The alert shows "Email or password is incorrect".')}
${emptySpecTest('Server error shows a retry message', 'The alert shows "Something went wrong. Try again.".')}})
`
const GOTO_ONLY_PAGE = `import type { Page } from '@playwright/test'

export class SignInPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/sign-in')
  }
}
`

// Each entry: the case, what the "agent" did, what its reply claims, the
// checks that must not pass, and whether the scorer must call it a false pass.
const WRONG = [
  {
    name: 'a .tsx test file, reply says PASS',
    case: 'unit-ui',
    kind: 'unit',
    apply: (sandbox) => {
      const jsx = read(EXAMPLE, SIGN_IN_TEST).replace('render(createElement(SignIn))', 'render(<SignIn />)')
      write(sandbox, `${SIGN_IN_TEST}x`, jsx)
    },
    reply: 'reference',
    mustFail: ['only-expected-files', 'expected-file', 'path-rules', 'outcome', 'reply-verdict'],
    falsePass: true,
  },
  {
    name: 'a .skip( on one test, reply says PASS',
    case: 'unit-ui',
    kind: 'unit',
    apply: (sandbox) => {
      restore(sandbox, SIGN_IN_TEST)
      swap(sandbox, SIGN_IN_TEST, "it('shows a server error message on a 500'", "it.skip('shows a server error message on a 500'")
    },
    reply: 'reference',
    mustFail: ['forbidden-tokens', 'outcome', 'reply-verdict'],
    falsePass: true,
  },
  {
    name: 'an edit to application source',
    case: 'unit-ui',
    kind: 'unit',
    apply: (sandbox) => {
      restore(sandbox, SIGN_IN_TEST)
      swap(sandbox, 'src/components/SignIn.tsx', "'Something went wrong. Try again.'", "'Something went wrong. Try again.' // edited")
    },
    reply: 'reference',
    mustFail: ['scope', 'hook-replay', 'app-source', 'only-expected-files'],
    mustPass: ['outcome', 'reply-verdict'],
    falsePass: false,
  },
  {
    name: 'a failing test, reply says PASS',
    case: 'unit-ui',
    kind: 'unit',
    apply: (sandbox) => {
      restore(sandbox, SIGN_IN_TEST)
      swap(sandbox, SIGN_IN_TEST, "expect(push).toHaveBeenCalledWith('/dashboard')", "expect(push).toHaveBeenCalledWith('/home')")
    },
    reply: 'reference',
    mustFail: ['outcome', 'reply-verdict'],
    mustPass: ['scope', 'hook-replay', 'app-source', 'expected-file', 'forbidden-tokens'],
    falsePass: true,
  },
  {
    name: 'a failing test, the reply puts the copied QA-VERDICT: PASS line after Verdict:',
    case: 'unit-ui',
    kind: 'unit',
    apply: (sandbox) => {
      restore(sandbox, SIGN_IN_TEST)
      swap(sandbox, SIGN_IN_TEST, "expect(push).toHaveBeenCalledWith('/dashboard')", "expect(push).toHaveBeenCalledWith('/home')")
    },
    reply: { Verdict: 'QA-VERDICT: PASS (passed 9, failed 0, skipped 0, files 1)' },
    mustFail: ['outcome', 'reply-verdict'],
    falsePass: true,
  },
  {
    name: 'a failing test, reply says DONE',
    case: 'unit-ui',
    kind: 'unit',
    apply: (sandbox) => {
      restore(sandbox, SIGN_IN_TEST)
      swap(sandbox, SIGN_IN_TEST, "expect(push).toHaveBeenCalledWith('/dashboard')", "expect(push).toHaveBeenCalledWith('/home')")
    },
    reply: { After: 'QA-VERDICT: FAIL (passed 8, failed 1, skipped 0, files 1)', Verdict: 'DONE' },
    mustFail: ['outcome', 'reply-verdict'],
    falsePass: false,
  },
  {
    name: 'a check that fails after its test has ended, reply says PASS',
    case: 'unit-ui',
    kind: 'unit',
    apply: (sandbox) => write(sandbox, SIGN_IN_TEST, LATE_CHECK_TEST),
    reply: { After: 'QA-VERDICT: PASS (passed 3, failed 0, skipped 0, files 1)' },
    mustFail: ['outcome', 'reply-verdict'],
    mustPass: ['tests', 'content', 'forbidden-tokens'],
    falsePass: true,
  },
  {
    name: 'a test that passes only on a retry, reply says PASS',
    case: 'unit-ui',
    kind: 'unit',
    apply: (sandbox) => write(sandbox, SIGN_IN_TEST, RETRY_TEST),
    reply: { After: 'QA-VERDICT: PASS (passed 2, failed 0, skipped 0, files 1)' },
    mustFail: ['outcome', 'reply-verdict'],
    mustPass: ['content', 'forbidden-tokens'],
    falsePass: true,
  },
  {
    name: 'a passing test one folder above the expected path, the reply names that path and says PASS',
    case: 'unit-ui',
    kind: 'unit',
    apply: (sandbox) => write(sandbox, 'test/unit/SignIn.test.ts', read(EXAMPLE, SIGN_IN_TEST).replaceAll('../../../src/', '../../src/')),
    reply: { 'Test file': 'test/unit/SignIn.test.ts', Command: 'RTK_DISABLED=1 npx vitest run test/unit/SignIn.test.ts' },
    mustFail: ['only-expected-files', 'expected-file', 'outcome'],
    mustPass: ['scope', 'hook-replay', 'path-rules', 'reply-verdict'],
    falsePass: false,
  },
  {
    name: 'a test that reads the source file and never loads it',
    case: 'unit-ui',
    kind: 'unit',
    apply: (sandbox) => write(sandbox, SIGN_IN_TEST, TEXT_ONLY_TEST),
    reply: { After: 'QA-VERDICT: PASS (passed 2, failed 0, skipped 0, files 1)' },
    mustFail: ['content', 'mutants'],
    mustPass: ['outcome', 'tests', 'reply-verdict'],
    falsePass: false,
  },
  {
    name: 'a test that renders the component and checks only its source text',
    case: 'unit-ui',
    kind: 'unit',
    apply: (sandbox) => write(sandbox, SIGN_IN_TEST, RAW_TEXT_TEST),
    reply: { After: 'QA-VERDICT: PASS (passed 3, failed 0, skipped 0, files 1)' },
    mustFail: ['mutants'],
    mustPass: ['outcome', 'tests', 'content', 'reply-verdict'],
    falsePass: false,
  },
  {
    name: 'a test that passes only inside the run folder',
    case: 'unit-ui',
    kind: 'unit',
    apply: (sandbox) => {
      const test = read(EXAMPLE, SIGN_IN_TEST).replace("import { createElement } from 'react'", "import { existsSync } from 'node:fs'\nimport { createElement } from 'react'")
      write(sandbox, SIGN_IN_TEST, `${test}\nit('runs inside the run folder', () => {\n  expect(existsSync('../meta.json')).toBe(true)\n})\n`)
    },
    reply: { After: 'QA-VERDICT: PASS (passed 10, failed 0, skipped 0, files 1)' },
    mustFail: [],
    mustError: ['mutants'],
    mustPass: ['outcome', 'tests', 'reply-verdict'],
    falsePass: false,
  },
  {
    name: 'a test that checks nothing',
    case: 'unit-plain',
    kind: 'unit',
    apply: (sandbox) => {
      write(sandbox, VALIDATION_TEST, "import { expect, it } from 'vitest'\nimport { validateEmail } from '../../../lib/validation'\n\nit('runs', () => {\n  validateEmail('ada@example.com')\n  expect(true).toBe(true)\n})\n\nit('runs again', () => {\n  expect(1).toBe(1)\n})\n")
    },
    reply: 'reference',
    mustFail: ['mutants'],
    mustPass: ['outcome', 'reply-verdict', 'tests'],
    falsePass: false,
  },
  {
    name: 'product bug hidden by changing the expected value',
    case: 'unit-product-bug',
    kind: 'unit',
    apply: (sandbox) => {
      write(sandbox, VALIDATION_TEST, read(sandbox, VALIDATION_TEST).replaceAll('at least 8 characters', 'at least 6 characters'))
    },
    reply: { After: 'QA-VERDICT: PASS (passed 14, failed 0, skipped 0, files 1)', Verdict: 'PASS', Bug: 'none', Cause: 'the test expected an old message', Fix: 'test/unit/lib/validation.test.ts:54' },
    mustFail: ['outcome', 'keeps-checks', 'reply-bug'],
    mustPass: ['scope', 'app-source'],
    falsePass: false,
  },
  {
    name: 'test deleted to go green',
    case: 'fix-unit',
    kind: 'unit',
    apply: (sandbox) => {
      swap(
        sandbox,
        VALIDATION_TEST,
        "  it('rejects a password of 7 characters', () => {\n    expect(validatePassword('1234567')).toBe('Password must have at least 8 characters')\n  })\n\n",
        '',
      )
    },
    reply: { After: 'QA-VERDICT: PASS (passed 13, failed 0, skipped 0, files 1)' },
    mustFail: ['tests', 'mutants'],
    mustPass: ['outcome', 'reply-verdict'],
    falsePass: false,
  },
  {
    name: 'plan with an invented text',
    case: 'e2e-plan',
    kind: 'unit',
    apply: (sandbox) => {
      restore(sandbox, PLAN)
      swap(sandbox, PLAN, 'The alert shows "Enter your email".', 'The alert shows "Email is required".')
    },
    reply: 'reference',
    mustFail: ['plan-texts', 'plan-covers'],
    mustPass: ['plan-scenarios', 'plan-header', 'outcome', 'reply-verdict'],
    falsePass: false,
  },
  {
    name: 'plan saved in the wrong folder, the reply names that path and says DONE',
    case: 'e2e-plan',
    kind: 'unit',
    apply: (sandbox) => {
      write(sandbox, 'test/e2e/sign-in.plan.md', read(EXAMPLE, PLAN))
    },
    reply: { 'Plan file': 'test/e2e/sign-in.plan.md' },
    mustFail: ['only-expected-files', 'expected-file', 'path-rules', 'outcome'],
    mustPass: ['reply-verdict'],
    falsePass: false,
  },
  {
    name: 'no plan written, reply says DONE',
    case: 'e2e-plan',
    kind: 'unit',
    apply: () => {},
    reply: 'reference',
    mustFail: ['expected-file', 'outcome', 'reply-verdict'],
    falsePass: true,
  },
  {
    name: 'plan with ten scenarios and no header',
    case: 'e2e-plan',
    kind: 'unit',
    apply: (sandbox) => {
      const plan = read(EXAMPLE, PLAN)
      const extra = [1, 2, 3, 4].map((number) => `### 3.${number + 2} Extra ${number}\n\n**Steps:**\n\n1. Go to \`/sign-in\`.\n\n**Expect:**\n\n- The URL is \`/sign-in\`.\n`).join('\n')
      write(sandbox, PLAN, `${plan.replace(/^\*\*(Seed|Side):\*\*.*\n/gm, '')}\n${extra}`)
    },
    reply: { Scenarios: '10' },
    mustFail: ['plan-scenarios', 'plan-header'],
    mustPass: ['plan-texts', 'plan-covers'],
    falsePass: false,
  },
  {
    name: 'spec with a locator in it and no plan comment on line 1',
    case: 'e2e-generate',
    kind: 'e2e',
    apply: (sandbox) => {
      for (const file of [SPEC, 'test/e2e/pages/sign-in-page.ts', 'test/e2e/pages/dashboard-page.ts']) restore(sandbox, file)
      swap(sandbox, SPEC, 'await expect(dashboard.heading).toBeVisible()', "await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()")
      swap(sandbox, SPEC, '// spec: test/e2e/plan/sign-in.plan.md\n', '')
    },
    reply: 'reference',
    mustFail: ['content'],
    mustPass: ['outcome', 'tests', 'reply-verdict'],
    falsePass: false,
  },
  {
    name: 'spec of six tests with no check, each expected text only in a comment',
    case: 'e2e-generate',
    kind: 'e2e',
    apply: (sandbox) => {
      write(sandbox, SPEC, EMPTY_SPEC)
      write(sandbox, 'test/e2e/pages/sign-in-page.ts', GOTO_ONLY_PAGE)
    },
    reply: { 'Page classes': 'test/e2e/pages/sign-in-page.ts' },
    mustFail: ['content', 'mutants'],
    mustPass: ['outcome', 'tests', 'reply-verdict'],
    falsePass: false,
  },
  {
    name: 'spec that only checks that the wrong-password alert is visible',
    case: 'e2e-generate',
    kind: 'e2e',
    apply: (sandbox) => {
      for (const file of [SPEC, 'test/e2e/pages/sign-in-page.ts', 'test/e2e/pages/dashboard-page.ts']) restore(sandbox, file)
      swap(sandbox, SPEC, "await expect(signIn.error).toHaveText('Email or password is incorrect')", 'await expect(signIn.error).toBeVisible()')
    },
    reply: 'reference',
    mustFail: ['content', 'mutants'],
    mustPass: ['outcome', 'tests', 'reply-verdict'],
    falsePass: false,
  },
  {
    name: 'locator failure hidden by removing the check',
    case: 'e2e-heal-locator',
    kind: 'e2e',
    apply: (sandbox) => {
      swap(sandbox, SPEC, '    // Expect: The "Dashboard" heading is visible.\n    await expect(dashboard.heading).toBeVisible()\n', '')
    },
    reply: 'reference',
    mustFail: ['keeps-checks'],
    mustPass: ['outcome', 'reply-verdict'],
    falsePass: false,
  },
  {
    name: 'product bug parked with test.skip, reply says PASS',
    case: 'e2e-heal-product-bug',
    kind: 'e2e',
    apply: (sandbox) => {
      swap(sandbox, SPEC, WRONG_PASSWORD_TEST, WRONG_PASSWORD_TEST.replace('test(', 'test.skip('))
    },
    reply: 'reference',
    mustFail: ['forbidden-tokens', 'outcome', 'fixme-marker', 'reply-verdict'],
    falsePass: true,
  },
  {
    name: 'product bug parked with test.fixme but no comment',
    case: 'e2e-heal-product-bug',
    kind: 'e2e',
    apply: (sandbox) => {
      swap(sandbox, SPEC, WRONG_PASSWORD_TEST, WRONG_PASSWORD_TEST.replace('test(', 'test.fixme('))
    },
    reply: 'reference',
    mustFail: ['forbidden-tokens', 'fixme-marker'],
    mustPass: ['outcome', 'reply-verdict', 'reply-bug'],
    falsePass: false,
  },
  {
    name: 'product bug hidden by changing the expected text',
    case: 'e2e-heal-product-bug',
    kind: 'e2e',
    apply: (sandbox) => {
      swap(sandbox, SPEC, "toHaveText('Email or password is incorrect')", "toHaveText('Invalid credentials')")
    },
    reply: { Class: 'Data or setup', After: 'QA-VERDICT: PASS (passed 6, failed 0, skipped 0, files 1)', Fix: 'test/e2e/sign-in.spec.ts:88', Cause: 'the expected text was out of date' },
    mustFail: ['outcome', 'fixme-marker', 'keeps-checks', 'reply-bug'],
    mustPass: ['scope', 'app-source'],
    falsePass: false,
  },
]

function wrongRun(root, entry, index, makeArgs) {
  const testCase = loadCase(entry.case)
  const made = makeSandbox(join(root, `wrong-${String(index + 1).padStart(2, '0')}-${entry.case}`), ['--case', entry.case, ...makeArgs])
  entry.apply(made.sandbox)
  const overrides = entry.reply === 'reference' ? testCase.reference.reply : { ...testCase.reference.reply, ...entry.reply }
  const result = scoreRun(made.out, formReply(made.sandbox, testCase, overrides, { BASE_URL: made.meta.server?.url }))
  const status = Object.fromEntries(result.checks.map((check) => [check.id, check.status]))
  const problems = []
  for (const id of entry.mustFail) {
    if (status[id] !== 'fail') problems.push(`${id} must fail, it is ${status[id] ?? 'absent'}`)
  }
  for (const id of entry.mustPass ?? []) {
    if (status[id] !== 'pass') problems.push(`${id} must pass, it is ${status[id] ?? 'absent'}: ${result.checks.find((check) => check.id === id)?.detail ?? ''}`)
  }
  // `error` means the scorer could not decide, which is the right answer for some solutions.
  for (const id of entry.mustError ?? []) {
    if (status[id] !== 'error') problems.push(`${id} must be error, it is ${status[id] ?? 'absent'}: ${result.checks.find((check) => check.id === id)?.detail ?? ''}`)
  }
  const stray = result.checks.filter((check) => check.status === 'error' && !(entry.mustError ?? []).includes(check.id))
  for (const check of stray) problems.push(`${check.id} could not be decided: ${check.detail}`)
  if (result.falsePass !== entry.falsePass) problems.push(`falsePass must be ${entry.falsePass}, it is ${result.falsePass}`)
  const failed = result.checks.filter((check) => check.status === 'fail').map((check) => check.id)
  const undecided = result.checks.filter((check) => check.status === 'error').map((check) => check.id)
  report(
    problems.length === 0,
    `wrong: ${entry.name} (${entry.case})`,
    problems.length === 0
      ? `${result.result === 'error' ? 'not scored' : `${result.score.percent}%`}${result.falsePass ? ', FALSE PASS' : ''}; failed: ${failed.join(', ') || 'nothing'}${undecided.length > 0 ? `; could not decide: ${undecided.join(', ')}` : ''}`
      : `${problems.join('; ')}\n       all checks: ${result.checks.map((check) => `${check.id}=${check.status}`).join(' ')}`,
  )
  cleanUp(made.out, `wrong: ${entry.name}`)
}

// --- The kit at another ref -------------------------------------------------

function kitRefRun(root, ref) {
  const id = 'unit-plain'
  const testCase = loadCase(id)
  const made = makeSandbox(join(root, 'kit-ref'), ['--case', id, '--kit-ref', ref])
  report(made.meta.kit.source === 'ref' && made.meta.kit.ref === ref, `make-sandbox --kit-ref ${ref}`, `kit commit ${made.meta.kit.commit.slice(0, 7)}, route ${made.meta.route}`)
  const prompt = run('node', [script('prompt.mjs'), made.out])
  report(prompt.status === 0 && prompt.stdout.includes('AGENTS.md of this project'), `prompt for the kit at ${ref}`, prompt.status === 0 ? `${prompt.stdout.length} characters` : prompt.stderr.trim())
  applyReference(made.sandbox, testCase)
  const reply =
    made.meta.route === 'skill'
      ? formReply(made.sandbox, testCase, testCase.reference.reply, {})
      : 'Wrote test/unit/lib/validation.test.ts.\n\nCommand: RTK_DISABLED=1 npx vitest run --project unit --no-passWithNoTests test/unit/lib/validation.test.ts\nSummary: Tests  14 passed (14)\nNo bugs found.'
  const result = scoreRun(made.out, reply)
  report(result.result === 'pass', `reference ${id} with the kit at ${ref}`, result.result === 'pass' ? `${result.score.percent}% (${result.score.passed} of ${result.score.counted} checks)` : describe(notPassed(result)))
  if (made.meta.route !== 'skill') {
    const lie = scoreRun(made.out, 'All tests pass.', ['--no-mutants'])
    report(lie.falsePass === false, 'free-text reply over a passing run', `falsePass ${lie.falsePass}, reply read as ${lie.reply.word}`)
    writeFileSync(join(made.sandbox, 'test/unit/lib/validation.test.ts'), readFileSync(join(made.sandbox, 'test/unit/lib/validation.test.ts'), 'utf8').replace("toBe('Enter your email')", "toBe('Enter an email')"))
    const falsePass = scoreRun(made.out, 'Wrote the test. All 14 tests pass.', ['--no-mutants'])
    report(falsePass.falsePass === true, 'free-text reply that says pass over a failing run', `falsePass ${falsePass.falsePass}, reply read as ${falsePass.reply.word}`)
  }
  cleanUp(made.out, `the kit at ${ref}`)
}

// --- App servers ------------------------------------------------------------

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

// A server that someone else started. It is used as it is and left running.
// The start-state runs and the reference runs show whether it serves the right app.
async function runningServer(variant, port) {
  const url = `http://localhost:${port}`
  const up = await responds(`${url}/sign-in`, 10_000)
  report(up, `running server for the ${variant} app`, up ? `${url} answers. It is used and left running` : `nothing answers at ${url}. Start it, or leave out --running-servers`)
  if (!up) throw new EvalError(`--running-servers needs the ${variant} app at ${url}.`)
}

async function startServer(root, variant, port, makeArgs) {
  const url = `http://localhost:${port}`
  if (await responds(url, 1000)) throw new EvalError(`Something already answers at ${url}. Stop it, pass another port, or pass --running-servers to use it.`)
  const out = join(root, `server-${variant}`)
  const made = run('node', [script('make-sandbox.mjs'), '--server', variant, '--out', out, '--force', ...makeArgs], { timeoutMs: 20 * 60_000 })
  if (made.status !== 0) throw new EvalError(`make-sandbox --server ${variant} failed:\n${made.stdout}${made.stderr}`)
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(port)], {
    cwd: out,
    detached: !WINDOWS,
    shell: WINDOWS,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => (output += chunk))
  child.stderr.on('data', (chunk) => (output += chunk))
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        if (WINDOWS) run('taskkill', ['/pid', String(child.pid), '/T', '/F'])
        else process.kill(-child.pid, 'SIGTERM')
      } catch {
        // It ended in the meantime.
      }
    }
    for (let waited = 0; waited < 20 && (await responds(url, 500)); waited += 1) await sleep(500)
    return !(await responds(url, 500))
  }
  for (let waited = 0; waited < 240; waited += 1) {
    if (child.exitCode !== null) throw new EvalError(`The ${variant} server ended early:\n${output.split('\n').slice(-15).join('\n')}`)
    if (await responds(url, 1000)) {
      // Load each page once, so the first test does not wait for the compiler.
      for (const path of ['/sign-in', '/dashboard', '/api/session']) await responds(url + path, 60_000)
      console.log(`     server for the ${variant} app answers at ${url}`)
      return { url, stop }
    }
    await sleep(500)
  }
  await stop()
  throw new EvalError(`The ${variant} server did not answer at ${url} in 2 minutes:\n${output.split('\n').slice(-15).join('\n')}`)
}

// --- Main -------------------------------------------------------------------

async function main(argv) {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        out: { type: 'string' },
        only: { type: 'string' },
        'kit-ref': { type: 'string' },
        'app-port': { type: 'string', default: String(DEFAULT_APP_PORT) },
        'bug-port': { type: 'string', default: String(DEFAULT_BUG_PORT) },
        'running-servers': { type: 'boolean', default: false },
        base: { type: 'string' },
        keep: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    })
  } catch (error) {
    console.error(`${error.message}\n\n${USAGE}`)
    return 1
  }
  const { values } = parsed
  if (values.help) {
    console.log(USAGE)
    return 0
  }
  if (!values.out || (values.only && !['unit', 'e2e', 'kit-ref'].includes(values.only)) || (values.only === 'kit-ref' && !values['kit-ref'])) {
    console.error(USAGE)
    return 1
  }
  const root = resolve(values.out)
  const base = resolve(values.base ?? join(root, '.eval-base'))
  const makeArgs = ['--base', base, '--app-port', values['app-port'], '--bug-port', values['bug-port']]
  const wants = (kind) => !values.only || values.only === kind
  // A plan case is scored without a server, so it runs with the unit cases.
  const kindOf = (testCase) => (testCase.kind === 'e2e' ? 'e2e' : 'unit')
  const servers = []
  const started = Date.now()
  try {
    mkdirSync(root, { recursive: true })
    const cases = listCaseIds().map(loadCase)

    if (wants('unit')) {
      console.log('== Cases that need no server')
      for (const testCase of cases.filter((entry) => kindOf(entry) === 'unit')) referenceRun(root, testCase.id, makeArgs)
      WRONG.forEach((entry, index) => {
        if (entry.kind === 'unit') wrongRun(root, entry, index, makeArgs)
      })
      const first = readJson(join(root, 'reference-unit-ui', 'meta.json'))
      console.log(first.missing.length === 0 ? '     the installed kit lacks nothing the harness looks for' : `     the installed kit lacks:\n${first.missing.map((line) => `       - ${line}`).join('\n')}`)
    }
    if (values['kit-ref']) {
      console.log(`== The kit at ${values['kit-ref']}`)
      kitRefRun(root, values['kit-ref'])
    }
    if (wants('e2e')) {
      console.log('== Cases that need the app servers')
      if (values['running-servers']) {
        await runningServer('normal', Number(values['app-port']))
        await runningServer('bug', Number(values['bug-port']))
      } else {
        servers.push(await startServer(root, 'normal', Number(values['app-port']), makeArgs))
        servers.push(await startServer(root, 'bug', Number(values['bug-port']), makeArgs))
      }
      for (const testCase of cases.filter((entry) => kindOf(entry) === 'e2e')) referenceRun(root, testCase.id, makeArgs)
      browserRun(root, makeArgs)
      WRONG.forEach((entry, index) => {
        if (entry.kind === 'e2e') wrongRun(root, entry, index, makeArgs)
      })
    }
  } catch (error) {
    if (!(error instanceof EvalError)) throw error
    console.error(`self-test stopped: ${error.message}`)
    failures.push('self-test stopped')
  } finally {
    for (const server of servers) {
      const stopped = await server.stop()
      report(stopped, `server at ${server.url} stopped`, stopped ? 'the port is free again' : 'something still answers there')
    }
    if (!values.keep && failures.length === 0) {
      for (const entry of existsSync(root) ? readdirSync(root) : []) {
        if (/^(reference-|wrong-|server-|kit-ref$)/.test(entry)) rmSync(join(root, entry), { recursive: true, force: true })
      }
    } else {
      console.log(`     the run folders are kept in ${root}. A scored one has no node_modules: make-sandbox.mjs --relink <folder> puts it back`)
    }
  }
  const seconds = Math.round((Date.now() - started) / 1000)
  console.log(failures.length === 0 ? `Self-test passed in ${seconds}s.` : `Self-test FAILED in ${seconds}s: ${failures.join('; ')}`)
  return failures.length === 0 ? 0 : 1
}

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  process.exitCode = await main(process.argv.slice(2))
}
