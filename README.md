# Cursor QA agent

This kit is a set of Cursor files that you copy into a React or Next.js app, so that the Cursor agent writes and fixes the app's tests: Vitest unit and integration tests, Playwright end-to-end tests, and Maestro flows for a mobile app (a preview). The agent reads your application source and does not edit it. When a test fails because the product is wrong, it reports the bug instead of weakening the test.

It is written for low-cost and mid-tier models: each job is one skill of numbered steps, every test run ends with one verdict line, and a hook enforces the rules that a small model drops. [Example app and evaluation](#example-app-and-evaluation) says how far that is measured.

The hook applies to every Cursor agent in the folder. It denies an edit to application source and a command such as `npm install`, so run those yourself. See [Limits](#limits).

## Requirements

- **Node** `^22.22.2 || ^24.15.0 || >=26.0.0`, which is `engines.node` in [`package.json`](package.json).
- **npm.** The hook denies `pnpm`, `yarn`, and `bunx` to the agent.
- **Python 3.9 or later**, started as `python3`, with no packages. The hook is a Python script.
- **Cursor 2.4 or later**, by Cursor's changelog the first version with skills, subagents, and the `preToolUse` hook event.
- **Linux.** macOS was not run. Windows is not expected to work as shipped: it cannot start the hook by its `.py` path.
- **Google Chrome**, for the plan and generate jobs.

Run so far: everything on Linux with Node 24, and the hook's tests on Python 3.9 and 3.14. Not run: this version in a live Cursor session. The install notes have [the detail](docs/install-notes.md#requirements-in-detail), and say what to do [if every action is denied](docs/install-notes.md#if-every-action-is-denied). The mobile skills need more: see [Mobile](#mobile).

## Add it to your app

Clone this repository next to your app:

```bash
git clone https://github.com/syedmuhdahmad/cursor-qa-agents.git
```

Copy these from the clone into the root of your React or Next.js app, next to `app/` or `src/`:

<!-- install:copy -->

```text
.cursor/  .cursorignore  test/  AGENTS.md  vitest.config.ts  playwright.config.ts
```

Copy `.cursor/` whole. The two config files load a reporter from `.cursor/qa/` and do not start without it.

Do not copy `package.json` over yours. Merge it instead:

- Add the `devDependencies` listed below, with the version ranges from this repo's [`package.json`](package.json). React and React DOM come from your app. Leave out `typescript` and `markdownlint-cli2`: they are tools for this repository.
- Add these four scripts:

  ```json
  "test:unit": "vitest run --project unit --passWithNoTests",
  "test:integration": "vitest run --project integration --passWithNoTests",
  "test:e2e": "playwright test",
  "test:e2e:list": "playwright test --list"
  ```

- Add the lines of this repo's [`.gitignore`](.gitignore) that yours does not have.

<!-- install:dev-dependencies -->

```text
@playwright/cli
@playwright/test
@testing-library/jest-dom
@testing-library/react
@types/node
@vitest/coverage-v8
jsdom
vitest
```

Then install dependencies and the Chromium browser Playwright uses:

```bash
npm install
npx playwright install chromium
```

Open the app folder in Cursor with **File → Open Folder** as a trusted workspace, and use **Agent** mode in chat. In a monorepo, copy the kit into the app package and open that package folder.

### Or use the installer

`scripts/install-into.mjs` does the copy and merge steps above. From the clone:

```bash
node scripts/install-into.mjs ../my-app --dry-run
node scripts/install-into.mjs ../my-app
```

The first command prints what would change and writes nothing. The second does the steps above, and adds `test/tsconfig.json` when your app has a `tsconfig.json`. It does not run `npm install`.

It merges the kit's entries into your own `.cursor/hooks.json` and `.cursor/mcp.json`. Any other file of yours with other content is skipped, unless you pass `--force`. It never deletes a file and never writes through a symbolic link. Read the end of the output: a `WARNING:` there means that a skipped file leaves part of the kit switched off. See [What the installer does](docs/install-notes.md#what-the-installer-does).

### If your app already has these files

Keep your own `.cursor/hooks.json`, `.cursor/mcp.json`, `AGENTS.md`, `.cursorignore`, and `.gitignore`, and add the kit's entries. Take the kit's two config files and move your own settings into them. Your tests stay. The install notes say [what to do for each file](docs/install-notes.md#if-your-app-already-has-these-files).

### Things that go wrong on install

The install notes [list them with the fix for each](docs/install-notes.md#things-that-go-wrong-on-install). Know these four first:

- `npm install` stops with `ERESOLVE` when your app has `"@types/node": "^20"`. Use the kit's range.
- With `test` in `exclude` of `tsconfig.json`, an import alias such as `@/lib/db` works in test files only with `test/tsconfig.json`. The installer adds it.
- A JavaScript app needs a `tsconfig.json` with `"allowJs": true` for an alias.
- Without Maestro on your machine, delete the `maestro` entry from `.cursor/mcp.json`.

## Start a job

In Agent chat, type `/` and pick a skill from the menu. Then add the file or the feature. Ask for one job in one prompt.

| Job | Prompt | What the agent does |
| --- | --- | --- |
| Unit or integration test | `/qa-unit src/components/SignIn.tsx` | Writes `test/unit/components/SignIn.test.ts` with 2 to 6 tests and runs it. Given a test file, it runs and fixes that file. |
| Plan | `/qa-plan sign-in` | Opens the feature in the browser and saves `test/e2e/plan/sign-in.plan.md` with 3 to 8 scenarios. |
| Generate | `/qa-generate test/e2e/plan/sign-in.plan.md` | Writes page classes in `test/e2e/pages/` and the spec `test/e2e/sign-in.spec.ts`, then runs the spec. |
| Heal | `/qa-heal test/e2e/sign-in.spec.ts` | Runs one failing spec and fixes the test, one line at a time, in at most three rounds. |

- A `route.ts` file, or a file under an `api/` folder, gets an integration test in `test/integration/`.
- Before plan and generate, start the app and turn on the `playwright` MCP server. See [Tools and the app under test](#tools-and-the-app-under-test).
- `/qa-plan sign-in` opens `http://localhost:3000/sign-in`. For another place, say so: `/qa-plan checkout. Base URL http://localhost:4000. Route /cart/checkout.` Give a test account the same way.
- `/qa-heal` also takes a spec that fails with no failing test: a `.skip` or `.only` mark, or a spec that does not load.
- When the app is wrong, no skill changes what the test expects. `/qa-unit` and `/qa-generate` leave the test failing and name the source line under `Bug:`. `/qa-heal` marks that one test `test.fixme(`, under a `// product bug:` comment that names the source line.
- For a small model, keep each prompt to one file, one feature, or one plan. Ask for generate in two prompts: `/qa-generate test/e2e/plan/sign-in.plan.md page classes only`, then the same with `spec only`.

`/qa` and a plain request also work, through the table in [`AGENTS.md`](AGENTS.md). The model then has one more choice to make, so prefer the `/` menu. Whether a skill name that is typed, and not picked from the menu, attaches the skill was not checked.

### The reply and the verdict line

Every skill ends with a form that the agent fills in. `Verdict:` is `PASS`, `FAIL`, or `BLOCKED:` with what you need to do, such as start the app. A plan, and a generate job with `page classes only`, ends with `DONE`. The last line, `Not checked:`, says what the agent did not run.

The agent does not judge the runner's output. Every Vitest and Playwright run ends with one line that the agent copies:

```text
QA-VERDICT: PASS (passed 3, failed 0, skipped 0, files 1)
QA-VERDICT: FAIL (passed 0, failed 0, skipped 2, files 1) reason: skipped or todo tests count as a failure
QA-VERDICT: PASS-WITH-FIXME (passed 5, failed 0, skipped 0, fixme 1, files 1)
```

`PASS` means that at least one test ran and every test passed on its first attempt. A skipped test, a retried test, a stray `.only`, and a run with no tests are `FAIL`. `PASS-WITH-FIXME` is Playwright only: every test passed except the ones marked `test.fixme()`. No line is never a pass. [docs/jobs.md](docs/jobs.md) has more on each job, a whole reply, and every case of the line.

## Tools and the app under test

[`.cursor/mcp.json`](.cursor/mcp.json) lists two MCP servers: `playwright`, for exploring a live page in `/qa-plan` and `/qa-generate`, and `maestro`, for reading the device screen in `/qa-mobile-plan` and `/qa-mobile-heal`. Turn one on in Cursor settings for the jobs that need it. An enabled server adds its tool list to each request, so keep both off while you only write unit or integration tests.

The agent runs every test command with `RTK_DISABLED=1` in front. See [Using RTK](#using-rtk) for why.

End-to-end tests open the app at `http://localhost:3000`, and Playwright starts it with `npm run dev` when nothing is listening there. The browser tool starts nothing, and the hook denies `npm run dev` to the agent. So start the app yourself before a plan or generate job. Otherwise the reply is `BLOCKED: start the app with npm run dev, then ask again.`

If your app runs somewhere else, start it yourself and set `BASE_URL`:

```bash
BASE_URL=http://localhost:4000 npm run test:e2e
```

In a prompt, name the address in words: `/qa-plan sign-in. Base URL http://localhost:4000.` The agent's own test commands accept only `localhost` and `127.0.0.1`. With another host, `/qa-generate` and `/qa-heal` stop with `BLOCKED: the tests run only against an app on this machine.`

## Using RTK

[RTK](https://github.com/rtk-ai/rtk) is a token-saving tool. Its Cursor hook rewrites shell commands so their output is shorter. For most commands that helps. For the test runners it hides or changes the lines the `qa` agent depends on, so every test command in the skills starts with `RTK_DISABLED=1`. RTK skips any command that starts with it. Without RTK the variable does nothing.

Only test commands carry the prefix. `git`, `gh`, `grep`, `cat`, `ls`, and the rest still go through RTK.

### Vitest: the whole result is lost

RTK rewrites `npx vitest run …` to `rtk vitest …`. On Vitest 5 the agent then sees only this, whether the tests pass or fail:

```text
[RTK:PASSTHROUGH] vitest parser: All parsing tiers failed
JSON report written to <project>/.vitest/json/output.json
```

The cause: `rtk vitest` adds `--reporter=json` and parses stdout. Since Vitest 5 the JSON reporter writes its report to `.vitest/json/output.json` by default and prints only that path, so every RTK parser tier fails. The agent cannot see the `Tests N passed` line it uses to tell a real pass from a run where every test was skipped. It cannot read the JSON file either, because `.vitest/` is in `.cursorignore`.

This is reported upstream as [rtk-ai/rtk#4224](https://github.com/rtk-ai/rtk/issues/4224) (open). We reproduced it on rtk 0.50.0 with Vitest 5.0.3. A fix, [rtk-ai/rtk#4264](https://github.com/rtk-ai/rtk/pull/4264), is waiting for review. Once a release includes it, the prefix can come off the Vitest commands.

### Playwright: wrong list, no debug session, missing error context

RTK rewrites `npx playwright test …` to `rtk playwright test …`. That filter runs every `playwright test` with `--reporter=json` added and prints a short summary. It keeps error messages and code frames, but:

- `--list` is reported as skipped tests (`PASS (0) FAIL (0) skipped (3)`) instead of the test names. Nothing runs in list mode, so the JSON report counts every test as skipped.
- The summary becomes `PASS (n) FAIL (n)` instead of Playwright's `n passed` / `n failed`.
- The `Error Context: test-results/…/error-context.md` line is dropped. The JSON report has the path, but RTK does not print it. The healer reads that file first.
- With `--debug=cli` the `playwright-cli attach tw-…` line never appears, so the healer cannot attach. The injected JSON reporter stops Playwright from printing it, and RTK shows nothing until the command exits, which a paused test never does.

These are reported upstream as [rtk-ai/rtk#4380](https://github.com/rtk-ai/rtk/issues/4380) (open), reproduced on rtk 0.50.0 with Playwright 1.63.0. Keep the Playwright prefix until a release fixes them.

### The cost

Test runs are not compressed. The skills run one file at a time, so a passing Vitest file is about 6 lines. On a failure RTK was keeping the error and code frame anyway, so little is lost. `rtk discover` and `rtk gain` may list these commands as using `RTK_DISABLED=1` unnecessarily. That only affects their statistics.

RTK's own numbers for Playwright overstate its savings: it measures against the JSON report it injects, not what Playwright would print. In our test a passing run of 3 tests was recorded as 1.5K tokens saved, while Playwright's normal output was about 65 tokens (also in [rtk-ai/rtk#4380](https://github.com/rtk-ai/rtk/issues/4380)).

### Alternative: exclude the commands in your RTK config

If you prefer, add the test runners to `exclude_commands` in `~/.config/rtk/config.toml`:

```toml
[hooks]
exclude_commands = ["^npx vitest\\b", "^npx playwright test\\b"]
```

This applies to every project on your machine and is not part of this repo, so keep the prefix in the skills for anyone else who uses them.

## Layout

```text
test/unit/                 Vitest unit tests
test/integration/          Vitest integration tests
test/e2e/<name>.spec.ts    Playwright specs
test/e2e/plan/             End-to-end plans
test/e2e/pages/            Page classes
test/e2e/seed.spec.ts      Checks that the app responds at /
test/setup.ts              Runs before every Vitest test file
test/tsconfig.json         Makes import aliases work in tests (added by the installer)
test/mobile/               Maestro plans and flows, see Mobile

AGENTS.md                  Write scope, the table from request to skill, and the test commands
.cursor/                   The skills, the hook, the MCP servers, and the verdict reporters
```

To run the tests yourself, use `npm run test:unit`, `npm run test:integration`, and `npm run test:e2e`. `npm run test:e2e:list` prints the Playwright tests without running them. The install notes list [every path of the kit](docs/install-notes.md#what-the-kit-puts-in-your-app).

## What the hook does

Cursor starts [`.cursor/hooks/guard-test-writes.py`](.cursor/hooks/guard-test-writes.py) before a tool call or a shell command of any agent in the folder. The hook answers allow or deny, and every deny says what to do instead.

- **File edits.** The agent's file tools may write in `test/**`, `vitest.config.ts`, `playwright.config.ts`, the root `README.md`, `.gitignore`, `AGENTS.md`, `.cursor/skills/**`, and `.cursor/agents/**`, and nowhere else in the project.
- **Test files.** A new file under `test/` must fit the layout: `.ts` and never `.tsx`, and no `__tests__/` folder. A write may not add text that hides a failing test, such as `.only(`, `.skip(`, or `waitForTimeout(`. `test.fixme(` needs a `// product bug:` line above it.
- **Shell.** Allowed: a test run that names a path under `test/`, the four `npm run test:*` scripts, reads such as `ls`, `cat`, and `grep`, and `git` and `gh` within limits. Denied: everything else, such as `npm install`, `npm run dev`, `curl`, `cd`, and a runner option that removes the verdict line.
- **MCP tools.** A file that an MCP tool writes must be inside the paths above. A few tools are denied by name.
- **Reads.** The hook denies a shell read of a path in [`.cursorignore`](.cursorignore): lockfiles, build output, and test reports.

[docs/hook-rules.md](docs/hook-rules.md) lists every rule and says how to debug a deny.

### Limits

The hook is a guardrail and not a sandbox.

- It checks file-editing tool calls, the text of shell commands, and the name and file arguments of MCP tool calls. Its MCP rules have not been seen working in a live Cursor session.
- It does not check what a program does after it starts. A test is code that runs with your permissions, so a test that writes to `src/` passes the hook.
- It will not hold against an agent that follows injected instructions, and it can read a command line wrongly. Gaps of that kind were closed in [issue 8](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/8), [issue 9](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/9), and this version. More may exist.
- `.cursorignore` saves context and keeps no secrets. An untrusted workspace loads no project hooks.

For a real boundary, run the agent in a container with application source mounted read-only. See [what the hook does not check](docs/hook-rules.md#what-it-does-not-check) and its [known limits](docs/hook-rules.md#known-limits-and-unverified-behaviour).

## Mobile

Three more skills plan, write, and fix [Maestro](https://maestro.dev) flows for an Android or iOS app: `/qa-mobile-plan`, `/qa-mobile-generate`, and `/qa-mobile-heal`. Treat them as a preview.

- **Run:** on one Android emulator (Android 17, Maestro 2.10.0) with a React Native sample app: the `maestro test` command and its output, the three MCP tools the skills call, the `fixme` mark, and one small job for each skill, done by a maintainer who followed the skill text line by line.
- **Not run:** anything on iOS, a sample app with a sign-in screen, CI, and the skills on a model. The skills were made shorter after the device run, and the shorter text was not followed on a device.

You start the device and install the app, and every flow clears the app's data there. See [docs/mobile.md](docs/mobile.md).

## Example app and evaluation

Neither is part of the files you copy.

[`examples/next-app/`](examples/next-app/) is a small Next.js app with a sign-in form and hand-written reference tests in the layout the skills produce. `node scripts/test-example.mjs` copies it to a temporary folder, installs the kit there with the installer, and runs `npm install`, the build, the three test commands, and a type check of the tests. Pass `--port 3100` when port 3000 is busy.

[`eval/`](eval/) holds nine fixed test jobs on the example app and a scorer that needs no model. The scorer runs the tests itself, and marks a reply that says the work passed over a failing run as `FALSE PASS`. See [`eval/README.md`](eval/README.md).

The first round, on 2026-10-09, was one run for each case:

| Skills | Model | Cases passed |
| --- | --- | --- |
| New | Claude Haiku 4.5, as a low-tier proxy | 9 of 9 |
| New | Claude Sonnet 5.5, as a mid-tier proxy | 9 of 9 |
| Old, with `/qa` only | Claude Haiku 4.5, as a low-tier proxy | 7 of 9 |

<!-- eval:round-2 -->

Round 2 is not recorded yet.

Read these numbers as a first sign and not as proof. The models are stand-ins. They ran outside Cursor with the skill text as the prompt, without the hook in the loop and without the MCP browser tools. One run for each case says little, and in two cases the skill text of that round held part of the answer, which is fixed since. See [docs/evaluation.md](docs/evaluation.md).

## Checks and CI

To check a change to the kit itself, run these from the repository root. [CONTRIBUTING.md](CONTRIBUTING.md#checks) says what each one checks.

```bash
npm ci
npm run test:hook
npm run test:reporters
node --test "scripts/*.test.mjs"
node --test "eval/*.test.mjs"
npm run lint:md
npm run typecheck
npx vitest run --passWithNoTests
npx playwright test --list
node scripts/test-example.mjs
```

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the same commands on every pull request and on every push to `main`: the hook tests on Ubuntu and macOS with Python 3.9 and 3.14, and the reporter, script, config, and example checks on Ubuntu with the lowest and the highest Node version that `engines` allows. The workflow has not run on GitHub yet. Its commands were run on one Linux machine and in Linux containers.

## Upgrading

`.cursor/qa/VERSION` holds the version of the kit you copied. A copy without that file is older than 0.1.0. [CHANGELOG.md](CHANGELOG.md) starts with the things you must do.

To upgrade, copy the files again or run the installer: its dry run lists every file of yours that differs. Overwrite the kit's own folders under `.cursor/`, merge the files you changed, and delete a skill folder that the new version no longer has. The install notes [name the files of each group](docs/install-notes.md#upgrading).

## Contributing, security, and license

- [CONTRIBUTING.md](CONTRIBUTING.md) says how a skill is laid out and which files must stay in step. Everyone who takes part follows the [code of conduct](CODE_OF_CONDUCT.md).
- [SECURITY.md](SECURITY.md) says how to report a security problem in private.
- [MIT](LICENSE) is the license for the files written for this project. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) lists every other source with its license. Three Vitest reference files in `.cursor/skills/qa-unit/references/` are unchanged MIT-licensed copies. Their license files sit in the same folder, so keep them when you copy `.cursor/`. The plan, generate, and heal skills began from Playwright's agent definitions, under Apache-2.0.
