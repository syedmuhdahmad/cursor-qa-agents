# Cursor QA agent

This kit is a set of Cursor files that you copy into a React or Next.js app, so that the Cursor agent writes and fixes the app's tests: Vitest unit and integration tests, Playwright end-to-end tests, and Maestro flows for a mobile app (a preview). The agent reads your application source and does not edit it. When a test fails because the product is wrong, it reports the bug instead of weakening the test.

It is written for low-cost and mid-tier models: each job is one skill of numbered steps, every test run ends with one verdict line, and a hook enforces the rules that a small model drops. In Cursor's own agent, Composer 2.5 passed 18 of 18 runs of the kit's evaluation cases and Claude Opus 5 passed 9 of 9. [Evaluation](#evaluation) says what that does not cover.

The hook applies to every Cursor agent in the folder. It denies an edit to application source and a command such as `npm install`, so run those yourself. See [What the hook does](#what-the-hook-does).

This file is the short version. The [wiki](https://github.com/syedmuhdahmad/cursor-qa-agents/wiki) is a guide by topic, and the files under [`docs/`](docs/) hold the detail.

## Requirements

- **Node** `^22.22.2 || ^24.15.0 || >=26.0.0`, which is `engines.node` in [`package.json`](package.json).
- **npm.** The hook denies `pnpm`, `yarn`, and `bunx` to the agent.
- **Python 3.9 or later**, started as `python3`, with no packages. The hook is a Python script.
- **Cursor 2.4 or later**, by Cursor's changelog the first version with skills, subagents, and the `preToolUse` hook event.
- **Linux.** On macOS only the hook's tests were run. Windows is not expected to work as shipped: it cannot start the hook by its `.py` path.
- **Google Chrome**, for the plan and generate jobs. `playwright-cli` starts it.

The install notes have [the detail](docs/install-notes.md#requirements-in-detail), and say what to do [if every action is denied](docs/install-notes.md#if-every-action-is-denied). The mobile skills need more: see [Mobile](#mobile).

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

It merges the kit's entries into your own `.cursor/hooks.json` and `.cursor/mcp.json`. Any other file of yours with other content is skipped, unless you pass `--force`. It never deletes a file and never writes through a symbolic link. Read the end of the output: a `WARNING:` there means that a skipped file leaves part of the kit switched off, and a `NOTE:` names what an earlier version of the kit left in your app and this version no longer uses. See [What the installer does](docs/install-notes.md#what-the-installer-does).

### If your app already has these files

Keep your own `.cursor/hooks.json`, `.cursor/mcp.json`, `AGENTS.md`, `.cursorignore`, and `.gitignore`, and add the kit's entries. Take the kit's two config files and move your own settings into them. Your tests stay. The install notes say [what to do for each file](docs/install-notes.md#if-your-app-already-has-these-files).

### Things that go wrong on install

The install notes [list them with the fix for each](docs/install-notes.md#things-that-go-wrong-on-install). The most common one: `npm install` stops with `ERESOLVE` when your app has `"@types/node": "^20"`. Use the kit's range.

## Start a job

In Agent chat, type `/` and pick a skill from the menu. Then add the file or the feature. Ask for one job in one prompt.

| Job | Prompt | What the agent does |
| --- | --- | --- |
| Unit or integration test | `/qa-unit src/components/SignIn.tsx` | Writes `test/unit/components/SignIn.test.ts` with 2 to 6 tests and runs it. Given a test file, it runs and fixes that file. |
| Plan | `/qa-plan sign-in` | Opens the feature in the browser and saves `test/e2e/plan/sign-in.plan.md` with 3 to 8 scenarios. |
| Generate | `/qa-generate test/e2e/plan/sign-in.plan.md` | Writes page classes in `test/e2e/pages/` and the spec `test/e2e/sign-in.spec.ts`, then runs the spec. |
| Heal | `/qa-heal test/e2e/sign-in.spec.ts` | Runs one failing spec and fixes the test, one line at a time, in at most three rounds. |

- **Start the app yourself** before a plan or generate job. The hook denies `npm run dev` to the agent. Without the app, the reply is `BLOCKED: start the app with npm run dev, then ask again.`
- **The app must be on this machine.** For another port or route, say so: `/qa-plan checkout. Base URL http://localhost:4000. Route /cart/checkout.`
- **When the app is wrong, no skill changes what the test expects.** `/qa-unit` and `/qa-generate` leave the test failing and name the source line under `Bug:`. `/qa-heal` marks that one test `test.fixme(`, under a `// product bug:` comment that names the source line.
- **For a small model,** keep each prompt to one file, one feature, or one plan, and ask for generate in two prompts: first with `page classes only` after the path of the plan, then with `spec only`.

`/qa` and a plain request also work, through the table in [`AGENTS.md`](AGENTS.md). The model then has one more choice to make, so prefer the `/` menu.

### The reply and the verdict line

Every skill ends with a form that the agent fills in. `Verdict:` is `PASS`, `FAIL`, or `BLOCKED:` with what you need to do. A plan ends with `DONE`. The last line, `Not checked:`, says what the agent did not run.

The agent does not judge the runner's output. Every Vitest and Playwright run ends with one line that the agent copies:

```text
QA-VERDICT: PASS (passed 3, failed 0, skipped 0, files 1)
```

`PASS` means that at least one test ran and every test passed on its first attempt. A skipped test, a retried test, a stray `.only`, and a run with no tests are `FAIL`. No line is never a pass.

[docs/jobs.md](docs/jobs.md) has more on each job, a whole reply, every case of the line, [the browser steps](docs/jobs.md#the-browser-for-plan-and-generate), and [the app under test](docs/jobs.md#the-app-under-test). Every test command of the agent starts with `RTK_DISABLED=1`. That matters only if you use RTK: see [docs/rtk.md](docs/rtk.md).

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
test/mobile/               Maestro plans, element files, and flows, see Mobile

AGENTS.md                  Write scope, the table from request to skill, and the test commands
.cursor/                   The skills, the hook, the Maestro MCP server, and the verdict reporters
```

To run the tests yourself, use `npm run test:unit`, `npm run test:integration`, and `npm run test:e2e`. `npm run test:e2e:list` prints the Playwright tests without running them. The install notes list [every path of the kit](docs/install-notes.md#what-the-kit-puts-in-your-app).

## What the hook does

Cursor starts [`.cursor/hooks/guard-test-writes.py`](.cursor/hooks/guard-test-writes.py) before a tool call or a shell command of any agent in the folder. The hook answers allow or deny, and every deny says what to do instead.

- **File edits.** The agent may write in `test/**`, `vitest.config.ts`, `playwright.config.ts`, the root `README.md`, `.gitignore`, `AGENTS.md`, `.cursor/skills/**`, and `.cursor/agents/**`, and nowhere else in the project.
- **Test files.** A new file under `test/` must fit the layout: a test ends in `.ts` and never `.tsx`, no `__tests__/` folder, and a page class is `test/e2e/pages/<name>-page.ts` in lower case. The hook rules [list the names](docs/hook-rules.md#rules-for-files-under-test). A write may not add text that hides a failing test, such as `.only(`, `.skip(`, or `waitForTimeout(`. `test.fixme(` needs a `// product bug:` line above it.
- **Shell.** Allowed: a test run that names a path under `test/`, the four `npm run test:*` scripts, reads such as `ls`, `cat`, and `grep`, `git` and `gh` within limits, and `playwright-cli` on `http://localhost` and `http://127.0.0.1`. Denied: everything else, such as `npm install`, `npm run dev`, `curl`, and `cd`.
- **MCP tools and reads.** A file that an MCP tool writes must be inside the paths above. A shell read of a path in [`.cursorignore`](.cursorignore) is denied.

[docs/hook-rules.md](docs/hook-rules.md) lists every rule and says how to debug a deny.

### Limits

The hook is a guardrail and not a sandbox.

- It does not check what a program does after it starts. A test is code that runs with your permissions, so a test that writes to `src/` passes the hook.
- It checks the URL the agent opens, not where a link, a redirect, or a script on that page takes the browser next.
- It will not hold against an agent that follows injected instructions, and it can read a command line wrongly. Gaps of that kind were closed in [issue 8](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/8) and [issue 9](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/9). More may exist.
- Its rules for MCP tools have not been seen working in a live Cursor session.
- `.cursorignore` saves context and keeps no secrets. An untrusted workspace loads no project hooks.

For a real boundary, run the agent in a container with application source mounted read-only. See [what the hook does not check](docs/hook-rules.md#what-it-does-not-check) and its [known limits](docs/hook-rules.md#known-limits-and-unverified-behaviour).

## Mobile

Three more skills plan, write, and fix [Maestro](https://maestro.dev) flows for an Android or iOS app: `/qa-mobile-plan`, `/qa-mobile-generate`, and `/qa-mobile-heal`. Treat them as a preview. Parts were run on one Android emulator, with scripts in place of a model. Nothing was run on iOS, and the skills were not run on any model. You start the device and install the app, and every flow clears the app's data there. [docs/mobile.md](docs/mobile.md) has the layout, each job, what was run, and the [open points](docs/mobile.md#open-points).

## Evaluation

[`examples/next-app/`](examples/next-app/) is a small Next.js app with reference tests, and [`eval/`](eval/) holds nine fixed test jobs on it with a scorer that needs no model. The scorer runs the tests itself, and marks a reply that says the work passed over a failing run as `FALSE PASS`. Neither is part of the files you copy.

In round 4, Cursor's own agent did the work, with the skill attached and the hook live:

| Model | Runs passed |
| --- | --- |
| Composer 2.5 | 18 of 18, two runs for each case |
| Claude Opus 5 | 9 of 9, one run for each case |

Every run passed every check, and no reply claimed a pass over a failing run. Read the numbers as a good sign and not as proof:

- Each case had one or two runs, and every case is on the one example app.
- No agent tried anything the hook forbids, so the round does not show how a model goes on after a deny.
- The mobile skills were not run on any model, and nothing was run on iOS or Windows.

[docs/evaluation.md](docs/evaluation.md) has every round by case, and [eval/results/README.md](eval/results/README.md) says how each round was run. [Issue 30](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/30) tracks what is not tested.

## Checks and CI

To check a change to the kit itself, [CONTRIBUTING.md](CONTRIBUTING.md#checks) lists the commands and says what each one checks. [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs them on every pull request and on every push to `main`.

## Upgrading

`.cursor/qa/VERSION` holds the version of the kit you copied. A copy without that file is older than 0.1.0. [CHANGELOG.md](CHANGELOG.md) starts with the things you must do.

To upgrade, copy the files again or run the installer: its dry run lists every file of yours that differs. Overwrite the kit's own folders under `.cursor/`, merge the files you changed, and delete a skill folder that the new version no longer has. The install notes [name the files of each group](docs/install-notes.md#upgrading).

## Contributing, security, and license

- [CONTRIBUTING.md](CONTRIBUTING.md) says how a skill is laid out and which files must stay in step. Everyone who takes part follows the [code of conduct](CODE_OF_CONDUCT.md).
- [SECURITY.md](SECURITY.md) says how to report a security problem in private.
- [MIT](LICENSE) is the license for the files written for this project. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) lists every other source with its license. Three Vitest reference files in `.cursor/skills/qa-unit/references/` are unchanged MIT-licensed copies. Their license files sit in the same folder, so keep them when you copy `.cursor/`. `.cursor/skills/playwright-cli/` is an Apache-2.0 copy of the skill in the `@playwright/cli` package, with its `LICENSE` file in the folder. The plan, generate, and heal skills began from Playwright's agent definitions, under Apache-2.0.
