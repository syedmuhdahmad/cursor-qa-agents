# Installation

This page installs the kit into an app that exists. For a first session after the install, see [[Getting started]]. The [install notes](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/install-notes.md) in the repository have every case.

## Requirements

| Need | Detail |
| --- | --- |
| Node | `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0`. This is `engines.node` in the kit's `package.json`. |
| npm | The hook lets the agent run `npm run` and `npx`. It denies `pnpm`, `yarn`, and `bunx`. |
| Python 3.9 or later | Started as `python3`, with no packages. The hook is a Python script. |
| Cursor 2.4 or later | Cursor's changelog names 2.4 as the first version with skills, subagents, and the `preToolUse` hook event. |
| Linux | On macOS only the hook's tests were run. Windows is not expected to work as shipped: it cannot start the hook by its `.py` path, and the hook is registered to fail closed, so every action would be blocked. |
| Google Chrome | For the plan and generate jobs. `playwright-cli` starts the installed Chrome, without a window. |

The mobile skills need more: the Maestro CLI, Java, and a device. See [[Mobile testing with Maestro]].

## With the installer

Use the installer. It does every copy and merge step of the manual install below, and it tells you what it skipped.

1. Clone the kit next to your app:

   ```bash
   git clone https://github.com/syedmuhdahmad/qa-agent-kit.git
   cd qa-agent-kit
   ```

2. Run a dry run first. It prints what would change and writes nothing:

   ```bash
   node scripts/install-into.mjs ../my-app --dry-run
   ```

3. Read the output, then run it for real:

   ```bash
   node scripts/install-into.mjs ../my-app
   ```

4. In your app, install the packages and, in a web app, the browser for test runs. The installer does not run `npm install`.

   ```bash
   npm install
   npx playwright install chromium
   ```

### What the installer does

- It copies `.cursor/`, `.cursorignore`, `test/`, `AGENTS.md`, `vitest.config.ts`, and `playwright.config.ts`.
- It adds the dev dependencies and the test scripts to your `package.json`, and the `.gitignore` lines you lack.
- It adds `test/tsconfig.json` when your app has a `tsconfig.json` and no `test/tsconfig.json`. That file makes an import alias such as `@/lib/db` work in test files.
- It merges the kit's entries into your own `.cursor/hooks.json` and `.cursor/mcp.json`. Your entries stay, and nothing is added twice.
- It leaves any other file of yours with other content alone, and lists it as skipped. `--force` takes the kit's version of each one instead.
- It never deletes a file, and never writes through a symbolic link.

### Read the end of the output

The command exits with 0 even when part of the kit is off. Read its last lines.

