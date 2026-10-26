# QA manual for web apps

This manual is for a QA engineer, or a developer doing QA, in a React or Next.js app that has the kit installed. It says which test to ask for, how to run each everyday job with the agent, and how to check what the agent wrote.

The kit is a set of skills and a hook for Cursor's agent. In a web app the agent writes Vitest unit and integration tests and Playwright end-to-end tests. It reads your application source and never edits it. When a test fails because the product is wrong, it reports the bug and leaves the test as it is. Every test run ends with one `QA-VERDICT:` line, and the agent copies that line into its reply.

New to the kit? Start with [[Installation]] and [[Getting started]]. [[Skills and example prompts]] lists every prompt each skill takes.

## What the kit covers

| You want | The kit does it | Skill |
| --- | --- | --- |
| A unit test for a component, such as `src/components/ProfileForm.tsx` | Yes. 2 to 6 tests in one file, with jsdom | `/qa-unit` |
| A unit test for plain functions, such as `lib/format.ts` | Yes. 2 to 6 tests in one file, in Node | `/qa-unit` |
| An integration test for a route handler, such as `app/api/profile/route.ts` | Yes. It calls the handler with a `Request` and checks the response | `/qa-unit` |
| A fix for one failing Vitest file | Yes. At most three rounds of one edit and one run | `/qa-unit` with the test file |
| An end-to-end plan for one feature | Yes. 3 to 8 scenarios, walked in Chrome | `/qa-plan` |
| Page classes and a Playwright spec from a plan | Yes. Then it runs the spec | `/qa-generate` |
| A fix for one failing Playwright spec | Yes. At most three rounds, one line at a time | `/qa-heal` |
| A product bug made visible | Yes. `Bug:` in the reply, or a `test.fixme(` mark from `/qa-heal` | All of them |
| A security review of the source | Yes, but it is not a test job. High-tier model only | `/security-audit` |

