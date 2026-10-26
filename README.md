# QA agent kit

This kit makes the AI agent in your editor write and fix your app's tests. You copy its files into a React, Next.js, or React Native app. Then the Cursor agent writes Vitest unit and integration tests, Playwright end-to-end tests, and Jest unit tests in a React Native or Expo app. It also writes Maestro flows for a mobile app, as a preview. The agent reads your application source and does not edit it. When a test fails because the product is wrong, it reports the bug instead of weakening the test. The kit also carries Cloudflare's security audit skill, for a high-tier model.

It is written for low-cost and mid-tier models: each job is one skill of numbered steps, every test run ends with one verdict line, and a hook enforces the rules that a small model drops. In Cursor's own agent, Composer 2.5 passed 26 of 26 runs of the kit's evaluation cases. [Evaluation](#evaluation) says what that does not cover.

The hook applies to every Cursor agent in the folder. It denies an edit to application source and a command such as `npm install`, so run those yourself. See [The hook](#the-hook).

## What it supports

| Your app | Tests the agent writes | Status | Manual |
| --- | --- | --- | --- |
| React or Next.js | Vitest unit and integration tests, Playwright end-to-end tests | Supported | [QA manual for web apps][manual-web] |
| React Native or Expo | Jest unit tests with React Native Testing Library | Supported | [QA manual for React Native][manual-rn] |
| React Native or Expo | Maestro flows | Preview. Run on Android only, never on iOS | [Mobile testing with Maestro][wiki-mobile] |
| .NET | xUnit v3, Testcontainers, Playwright for .NET | Planned for v0.4.0 | [QA manual for .NET][manual-dotnet] |

The agent today is Cursor's. Version 1.0 is planned to install with one command, `npx qa-agent-kit`, into Claude Code, Cursor, GitHub Copilot, and OpenAI Codex, and to connect to Jira. [docs/roadmap.md](docs/roadmap.md) has the plan and the dates.

## Documentation

This README is the overview. The [wiki][wiki] is the full manual, and the files under [`docs/`](docs/) are the reference detail. The repository wins when the two differ.

| Page | What it has |
| --- | --- |
| [Getting started][wiki-start] | Your first hour: install, the first unit test, a plan, a generated spec, and how to read the reply |
| [Skills and example prompts][wiki-prompts] | Every skill, the prompts it takes, the files it writes, and its `BLOCKED` replies |
| [QA manual for web apps][manual-web] | Day-to-day QA work in a React or Next.js app: which test to write, workflows, and a review checklist |
| [QA manual for React Native][manual-rn] | The same for a React Native or Expo app, with Jest and Maestro |
| [QA manual for .NET][manual-dotnet] | What is planned for .NET, and what to do by hand until then |
| [Installation][wiki-install] | Requirements, the installer, copying by hand, and files your app already has |
| [Jobs and commands][wiki-jobs] | The reply form, every case of the verdict line, and the app under test |
| [The hook][wiki-hook] | What the hook allows and denies, and its limits |
| [Layout and files][wiki-layout] | Where each test goes, and every file the kit puts in your app |
| [Mobile testing with Maestro][wiki-mobile] | The three mobile jobs, element files, and what was run |
| [Security audit][wiki-audit] | Cloudflare's audit skill: when to use it and where the report goes |
| [Upgrading][wiki-upgrade] | Moving to a newer version of the kit |
| [Troubleshooting][wiki-trouble] | Symptoms, causes, and fixes, from install to a denied command |
| [Supported models and evaluation][wiki-eval] | The three model tiers, and what was run on each |
| [Using RTK][wiki-rtk] | Why every test command starts with `RTK_DISABLED=1` |
| [Roadmap and open issues][wiki-roadmap] | The plan to 1.0, and where the work is tracked |
| [Contributing][wiki-contrib] | Checks, style, and how a release is made |

## Requirements

- **Node** `^22.22.2 || ^24.15.0 || >=26.0.0`, which is `engines.node` in [`package.json`](package.json).
- **npm.** The hook denies `pnpm`, `yarn`, and `bunx` to the agent.
- **Python 3.9 or later**, started as `python3`, with no packages. The hook is a Python script.
- **Cursor 2.4 or later**, by Cursor's changelog the first version with skills, subagents, and the `preToolUse` hook event.
- **Linux.** On macOS only the hook's tests were run. Windows is not expected to work as shipped: it cannot start the hook by its `.py` path.
- **Google Chrome**, for the plan and generate jobs. `playwright-cli` starts it.

The install notes have [the detail](docs/install-notes.md#requirements-in-detail), and say what to do [if every action is denied](docs/install-notes.md#if-every-action-is-denied). The mobile skills need more: see [Mobile testing with Maestro][wiki-mobile].

## Add it to your app

Clone this repository next to your app:

```bash
git clone https://github.com/syedmuhdahmad/qa-agent-kit.git
```

### With the installer

`scripts/install-into.mjs` does the copy and merge steps of the next section. From the clone:

```bash
node scripts/install-into.mjs ../my-app --dry-run
node scripts/install-into.mjs ../my-app
```

The first command prints what would change and writes nothing. The second does the steps, and adds `test/tsconfig.json` when your app has a `tsconfig.json`. It does not run `npm install`.

It merges the kit's entries into your own `.cursor/hooks.json` and `.cursor/mcp.json`. Any other file of yours with other content is skipped, unless you pass `--force`. It never deletes a file and never writes through a symbolic link. Read the end of the output: a `WARNING:` there means that a skipped file leaves part of the kit switched off, and a `NOTE:` names what an earlier version of the kit left in your app and this version no longer uses. See [What the installer does](docs/install-notes.md#what-the-installer-does).

Then install dependencies and, in a web app, the Chromium browser Playwright uses:

```bash
npm install
npx playwright install chromium
```

Open the app folder in Cursor with **File → Open Folder** as a trusted workspace, and use **Agent** mode in chat. In a monorepo, copy the kit into the app package and open that package folder.

### By hand

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

In a React Native or Expo app, the installer leaves out the web files, adds these dev dependencies in place of the ones above, and adds one script, `"test:rn-unit": "jest --config .cursor/qa/jest.config.cjs --ci"`.

<!-- install:react-native-dev-dependencies -->

```text
@testing-library/react-native
@types/jest
jest
test-renderer
```

Your app needs a Jest preset of its own, such as `"jest": { "preset": "jest-expo" }` in `package.json`. [A React Native app](docs/install-notes.md#a-react-native-app) in the install notes has the detail.

### If your app already has these files

Keep your own `.cursor/hooks.json`, `.cursor/mcp.json`, `AGENTS.md`, `.cursorignore`, and `.gitignore`, and add the kit's entries. Take the kit's two config files and move your own settings into them. Your tests stay. The install notes say [what to do for each file](docs/install-notes.md#if-your-app-already-has-these-files).

### Things that go wrong on install

The most common one: `npm install` stops with `ERESOLVE` when your app has `"@types/node": "^20"`. Use the kit's range. [Troubleshooting][wiki-trouble] lists the others with the fix for each.

## Getting started

A first session in a web app, with the app running on `http://localhost:3000`. The examples use a profile form at `src/components/ProfileForm.tsx`, shown at `/profile`. Use your own file names.

1. Start the app yourself with `npm run dev`. The hook denies that command to the agent.
2. In Agent chat, type `/qa-unit src/components/ProfileForm.tsx`. The agent writes `test/unit/components/ProfileForm.test.ts`, runs it, and replies with a form that ends in `Verdict:` and `Not checked:`.
3. Type `/qa-plan profile`. The agent opens `http://localhost:3000/profile` in Chrome and saves `test/e2e/plan/profile.plan.md`. Read the plan, and delete a scenario you do not want.
4. Type `/qa-generate test/e2e/plan/profile.plan.md`. The agent writes `test/e2e/pages/profile-page.ts` and `test/e2e/profile.spec.ts`, and runs the spec.
5. When the spec fails later, after a change to the page, type `/qa-heal test/e2e/profile.spec.ts`.
6. Run the tests yourself with `npm run test:unit`, `npm run test:integration`, and `npm run test:e2e`.

[Getting started][wiki-start] in the wiki walks through each step with the whole reply, and says what to do after `FAIL` and `BLOCKED`.

## Start a job

In Agent chat, type `/` and pick a skill from the menu. Then add the file or the feature. Ask for one job in one prompt.

| Job | Example prompt | What the agent does |
| --- | --- | --- |
| Unit test | `/qa-unit src/components/ProfileForm.tsx` | Writes `test/unit/components/ProfileForm.test.ts` with 2 to 6 tests and runs it. Given a test file, it runs and fixes that file. |
| Integration test | `/qa-unit app/api/profile/route.ts` | Writes `test/integration/api/profile/route.test.ts`. A `route.ts` file, or a file under an `api/` folder, goes to `test/integration/`. Say `integration` or `unit test` to choose the folder yourself. |
| Plan | `/qa-plan profile` | Opens the feature in the browser and saves `test/e2e/plan/profile.plan.md` with 3 to 8 scenarios. |
| Generate | `/qa-generate test/e2e/plan/profile.plan.md` | Writes page classes in `test/e2e/pages/` and the spec `test/e2e/profile.spec.ts`, then runs the spec. |
| Heal | `/qa-heal test/e2e/profile.spec.ts` | Runs one failing spec and fixes the test, one line at a time, in at most three rounds. |
| React Native unit test | `/qa-rn-unit src/components/ProfileForm.tsx` | In a React Native or Expo app: writes `test/unit/components/ProfileForm.test.ts` with Jest and React Native Testing Library, and runs it. Given a test file, it runs and fixes that file. |
| Mobile plan | `/qa-mobile-plan profile. This is Android. App id com.example.app` | Walks one feature on the device and saves `test/mobile/plan/profile.plan.md`. |
| Mobile generate | `/qa-mobile-generate test/mobile/plan/profile.plan.md. This is Android. App id com.example.app` | Writes element files and Maestro flows under `test/mobile/profile/`, then runs the flows. |
| Mobile heal | `/qa-mobile-heal test/mobile/profile/02-taken-name.flow.yaml. This is Android. App id com.example.app` | Runs one failing flow and fixes a selector in the element file. |
| Security audit | `/security-audit Run a quick audit of this codebase (quick profile), with a budget of 20 agent invocations.` | Not a test job. For a high-tier model only. See [Security audit][wiki-audit]. |

- **Start the app yourself** before a plan or generate job. Without it, the reply is `BLOCKED: start the app with npm run dev, then ask again.`
- **The app must be on this machine.** For another port, route, or a signed-in page, say so in words: `/qa-plan profile. Base URL http://localhost:4000. Route /settings/profile. Test account ada@example.com / correct-horse-battery.`
- **When the app is wrong, no skill changes what the test expects.** `/qa-unit`, `/qa-rn-unit`, and `/qa-generate` leave the test failing and name the source line under `Bug:`. `/qa-heal` marks that one test `test.fixme(`, under a `// product bug:` comment that names the source line. `/qa-mobile-heal` tags the flow `fixme`.
- **For a small model,** keep each prompt to one file, one feature, or one plan, and ask for generate in two prompts: `/qa-generate test/e2e/plan/profile.plan.md page classes only`, then `/qa-generate test/e2e/plan/profile.plan.md spec only`.

`/qa` and a plain request also work, through the table in [`AGENTS.md`](AGENTS.md). The model then has one more choice to make, so prefer the `/` menu. [Skills and example prompts][wiki-prompts] has every prompt each skill takes.

### The reply and the verdict line

Every skill ends with a form that the agent fills in. `Verdict:` is `PASS`, `FAIL`, or `BLOCKED:` with what you need to do. A plan ends with `DONE`. The last line, `Not checked:`, says what the agent did not run.

The agent does not judge the runner's output. Every Vitest, Playwright, and Jest run ends with one line that the agent copies:

```text
QA-VERDICT: PASS (passed 3, failed 0, skipped 0, files 1)
```

`PASS` means that at least one test ran and every test passed on its first attempt. A skipped test, a retried test, a stray `.only`, and a run with no tests are `FAIL`. No line is never a pass.

[docs/jobs.md](docs/jobs.md) has a whole reply, every case of the line, [the browser steps](docs/jobs.md#the-browser-for-plan-and-generate), and [the app under test](docs/jobs.md#the-app-under-test). Every test command of the agent starts with `RTK_DISABLED=1`. That matters only if you use RTK: see [Using RTK][wiki-rtk].

## The hook

Cursor starts [`.cursor/hooks/guard-test-writes.py`](.cursor/hooks/guard-test-writes.py) before a tool call or a shell command of any agent in the folder. The hook answers allow or deny, and every deny says what to do instead.

- **File edits.** The agent may write in `test/**`, `vitest.config.ts`, `playwright.config.ts`, the root `README.md`, `.gitignore`, `AGENTS.md`, `.cursor/skills/**`, and `.cursor/agents/**`, and nowhere else in the project.
- **Test files.** A new file under `test/` must fit the layout, and a write may not add text that hides a failing test, such as `.only(`, `.skip(`, or `waitForTimeout(`. `test.fixme(` needs a `// product bug:` line above it.
- **Shell.** Allowed: a test run that names a path under `test/`, the four `npm run test:*` scripts, reads such as `ls`, `cat`, and `grep`, `git` and `gh` within limits, and `playwright-cli` on `http://localhost` and `http://127.0.0.1`. Denied: everything else, such as `npm install`, `npm run dev`, `curl`, and `cd`.
- **MCP tools and reads.** A file that an MCP tool writes must be inside the paths above. A shell read of a path in [`.cursorignore`](.cursorignore) is denied.

The hook is a guardrail and not a sandbox. It does not check what a program does after it starts: a test is code that runs with your permissions, so a test that writes to `src/` passes the hook. It will not hold against an agent that follows injected instructions. For a real boundary, run the agent in a container with application source mounted read-only. [The hook][wiki-hook] in the wiki has every limit, and [docs/hook-rules.md](docs/hook-rules.md) lists every rule and says how to debug a deny.

## Layout

```text
test/unit/                 Vitest or Jest unit tests
test/integration/          Vitest integration tests
test/e2e/<name>.spec.ts    Playwright specs
test/e2e/plan/             End-to-end plans
test/e2e/pages/            Page classes
test/mobile/               Maestro plans, element files, and flows
AGENTS.md                  Write scope, the table from request to skill, and the test commands
.cursor/                   The skills, the hook, the Maestro MCP server, and the verdict reporters
```

[Layout and files][wiki-layout] lists every path the kit puts in your app.

## Evaluation

[`examples/next-app/`](examples/next-app/) and [`examples/expo-app/`](examples/expo-app/) are two small apps with reference tests, and [`eval/`](eval/) holds 13 fixed test jobs on them, with a scorer that needs no model. The scorer runs the tests itself, and marks a reply that says the work passed over a failing run as `FALSE PASS`. None of it is part of the files you copy.

In round 5, in Cursor's own agent with the hook live, Composer 2.5 passed 26 of 26 runs: two runs of each of the 13 cases. Gemini 3.8 Flash and Claude Opus 5 each passed 6 of 6, one run of 6 cases, before the account's usage limit stopped the round. Read the numbers as a good sign and not as proof: each case had one or two runs on each model, on two small apps, and nothing was run on iOS or Windows. [Supported models and evaluation][wiki-eval] and [docs/evaluation.md](docs/evaluation.md) have every round.

## Upgrading

`.cursor/qa/VERSION` holds the version of the kit you copied. [CHANGELOG.md](CHANGELOG.md) starts with the things you must do. To upgrade, run the installer's dry run, which lists every file of yours that differs, then follow [Upgrading][wiki-upgrade].

## Contributing, security, and license

- [CONTRIBUTING.md](CONTRIBUTING.md) lists the checks, says how a skill is laid out, and which files must stay in step. Everyone who takes part follows the [code of conduct](CODE_OF_CONDUCT.md).
- Work is planned in [Jira](https://syedmuhdahmad.atlassian.net/jira/software/projects/SCRUM/boards/1). [docs/jira-workflow.md](docs/jira-workflow.md) says how.
- [SECURITY.md](SECURITY.md) says how to report a security problem in private.
- [MIT](LICENSE) is the license for the files written for this project. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) lists every other source with its license. Three Vitest reference files in `.cursor/skills/qa-unit/references/` are unchanged MIT-licensed copies. Their license files sit in the same folder, so keep them when you copy `.cursor/`. `.cursor/skills/playwright-cli/` is an Apache-2.0 copy of the skill in the `@playwright/cli` package, with its `LICENSE` file in the folder. The plan, generate, and heal skills began from Playwright's agent definitions, under Apache-2.0.

[wiki]: https://github.com/syedmuhdahmad/qa-agent-kit/wiki
[wiki-start]: https://github.com/syedmuhdahmad/qa-agent-kit/wiki/Getting-started
[wiki-prompts]: https://github.com/syedmuhdahmad/qa-agent-kit/wiki/Skills-and-example-prompts
[manual-web]: https://github.com/syedmuhdahmad/qa-agent-kit/wiki/QA-manual-for-web-apps
[manual-rn]: https://github.com/syedmuhdahmad/qa-agent-kit/wiki/QA-manual-for-React-Native
[manual-dotnet]: https://github.com/syedmuhdahmad/qa-agent-kit/wiki/QA-manual-for-.NET
[wiki-install]: https://github.com/syedmuhdahmad/qa-agent-kit/wiki/Installation
[wiki-jobs]: https://github.com/syedmuhdahmad/qa-agent-kit/wiki/Jobs-and-commands
[wiki-hook]: https://github.com/syedmuhdahmad/qa-agent-kit/wiki/The-hook
[wiki-layout]: https://github.com/syedmuhdahmad/qa-agent-kit/wiki/Layout-and-files
[wiki-mobile]: https://github.com/syedmuhdahmad/qa-agent-kit/wiki/Mobile-testing-with-Maestro
[wiki-audit]: https://github.com/syedmuhdahmad/qa-agent-kit/wiki/Security-audit
[wiki-upgrade]: https://github.com/syedmuhdahmad/qa-agent-kit/wiki/Upgrading
[wiki-trouble]: https://github.com/syedmuhdahmad/qa-agent-kit/wiki/Troubleshooting
[wiki-eval]: https://github.com/syedmuhdahmad/qa-agent-kit/wiki/Supported-models-and-evaluation
[wiki-rtk]: https://github.com/syedmuhdahmad/qa-agent-kit/wiki/Using-RTK
[wiki-roadmap]: https://github.com/syedmuhdahmad/qa-agent-kit/wiki/Roadmap-and-open-issues
[wiki-contrib]: https://github.com/syedmuhdahmad/qa-agent-kit/wiki/Contributing
