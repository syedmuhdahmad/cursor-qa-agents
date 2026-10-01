# Cursor QA agent

A Cursor setup for writing tests. The `qa` agent reads your application source and writes tests. It does not change the product to make a test pass.

Application code lives in places such as `app/` or `src/`. Tests live under `test/`.

## Add it to your app

Copy these into the root of your React or Next.js app, next to `app/` or `src/`:

```text
.cursor/  test/  AGENTS.md  vitest.config.ts  playwright.config.ts
```

Do not copy `package.json` over yours. Merge it instead:

- Add the `devDependencies` from this repo's `package.json` to yours. React and React DOM come from your app.
- Add the four `test:*` scripts.
- Add the `.gitignore` lines you don't already have.

Then install dependencies and the Chromium browser Playwright uses:

```bash
npm install
npx playwright install chromium
```

Open the app folder in Cursor with **File → Open Folder**, and use **Agent** mode in chat. Ask mode can explain code but cannot write files.

## Tools

The Playwright MCP server is listed in [`.cursor/mcp.json`](.cursor/mcp.json). Turn it on in Cursor settings, and restart it if Cursor does not show it. Every enabled MCP server adds its tool list to each request, so turn it off while you only write unit or integration tests.

| Tool | Used for |
| --- | --- |
| `playwright` MCP | Exploring a live page while planning or generating a spec |
| `playwright-cli` | Debugging a failing spec (`npx playwright test --debug=cli`, then `attach`) |
| `npx vitest` | Running unit and integration tests from the shell |

The agent runs every test command with `RTK_DISABLED=1` in front. See [Using RTK](#using-rtk) for why.

## The app under test

End-to-end tests open the app at `http://localhost:3000`. Playwright starts it with `npm run dev` when nothing is listening there.

If your app runs somewhere else, start it yourself and set `BASE_URL`:

```bash
BASE_URL=http://localhost:5173 npm run test:e2e
```

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

This is reported upstream as [rtk-ai/rtk#4224](https://github.com/rtk-ai/rtk/issues/4224) (open). We reproduced it on rtk 0.50.0 with Vitest 5.0.3. Once a fixed RTK release is out, the prefix can come off the Vitest commands.

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

## Start the qa agent

The role is defined in [`.cursor/agents/qa.md`](.cursor/agents/qa.md). In the agent chat, type `/qa`. Ask for one job per prompt, name the source file or screen, and say **UI** or **API**:

- **UI** means client screens, forms, and flows. The network may be mocked.
- **API** means route handlers, server actions, services, auth, or saved data. These tests use the real backend.

### Unit and integration

```text
/qa Write a unit test for src/components/SignIn.tsx. This is UI.
```

```text
/qa Write an integration test for app/api/session/route.ts. This is API.
```

Files are `.test.ts` and contain no JSX. They mirror the source path, so `src/components/SignIn.tsx` gets `test/unit/components/SignIn.test.ts`.

### End-to-end

End-to-end work has three steps. Ask for one at a time.

**Plan.** The agent explores one feature in the browser and saves `test/e2e/plan/<name>.plan.md`.

```text
/qa Plan end-to-end coverage for sign-in. This is UI.
```

**Generate.** The agent turns one plan into `test/e2e/<name>.spec.ts` and page classes in `test/e2e/pages/`, then runs the spec.

```text
/qa Generate the Playwright spec from test/e2e/plan/sign-in.plan.md. This is UI.
```

**Heal.** The agent reruns one failing spec, debugs it with `playwright-cli`, and fixes the test. A real product bug is marked `test.fixme()` and reported.

```text
/qa Fix the failing spec test/e2e/sign-in.spec.ts.
```

## What qa reads

`qa` reads only the files for the job you asked for. This keeps it fast and stops it from mixing instructions.

| Job | Files |
| --- | --- |
| Unit or integration | [`vitest-unit-integration`](.cursor/skills/vitest-unit-integration/SKILL.md), plus at most one reference |
| Plan | [`playwright-planner`](.cursor/skills/playwright-planner/SKILL.md) |
| Generate | [`playwright-generator`](.cursor/skills/playwright-generator/SKILL.md) and [`playwright-page-objects`](.cursor/skills/playwright-page-objects/SKILL.md) |
| Heal | [`playwright-healer`](.cursor/skills/playwright-healer/SKILL.md) and [`playwright-page-objects`](.cursor/skills/playwright-page-objects/SKILL.md) |

## Layout

```text
test/unit/                 Vitest unit tests
test/integration/          Vitest integration tests
test/e2e/<name>.spec.ts    Playwright specs
test/e2e/plan/             End-to-end plans
test/e2e/pages/            Page classes
test/e2e/seed.spec.ts      Checks that the app responds at /
```

## Run the tests yourself

```bash
npm run test:unit
npm run test:integration
npm run test:e2e
```

`npm run test:e2e:list` prints the Playwright tests without running them.

## What qa will not change

`qa` reads `app/`, `src/`, and similar source to learn the behavior. It does not edit that source. If a test fails because the product is wrong, it reports the bug instead of weakening the test.

A project hook, [`.cursor/hooks/guard-test-writes.py`](.cursor/hooks/guard-test-writes.py), enforces this. Writes are allowed only in:

- `test/**`
- `vitest.config.ts`
- `playwright.config.ts`
- root `README.md`
- `.gitignore`
- `AGENTS.md`
- `.cursor/skills/**`
- `.cursor/agents/**`

In the shell, the agent can run tests, read files, and use `git` and `gh` to inspect, commit, push, create a branch from the current commit (`git switch -c`), and open pull requests. The hook blocks anything that could change files outside those paths:

- Redirects into other files (`>`, `>>`, `&>`, `>|`, `<>`). `/dev/null` is allowed.
- Nested commands: `$(...)`, backticks, `<(...)`.
- Read commands that can write or run programs: `sed` with `w`/`e` or `-f`, in-place `sed` on source, `sort -o`, a `uniq` output file, and `rg --pre`.
- Git commands that rewrite the working tree: switching to an existing branch, `pull`, `merge`, `rebase`, `cherry-pick`, `stash`, `reset --hard`, `restore` or `checkout --` on source, `apply`, `clean`.
- Git aliases, `-c` overrides, `--git-dir`/`--work-tree`, and `git config` writes.
- `gh pr checkout`, `gh repo clone`, `gh run download`, and `gh alias`.

Run those yourself when you need them.

## What qa does not read

[`.cursorignore`](.cursorignore) keeps lockfiles, build output, and test reports out of the agent's context. Cursor does not apply it to terminal commands, so the hook also denies `cat`, `grep`, `sed`, and similar reads of those paths. Add your app's large fixtures or generated code there.

Test the hook after changing it:

```bash
python3 -m unittest discover -s .cursor/hooks
```
