# Install notes

This file holds the detail behind [Requirements](../README.md#requirements) and [Add it to your app](../README.md#add-it-to-your-app) in the README:

- [Requirements in detail](#requirements-in-detail)
- [What the installer does](#what-the-installer-does)
- [If your app already has these files](#if-your-app-already-has-these-files)
- [What the kit puts in your app](#what-the-kit-puts-in-your-app)
- [Things that go wrong on install](#things-that-go-wrong-on-install)
- [If every action is denied](#if-every-action-is-denied)
- [Upgrading](#upgrading)

## Requirements in detail

- **Node** `^22.22.2 || ^24.15.0 || >=26.0.0`: 22.22.2 or later in the 22 line, 24.15.0 or later in the 24 line, or 26 and up. This is `engines.node` in the kit's `package.json`. `jsdom` sets the lower bounds.
- **npm.** The hook lets the agent run `npm run` and `npx`. It denies `pnpm`, `yarn`, and `bunx`.
- **Python 3.9 or later**, started as `python3`, with no packages. The hook is a Python script.
- **Cursor 2.4 or later.** Cursor's changelog names 2.4 as the first version with skills, subagents, and the `preToolUse` hook event.
- **Linux.** macOS was not run. Windows is not expected to work as shipped: `.cursor/hooks.json` starts the hook by its `.py` path, and Windows cannot start a file that way. The hook is registered with `failClosed: true`, and Cursor's documentation says a hook that fails then blocks the action. So on Windows every action would be blocked.
- **Google Chrome**, for the plan and generate jobs. `playwright-cli` starts the installed Chrome, without a window. `npx playwright install chromium` installs the browser for test runs only.
- **The executable bit on the hook.** Cursor starts `.cursor/hooks/guard-test-writes.py` by its path. Git and the installer keep the bit. If a copy lost it, run `chmod +x .cursor/hooks/guard-test-writes.py`, or run the installer again.

What was run:

- Everything was run on Linux with Node 24.
- The hook's tests pass on Python 3.9 and 3.14.
- The reporter tests, the installer tests, and the example app check also passed on Node 22.22.2 and Node 26.11.1, in a container, at an earlier state of this version. The last fixes to the installer and the reporters ran on Node 24 only.
- This version ran in Cursor's agent with the Composer 2.5 model: seven prompts, by hand, on a copy of the example app. The hook denied what it must, and the four web jobs each ended with tests that pass. See [the evaluation results](evaluation.md#a-run-in-cursor-2026-10-09).
- The CI workflow ran on GitHub, and every job passed. Its hook tests also ran on macOS. See [Checks and CI](../README.md#checks-and-ci) in the README.
- An earlier version of the hook ran in Cursor 3.22. The hook's tests send payloads in the shapes that Cursor 3.22 logged and that the code of Cursor 3.23 builds.

What was not run:

- macOS, apart from the hook's tests, and Windows.
- An older Cursor.
- The mobile skills, the hook's rules for MCP tools, and a mid-tier model, in a live Cursor session.

## What the installer does

`scripts/install-into.mjs` does the copy and merge steps of the README. Run it from your clone of the kit:

```bash
node scripts/install-into.mjs ../my-app --dry-run
node scripts/install-into.mjs ../my-app
```

The first command prints what would change and writes nothing. The second one:

- copies the paths in the README's copy list;
- adds the dev dependencies and the four scripts to your `package.json`;
- adds the `.gitignore` lines you lack;
- adds `test/tsconfig.json`, when your app has a `tsconfig.json` and no `test/tsconfig.json`. That file makes an import alias such as `@/lib/db` work in test files.

It does not run `npm install`.

What it does with something your app already has:

- **`.cursor/hooks.json` and `.cursor/mcp.json`** are merged. Your own entries stay. The kit's hook entries and its MCP server, `maestro`, are added when they are missing, and nothing is added twice. This is the same with `--force`. A file that is not valid JSON cannot be merged: it is skipped, or replaced with `--force`.
- **Any other file, a dependency range, or a script** with other content is left alone and listed as skipped. Merge those by hand, or pass `--force` to take the kit's version of every one of them. A `test/tsconfig.json` of your own is always kept.
- **A symbolic link** is never written through, with or without `--force`. If `AGENTS.md` is a link to `CLAUDE.md`, or `.cursor` is a link to a shared folder, those paths are listed as skipped and what they point at stays as it is.
- **The hook's executable bit** is set again when the file is the kit's and the bit is missing.

It never deletes a file. Without `--force` it never replaces one.

Read the end of the output. If a skipped file leaves part of the kit switched off, the last lines start with `WARNING:` and say what does not work and what to do:

| Warning | Cause |
| --- | --- |
| `the hook is not registered, so nothing is guarded` | `.cursor/hooks.json` was skipped, and yours does not start the kit's hook for all three events. |
| `Vitest runs print no QA-VERDICT line`, and the same for Playwright | A config file was skipped, and yours does not load the reporter from `.cursor/qa/`. The skills then stop with `BLOCKED`. |
| `the kit's MCP server is not registered` | `.cursor/mcp.json` was skipped and lacks the `maestro` server. |

The command exits with 0 then too.

A `NOTE:` names what an earlier version of the kit left in your app and this version no longer uses. Today that is the Playwright MCP server: an entry in `.cursor/mcp.json` that starts `@playwright/mcp`, and that package in your `package.json`. The installer removes neither. Delete both, unless you use the server yourself.

Not checked: the installer on macOS and Windows, and a merged `hooks.json` or `mcp.json` loaded in Cursor. The installer treats a file with comments in it as not valid JSON.

## If your app already has these files

This is the merge by hand, for the files the installer skips and for a copy without the installer.

| File | What to do |
| --- | --- |
| `.cursor/hooks.json` | Keep yours. Add the kit's three entries, `preToolUse`, `beforeShellExecution`, and `beforeMCPExecution`, each with the command `.cursor/hooks/guard-test-writes.py` and `failClosed: true`. The installer does this merge. |
| `.cursor/mcp.json` | Keep yours. Add the `maestro` entry from the kit's file if you test a mobile app. The installer adds it. The web jobs need no entry. If your file has the `playwright` entry of an earlier version of the kit, delete it. |
| `.cursor/rules/` | Your rules stay. The kit adds `test-file-conventions.mdc` and `mobile-test-conventions.mdc`. |
| `AGENTS.md` | Keep yours and put the kit's text at the top. |
| `.cursorignore` | Keep yours and add the kit's lines. The hook reads this file too. Without the file, the hook holds back lockfiles only. Add your app's large fixtures or generated code there. |
| `.gitignore` | Add the kit's lines that yours lacks. The installer does this. |
| `test/` | Your tests stay. The kit adds `test/setup.ts`, `test/e2e/seed.spec.ts`, and empty folders. The hook's rules for file names apply to new files only, so the agent can still edit a test of yours with another name, such as a `.tsx` test or a file in `__tests__/`. The content rules apply to it. |
| `vitest.config.ts`, `playwright.config.ts` | Take the kit's files and move your own settings into them. The skills need the verdict reporter, the `unit` and `integration` projects, and `testDir: './test/e2e'`. |

Four lines in `.cursorignore` and four in `.gitignore` start with a slash: `/dist/`, `/build/`, `/out/`, and `/coverage/` in the first, and `/coverage/`, `/playwright-report/`, `/test-results/`, and `/blob-report/` in the second. A line with a slash in front matches in the project root only. Without it, `coverage/` would also match `app/coverage/page.tsx`: git would hide that file, and the hook would deny the agent a read of it. If your build writes to another folder, add that folder to both files.

## What the kit puts in your app

```text
test/unit/                 Vitest unit tests
test/integration/          Vitest integration tests
test/e2e/<name>.spec.ts    Playwright specs
test/e2e/plan/             End-to-end plans
test/e2e/pages/            Page classes
test/e2e/seed.spec.ts      Checks that the app responds at /
test/setup.ts              Runs before every Vitest test file
test/tsconfig.json         Makes import aliases work in tests (added by the installer)
test/mobile/               Maestro plans, flows, subflows, and element files

AGENTS.md                  Write scope, the table from request to skill, and the test commands
vitest.config.ts           The unit and integration projects, and the verdict reporter
playwright.config.ts       The end-to-end settings, and the verdict reporter
.cursorignore              Paths the agent does not read
.cursor/skills/qa-*/       One skill for each job, with its templates
.cursor/skills/playwright-cli/  The manual of playwright-cli, copied from its package
.cursor/agents/qa.md       The /qa router
.cursor/rules/             Where each kind of test file goes
.cursor/hooks/             The hook and its tests
.cursor/hooks.json         Registers the hook with Cursor
.cursor/mcp.json           The maestro MCP server
.cursor/qa/                The verdict reporters and the VERSION file
```

`.cursor/skills/playwright-cli/` is not a job. It is the skill that ships inside the `@playwright/cli` package, version 0.1.22, under Apache-2.0, with its `LICENSE` file. Only the frontmatter of its `SKILL.md` was changed. Each job skill lists the `playwright-cli` commands it needs, and the hook denies many of the others in the manual. You do not need `playwright-cli install --skills` in your app. By its code, which was read and not run, it copies the skill a second time, into `.claude/skills/` or `.agents/skills/`, with the package's own frontmatter.

Unit and integration test files end in `.test.ts` and contain no JSX. The test files and plans are yours. The other paths are the kit's.

## Things that go wrong on install

- **`@types/node` must be 22, or 24 and up.** A new Next.js app has `"@types/node": "^20"`. `npm install` then stops with `ERESOLVE`, because Vitest 5 accepts `^22.0.0 || >=24.0.0`. Use the range in the kit's `package.json`. The installer leaves your range alone and says so.
- **`next build` type-checks your tests.** A new Next.js app includes every `.ts` file in `tsconfig.json`. A type error in a test then fails the app build while Vitest still passes. To keep tests out of the build, add `test` to `exclude` in `tsconfig.json`, and keep the `test/tsconfig.json` of the next point. The example app does both. To type-check the tests on their own, run `npx tsc --noEmit -p test`. With `"incremental": true` in `tsconfig.json` that command writes `test/tsconfig.tsbuildinfo`. A Next.js app's `.gitignore` already has `*.tsbuildinfo`.
- **With `test` in `exclude`, an import alias needs `test/tsconfig.json`.** Vitest reads the `paths` of `tsconfig.json` only for the files that config includes. Without the second file, `import { x } from '@/lib/db'` in a test fails with `Cannot find package '@/lib/db'`, and `vi.mock('@/lib/db')` replaces nothing and prints no warning, so the test runs against the real module. The file is:

  ```json
  {
    "extends": "../tsconfig.json",
    "include": ["**/*.ts"],
    "exclude": []
  }
  ```

  The installer adds it when your app has a `tsconfig.json` and no `test/tsconfig.json`. If you copied the kit by hand, add it yourself. Do not add it to an app without a `tsconfig.json`: every Vitest run then stops with `Failed to load tsconfig`. Playwright specs resolve the alias with or without the file. `/qa-unit` writes imports and `vi.mock` paths as relative paths, such as `../../../lib/db`. In a test file it is asked to fix, it rewrites an `@/` path the same way before anything else.
- **A JavaScript app needs a `tsconfig.json` for an alias.** Vitest reads the alias from `tsconfig.json` only, not from `jsconfig.json`, and only for the files that `tsconfig.json` includes. A source file that imports `@/lib/sum` then fails in every test that loads it, with `Cannot find package '@/lib/sum'`. Add a `tsconfig.json` with `"allowJs": true` and the `paths` of your `jsconfig.json`. An app that uses no alias needs nothing.
- **In a monorepo, install into the app package.** Give the installer the folder of the package that holds the app, such as `packages/web`, and open that folder in Cursor as the workspace. The hook and the two config files look for `.cursor/` in the folder they run in. With `.cursor/` at the repository root and the configs in the package, Vitest stops with `Failed to load custom Reporter from ./.cursor/qa/vitest-verdict.mjs`, and the hook denies a write to `packages/web/test/`.
- **The `maestro` MCP server needs Maestro.** The kit's `.cursor/mcp.json` has one server, `maestro`, and the installer adds it. On a machine without the Maestro CLI the `maestro` server cannot start. If you do not test a mobile app, delete the `maestro` entry, or leave that server off in Cursor settings. What Cursor shows for a server that cannot start was not seen.
- **`next dev` adds to `AGENTS.md`.** Under a coding agent, Next.js 16.4 adds its own block to `AGENTS.md` when `next dev` starts. The block tells the agent to read files under `node_modules/`, which the hook denies. Set `agentRules: false` in `next.config.ts` to stop it. The example app does.
- **`vitest.config.ts` needs Vite 8.** Vitest 5 installs Vite 8 unless your app already depends on Vite 6 or 7. With Vite 7 an import alias such as `@/lib/db` does not resolve, and `tsc` reports `'tsconfigPaths' does not exist in type 'AllResolveOptions'`. Vite 6 was not tried.
- **A Vite warning starts every Vitest run** in an app whose `package.json` has no `"type": "module"`. It begins with `(!) Your Vite config uses features`. The run is not affected, and `/qa-unit` is told to ignore it.
- **Plan and generate need Google Chrome and `@playwright/cli`.** When `playwright-cli` finds no browser, the two skills reply `BLOCKED: playwright-cli found no browser. Install Google Chrome, then ask again.` When `npx` cannot find the package, they reply `BLOCKED: playwright-cli is not installed. Add the dev dependency @playwright/cli, then ask again.` The error text that the skills look for when Chrome is missing was read in the code of `playwright-cli` 0.1.22. A machine without Chrome was not tried.
- **`playwright-cli` asks the npm registry for a newer version once a day.** Set `NO_UPDATE_NOTIFIER=1` to turn that off. This was read in the code of version 0.1.22 and not observed.

Not checked: a `tsconfig.json` with project references, `"composite": true`, or `"rootDir"`, and an `include` that leaves out `test/` without an `exclude`.

## If every action is denied

The hook did not start. Cursor starts `.cursor/hooks/guard-test-writes.py` by its path, and the hook is registered with `failClosed: true`, so a hook that fails blocks the action. In the shell that Cursor uses, from the root of your app, run:

```bash
python3 --version
printf '%s' '{"hook_event_name":"beforeShellExecution","command":"npm run test:unit","cwd":""}' | .cursor/hooks/guard-test-writes.py
```

The second command should print `{"permission": "allow"}`.

| It prints | Do |
| --- | --- |
| `Permission denied` | Run `chmod +x .cursor/hooks/guard-test-writes.py`, or run the installer again. Git and the installer keep the executable bit. A copy made another way can lose it. |
| `env: 'python3': No such file or directory` | Install Python 3.9 or later, or put `python3` on the `PATH` of that shell. |

What Cursor itself shows in these two cases was not seen. The code of Cursor 3.23 has a message for a hook that fails, which starts with `Tool blocked because this hook is configured to fail closed`.

If nothing is ever denied, check that the workspace is trusted. Cursor's documentation says project hooks load only in a trusted workspace. Then run the installer again and read its last lines: a `WARNING:` there says that the hook is not registered.

## Upgrading

`.cursor/qa/VERSION` holds the version of the kit you copied:

```bash
cat .cursor/qa/VERSION
```

A copy without that file is older than 0.1.0. [CHANGELOG.md](../CHANGELOG.md) lists what changed, and starts with the things you must do.

To upgrade, copy the files again. A dry run of the installer lists every file of yours that differs from the new version as skipped.

- **Safe to overwrite:** `.cursor/skills/qa-*/`, `.cursor/skills/playwright-cli/`, `.cursor/agents/qa.md`, `.cursor/hooks/`, `.cursor/qa/`, and the kit's two files in `.cursor/rules/`, unless you changed them yourself.
- **Merge by hand:** `AGENTS.md`, `vitest.config.ts`, `playwright.config.ts`, `.cursorignore`, `.gitignore`, `test/setup.ts`, and the scripts and dev dependencies in `package.json`. The installer merges `.cursor/hooks.json` and `.cursor/mcp.json` itself. If you copy by hand, merge those two as well.
- **Delete by hand:** a skill folder that the new version no longer has. A copy over the old `.cursor/` leaves it behind, and the installer never deletes.

The installer's `--force` replaces every file that differs, the ones to merge by hand included. Use it only when you have no changes of your own in them.

Version 0.1.0 renamed the skills. Delete `vitest-unit-integration`, `playwright-planner`, `playwright-generator`, `playwright-healer`, and `playwright-page-objects` from `.cursor/skills/`. Type `/qa-unit`, `/qa-plan`, `/qa-generate`, or `/qa-heal` where you typed `/qa`.

Version 0.1.0 also stopped using the Playwright MCP server. `/qa-plan` and `/qa-generate` now look at the app with `playwright-cli` shell commands, which the hook allows for `http://localhost` and `http://127.0.0.1` only. In your app:

- Delete the `playwright` entry from `.cursor/mcp.json`.
- Run `npm uninstall @playwright/mcp`, unless you use the package for something else. Keep `@playwright/cli`.
- Overwrite `.cursor/skills/playwright-cli/` with the new folder. The old copy had no `LICENSE` file.
- Copy the new `.cursor/hooks/`. The old hook denies `playwright-cli open`, `goto`, and `close`.
