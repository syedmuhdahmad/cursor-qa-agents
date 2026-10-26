# Troubleshooting

Find the symptom in the table, then read the detail below it. The repository has more in [Things that go wrong on install](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/install-notes.md#things-that-go-wrong-on-install) and [How to debug a deny](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/hook-rules.md#how-to-debug-a-deny).

## Symptom, cause, and fix

| Symptom | Cause | Fix |
| --- | --- | --- |
| `npm install` stops with `ERESOLVE` | Your app has `"@types/node": "^20"`, and Vitest 5 accepts `^22.0.0 \|\| >=24.0.0` | Use the kit's range for `@types/node`. See [ERESOLVE](#eresolve-with-typesnode). |
| Every action of the agent is denied | The hook does not start, and it is registered to fail closed | Check `python3` and the hook's executable bit. See [If every action is denied](#if-every-action-is-denied). |
| Nothing is ever denied | The workspace is not trusted, or the hook is not registered | See [If nothing is denied](#if-nothing-is-denied). |
| One command is denied | A hook rule | Read the message: it says what to do instead. See [A command is denied](#a-command-is-denied). |
| The reply is `Verdict: BLOCKED:` with a sentence | The agent stopped and needs something from you | Do what the sentence says, and ask again. See [BLOCKED replies](#blocked-replies). |
| `Cannot find package '@/lib/db'` in a test, or `vi.mock('@/lib/db')` replaces nothing | `tsconfig.json` leaves out `test/`, and there is no `test/tsconfig.json` | Add `test/tsconfig.json`. See [Import aliases](#import-aliases-in-tests). |
| `Failed to load custom Reporter from ./.cursor/qa/vitest-verdict.mjs` | `.cursor/qa/` is missing, or `.cursor/` is in another folder than the configs, as in a monorepo | Copy `.cursor/` whole into the app package and open that folder in Cursor |
| `Cannot find module './.cursor/qa/playwright-verdict.mjs'` | `.cursor/qa/` is missing | Copy `.cursor/` whole |
| `next build` fails on a type error in a test | A new Next.js app type-checks every `.ts` file | Add `test` to `exclude` in `tsconfig.json`, and keep `test/tsconfig.json` |
| `Failed to load tsconfig` on every Vitest run | `test/tsconfig.json` in an app without a `tsconfig.json` | Delete `test/tsconfig.json` |
| `'tsconfigPaths' does not exist in type 'AllResolveOptions'` | Your app pins Vite 7 | `vitest.config.ts` needs Vite 8 |
| `(!) Your Vite config uses features` at the start of every run | `package.json` has no `"type": "module"` | Nothing. The run is not affected. |
| The `maestro` MCP server does not start | The Maestro CLI is not installed | Delete the `maestro` entry from `.cursor/mcp.json`, or leave the server off |
| `Device server died`, or a mobile job asks you to restart the server | `maestro test` ended and took the server's helper apps with it | Turn the `maestro` server off and on in Cursor settings |
| A browser stays open after a job | The job was cut off before its last step | Run `npx --no-install playwright-cli close` in the app folder |
| `AGENTS.md` gets a block from Next.js | Next.js 16.4 adds one when `next dev` starts under a coding agent | Set `agentRules: false` in `next.config.ts` |

## ERESOLVE with @types/node

A new Next.js app has `"@types/node": "^20"`. Vitest 5 accepts `^22.0.0 || >=24.0.0`, so `npm install` stops with `ERESOLVE`.

Change the range in your `package.json` to the one in the kit's [`package.json`](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/package.json), then run `npm install` again. The installer leaves your range alone and lists it as skipped, so you must change it yourself.

## If every action is denied

The hook did not start. Cursor starts `.cursor/hooks/guard-test-writes.py` by its path, with `failClosed: true`, so a hook that fails blocks the action. In the shell that Cursor uses, from the root of your app, run:

```bash
python3 --version
printf '%s' '{"hook_event_name":"beforeShellExecution","command":"npm run test:unit","cwd":""}' | .cursor/hooks/guard-test-writes.py
```

The second command should print `{"permission": "allow"}`.

| It prints | Do |
| --- | --- |
| `Permission denied` | Run `chmod +x .cursor/hooks/guard-test-writes.py`, or run the installer again. Git and the installer keep the executable bit. A copy made another way can lose it. |
| `env: 'python3': No such file or directory` | Install Python 3.9 or later, or put `python3` on the `PATH` of that shell. |

What Cursor itself shows in these two cases was not seen. On Windows every action is expected to be denied, because Windows cannot start the hook by its `.py` path. The kit does not support Windows today.

## If nothing is denied

- Check that the workspace is trusted. Cursor's documentation says project hooks load only in a trusted workspace.
- Check that `.cursor/hooks.json` is in the root of the folder you opened.
- Run the installer again and read its last lines. `WARNING: the hook is not registered, so nothing is guarded` means your `.cursor/hooks.json` was skipped. Add the kit's three entries to it.

## A command is denied

Every deny names the cause and what to do instead. The agent gets the same text. Common ones:

| Denied | Why | Instead |
| --- | --- | --- |
| `npm install`, `npm run dev` | The agent may not install packages or start servers | Run them yourself |
| `npx vitest run` with no path | A run must name a test file under `test/` | `RTK_DISABLED=1 npx vitest run test/unit/components/ProfileForm.test.ts`, or `npm run test:unit` |
| `cd lib` | Every command starts and ends in the project root | Pass paths from the root |
| `cat package-lock.json` | The path is in `.cursorignore` | Read `package.json`, or the source |
| `grep -rn "text" .` | The search would read `.cursorignore` paths | Name the folders: `grep -rn "text" src test` |
| A write to `src/` | Outside the write scope | Report the bug. The agent never edits application source. |
| `playwright-cli open https://localhost:3000` | Only `http://localhost` and `http://127.0.0.1` are allowed | Use `http` |
| `cat *.json` | A wildcard at the start of a word is denied | `cat ./*.json` |

To see why a command was denied:

1. Read the message.
2. Open the Output panel in Cursor and pick **Hooks**, or read the log file. On Linux it is `~/.config/Cursor/logs/<session>/window1/output_<time>/cursor.hooks.workspaceId-<id>.log`. Each run has an `INPUT:` block with the JSON Cursor sent and an `OUTPUT:` block with the answer.
3. Run the hook yourself with that input, from the project root:

   ```bash
   printf '%s' '{"hook_event_name":"beforeShellExecution","command":"npx vitest run","cwd":""}' | python3 .cursor/hooks/guard-test-writes.py
   ```

   It prints the answer as one line of JSON, with `"permission": "deny"` and the message.

4. If the message says "The write guard hook failed on this input", the hook has a bug. Report it with the input.

Some rules deny more than they must. [Known limits](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/hook-rules.md#known-limits-and-unverified-behaviour) lists them. See also [[The hook]].

## BLOCKED replies

A reply that ends in `Verdict: BLOCKED:` names what you need to do. Do it and ask again. The ones you are most likely to see:

| Reply after `BLOCKED:` | Fix |
| --- | --- |
| `start the app with npm run dev, then ask again.` | Start the app yourself. The hook denies `npm run dev` to the agent. |
| `the tests run only against an app on this machine.` | Run the app on `localhost` or `127.0.0.1`, and name the address in words: `/qa-plan profile. Base URL http://localhost:4000.` |
| `playwright-cli found no browser. Install Google Chrome, then ask again.` | Install Google Chrome. |
| `playwright-cli is not installed. Add the dev dependency @playwright/cli, then ask again.` | Add `@playwright/cli` to your dev dependencies and run `npm install`. |
| `Playwright has no browser to start. ...` | Run `npx playwright install chromium`, or install Google Chrome. |
| `no page at http://localhost:3000/profile. Ask again with the route.` | Give the route: `/qa-plan profile. Route /settings/profile.` |
| `this page needs a signed-in user. Ask again with a test account.` | Give a test account in the prompt. |
| `http://localhost:3000/profile redirects to another page. Correct the plan.` | Make the plan start on the page the app redirects to. |
| `the browser did not open.` | Read the first output line under `Not checked:`. |
| `the test command did not finish.` | No `QA-VERDICT:` line was printed. Check that the config files load the reporter from `.cursor/qa/`. |
| `Vitest cannot resolve an import in the app. Check paths in tsconfig.json and the installed packages.` | Check `paths` in `tsconfig.json`, and `test/tsconfig.json`. |
| `the app and the test tools load two copies of React.` | Make the app and the test packages use one copy of React. The agent installs nothing. |
| `the app has no Jest preset. ...` | In an Expo app, run `npx expo install jest-expo` and add `"jest": { "preset": "jest-expo" }` to `package.json`. |
| `Jest does not transform the package PACKAGE_NAME. ...` | Add that package to `transformIgnorePatterns` in your Jest config. |
| `no Android device is connected. ...` | Start an emulator or plug in a device, and install the app on it. |
| `turn on the maestro MCP server in Cursor settings, then ask again.` | Turn the server on. |
| `the maestro MCP server cannot read the device. ...` | Turn the server off and on in Cursor settings. |
| `iOS needs a Mac with Xcode. This computer is not a Mac.` | iOS needs a Mac. iOS was not run with the kit. |

[[Skills and example prompts]] lists the `BLOCKED` replies of each skill.

## Import aliases in tests

With `test` in `exclude` of `tsconfig.json`, Vitest does not read `paths` for test files. Add `test/tsconfig.json`:

```json
{
  "extends": "../tsconfig.json",
  "include": ["**/*.ts"],
  "exclude": []
}
```

The installer adds it when your app has a `tsconfig.json`. Do not add it to an app without one: every Vitest run then stops with `Failed to load tsconfig`. A JavaScript app needs a `tsconfig.json` with `"allowJs": true` and the `paths` of its `jsconfig.json`, because Vitest does not read `jsconfig.json`.

## Still stuck

Check that your copy is current: see [[Upgrading]]. A copy older than 0.1.0 has other skill names and another hook. For a way around the hook, follow the [security policy](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/SECURITY.md) and do not open a public issue.