| You want | The kit does not do it | What you do by hand |
| --- | --- | --- |
| Other browsers than Chromium | `playwright.config.ts` has one project, Desktop Chrome | Add projects to `playwright.config.ts` yourself |
| A test against a staging or production URL | The hook allows the agent only `http://localhost` and `http://127.0.0.1` | Run Playwright yourself with `BASE_URL` |
| Visual comparisons, accessibility audits, load tests | No skill writes them. The hook denies snapshot matchers | Use your own tools |
| Test data in a database | No skill seeds data. A plan uses an account from your prompt or from the source | Seed the data yourself, and name the account in the prompt |
| A test that starts from a bug report | The write jobs test what the source does now | See [A bug report to reproduce as a failing test](#a-bug-report-to-reproduce-as-a-failing-test) |
| A failure that only happens in CI | No skill reads CI logs. The agent works from its own local run | See [A test that fails in CI](#a-test-that-fails-in-ci) |
| A bug ticket | No skill files an issue. Jira is planned for v0.5.0 | File it yourself |
| A CI workflow for your app | The kit ships none | See [In CI](#in-ci) |
| Starting the app | The hook denies `npm run dev` to the agent | Start it yourself before a plan or generate job |
| Installing a package | The hook denies `npm install` to the agent | Install it yourself |

## Where tests go

The hook holds these names for every new file under `test/`. A test file ends in `.ts`, never `.tsx`, and has no JSX. [[Layout and files]] lists every path the kit puts in your app.

| File | Path | Example |
| --- | --- | --- |
| Unit test | `test/unit/` plus the source path, without a leading `src/` or `app/` | `test/unit/components/ProfileForm.test.ts`, `test/unit/lib/format.test.ts` |
| Integration test | `test/integration/` plus the source path | `test/integration/api/profile/route.test.ts` |
| End-to-end plan | `test/e2e/plan/<feature>.plan.md` | `test/e2e/plan/profile.plan.md` |
| Page class | `test/e2e/pages/<screen>-page.ts`, lower case | `test/e2e/pages/profile-page.ts` |
| Spec | `test/e2e/<feature>.spec.ts`, named after the plan | `test/e2e/profile.spec.ts` |
| Seed spec | `test/e2e/seed.spec.ts` | Checks that the app responds at `/` |
| Setup | `test/setup.ts` | Runs before every Vitest file. The agent does not edit it |

No `__tests__/` folder anywhere under `test/`, and no `tests/` or `specs/` folder directly under `test/` or under `test/e2e/`.

## Which layer to pick

| You want to check | Layer | Prompt |
| --- | --- | --- |
| What a pure function returns, each branch, a limit and the value one past it | Unit | `/qa-unit lib/format.ts` |
| What a component shows, its validation messages, what a click does, with `fetch` and the router mocked | Unit, jsdom | `/qa-unit src/components/ProfileForm.tsx` |
| A component test that you want in the integration project, run by `npm run test:integration` | Integration, jsdom | `/qa-unit src/components/ProfileForm.tsx integration` |
| A route handler: status code and JSON body for each input, with the data module mocked | Integration, Node | `/qa-unit app/api/profile/route.ts` |
| The page in a real browser against the running app: the main flow, each message, a server error | End to end | `/qa-plan profile`, then `/qa-generate test/e2e/plan/profile.plan.md` |
| A behaviour that crosses pages, cookies, or redirects | End to end | `/qa-plan profile` with the route and a test account |

Put each check in the lowest layer that can see it. A unit test is fast and names the line that broke. An end-to-end test needs the running app and a browser, and it is the only layer that sees the real page.

## Setup for a web app

Install the kit as [[Installation]] says. Then check these points for a web app.

- **`@types/node`.** A new Next.js app has `"@types/node": "^20"`, and `npm install` stops with `ERESOLVE`. Use the kit's range.
- **Tests and `next build`.** `next build` type-checks every `.ts` file that `tsconfig.json` includes. To keep tests out of the build, add `test` to `exclude` in `tsconfig.json`, and keep `test/tsconfig.json`. The installer adds that file when your app has a `tsconfig.json`. It makes an alias such as `@/lib/db` work in tests.
- **`AGENTS.md` and `next dev`.** Next.js 16.4 adds its own block to `AGENTS.md` when `next dev` starts under a coding agent. Set `agentRules: false` in `next.config.ts` to stop it.
- **Vite 8.** Vitest 5 needs it. With Vite 7 an import alias does not resolve.
- **Chrome.** `/qa-plan` and the first part of `/qa-generate` use the installed Google Chrome through `playwright-cli`. `npx playwright install chromium` is for test runs only.
- **A monorepo.** Install the kit into the app package, such as `packages/web`, and open that folder in Cursor.

### The app under test

End-to-end jobs need the app on this machine. Start it yourself:

```bash
npm run dev
```

The default address is `http://localhost:3000`, and the default route is `/` plus the feature name. Say anything else in the prompt, in words:

```text
/qa-plan profile. Base URL http://localhost:4000. Route /settings/profile. Test account grace@example.org / profile-test-1.
```

The agent's browser and test commands accept only `localhost` and `127.0.0.1`, with any port. A base URL on another host stops the job with `BLOCKED: the tests run only against an app on this machine.` A page that redirects to a login page stops `/qa-plan` with `BLOCKED: this page needs a signed-in user. Ask again with a test account.` With an account, every scenario starts with the steps that log in.

### The mocks `/qa-unit` knows

`/qa-unit` adds a mock only when the source file needs it, and mocks nothing else. Child components, helper modules, and the file under test stay real. Every mock return value is set inside the `it`.

| The source file | The test gets |
| --- | --- |
| imports `next/navigation` | `useRouter` mocked, with a `push` spy. `redirect` and `notFound` throw, so the test can check them |
| imports `next/headers` | `cookies` mocked, with `get`, `set`, and `delete` spies |
| calls `fetch(` | A spy on `globalThis.fetch` that always answers with a response |
| imports a module that reads a database or calls a server, such as `prisma`, `axios`, a `repository.ts`, or a local `api.ts` | That module mocked, one `vi.fn()` for each function the source imports |
| is a server module, or Vitest reports `cannot be imported from a Client Component module` | `vi.mock('server-only', () => ({}))` |

Imports in tests are relative paths such as `../../../lib/format`, never `@/`. A `vi.mock` of an `@/` path can mock nothing and let the real module run, so the skill rewrites `@/` paths in a file it fixes.

## Workflows

Each workflow is a list of steps with the exact prompts. Ask for one job in one prompt, and pick the skill from the `/` menu.

### A new feature to cover

The example is a "Save profile" form at `/profile`.

1. Start the app with `npm run dev`.
2. Cover the plain functions first:

   ```text
   /qa-unit lib/format.ts
   ```

3. Cover the component:

   ```text
   /qa-unit src/components/ProfileForm.tsx
   ```

4. Cover the route handler it calls:

   ```text
   /qa-unit app/api/profile/route.ts
   ```

5. Plan the end-to-end scenarios:

   ```text
   /qa-plan profile
   ```

6. Read `test/e2e/plan/profile.plan.md`. Each scenario has steps and an `Expect` list, with texts copied from the page. Delete a scenario you do not want. Check the `Texts from source, not seen in the browser:` line of the reply: those texts come from the source, often from a mocked server error, and nobody saw them on the page.
7. Generate the page classes and the spec, and run it:

   ```text
   /qa-generate test/e2e/plan/profile.plan.md
   ```

8. Check each reply with the [review checklist](#review-checklist), then run the suites yourself: `npm run test:unit`, `npm run test:integration`, and `npm run test:e2e`.
9. Commit the files under `test/`.

The plan is yours. You may edit it by hand in the sentence forms the plan already uses. `/qa-generate` takes the plan as the truth: when the app shows another text, it reports a bug and does not change the plan.

### A bug report to reproduce as a failing test

The write jobs test what the source does now. `/qa-unit` reads the source and copies its texts. `/qa-plan` copies what the page shows. Neither takes an expected value from your prompt. So write the expected behaviour down first, in a place the skills treat as the truth: the end-to-end plan.

The example report: "When the name is taken, the profile form says `Name unavailable`. It should say `That name is taken`."

1. Open `test/e2e/plan/profile.plan.md`. If the plan has no scenario for a taken name, add one in the plan's own sentence forms, with the text from the report and not from the app:

   ```markdown
   ### 3.1 A taken name shows an error

   **Steps:**

   1. Go to `/profile`.
   2. Fill the "Display name" textbox with `Grace Hopper`.
   3. Click the "Save profile" button.

   **Expect:**

   - The alert shows "That name is taken".
   ```

   The data the scenario needs, here a taken name, must exist in the app. Name it on the plan's `**Data:**` line.
2. Start the app. Ask for the spec:

   ```text
   /qa-generate test/e2e/plan/profile.plan.md spec only
   ```

   The spec keeps its tests and adds only the scenarios whose title it does not have. If a page class lacks a field, the reply is `BLOCKED: a page class or field is missing. Ask again with page classes only.` Then run `/qa-generate test/e2e/plan/profile.plan.md page classes only` first.
3. The reply should say `Verdict: FAIL`, and `Bug:` names the plan line, the source line, the expected value, and the received value. The new test stays failing. That is the reproduction.
4. Go on with [The agent reports a product bug](#the-agent-reports-a-product-bug).

At the unit layer, write the failing `it` yourself in `test/unit/components/ProfileForm.test.ts` and run it yourself:

```bash
npx vitest run test/unit/components/ProfileForm.test.ts
```

Do not ask `/qa-unit` to fix that file. Its table for a failed assertion can change an expected value that is only in that test, when the received value is in another test or another source file. It treats the failure as a product bug when the expected value is also in a plan in `test/e2e/plan/`, in another test, or in another source file.

### A test that fails in CI

No skill reads CI logs. The agent runs the test on your machine and works from that run.

1. In the CI log, find the last `QA-VERDICT:` line and the first failure: the file, the test title, and the error.
2. Run the same file on your machine:

   ```bash
   npx playwright test test/e2e/profile.spec.ts
   npx vitest run test/unit/components/ProfileForm.test.ts
   ```

3. It fails on your machine too: ask the agent to fix it.

   ```text
   /qa-heal test/e2e/profile.spec.ts
   /qa-unit test/unit/components/ProfileForm.test.ts
   ```

4. It passes on your machine: the agent has nothing to fix, and `/qa-heal` replies `Verdict: PASS`. Look for the difference yourself:
   - With `CI` set, Playwright retries a failed test twice, does not reuse a running app, and starts `npm run dev` itself unless `BASE_URL` is set. Run `CI=1 npm run test:e2e` with your own app stopped to get closer to CI.
   - A test that passed only on a retry is flaky. Playwright reports it as flaky, and the verdict line says `FAIL`. Run it several times to make it fail on your machine: `npx playwright test test/e2e/profile.spec.ts --repeat-each=5`.
   - Data, time zone, and screen size can differ between your machine and CI.
5. Once it fails on your machine, go back to step 3.

### A flaky or broken end-to-end test after a UI change

1. Run the spec and see it fail:

   ```bash
   npx playwright test test/e2e/profile.spec.ts
   ```

2. Was a text on the page changed on purpose? Then correct the plan first, in `test/e2e/plan/profile.plan.md`. `/qa-heal` reads the plan: when the plan still has the old text, it marks the test as a product bug.
3. Ask for the fix:

   ```text
   /qa-heal test/e2e/profile.spec.ts
   ```

4. Read `Class:` in the reply.

   | Class | What the agent did |
   | --- | --- |
   | `Locator` | Changed one field in the page class, with the role and name the page shows now. It then ran every other spec that uses that class |
   | `Timing` | Replaced a check that does not wait, such as `expect(await profile.error.isVisible()).toBe(true)`, with one that does, such as `await expect(profile.error).toBeVisible()`. It ran the test three times with `--repeat-each=3` |
   | `Data or setup` | Corrected a route, a mock, or a value in the spec from the plan, or removed a stray `.skip` or `.only` |
   | `Product bug` | Marked the test `test.fixme(` under a `// product bug:` comment. See the next workflow |

5. `Verdict: FAIL` after three rounds means the agent stopped. Read `Cause:` and take over.

`/qa-heal` never adds retries, a longer timeout, `waitForTimeout`, `networkidle`, or `force: true`, and the hook denies them. `Test timeout of 30000ms exceeded` alone does not make the class `Timing`.

### The agent reports a product bug

A product bug shows in the reply in one of two ways.

| Skill | The reply | The test |
| --- | --- | --- |
| `/qa-unit`, `/qa-generate` | `Verdict: FAIL`, and `Bug:` names the source `file:line`, the expected value, and the received value | Left failing, unchanged |
| `/qa-heal` | `Class: Product bug`, and `Fix:` names the spec line and the source line | Marked `test.fixme(`. The run ends with `PASS-WITH-FIXME`, and `Verdict:` is `PASS` |

The mark from `/qa-heal` looks like this:

```ts
// product bug: src/components/ProfileForm.tsx:9 expected "That name is taken", got "Name unavailable"
test.fixme('A taken name shows an error', async ({ page }) => {
```

1. Open the source line the reply names, and check that the expected value is the intended one: in the plan, the design, or the ticket. `Not checked: which value is intended` means the agent could not tell.
2. File the bug in your tracker. Copy the `Bug:` line or the `// product bug:` line, the test file, the command, and the `QA-VERDICT:` line. The kit files nothing.
3. Decide what the test does until the fix:
   - **A spec.** Keep it failing, or ask `/qa-heal test/e2e/profile.spec.ts` to mark it. The hook allows `test.fixme(` only in a spec directly under `test/e2e/`, and only under a `// product bug:` line that names a source file and line.
   - **A unit or integration test.** The kit has no mark for it. A skipped test makes the verdict line `FAIL` too. The test stays failing until the product is fixed.
4. When the fix is merged, change `test.fixme(` back to `test(` and delete the comment line yourself. Run the spec. Playwright does not run a `fixme` test, so nothing tells you that the bug is fixed.

### A refactor where tests must stay green

The hook denies every Cursor agent in the folder an edit to application source, so the refactor itself is yours.

1. Run every suite before you start. Each must end with `QA-VERDICT: PASS`:

   ```bash
   npm run test:unit
   npm run test:integration
   npm run test:e2e
   ```

2. Make the refactor.
3. Run the three suites again.
4. For each failure, decide what changed:
   - **The behaviour changed.** The refactor broke something. Fix the source.
   - **A source file moved or was renamed.** Move the test file to mirror the new path, for example with `git mv`, then ask `/qa-unit test/unit/lib/format.test.ts` to fix its import.
   - **The markup changed.** Ask `/qa-heal test/e2e/profile.spec.ts`. A locator is fixed once, in the page class.
5. Do not tell the agent that the behaviour changed. That one sentence lets `/qa-unit` change an expected value.

### Reviewing a pull request the agent's tests are in

1. List the changed files:

   ```bash
   gh pr diff 12 --name-only
   ```

2. Expect files under `test/` only. The agent may also write `vitest.config.ts`, `playwright.config.ts`, `AGENTS.md`, the root `README.md`, `.gitignore`, `.cursor/skills/`, and `.cursor/agents/`. No skill edits those, so ask why when one changed.
3. Go through the [review checklist](#review-checklist).
4. Check out the branch and run the suites yourself. The `QA-VERDICT:` lines must match the replies.
5. Ask for the agent's replies, or read them in the pull request description. No skill writes a pull request: the hook lets the agent run `git commit` and `gh pr create` within limits, but only when someone asks.

## Review checklist

Check every reply before you keep its files.

- [ ] **The verdict line is copied.** `After:` or `Result:` is a `QA-VERDICT:` line, word for word. `Verdict: PASS` stands only over a line that says `PASS`, or `PASS-WITH-FIXME` for Playwright. Run the command from `Command:` yourself, and get the same line.
- [ ] **No expectation was weakened.** In the diff, look at every changed `expect`. No `toBeTruthy()`, no `expect.anything()`, no removed check, no pattern that matches anything, and no expected value changed to the received value without a `Cause:` that explains it.
- [ ] **No hidden failure.** No `.skip`, `.only`, `.todo`, `.fails`, `test.fail`, `waitForTimeout`, `networkidle`, `force: true`, or snapshot matcher. No `if (await locator.isVisible())`, `try` and `catch`, or `.catch(() => {})` around a check. The hook denies most of these to the agent, but not to you or another tool.
- [ ] **`test.fixme(` only for a filed bug.** Each mark sits under a `// product bug:` line that names a source file and line, and has a ticket.
- [ ] **The diff is small.** A fix job changes the lines that caused the failure and nothing else: no renames, no reformatting, no new helpers, retries, or timeouts.
- [ ] **Page classes stay simple.** One field for each element and one `goto` method. No `expect` in a page class, and no `page.getBy` or `page.locator` in a spec.
- [ ] **Mocks are the ones the source needs.** Each return value is set inside the `it`.
- [ ] **Texts match the app.** Spot-check the texts in the plan against the page. Read `Texts from source, not seen in the browser:` and `Locators not copied from the browser:` when they are not `none`.
- [ ] **`Not checked:` is read.** Each item there is either fine with you or done by you.

To search the test folder for the marks yourself:

```bash
grep -rnE '\.(only|skip|todo|fails)\(|waitForTimeout|networkidle|force: true|toMatch(Inline)?Snapshot' test/
```

## Run the tests yourself

### On your machine

```bash
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:e2e:list
```

`npm run test:e2e:list` prints the Playwright tests without running them, and prints no verdict line. One file at a time:

```bash
npx vitest run test/unit/components/ProfileForm.test.ts
npx playwright test test/e2e/profile.spec.ts
```

For an app on another port, start it yourself and set `BASE_URL`. Without `BASE_URL`, Playwright starts `npm run dev` when nothing answers at `http://localhost:3000`.

```bash
BASE_URL=http://localhost:4000 npm run test:e2e
```

Coverage of the unit tests:

```bash
npm run test:unit -- --coverage
```

The hook limits the agent, not you. You may run Playwright with `--ui` or `--headed` to watch a test. A `--reporter` flag removes the verdict line, so leave it out when you want the line.

The agent's commands start with `RTK_DISABLED=1`. That matters only if you use RTK: see [[Using RTK]].

### In CI

The kit ships no CI workflow for your app. Its own workflows test the kit. Add the steps to your pipeline:

```bash
npm ci
npx playwright install --with-deps chromium
npm run test:unit
npm run test:integration
npm run test:e2e
```

- Commit `.cursor/`. The two config files load the verdict reporters from `.cursor/qa/` and do not start without them.
- With `CI` set, Playwright retries a failed test twice, records a trace on the first retry, and starts the app with `npm run dev` unless `BASE_URL` is set. To test a production build, start it yourself and set `BASE_URL`.
- CI reads the exit code. The verdict line is stricter and does not change it. A run where every test is skipped, or a test passed only on a retry, can exit with 0 while the line says `FAIL`.

To fail the job on the line as well, keep the output and check the last `QA-VERDICT:` line. This is not part of the kit and was not run by its maintainers:

```bash
npm run test:e2e 2>&1 | tee e2e.log
grep '^QA-VERDICT:' e2e.log | tail -n 1 | grep -q '^QA-VERDICT: PASS'
```

That pattern also accepts `PASS-WITH-FIXME`. Use `'^QA-VERDICT: PASS ('` to reject a run with a `fixme` test.

## Choose a model for each job

The kit was tested in Cursor's agent on three tiers. The table shows what the evaluation ran for the web jobs. [[Supported models and evaluation]] has every round.

| Job | Low: Gemini 3.8 Flash | Mid: Composer 2.5 | High: Claude Opus 5 |
| --- | --- | --- | --- |
| `/qa-unit`, a component or plain functions | Passed in round 5 | Passed in rounds 4 and 5 | Passed in rounds 4 and 5 |
| `/qa-unit`, a route handler | Not in a recorded round | Passed in rounds 4 and 5 | Passed in round 4 |
| `/qa-unit`, a fix or a product bug | Not in a recorded round | Passed in rounds 4 and 5 | Passed in round 4 |
| `/qa-plan`, `/qa-generate` | Passed in round 5 | Passed in rounds 4 and 5 | Passed in rounds 4 and 5 |
| `/qa-heal`, a locator or a product bug | Not in a recorded round | Passed in rounds 4 and 5 | Passed in round 4 |
| `/security-audit` | Not run | Not run | The tier to use |

- **Composer 2.5** has the most runs, two of every case, and passed all of them. It is a sound default.
- **Gemini 3.8 Flash** passed the write jobs it ran. A first look at all nine web cases, two runs each, also passed, but it is not in the recorded results. In plan and generate it read about twice the tokens of Composer 2.5.
- **Claude Opus 5** is for `/security-audit`, which is long and sends work to subagents. A quick audit of a small app took over an hour. See [[Security audit]].

With a small model:

- Pick the skill from the `/` menu. `/qa` and a plain request leave the model one more choice.
- Keep each prompt to one file, one feature, or one plan.
- Ask for generate in two prompts. The first uses the browser, and the second does not:

  ```text
  /qa-generate test/e2e/plan/profile.plan.md page classes only
  /qa-generate test/e2e/plan/profile.plan.md spec only
  ```

- When the reply says `BLOCKED`, do what the line says and ask again.

## Limits

- **One browser.** The config runs Chromium, or Google Chrome when Playwright's Chromium is missing.
- **One machine.** The agent tests only an app on `localhost` or `127.0.0.1`.
- **Mocks.** End-to-end scenarios mock only a server error with status 500, through `page.route`. Unit tests mock only the modules in [the table above](#the-mocks-qa-unit-knows).
- **Size of a job.** `/qa-unit` writes at most 6 tests for a file, and `/qa-plan` at most 8 scenarios. The rest are named under `Not checked:`.
- **Text that starts with `--`.** `playwright-cli` reads it as an option, and the plan and generate skills have no step for it.
- **Systems.** Everything was run on Linux. On macOS only the hook's tests were run. Windows is not expected to work: it cannot start the hook.
- **The hook is a guardrail, not a sandbox.** A test is code that runs with your permissions. See [[The hook]].

What the evaluation does not show: each case had one or two runs on each model, on one small example app. In rounds 4 and 5 no agent tried anything the hook denies, so they do not show how a model goes on after a deny in the middle of a web job. [docs/evaluation.md](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/evaluation.md) has the detail.

When a job stops or a command is denied, see [[Troubleshooting]]. [docs/jobs.md](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/jobs.md) has every reply and every case of the verdict line.
