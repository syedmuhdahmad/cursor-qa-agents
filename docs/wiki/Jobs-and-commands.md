# Jobs and commands

This page explains what every job has in common: the reply form, the `QA-VERDICT:` line, what happens when the app is wrong, the app under test, and the tools each job uses. The prompts of each skill, its files, and its `BLOCKED` replies are on [[Skills and example prompts]]. A first walk through the jobs is on [[Getting started]].

The examples use the imaginary app of the skills: a "Save profile" form at `/profile`, in `src/components/ProfileForm.tsx`.

## Start a job

In Agent chat, type `/`, pick a skill from the menu, and add one file, feature, plan, spec, or flow. Ask for one job in one prompt.

```text
/qa-unit src/components/ProfileForm.tsx
/qa-plan profile
/qa-generate test/e2e/plan/profile.plan.md
/qa-heal test/e2e/profile.spec.ts
```

`/qa` and a plain request also work. `AGENTS.md` and the `/qa` subagent in `.cursor/agents/qa.md` each have a table from the kind of request to the one skill file to read. The model then has one more choice to make, so prefer the `/` menu.

## The reply form

Every job ends with a form that the agent fills in, as plain lines and nothing else. This is a reply to `/qa-unit src/components/ProfileForm.tsx`:

```text
Job: write
Source: src/components/ProfileForm.tsx
Test file: test/unit/components/ProfileForm.test.ts
Command: RTK_DISABLED=1 npx vitest run test/unit/components/ProfileForm.test.ts
Cause: none
Fix: none
Before: none
After: QA-VERDICT: PASS (passed 4, failed 0, skipped 0, files 1)
Verdict: PASS
Bug: none
Not checked: the other test files
```

Each skill has its own lines. A line the agent has nothing for says `none`. Two lines are in every form:

- `Verdict:` is one word from a closed set, in the table below.
- `Not checked:` is the last line. It says what the agent did not run or verify. Read it every time.

| Skill | Lines of its form |
| --- | --- |
| `/qa-unit`, `/qa-rn-unit` | `Job`, `Source`, `Test file`, `Command`, `Cause`, `Fix`, `Before`, `After`, `Verdict`, `Bug`, `Not checked` |
| `/qa-plan` | `Plan file`, `Side`, `Scenarios`, `Texts from source, not seen in the browser`, `Verdict`, `Not checked` |
| `/qa-generate` | `Plan`, `Page classes`, `Spec`, `Command`, `Result`, `Verdict`, `Bug`, `Locators not copied from the browser`, `Not checked` |
| `/qa-heal` | `Test`, `Class`, `Cause`, `Fix`, `Before`, `After`, `Verdict`, `Not checked` (the first six once for each failure it worked on) |
| `/qa-mobile-plan` | `Plan file`, `Platform`, `Device`, `Scenarios`, `Screens`, `Texts from source, not seen on the device`, `Verdict`, `Not checked` |
| `/qa-mobile-generate` | `Plan`, `Platform`, `Element files`, `Elements found by text`, `Flows`, `Subflow`, `Command`, `Result`, `Failed`, `Verdict`, `Not checked` |
| `/qa-mobile-heal` | `Flow`, `Platform`, `Class`, `Cause`, `Fix`, `Before`, `After`, `Verdict`, `Not checked` |

`/security-audit` is not a test job and has no form: it writes a report.

### Verdict words

| Word | Means | Next |
| --- | --- | --- |
| `PASS` | The last test run passed. For Vitest and Jest, its `QA-VERDICT:` line says `PASS`. For Playwright, `PASS` or `PASS-WITH-FIXME`. For Maestro, the summary line has the same number on both sides of the `/`. | Read the test and keep it. |
| `FAIL` | The last run did not pass. A fix job stops after 3 rounds with `FAIL` when the test still fails. A generate job also says `FAIL` when a plan line has no code, or a scenario has no flow. | Read `Bug:`, `Cause:`, and `Not checked:`. |
| `BLOCKED:` | The agent stopped. The words after it say what you must do, such as start the app. | Do it, then send the same prompt again. |
| `DONE` | The job runs no test, and its file is written: `/qa-plan`, `/qa-mobile-plan`, `/qa-generate` with `page classes only`, and `/qa-mobile-generate` with `element files only`. | Read the file, then start the next job. |

`/qa-mobile-heal` also says `PASS` when it marked a product bug, with `After: marked fixme` and no passing run. The flow still fails when run on its own.

## The verdict line

