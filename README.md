# Cursor QA agent

This kit is a set of Cursor files that you copy into a React or Next.js app, so that the Cursor agent writes and fixes the app's tests: Vitest unit and integration tests, Playwright end-to-end tests, and Maestro flows for a mobile app (a preview). The agent reads your application source and does not edit it, and when a test fails because the product is wrong, it reports the bug instead of weakening the test. It is written to work on low-cost and mid-tier models: each job is one skill of numbered steps, every test run ends with one verdict line, and a hook enforces the rules that a small model drops.

Application code lives in places such as `app/` or `src/`. Tests live under `test/`.

The hook applies to every Cursor agent in the folder, not only to these skills. It denies an edit to application source and a command such as `npm install`. Run such commands yourself. See [Limits](#limits).

## Requirements

- **Node** `^22.22.2 || ^24.15.0 || >=26.0.0`: 22.22.2 or later in the 22 line, 24.15.0 or later in the 24 line, or 26 and up. This is `engines.node` in [`package.json`](package.json). `jsdom` sets the lower bounds. Only Node 24 was run.
- **npm.** The hook lets the agent run `npm run` and `npx`. It denies `pnpm`, `yarn`, and `bunx`.
- **Python 3.9 or later**, started as `python3`, with no packages. The hook is a Python script. Its tests pass on Python 3.9, 3.12, and 3.14.
- **Cursor 2.4 or later.** Cursor's changelog names 2.4 as the first version with skills, subagents, and the `preToolUse` hook event. Checked: an earlier version of the hook ran in Cursor 3.22, and the hook's tests send payloads in the shapes that Cursor 3.22 logged and that the code of Cursor 3.23 builds. Not checked: an older Cursor, and this version of the skills and the hook in a live Cursor session.
- **Operating system.** Everything here was run on Linux only. macOS was not run. Windows was not run, and the kit is not expected to work there as shipped: `.cursor/hooks.json` starts the hook by its `.py` path, and Windows cannot start a file that way. The hook is registered with `failClosed: true`, and Cursor's documentation says a hook that fails then blocks the action. So on Windows every action would be blocked.
- **Google Chrome**, for the plan and generate jobs. The Playwright MCP server drives the installed Chrome. `npx playwright install chromium` installs the browser for test runs only.
- **The executable bit on the hook.** Cursor starts `.cursor/hooks/guard-test-writes.py` by its path. Git and the installer keep the bit. If a copy lost it, run `chmod +x .cursor/hooks/guard-test-writes.py`.

The mobile skills need more. See [Mobile](#mobile).

### If every action is denied

The hook did not start. In the shell that Cursor uses, from the root of your app, run:

```bash
python3 --version
printf '%s' '{"hook_event_name":"beforeShellExecution","command":"npm run test:unit","cwd":""}' | .cursor/hooks/guard-test-writes.py
```

The second command should print `{"permission": "allow"}`.

| It prints | Do |
| --- | --- |
| `Permission denied` | Run the `chmod` command above. |
| `env: 'python3': No such file or directory` | Install Python 3.9 or later, or put `python3` on the `PATH` of that shell. |

What Cursor itself shows in these two cases was not seen. The code of Cursor 3.23 has a message for a hook that fails, which starts with `Tool blocked because this hook is configured to fail closed`.

If nothing is ever denied, check that the workspace is trusted. Cursor's documentation says project hooks load only in a trusted workspace.

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
@playwright/mcp
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

Open the app folder in Cursor with **File → Open Folder** as a trusted workspace, and use **Agent** mode in chat.

### Or use the installer

`scripts/install-into.mjs` does the copy and merge steps above. From the clone:

```bash
node scripts/install-into.mjs ../my-app --dry-run
node scripts/install-into.mjs ../my-app
```

The first command prints what would change and writes nothing. The second copies the paths in the list above, adds the dev dependencies and the four scripts to your `package.json`, and adds the `.gitignore` lines you lack. It does not run `npm install`.

It never deletes a file and never replaces one. A file, a dependency range, or a script that your app already has with other content is left alone and listed as skipped. Merge those by hand, or pass `--force` to take the kit's version of every one of them.

### If your app already has these files

| File | What to do |
| --- | --- |
| `.cursor/hooks.json` | Keep yours. Add the kit's three entries, `preToolUse`, `beforeShellExecution`, and `beforeMCPExecution`, each with the command `.cursor/hooks/guard-test-writes.py` and `failClosed: true`. |
| `.cursor/mcp.json` | Keep yours. Add the `playwright` entry from the kit's file, and the `maestro` entry if you test a mobile app. |
| `.cursor/rules/` | Your rules stay. The kit adds `test-file-conventions.mdc` and `mobile-test-conventions.mdc`. |
| `AGENTS.md` | Keep yours and put the kit's text at the top. |
| `.cursorignore` | Keep yours and add the kit's lines. The hook reads this file too. Without the file, the hook holds back lockfiles only. |
| `test/` | Your tests stay. The kit adds `test/setup.ts`, `test/e2e/seed.spec.ts`, and empty folders. The agent can move or delete a file whose name breaks the hook's rules, such as a `.tsx` test or a file in `__tests__/`, but it cannot edit one. |
| `vitest.config.ts`, `playwright.config.ts` | Take the kit's files and move your own settings into them. The skills need the verdict reporter, the `unit` and `integration` projects, and `testDir: './test/e2e'`. |

### Things that go wrong on install

- **`@types/node` must be 22, or 24 and up.** A new Next.js app has `"@types/node": "^20"`. `npm install` then stops with `ERESOLVE`, because Vitest 5 accepts `^22.0.0 || >=24.0.0`. Use the range in this repo's `package.json`. The installer leaves your range alone and says so.
- **`next build` type-checks your tests.** A new Next.js app includes every `.ts` file in `tsconfig.json`. A type error in a test then fails the app build while Vitest still passes. To keep tests out of the build, add `test` to `exclude` in `tsconfig.json`. The example app does.
- **`next dev` adds to `AGENTS.md`.** Under a coding agent, Next.js 16.4 adds its own block to `AGENTS.md` when `next dev` starts. The block tells the agent to read files under `node_modules/`, which the hook denies. Set `agentRules: false` in `next.config.ts` to stop it. The example app does.
- **`vitest.config.ts` needs Vite 8.** Vitest 5 installs Vite 8 unless your app already depends on Vite 6 or 7. With Vite 7 an import alias such as `@/lib/db` does not resolve, and `tsc` reports `'tsconfigPaths' does not exist in type 'AllResolveOptions'`. Vite 6 was not tried.
- **A Vite warning starts every Vitest run** in an app whose `package.json` has no `"type": "module"`. It begins with `(!) Your Vite config uses features`. The run is not affected.

## Start a job

In Agent chat, type `/` and pick a skill from the menu. Then add the file or the feature. Ask for one job in one prompt.

| Job | Prompt | What the agent does |
| --- | --- | --- |
| Unit or integration test | `/qa-unit src/components/SignIn.tsx` | Writes `test/unit/components/SignIn.test.ts` with 2 to 6 tests and runs it. Give it a test file instead, and it runs that file and fixes it. |
| Plan | `/qa-plan sign-in` | Opens the feature in the browser and saves `test/e2e/plan/sign-in.plan.md` with 3 to 8 scenarios. |
| Generate | `/qa-generate test/e2e/plan/sign-in.plan.md` | Turns the plan into page classes in `test/e2e/pages/` and the spec `test/e2e/sign-in.spec.ts`, then runs the spec. |
| Heal | `/qa-heal test/e2e/sign-in.spec.ts` | Runs one failing spec and fixes the test, one line at a time, in at most three rounds. |

- `/qa-unit` mirrors the source path and drops a leading `src/` or `app/`. A `.tsx` or `.jsx` file gets a jsdom test. A file named `route.ts`, or under an `api/` folder, goes to `test/integration/`. Say `unit test` or `integration` in the prompt to choose the folder yourself.
- Before plan and generate, start the app and turn on the `playwright` MCP server. See [The app under test](#the-app-under-test) and [Tools](#tools).
- `/qa-plan sign-in` opens `http://localhost:3000/sign-in`. If the app or the page is somewhere else, say so, and give a test account if the feature needs one: `/qa-plan checkout. Base URL http://localhost:4000. Route /cart/checkout. Test account ada@example.com / correct-horse-battery.`
- When the app is wrong, no skill changes what the test expects. `/qa-unit` and `/qa-generate` leave the test failing and name the source line under `Bug:`. `/qa-heal` marks that one test and reports it:

  ```ts
  // product bug: src/components/SignIn.tsx:7 expected "Email or password is incorrect", got "Invalid credentials"
  test.fixme('Wrong password shows an error', async ({ page }) => {
  ```

`/qa` and a plain request, such as "Write a unit test for src/components/SignIn.tsx", also work. [`AGENTS.md`](AGENTS.md) is always in the model's context, and it has a table from the kind of request to the one skill file to read. `/qa` asks the model to hand the request to the subagent in [`.cursor/agents/qa.md`](.cursor/agents/qa.md), which has the same table. On both routes the model must pick the skill file and read it. With a slash skill, Cursor attaches the skill's text to your message. Whether a skill name that is typed or pasted, and not picked from the menu, attaches the skill was not checked.

### The reply and the verdict line

Every skill ends with a form that the agent fills in. This is the form of `/qa-unit`:

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

`Verdict:` is `PASS`, `FAIL`, or `BLOCKED:` with what you need to do, such as start the app. A plan ends with `DONE`. The last line, `Not checked:`, says what the agent did not run or verify.

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
- Some runs print no line: `npm run test:e2e:list`, a run with a `--reporter` flag, and a Vitest run that is killed. No line is never a pass.
- On a new install with no tests, `npm run test:unit` exits 0 and prints `QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: no tests ran`.

### With a small model

- Pick the skill from the `/` menu. `/qa` and a plain request leave the model one more choice to make.
- Keep each prompt to one file, one feature, or one plan.
- Ask for generate in two prompts. The first uses the browser, and the second does not:

  ```text
  /qa-generate test/e2e/plan/sign-in.plan.md page classes only
  /qa-generate test/e2e/plan/sign-in.plan.md spec only
  ```

- When the reply says `BLOCKED`, do what the line says and ask again.

## Tools

[`.cursor/mcp.json`](.cursor/mcp.json) lists two MCP servers. Turn a server on in Cursor settings for the jobs that need it, and restart it if Cursor does not show it. Every enabled MCP server adds its tool list to each request, so keep both off while you only write unit or integration tests.

| Tool | Used for |
| --- | --- |
| `playwright` MCP | Exploring a live page in `/qa-plan` and `/qa-generate` |
| `maestro` MCP | Reading the device screen in `/qa-mobile-plan` and `/qa-mobile-heal` |
| `playwright-cli` | Looking at the page of a paused spec in `/qa-heal` (a spec run with `--debug=cli`, then `playwright-cli attach`) |
| `npx vitest` | Running unit and integration tests from the shell |

The agent runs every test command with `RTK_DISABLED=1` in front. See [Using RTK](#using-rtk) for why.

## The app under test

End-to-end tests open the app at `http://localhost:3000`. Playwright starts it with `npm run dev` when nothing is listening there.

The plan and generate jobs use the browser tool, which starts nothing, and the hook denies `npm run dev` to the agent. Start the app yourself before you ask for a plan or a spec. Without it the reply is `BLOCKED: start the app with npm run dev, then ask again.`

If your app runs somewhere else, start it yourself and set `BASE_URL`:

```bash
BASE_URL=http://localhost:4000 npm run test:e2e
```

In a prompt, name the address in words: `/qa-plan sign-in. Base URL http://localhost:4000.` On the agent's own command line, `BASE_URL` may only name `localhost` or `127.0.0.1`.

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
test/mobile/               Maestro plans and flows, see Mobile

AGENTS.md                  Write scope, the table from request to skill, and the test commands
.cursor/skills/qa-*/       One skill for each job, with its templates
.cursor/agents/qa.md       The /qa router
.cursor/rules/             Where each kind of test file goes
.cursor/hooks/             The hook and its tests
.cursor/hooks.json         Registers the hook with Cursor
.cursor/mcp.json           The playwright and maestro MCP servers
.cursor/qa/                The verdict reporters and the VERSION file
```

Unit and integration test files end in `.test.ts` and contain no JSX.

To run the tests yourself:

```bash
npm run test:unit
npm run test:integration
npm run test:e2e
```

`npm run test:e2e:list` prints the Playwright tests without running them.

## What the hook does

Cursor starts [`.cursor/hooks/guard-test-writes.py`](.cursor/hooks/guard-test-writes.py) before a tool call or a shell command of any agent in the folder. The hook answers allow or deny. Every deny carries a message that names the cause and says what to do instead.

- **File edits.** The agent's file tools may write in `test/**`, `vitest.config.ts`, `playwright.config.ts`, the root `README.md`, `.gitignore`, `AGENTS.md`, `.cursor/skills/**`, and `.cursor/agents/**`. The hook denies a file edit elsewhere in the project.
- **Test files.** Under `test/` the hook holds the file names: `.ts` and never `.tsx`, no `__tests__/` folder, page classes as `test/e2e/pages/<name>-page.ts`, plans as `<name>.plan.md`. It denies a write that adds text which hides a failing test, such as `.only(`, `.skip(`, `.todo(`, or `waitForTimeout(`. `test.fixme(` needs a `// product bug:` line above it.
- **Shell.** Allowed: a test run that names a path under `test/`, the four `npm run test:*` scripts, reads such as `ls`, `cat`, and `grep`, and `git` and `gh` within limits. Force push, a switch to an existing branch, and merge are denied. So is a command that is not on the list, such as `npm install`, `npm run dev`, `curl`, or `cd` into a folder.
- **MCP tools.** A file that an MCP tool writes must be inside the paths above. A few tools are denied by name, such as the Playwright tool that runs code outside the page.
- **Reads.** [`.cursorignore`](.cursorignore) keeps lockfiles, build output, and test reports out of the agent's context. Cursor does not apply it to shell commands, so the hook does. Add your app's large fixtures or generated code there.

[docs/hook-rules.md](docs/hook-rules.md) lists every rule, with examples that the hook's own tests run, and says how to find out why a command was denied.

### Limits

- **What the hook checks:** file-editing tool calls, the text of shell commands, and the name and file arguments of MCP tool calls.
- **What it does not check:** what a program does after it starts. A test file, a config file, a setup file, and a Maestro flow are code, and Vitest, Playwright, and Maestro run them with your permissions. A test that writes to `src/` passes the hook, because the hook sees only an allowed test command. The hook also does not see what an MCP tool does once it runs, and its MCP rules have not been seen working in a live Cursor session.
- **The hook is a guardrail and not a sandbox.** It keeps an agent that follows its instructions out of application source. It will not hold against an agent that follows instructions injected through a source file or a web page.

Three more things to know:

- The hook reads a command line before the shell does, and it can read one wrongly. Gaps of that kind were closed in [issue 8](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/8), in [issue 9](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/9), and in this version. More may exist. The rules document lists the [known limits](docs/hook-rules.md#known-limits-and-unverified-behaviour).
- The agent may read any file that `.cursorignore` does not name. That list saves context. It does not keep secrets.
- In a workspace that is not trusted, Cursor does not load project hooks, by its documentation. Nothing is checked there.

If you need a real boundary, add a stronger layer. Run the agent in a container with application source mounted read-only, or add a CI check that fails a pull request when `git diff --name-only` lists a path outside the write scope.

The full list is under [What it does not check](docs/hook-rules.md#what-it-does-not-check) in the rules document.

## Mobile

Three more skills plan, write, and fix [Maestro](https://maestro.dev) flows for an Android or iOS app. Treat them as a preview.

- Checked: every flow template and every command in the skills, against Maestro 2.10.0 with no device attached.
- Not checked: a flow run on a device, anything on iOS, and the skills on a model.

You need:

- The [Maestro CLI](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli), 2.6.0 or later, and Java 17 or later.
- Android: `adb` on your `PATH`, and a running emulator or a device with USB debugging.
- iOS: a Mac with Xcode and a booted Simulator. Physical iOS devices are not supported.

You start the device and install the app. The agent never boots a device, never installs an app, and never switches to the other platform. Install a real build of the app, not Expo Go: the flows launch the app under its own id. For plan and heal, turn on the `maestro` MCP server in Cursor settings, and keep it off when you do no mobile work.

Every flow starts by clearing the app's data on the device, and Maestro installs two helper apps of its own there. Do not point the skills at a device whose app data you need.

Name the platform and the app id in the prompt:

| Job | Prompt | What the agent does |
| --- | --- | --- |
| Plan | `/qa-mobile-plan sign-in. This is Android. App id com.example.app` | Walks one feature on the device and saves `test/mobile/plan/sign-in.plan.md` with the texts and ids it saw. |
| Generate | `/qa-mobile-generate test/mobile/plan/sign-in.plan.md. This is Android.` | Writes one flow file for each scenario in `test/mobile/sign-in/`, then runs that folder. |
| Heal | `/qa-mobile-heal test/mobile/sign-in/02-wrong-password.flow.yaml. This is Android.` | Runs one failing flow, reads the screen where it stops, and makes the smallest fix. |

One flow file serves both platforms. A product bug is not hidden: the flow gets the tag `fixme` and a `# product bug:` comment that names the source line.

```text
test/mobile/plan/<feature>.plan.md                Plans
test/mobile/<feature>/<nn>-<scenario>.flow.yaml   Flows, one scenario per file
test/mobile/subflows/<name>.yaml                  Start steps shared by the flows of one plan
test/mobile/config.yaml                           Settings for a run of the whole folder
```

To run the flows of one feature yourself:

```bash
maestro test --platform android --exclude-tags=fixme -e APP_ID=com.example.app test/mobile/sign-in
```

`--exclude-tags=fixme` leaves out the flows that record a product bug. It has no effect when you pass a single file.

Known limits:

- With no device, each skill stops and tells you what to start. On Linux or Windows the skills stop when the prompt says iOS.
- After `maestro test` has run, the `maestro` MCP server may lose the device. This comes from reading Maestro's source and was not run. Plan and heal then ask you to turn the server off and on.
- An element with no id is found by its text. The agent does not add a `testID` to your source.
- Maestro cannot mock the network, so the skills plan no scenario that needs the server to fail.
- Maestro sends usage analytics unless `MAESTRO_CLI_NO_ANALYTICS` is set in your environment.

The device checks are tracked in [issue 23](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/23) for Android and [issue 24](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/24) for iOS.

## Example app and evaluation

Neither is part of the files you copy.

[`examples/next-app/`](examples/next-app/) is a small Next.js app with a sign-in form, a session route, a dashboard page, and hand-written reference tests in the layout the skills produce. The kit is tested against it:

```bash
node scripts/test-example.mjs
```

This copies the example to a temporary folder, installs the kit there with `scripts/install-into.mjs`, and runs `npm install`, the build, and the three test commands. It stops at the first failure. The installer reads the copy list and the dependency list from this README, so a path or a package that is missing from them fails the run. Pass `--port 3100` when port 3000 is busy, and `--keep` to keep the folder.

[`eval/`](eval/) holds nine fixed test jobs on the example app and a scorer that needs no model. It is for comparing two versions of the skills, or two models, on the same work. The scorer runs the tests itself and marks a reply that says `PASS` over a failing run as `FALSE PASS`. See [`eval/README.md`](eval/README.md).

## Upgrading

`.cursor/qa/VERSION` holds the version of the kit you copied:

```bash
cat .cursor/qa/VERSION
```

A copy without that file is older than 0.1.0. [CHANGELOG.md](CHANGELOG.md) lists what changed, and starts with the things you must do.

To upgrade, copy the files again. A dry run of the installer lists every file of yours that differs from the new version as skipped.

- **Safe to overwrite:** `.cursor/skills/qa-*/`, `.cursor/agents/qa.md`, `.cursor/hooks/`, `.cursor/qa/`, and the kit's two files in `.cursor/rules/`, unless you changed them yourself.
- **Merge by hand:** `AGENTS.md`, `vitest.config.ts`, `playwright.config.ts`, `.cursorignore`, `.gitignore`, `.cursor/hooks.json`, `.cursor/mcp.json`, `test/setup.ts`, and the scripts and dev dependencies in `package.json`.
- **Delete by hand:** a skill folder that the new version no longer has. A copy over the old `.cursor/` leaves it behind, and the installer never deletes.

Version 0.1.0 renamed the skills. Delete `vitest-unit-integration`, `playwright-planner`, `playwright-generator`, `playwright-healer`, `playwright-page-objects`, and `playwright-cli` from `.cursor/skills/`. Type `/qa-unit`, `/qa-plan`, `/qa-generate`, or `/qa-heal` where you typed `/qa`.

## Contributing, security, and license

- [CONTRIBUTING.md](CONTRIBUTING.md) says how a skill is laid out, which checks to run, which files must stay in step, and how to release. Everyone who takes part follows the [code of conduct](CODE_OF_CONDUCT.md).
- [SECURITY.md](SECURITY.md) says how to report a security problem in private.
- [MIT](LICENSE) is the license for the files written for this project.
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) lists every other source with its license. Three Vitest reference files in `.cursor/skills/qa-unit/references/` are unchanged copies from other projects, under the MIT license. Their license files sit in the same folder, so keep them when you copy `.cursor/`. The plan, generate, and heal skills began from Playwright's agent definitions, under Apache-2.0.
