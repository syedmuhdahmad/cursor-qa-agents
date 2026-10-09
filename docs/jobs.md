# Jobs, replies, and the verdict line

This file holds the detail behind [Start a job](../README.md#start-a-job) in the README: what each web skill does with a prompt, the form every reply has, and the line every test run ends with. The mobile skills are in [mobile.md](mobile.md).

## Notes on each job

- **`/qa-unit`** mirrors the source path and drops a leading `src/` or `app/`: `src/components/SignIn.tsx` gets `test/unit/components/SignIn.test.ts`. A `.tsx` or `.jsx` file gets a jsdom test. A file named `route.ts`, or under an `api/` folder, goes to `test/integration/`. Say `unit test` or `integration` in the prompt to choose the folder yourself. Give it a test file, and it runs that file and fixes it in at most three rounds.
- **`/qa-plan`** opens the feature in the browser. `/qa-plan sign-in` opens `http://localhost:3000/sign-in`. If the app or the page is somewhere else, say so, and give a test account if the feature needs one: `/qa-plan checkout. Base URL http://localhost:4000. Route /cart/checkout. Test account ada@example.com / correct-horse-battery.`
- **`/qa-generate`** has two parts. The first uses the browser and writes the page classes. The second writes the spec and runs it. Ask for one part with `page classes only` or `spec only` after the path of the plan.
- **`/qa-heal`** runs one spec and fixes the test, one line at a time, in at most three rounds. It also takes a spec that fails with no failing test: a test marked `.skip` or `.only`, or a spec that does not load. It removes the mark, or corrects the import, and runs the spec again.

`/qa-plan` and the first part of `/qa-generate` only use the browser, so they work against an app at any address. `/qa-heal` and the second part of `/qa-generate` run tests, and the hook allows a test run only against `localhost` or `127.0.0.1`. With another host in the prompt they stop with `BLOCKED: the tests run only against an app on this machine.`

`/qa` and a plain request, such as "Write a unit test for src/components/SignIn.tsx", also work. [`AGENTS.md`](../AGENTS.md) is always in the model's context, and it has a table from the kind of request to the one skill file to read. `/qa` asks the model to hand the request to the subagent in [`.cursor/agents/qa.md`](../.cursor/agents/qa.md), which has the same table. On both routes the model must pick the skill file and read it. With a slash skill, Cursor attaches the skill's text to your message. Whether a skill name that is typed or pasted, and not picked from the menu, attaches the skill was not checked.

The examples inside the skills come from an imaginary app with a profile form, not from `examples/next-app`. The evaluation runs on the example app, so no skill shows the answer to a case.

## With a small model

- Pick the skill from the `/` menu. `/qa` and a plain request leave the model one more choice to make.
- Keep each prompt to one file, one feature, or one plan.
- Ask for generate in two prompts. The first uses the browser, and the second does not:

  ```text
  /qa-generate test/e2e/plan/sign-in.plan.md page classes only
  /qa-generate test/e2e/plan/sign-in.plan.md spec only
  ```

- When the reply says `BLOCKED`, do what the line says and ask again.

## Tools

| Tool | Used for |
| --- | --- |
| `playwright` MCP | Exploring a live page in `/qa-plan` and `/qa-generate` |
| `maestro` MCP | Reading the device screen in `/qa-mobile-plan` and `/qa-mobile-heal` |
| `playwright-cli` | Looking at the page of a paused spec in `/qa-heal` (a spec run with `--debug=cli`, then `playwright-cli attach`) |
| `npx vitest` | Running unit and integration tests from the shell |

Turn an MCP server on in Cursor settings for the jobs that need it, and restart it if Cursor does not show it. The Playwright MCP server drives the Google Chrome that is installed on your machine. `npx playwright install chromium` installs the browser for test runs only.

## The reply form

This is a reply to `/qa-unit src/components/SignIn.tsx`:

```text
Job: write
Source: src/components/SignIn.tsx
Test file: test/unit/components/SignIn.test.ts
Command: RTK_DISABLED=1 npx vitest run test/unit/components/SignIn.test.ts
Cause: none
Fix: none
Before: none
After: QA-VERDICT: PASS (passed 4, failed 0, skipped 0, files 1)
Verdict: PASS
Bug: none
Not checked: the other test files
```

Each skill has its own lines, and two lines are in every form:

- `Verdict:` is one word from a closed set.

  | Word | Means |
  | --- | --- |
  | `PASS` | The last test run passed. For Vitest and Playwright that means its `QA-VERDICT:` line says `PASS`, or `PASS-WITH-FIXME` in Playwright. |
  | `FAIL` | The last test run did not pass. A fix job stops after 3 rounds, with `FAIL` when the test still fails. |
  | `BLOCKED:` | The agent stopped. The words after it say what you need to do, such as start the app. Do it and ask again. |
  | `DONE` | The job runs no test and its file is written: a plan from `/qa-plan` or `/qa-mobile-plan`, and `/qa-generate` with `page classes only`. |

- `Not checked:` is the last line. It says what the agent did not run or verify.

## The verdict line

The agent does not judge the runner's output. Every Vitest run and every Playwright run ends with one line that starts with `QA-VERDICT:`, and the agent copies it:

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

- The line is stricter than the exit code and does not change it. Vitest exits 0 when every test is skipped, and the line says `FAIL`.
- With `--coverage` and a coverage threshold, a run in which every test passes and coverage is below the threshold exits with 1, and the line says `FAIL` with `reason: the runner reported a failure`. Vitest's own `ERROR: Coverage for ...` line above it names the threshold.
- Some runs print no line: `npm run test:e2e:list`, a run with a `--reporter` flag, and a Vitest run that is killed. No line is never a pass. The hook denies the agent a `--reporter` flag on a test run for that reason.
- On a new install with no tests, `npm run test:unit` exits 0 and prints `QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: no tests ran`.

The two reporters that print the line are `.cursor/qa/vitest-verdict.mjs` and `.cursor/qa/playwright-verdict.mjs`. The kit's two config files load them. They are outside the agent's write scope.

The Maestro skills have no verdict line. They copy Maestro's own summary line, such as `2/2 Flows Passed in 46s`.

## When the app is wrong

No skill changes what a test expects to get a pass.

- `/qa-unit` and `/qa-generate` leave the test failing. The reply says `Verdict: FAIL`, and `Bug:` names the source line with the expected and the received value.
- `/qa-heal` marks that one test and reports it. The mark is `test.fixme(` with a comment on the line above it:

  ```ts
  // product bug: src/components/ProfileForm.tsx:9 expected "That name is taken", got "Name unavailable"
  test.fixme('A taken name shows an error', async ({ page }) => {
  ```

  The run then ends with `PASS-WITH-FIXME`. The hook allows `test.fixme(` only in a spec under `test/e2e/` and only under such a comment line.
- `/qa-mobile-heal` gives the flow the tag `fixme` and a `# product bug:` comment. A run of the folder with `--exclude-tags=fixme` leaves that flow out.