The agent does not judge the runner's output. Every Vitest, Playwright, and Jest run ends with one line that starts with `QA-VERDICT:`, and the agent copies it into `After:` or `Result:`. The kit's reporters print it: `.cursor/qa/vitest-verdict.mjs`, `.cursor/qa/playwright-verdict.mjs`, and `.cursor/qa/jest-verdict.mjs`. They are outside the agent's write scope.

```text
QA-VERDICT: PASS (passed 3, failed 0, skipped 0, files 1)
QA-VERDICT: FAIL (passed 2, failed 1, skipped 0, files 1)
QA-VERDICT: FAIL (passed 0, failed 0, skipped 2, files 1) reason: skipped or todo tests count as a failure
QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: no tests ran
QA-VERDICT: PASS-WITH-FIXME (passed 5, failed 0, skipped 0, fixme 1, files 1)
```

| Word | Means |
| --- | --- |
| `PASS` | At least one test ran, and every test passed on its first attempt. |
| `PASS-WITH-FIXME` | Playwright only. Every test passed except the ones marked `test.fixme()`. |
| `FAIL` | Every other result: a failed test, a skipped or todo test, a test that passed only on a retry, a stray `.only`, an error outside a test, or no tests. |

A `FAIL` with no failed test has a reason after it. These are the reasons the reporters print:

| `reason:` | Runner |
| --- | --- |
| `.only is not allowed` | Vitest, Playwright |
| `the run was interrupted` | All three |
| `the run timed out` | Playwright |
| `an error happened outside a test` | All three. The spec or test file did not load. |
| `no tests ran` | All three |
| `a test passed only on a retry` | All three. The counts then include `flaky`. |
| `skipped or todo tests count as a failure` | All three. In Jest a stray `.only` shows up this way, because it leaves the other tests out. |
| `the runner reported a failure` | Vitest, Playwright |
| `a snapshot was written or updated` | Jest |
| `the verdict reporter failed` | All three, followed by what went wrong |

Points to know:

- **The line is stricter than the exit code, and does not change it.** Vitest exits 0 when every test is skipped, and the line says `FAIL`. Jest exits 0 when a test is skipped, is a `todo`, was left out by a stray `.only`, or passed only on a retry, and the line says `FAIL` for each.
- **Coverage.** With `--coverage` and a coverage threshold, a run in which every test passes and coverage is below the threshold exits with 1, and the line says `FAIL` with `reason: the runner reported a failure`. Vitest's own `ERROR: Coverage for ...` line above it names the threshold.
- **No line is never a pass.** Some runs print no line: `npm run test:e2e:list`, a run with a `--reporter` flag, and a Vitest run that is killed. The hook denies the agent a `--reporter` flag on a test run for that reason. A job with no line stops with `BLOCKED: the test command did not finish.`
- **A new install.** With no tests yet, `npm run test:unit` exits 0 and prints `QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: no tests ran`.
- **Jest.** Jest prints its own summary after the reporters are done, so the reporter holds the line and prints it as the process exits. It stays the last line. When no test file matches the command, Jest calls no reporter, and `.cursor/qa/jest.config.cjs` prints the `no tests ran` line itself.
- **Maestro.** The mobile skills have no `QA-VERDICT:` line. They copy Maestro's own summary line, such as `2/2 Flows Passed in 46s` or `1/2 Flow Failed`.

## When the app is wrong

No skill changes what a test expects to get a pass.

| Skill | What it does with a product bug | `Verdict:` |
| --- | --- | --- |
| `/qa-unit`, `/qa-rn-unit` | Leaves the test failing. `Bug:` names the source `file:line`, the expected value, and the received value. | `FAIL` |
| `/qa-generate` | Leaves the test failing. `Bug:` names the plan line, the source `file:line`, the expected value, and the received value. | `FAIL` |
| `/qa-heal` | Marks that one test `test.fixme(`, with a `// product bug:` comment on the line above it. The run ends with `PASS-WITH-FIXME`. | `PASS` |
| `/qa-mobile-generate` | Leaves the flow failing. `/qa-mobile-heal` finds the cause. | `FAIL` |
| `/qa-mobile-heal` | Tags the flow `fixme`, with a `# product bug:` comment. | `PASS`, with `After: marked fixme` |

The mark of `/qa-heal` looks like this:

```ts
// product bug: src/components/ProfileForm.tsx:9 expected "That name is taken", got "Name unavailable"
test.fixme('A taken name shows an error', async ({ page }) => {
```

The hook allows `test.fixme(` only in a spec under `test/e2e/` and only under such a comment line. A Maestro folder run with `--exclude-tags=fixme` leaves a tagged flow out. When the bug is fixed, remove the mark yourself: no skill does it.

