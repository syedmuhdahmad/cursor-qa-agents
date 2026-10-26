# The hook

Cursor starts `.cursor/hooks/guard-test-writes.py` before every tool call, shell command, and MCP tool call of any agent in the folder. The hook answers allow or deny. Every deny names the cause and says what to do instead, and the agent gets the same text as you.

It applies to every Cursor agent in the folder, not only to the test jobs. So run commands such as `npm install` and `npm run dev` yourself.

[docs/hook-rules.md](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/hook-rules.md) lists every rule, with examples that the hook's own tests run.

## How it is registered

`.cursor/hooks.json` registers the hook for three Cursor events:

| Event | When Cursor raises it | What the hook checks |
| --- | --- | --- |
| `preToolUse` | Before every tool call, file edits and MCP tools included | The files the tool writes or names |
| `beforeShellExecution` | Before every shell command | The whole command line |
| `beforeMCPExecution` | Before every MCP tool call | The same as `preToolUse` for that call |

All three have `failClosed: true`, so a hook that cannot start blocks the action. Input that is not valid JSON is denied. An error inside the hook is a deny with a message.

## What it allows and denies

| Area | Rule |
| --- | --- |
| File edits | The agent may write in `test/**`, `vitest.config.ts`, `playwright.config.ts`, the root `README.md`, `.gitignore`, `AGENTS.md`, `.cursor/skills/**`, and `.cursor/agents/**`, and nowhere else in the project. Paths are compared after `..` and symbolic links are resolved. |
| Names of new test files | A file under `test/` ends in `.ts`, never `.tsx` or `.jsx`. No `__tests__/` folder. A page class is `test/e2e/pages/<name>-page.ts`, in lower case. A plan is `<name>.plan.md` in a `plan/` folder. A file that already exists can be edited whatever its name. |
| Content of test code | A write may not add `.only(`, `.skip(`, `.todo(`, `.fails(`, `test.fail(`, `skipIf(`, or `runIf(`, Jest's `xit(`, `xtest(`, `xdescribe(`, `fit(`, or `fdescribe(`, or a snapshot matcher such as `toMatchSnapshot(`. Under `test/e2e/` it may not add `waitForTimeout(`, `networkidle`, or `force: true` on a Playwright action. `test.fixme(` needs a `// product bug:` line above it that names a source file and line. Text that is already in a file may stay. |
| Maestro flows | A write of a flow under `test/mobile/` may not add `takeScreenshot`, `startRecording`, `evalScript`, or `addMedia`, and may add `runScript` only to the loader, `test/mobile/elements/load.yaml`. |
| Test runs | A Vitest, Playwright, or Jest run must name a path under `test/`. Options that wait for a person or hide a failure are denied, such as `--watch`, `--ui`, `-u`, `--reporter`, and `--retries`. Jest runs only with `--config .cursor/qa/jest.config.cjs` and `--ci`. The five `npm run test:*` scripts are allowed. |
| Other shell commands | Allowed: reads such as `ls`, `cat`, and `grep`, file operations inside the write scope, `git` and `gh` within limits, `sleep` up to 30 seconds, and three `maestro` forms. Denied: everything else, such as `npm install`, `npm run dev`, `curl`, `node -e`, and `cd` into another folder. |
| Browser | `playwright-cli` may open a URL on `http://localhost` or `http://127.0.0.1`, print the page, click, fill in, and close. Its other commands are denied. |
| MCP tools | A file that an MCP tool writes must be inside the write scope. A few tools are denied by name, such as Maestro's cloud tools. Maestro's `run` is denied when its inline flow holds `takeScreenshot`, `startRecording`, `runScript`, `evalScript`, or `addMedia`. |
| Reads | A shell read of a path in `.cursorignore` is denied: lockfiles, build output, test reports, and `.playwright-cli/`. |
| Security audit | A write tool may write inside `~/security-audit-skill/`, outside the project, and `node` may run the audit's two validators on a file there. See [[Security audit]]. |

## Limits

The hook is a guardrail and not a sandbox. It reads the text of a tool call or a command before it runs. It does not see what happens after that.

- **Code that the runners run.** A test file, `vitest.config.ts`, `playwright.config.ts`, and a Maestro flow are code that runs with your permissions. A test that writes to `src/`, reads any file, or calls the network passes the hook.
- **The browser after the first page.** The hook checks the URL the agent opens. It does not see where a link, a redirect, or a script on that page takes the browser next.
- **What an MCP tool does.** The hook sees the tool's name and arguments, not its effect. The JavaScript in a Maestro element file is not checked either.
- **Reads.** The agent may read any file on the machine except the `.cursorignore` paths. That list saves context. It keeps no secrets.
- **Injected instructions.** It will not hold against an agent that follows them, and it can read a command line wrongly. Gaps of that kind were found and closed. More may exist.
- **MCP denies.** The MCP events were seen in the Cursor CLI on 2026-10-26, in the shapes the hook expects. A live run there found one gap, now closed: Maestro's `run` tool saved a screenshot into `src/`. No MCP deny was seen reaching an agent.
- **Platforms.** It was not run on Windows. On macOS only its tests were run.
- **An untrusted workspace** loads no project hooks.

For a real boundary, run the agent in a container with application source mounted read-only, or add a CI check that fails a pull request that changes a file outside the write scope.

## When a deny is wrong

Some rules deny more than they must. For example, `cat *.json` is denied by the wildcard rule, and `playwright-cli open https://localhost:3000` is denied because only `http` is allowed. The [known limits](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/hook-rules.md#known-limits-and-unverified-behaviour) list them.

To see why a command was denied, run the hook yourself with the same input. [[Troubleshooting]] has the steps, and so does [How to debug a deny](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/hook-rules.md#how-to-debug-a-deny).

## Report a way around it

Do not open a public issue. Follow the [security policy](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/SECURITY.md).