| Last lines say | Cause | Do |
| --- | --- | --- |
| `WARNING: the hook is not registered, so nothing is guarded` | `.cursor/hooks.json` was skipped, and yours does not start the kit's hook for all three events | Merge the three entries by hand. See [Files your app already has](#files-your-app-already-has). |
| `WARNING:` Vitest or Playwright runs print no `QA-VERDICT` line | A config file was skipped, and yours does not load the reporter from `.cursor/qa/` | Take the kit's config file and move your settings into it. Until then the skills stop with `BLOCKED`. |
| `WARNING: the kit's MCP server is not registered` | `.cursor/mcp.json` was skipped and lacks the `maestro` server | Only matters for mobile work. Add the `maestro` entry. |
| `WARNING: your app has no Jest config, so Jest has no React Native preset` | A React Native app with no `"jest"` key in `package.json` and no `jest.config.js` | Add a preset. See [A React Native app](#a-react-native-app). |
| `WARNING: the kit cannot read your Jest config` | A React Native app whose Jest config is `jest.config.ts` | Use a config in `.js`, `.cjs`, `.mjs`, `.json`, or `package.json`. |
| `NOTE:` | An earlier version of the kit left the Playwright MCP server in your app | Delete the `playwright` entry from `.cursor/mcp.json` and run `npm uninstall @playwright/mcp`, unless you use the server yourself. |

## Copy by hand

Use this when you cannot run the installer.

1. Copy these from the clone into the root of your app, next to `app/` or `src/`:

   ```text
   .cursor/  .cursorignore  test/  AGENTS.md  vitest.config.ts  playwright.config.ts
   ```

   Copy `.cursor/` whole. The two config files load a reporter from `.cursor/qa/` and do not start without it.

2. Do not copy `package.json` over yours. Add these dev dependencies, with the version ranges from the kit's [`package.json`](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/package.json). Leave out `typescript` and `markdownlint-cli2`: they are tools of the kit's repository.

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

3. Add these four scripts:

   ```json
   "test:unit": "vitest run --project unit --passWithNoTests",
   "test:integration": "vitest run --project integration --passWithNoTests",
   "test:e2e": "playwright test",
   "test:e2e:list": "playwright test --list"
   ```

4. Add the lines of the kit's [`.gitignore`](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/.gitignore) that yours does not have.
5. If your `tsconfig.json` leaves out `test/`, add `test/tsconfig.json`. See [[Troubleshooting]].
6. Run `npm install` and `npx playwright install chromium`.

## Files your app already has

The installer merges two files and skips the rest. Merge the skipped ones by hand.

| File | What to do |
| --- | --- |
| `.cursor/hooks.json` | Keep yours. Add the kit's three entries, `preToolUse`, `beforeShellExecution`, and `beforeMCPExecution`, each with the command `.cursor/hooks/guard-test-writes.py` and `failClosed: true`. The installer does this. |
| `.cursor/mcp.json` | Keep yours. Add the `maestro` entry if you test a mobile app. The web jobs need no entry. The installer adds it. |
| `.cursor/rules/` | Your rules stay. The kit adds `test-file-conventions.mdc` and `mobile-test-conventions.mdc`. |
| `AGENTS.md` | Keep yours and put the kit's text at the top. |
| `.cursorignore` | Keep yours and add the kit's lines. The hook reads this file too. |
| `.gitignore` | Add the kit's lines that yours lacks. The installer does this. |
| `test/` | Your tests stay. The agent can edit a test of yours with another name, such as a `.tsx` test, because the naming rules apply to new files only. |
| `vitest.config.ts`, `playwright.config.ts` | Take the kit's files and move your own settings into them. The skills need the verdict reporter, the `unit` and `integration` projects, and `testDir: './test/e2e'`. |

[[Layout and files]] says what each file is for.

## A React Native app

The installer reads your `package.json`. An app that lists `expo` or `react-native` is a React Native app. The first lines of the output say which kind it found and why. In a React Native app it:

- leaves out `vitest.config.ts`, `playwright.config.ts`, `test/setup.ts`, and `test/e2e/`;
- adds `@testing-library/react-native`, `@types/jest`, `jest`, and `test-renderer`, with `test-renderer` matched to your React version;
- adds one script, `"test:rn-unit": "jest --config .cursor/qa/jest.config.cjs --ci"`.

It does not add the Jest preset, because its version follows your Expo SDK or React Native version. For an Expo app:

```bash
npx expo install jest-expo
```

Then add `"jest": { "preset": "jest-expo" }` to `package.json`.

An Expo app that also builds for the web, and wants the Vitest and Playwright files, can choose the kind by hand:

```bash
node scripts/install-into.mjs ../my-expo-app --dry-run --app web
```

With TypeScript 6 or later, add `"types": ["jest"]` to `compilerOptions`, or `tsc` does not know `describe` and `expect` in a test file. A bare React Native app without Expo was not tried.

## Open it in Cursor

Open the app folder with **File → Open Folder** as a trusted workspace, and use **Agent** mode in chat. An untrusted workspace loads no project hooks. In a monorepo, install into the app package, such as `packages/web`, and open that folder.

The hook applies to every Cursor agent in the folder, not only to the test jobs. Run `npm install` and `npm run dev` yourself.

## What goes wrong

| Symptom | Fix |
| --- | --- |
| `npm install` stops with `ERESOLVE` | Your app has `"@types/node": "^20"`. Use the kit's range. |
| An `@/` import fails in a test, or `vi.mock('@/lib/db')` replaces nothing | Add `test/tsconfig.json`. |
| Every action of the agent is denied | The hook does not start. Check `python3` and the executable bit. |
| Nothing is ever denied | The workspace is not trusted, or `.cursor/hooks.json` does not start the hook. |
| The `maestro` server does not start | The Maestro CLI is not installed. Delete the `maestro` entry, or leave the server off. |

[[Troubleshooting]] has the cause and the full fix for each, and more.

## Upgrading

See [[Upgrading]].