How a job decides between the test and the product:

- **Unit tests** compare the expected value with the source, other tests, and the plans. If the prompt says the behavior changed, the agent may change the expected value.
- **End-to-end and mobile** jobs compare with the plan. A value the plan has is right. To accept a change on purpose, edit the plan first.

## The app under test

End-to-end tests open the app at `http://localhost:3000`.

- **When you run `npm run test:e2e` yourself**, Playwright starts the app with `npm run dev` if nothing answers there.
- **The agent cannot start the app.** The hook denies it `npm run dev`, and `playwright-cli` starts nothing but its browser. Start the app yourself before a plan or generate job. Otherwise the reply is `BLOCKED: start the app with npm run dev, then ask again.`
- **Another address.** Start the app yourself and set `BASE_URL` for your own runs:

  ```bash
  BASE_URL=http://localhost:4000 npm run test:e2e
  ```

  In a prompt, name it in words: `/qa-plan profile. Base URL http://localhost:4000.`
- **Only this machine.** The hook lets the agent's browser open only `http://localhost` and `http://127.0.0.1`, with any port, and allows a test run only against the same two hosts. With another host in the prompt, the web skills stop with `BLOCKED: the tests run only against an app on this machine.`
- **A mobile app** runs on a device or emulator that you start, with a real build that you install. The agent never starts a device or installs the app, and every flow clears the app's data.

## The tools each job uses

| Job | Looks at the app with | Runs tests with |
| --- | --- | --- |
| `/qa-unit` | Nothing | `RTK_DISABLED=1 npx vitest run test/unit/components/ProfileForm.test.ts` |
| `/qa-rn-unit` | Nothing | `RTK_DISABLED=1 npx jest --config .cursor/qa/jest.config.cjs --ci test/unit/components/ProfileForm.test.ts` |
| `/qa-plan` | `playwright-cli` in Google Chrome | Nothing |
| `/qa-generate` | `playwright-cli`, in Part 1 only | `RTK_DISABLED=1 npx playwright test test/e2e/profile.spec.ts`, in Part 2 |
| `/qa-heal` | `playwright-cli attach` on a paused spec, only when it cannot find the cause | `RTK_DISABLED=1 npx playwright test test/e2e/profile.spec.ts` |
| `/qa-mobile-plan` | The `maestro` MCP server: `list_devices`, `run`, `inspect_screen` | Nothing |
| `/qa-mobile-generate` | The `maestro` MCP server, in Part 1 only | `maestro check-syntax`, then `RTK_DISABLED=1 maestro test --platform android --exclude-tags=fixme -e APP_ID=com.example.app test/mobile/profile` |
| `/qa-mobile-heal` | The `maestro` MCP server | The MCP `run` tool on one flow, never `maestro test` |
| `/security-audit` | Reads source only | Nothing. Its two validators run on its own report files. |

- `playwright-cli` is the command-line tool of the dev dependency `@playwright/cli`. It starts the Google Chrome installed on your machine, without a window. `npx playwright install chromium` installs the browser for test runs only. The agent runs commands such as:

  ```bash
  npx --no-install playwright-cli open http://localhost:3000/profile && sleep 2 && npx --no-install playwright-cli snapshot
  npx --no-install playwright-cli fill e5 'Grace Hopper'
  npx --no-install playwright-cli click e9 && sleep 2 && npx --no-install playwright-cli snapshot
  npx --no-install playwright-cli close
  ```

- Plan and generate end with `playwright-cli close`, also after `BLOCKED`. If a job is cut off, the browser can stay open: run `npx --no-install playwright-cli close` in the app folder.
- The web jobs need no MCP server. Turn the `maestro` server on in Cursor settings for the mobile jobs only. `maestro test` ends the server's session with the device, so turn the server off and on after a full `/qa-mobile-generate` job or a run from your terminal.
- Every test command of the agent starts with `RTK_DISABLED=1`. That matters only if you use RTK: see [[Using RTK]].

## Run the tests yourself

```bash
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:e2e:list
npm run test:rn-unit
```

`test:rn-unit` exists only in a React Native app, and the other four only in a web app. To run the Maestro flows of one feature:

```bash
maestro test --platform android --exclude-tags=fixme -e APP_ID=com.example.app test/mobile/profile
```

## More

[docs/jobs.md](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/jobs.md) has the detail of each web job and of the browser steps. [docs/mobile.md](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/mobile.md) has the Maestro jobs, and [[Mobile testing with Maestro]] a short version.
