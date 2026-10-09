# Hook rules

This is the reference for [`.cursor/hooks/guard-test-writes.py`](../.cursor/hooks/guard-test-writes.py): what it allows, what it denies, and what it cannot see.

The hook is a guardrail, not a sandbox. It reads the text of a tool call or a shell command before Cursor runs it. It cannot see what a program does after it starts. Read "What it does not check" before you rely on it.

How to read the tables: each row is one input and the hook's answer. A row that ends in `allow` or `deny` is run against the hook by the hook's own tests, so the tables cannot drift from the code. A first cell with a tool name and JSON, such as `Write {"file_path": "src/a.ts", "content": "x"}`, is a tool call. Any other first cell is a shell command. In a table a `|` is written `\|`.

## What it checks

[`.cursor/hooks.json`](../.cursor/hooks.json) registers the hook for three Cursor events:

| Event | When Cursor raises it | What the hook checks |
| --- | --- | --- |
| `preToolUse` | Before every tool call, including file edits and MCP tools | The files the tool writes or names |
| `beforeShellExecution` | Before every shell command | The whole command line |
| `beforeMCPExecution` | Before every MCP tool call | The same as `preToolUse` for that call |

- The hook answers `allow` or `deny`. A deny carries one message, the same for you and for the agent. The message names the cause and says what to do instead.
- The hook does not look at which agent or model makes the call. It applies to every Cursor agent in the folder, not only to `qa`. No agent's file edit or shell command can write application source or run `npm install`. The hook is a guardrail, not a sandbox: it cannot stop code that a test file, a config, or an MCP tool runs once a runner starts it. See "What it does not check".
- All three entries have `failClosed: true`. Cursor's documentation says it then blocks the action when the hook cannot run.
- Input that is not valid JSON is denied. An error inside the hook is a deny with a message, and the error text goes to Cursor's Hooks output.
- Empty input is allowed. Cursor does not send it.

## Write scope

A tool that writes may only write these paths:

- `test/**`
- `vitest.config.ts`
- `playwright.config.ts`
- root `README.md`
- `.gitignore`
- `AGENTS.md`
- `.cursor/skills/**`
- `.cursor/agents/**`

In Cursor's hook log every edit arrived as the tool `Write` with the path and the whole new file. The hook also knows the names `StrReplace`, `Delete`, `EditNotebook`, `Edit`, `ApplyPatch`, `MultiEdit`, and `NotebookEdit`. A tool with any other name is treated as a write tool when its input has a path and content.

| Tool call | Decision |
| --- | --- |
| `Write {"file_path": "test/unit/components/SignIn.test.ts", "content": "x"}` | allow |
| `Write {"file_path": "README.md", "content": "x"}` | allow |
| `Write {"file_path": ".cursor/skills/qa-unit/SKILL.md", "content": "x"}` | allow |
| `Write {"file_path": "src/components/SignIn.tsx", "content": "x"}` | deny |
| `Write {"file_path": "package.json", "content": "x"}` | deny |
| `Write {"file_path": ".cursor/hooks/guard-test-writes.py", "content": "x"}` | deny |
| `Write {"file_path": ".cursor/hooks.json", "content": "x"}` | deny |
| `Write {"file_path": ".cursorignore", "content": "x"}` | deny |
| `Write {"file_path": "docs/README.md", "content": "x"}` | deny |
| `Write {"file_path": "test/../src/a.ts", "content": "x"}` | deny |
| `Write {"content": "x"}` | deny |
| `Delete {"file_path": "test/unit/old.test.ts"}` | allow |
| `Delete {"file_path": "src/a.ts"}` | deny |
| `Read {"file_path": "src/a.ts"}` | allow |
| `Grep {"pattern": "x", "file_path": "src"}` | allow |
| `NewWriter {"path": "src/a.ts", "contents": "x"}` | deny |
| `NewWriter {"path": "test/unit/a.test.ts", "contents": "x"}` | allow |
| `EditNotebook {"target_notebook": "src/a.ipynb", "new_string": "x"}` | deny |
| `ApplyPatch {"path": "test/a.ts", "patch": "*** Update File: src/app.ts\n"}` | deny |

- Paths are compared after `..` and symlinks are resolved. A link under `test/` that leads to `src/` does not make `src/` writable.
- A path that runs through a symlink loop is outside the write scope.
- For `ApplyPatch` the hook also reads the file names inside the patch text (`*** Update File:`, `*** Add File:`, `*** Delete File:`, `*** Move to:`).

## Files Cursor itself writes

Cursor uses the same `Write` tool for two kinds of file of its own, outside the project. The hook lets these through for write tools:

- `~/.cursor/projects/<project>/agent-tools/<file>`: a tool result that was too long to return.
- `~/.cursor/plans/<name>.plan.md`: a plan from Plan mode.

| Tool call | Decision |
| --- | --- |
| `Write {"file_path": "~/.cursor/projects/my-app/agent-tools/result.txt", "content": "x"}` | allow |
| `Write {"file_path": "~/.cursor/plans/sign-in.plan.md", "content": "x"}` | allow |
| `Write {"file_path": "~/.cursor/plans/notes.md", "content": "x"}` | deny |
| `Write {"file_path": "~/.cursor/projects/my-app/agent-transcripts/a.jsonl", "content": "x"}` | deny |
| `Write {"file_path": "~/.cursor/mcp.json", "content": "x"}` | deny |
| `Write {"file_path": "~/.bashrc", "content": "x"}` | deny |

Shell commands get no such exception.

## Rules for files under `test/`

A write tool call under `test/` must also pass the naming rules and the content rules. A low-cost model drops a rule that is only written down, so the hook holds these.

### Names

| Tool call | Decision |
| --- | --- |
| `Write {"file_path": "test/unit/components/SignIn.test.ts", "content": "x"}` | allow |
| `Write {"file_path": "test/unit/components/SignIn.test.tsx", "content": "x"}` | deny |
| `Write {"file_path": "test/unit/components/SignIn.test.jsx", "content": "x"}` | deny |
| `Write {"file_path": "test/__tests__/a.test.ts", "content": "x"}` | deny |
| `Write {"file_path": "test/unit/__tests__/a.test.ts", "content": "x"}` | deny |
| `Write {"file_path": "test/tests/a.test.ts", "content": "x"}` | deny |
| `Write {"file_path": "test/specs/a.spec.ts", "content": "x"}` | deny |
| `Write {"file_path": "test/e2e/specs/a.spec.ts", "content": "x"}` | deny |
| `Write {"file_path": "test/unit/app/products/specs/page.test.ts", "content": "x"}` | allow |
| `Write {"file_path": "test/e2e/pages/sign-in-page.ts", "content": "x"}` | allow |
| `Write {"file_path": "test/e2e/pages/SignInPage.ts", "content": "x"}` | deny |
| `Write {"file_path": "test/e2e/pages/auth/sign-in-page.ts", "content": "x"}` | deny |
| `Write {"file_path": "test/e2e/sign-in-page.ts", "content": "x"}` | deny |
| `Write {"file_path": "test/e2e/plan/sign-in.plan.md", "content": "x"}` | allow |
| `Write {"file_path": "test/mobile/plan/sign-in.plan.md", "content": "x"}` | allow |
| `Write {"file_path": "test/e2e/plan/sign-in.md", "content": "x"}` | deny |
| `Write {"file_path": "test/e2e/sign-in.plan.md", "content": "x"}` | deny |
| `Write {"file_path": "test/unit/<name>.test.ts", "content": "x"}` | deny |
| `Delete {"file_path": "test/__tests__/a.test.ts"}` | allow |
| `mkdir -p test/unit/components` | allow |
| `mkdir test/__tests__` | deny |
| `touch test/e2e/pages/SignInPage.ts` | deny |
| `rm -rf test/__tests__` | allow |
| `mv test/unit/SignIn.test.tsx test/unit/SignIn.test.ts` | allow |

- Files under `test/` end in `.ts`, never `.tsx` or `.jsx`.
- No `__tests__/` folder anywhere under `test/`. No `tests/` or `specs/` folder directly under `test/` or anywhere under `test/e2e/`. Below `test/unit/` and `test/integration/` those two names are allowed, because test folders mirror the source tree.
- A page class is `test/e2e/pages/<name>-page.ts`, in lower case, directly in that folder.
- A plan is `test/e2e/plan/<name>.plan.md` or `test/mobile/plan/<name>.plan.md`.
- A path that still has a placeholder such as `<name>` is denied.
- The names are held for a new file only. Deleting, moving, and editing a file that already exists are not, so a wrong name a person made can be fixed or edited in place. The content rules below still apply to such a file.

### Content of test code

The hook compares the new text with the file on disk and denies only what the write adds. A file that already has a `test.skip(` can still be edited, and the skip can be removed. The rows below assume the file does not exist yet.

| Tool call | Decision |
| --- | --- |
| `Write {"file_path": "test/unit/a.test.ts", "content": "it('adds', () => {})"}` | allow |
| `Write {"file_path": "test/unit/a.test.ts", "content": "it.only('adds', () => {})"}` | deny |
| `Write {"file_path": "test/unit/a.test.ts", "content": "it.skip('adds', () => {})"}` | deny |
| `Write {"file_path": "test/unit/a.test.ts", "content": "it.todo('adds')"}` | deny |
| `Write {"file_path": "test/unit/a.test.ts", "content": "it.fails('adds', () => {})"}` | deny |
| `Write {"file_path": "test/unit/a.test.ts", "content": "it.skipIf(true)('adds', () => {})"}` | deny |
| `Write {"file_path": "test/unit/a.test.ts", "content": "it.runIf(false)('adds', () => {})"}` | deny |
| `Write {"file_path": "test/unit/a.test.ts", "content": "describe.skip('math', () => {})"}` | deny |
| `Write {"file_path": "test/unit/a.test.ts", "content": "// it.only( was here"}` | deny |
| `Write {"file_path": "test/unit/a.test.ts", "content": "expect(validation.fails()).toBe(true)"}` | allow |
| `Write {"file_path": "test/unit/a.test.ts", "content": "await player.skip()"}` | allow |
| `Write {"file_path": "test/e2e/a.spec.ts", "content": "test.fail('adds', async () => {})"}` | deny |
| `Write {"file_path": "test/e2e/a.spec.ts", "content": "await page.waitForTimeout(500)"}` | deny |
| `Write {"file_path": "test/e2e/a.spec.ts", "content": "await page.waitForLoadState('networkidle')"}` | deny |
| `Write {"file_path": "test/e2e/a.spec.ts", "content": "await button.click({ force: true })"}` | deny |
| `Write {"file_path": "test/e2e/pages/a-page.ts", "content": "await this.save.click({ force: true })"}` | deny |
| `Write {"file_path": "test/e2e/a.spec.ts", "content": "rmSync(dir, { recursive: true, force: true })"}` | allow |
| `Write {"file_path": "test/e2e/fixtures.ts", "content": "rmSync(dir, { recursive: true, force: true })"}` | allow |
| `Write {"file_path": "test/integration/a.test.ts", "content": "rmSync(dir, { recursive: true, force: true })"}` | allow |
| `Write {"file_path": "test/e2e/a.spec.ts", "content": "test.fixme('adds', async () => {})"}` | deny |
| `Write {"file_path": "test/e2e/a.spec.ts", "content": "// product bug: src/a.ts:7 expected \"1\", got \"2\"\ntest.fixme('adds', async () => {})"}` | allow |
| `Write {"file_path": "test/unit/a.test.ts", "content": "// product bug: src/a.ts:7 expected \"1\", got \"2\"\ntest.fixme('adds', () => {})"}` | deny |
| `Write {"file_path": "test/e2e/plan/a.plan.md", "content": "Do not use test.skip( or waitForTimeout("}` | allow |
| `Write {"file_path": "test/mobile/sign-in/01-a.flow.yaml", "content": "- waitForTimeout(\n"}` | allow |
| `Write {"file_path": ".cursor/skills/x/SKILL.md", "content": "it.only("}` | allow |
| `Write {"file_path": "test/mobile/config.yaml", "content": "excludeTags:\n  - fixme\n"}` | allow |
| `Write {"file_path": "test/mobile/config.yaml", "content": "testOutputDir: out\n"}` | deny |

- Test code is a file under `test/` that ends in `.ts`, `.js`, `.mts`, `.cts`, `.mjs`, or `.cjs`. Plans, flows, and files outside `test/` are not scanned.
- A write may not add `.only(`, `.skip(`, `.todo(`, or `.fails(` on a test function (`it`, `test`, `describe`, `suite`, `bench`, and names built on them such as `test.describe`), or `test.fail(`, `skipIf(`, or `runIf(`.
- Under `test/e2e/` it may not add `waitForTimeout(` or `networkidle`.
- Under `test/e2e/` it may not add `force: true` as an option of a Playwright action (`click`, `dblclick`, `tap`, `check`, `uncheck`, `hover`, `fill`, `selectOption`, `setChecked`, `setInputFiles`, `dragTo`, `clear`, `selectText`, `scrollIntoViewIfNeeded`). A `force: true` passed to `fs.rm` or `rmSync`, as a globalSetup or fixture uses to clear a temp folder, is not an action and is allowed. The option object must open with `{` on the same line as the action call.
- `test.fixme(` is allowed only in a spec directly in `test/e2e/`, and only when the line above it starts with `// product bug:`.
- The check is on plain text. The same text in a comment or a string counts.
- A write may not add `testOutputDir` to `config.yaml` or `config.yml` under `test/mobile/`. See "maestro".

## Shell commands

### How a command line is read

The hook splits the line on `&&`, `||`, `;`, a line break, and `&`, and each part on `|`. Every part must be an allowed command on its own. Anything the hook cannot classify is denied.

| Command | Decision |
| --- | --- |
| `ls test && cat package.json` | allow |
| `ls test; rm -rf src` | deny |
| `cat package.json \| grep vitest` | allow |
| `ls 2>&1 \| tail -40` | allow |
| `RTK_DISABLED=1 npx playwright test test/e2e/sign-in.spec.ts:63 --debug=cli &` | allow |
| `if true; then ls; fi` | deny |
| `for f in a b; do ls; done` | deny |
| `(ls)` | deny |
| `{ ls; }` | deny |
| `./test/bin/tool` | deny |
| `node_modules/.bin/vitest run test/unit/a.test.ts` | allow |
| `node script.js` | deny |
| `curl http://localhost:3000` | deny |
| `npm install` | deny |
| `npm run dev` | deny |
| `npx tsc --noEmit` | deny |
| `pnpm test:unit` | deny |

- A program is run by name. Only `node_modules/.bin/vitest`, `playwright`, and `playwright-cli` may be run by path.
- Compound commands (`if`, `for`, `while`, `( )`, `{ }`) are denied.
- The programs the shell can run are: the test runners below, `sleep`, the read programs, the file operations, `git`, `gh`, `cd` to the project root, `export` and `unset` for the allowed variables, and `rtk` in the forms listed under "rtk".

### Working directory

Every command must start in the project root and leave the shell there. Cursor does not tell the hook which directory its shell is in, so the hook checks every relative path against the project root.

| Command | Decision |
| --- | --- |
| `cd src` | deny |
| `cd test && ls` | deny |
| `cd` | deny |
| `cd -` | deny |
| `cd . && ls` | allow |
| `ls \| cd test` | deny |

A command that Cursor starts in another directory (a `cwd` in the payload that is not the project root) is denied too.

### Environment variables

A command may set only `BASE_URL`, `CI`, `FORCE_COLOR`, `NO_COLOR`, `PLAYWRIGHT_HTML_OPEN`, and `RTK_DISABLED`, to plain values. `BASE_URL` may only name this machine.

| Command | Decision |
| --- | --- |
| `RTK_DISABLED=1 CI=1 npm run test:unit` | allow |
| `BASE_URL=http://localhost:4000 npm run test:e2e` | allow |
| `BASE_URL=http://127.0.0.1:4000 npm run test:e2e` | allow |
| `BASE_URL=https://example.com npm run test:e2e` | deny |
| `NODE_OPTIONS=--require=./test/x.js npm run test:unit` | deny |
| `PATH=test/bin npm run test:unit` | deny |
| `export CI=1` | allow |
| `export PATH=test/bin` | deny |

### Vitest

One run, of files the command names under `test/`.

| Command | Decision |
| --- | --- |
| `RTK_DISABLED=1 npx vitest run test/unit/components/SignIn.test.ts` | allow |
| `npx vitest run test/unit/a.test.ts test/unit/b.test.ts` | allow |
| `npx vitest run test/unit/a.test.ts -t "shows an error"` | allow |
| `npx vitest run -t init test/unit/a.test.ts` | allow |
| `npx vitest run --coverage test/unit/a.test.ts` | allow |
| `npx vitest run` | deny |
| `npx vitest run SignIn` | deny |
| `npx vitest run src/a.test.ts` | deny |
| `npx vitest test/unit/a.test.ts` | deny |
| `npx vitest` | deny |
| `npx vitest watch test/unit/a.test.ts` | deny |
| `npx vitest run --watch test/unit/a.test.ts` | deny |
| `npx vitest run -w test/unit/a.test.ts` | deny |
| `npx vitest run --ui test/unit/a.test.ts` | deny |
| `npx vitest run -u test/unit/a.test.ts` | deny |
| `npx vitest run --update test/unit/a.test.ts` | deny |
| `npx vitest init` | deny |
| `npx vitest list` | deny |
| `npx vitest --version` | deny |
| `npx vitest run --outputFile=src/out.json test/unit/a.test.ts` | deny |
| `npx vitest run --outputFile=test/out.json test/unit/a.test.ts` | allow |
| `npx vitest run --config src/vitest.config.ts test/unit/a.test.ts` | deny |
| `npx vitest run --root src test/unit/a.test.ts` | deny |
| `npx vitest run --reporter=verbose test/unit/a.test.ts` | deny |
| `npx vitest run --reporter dot test/unit/a.test.ts` | deny |
| `npx vitest run --passWithNoTests test/unit/a.test.ts` | deny |
| `npx vitest run --pass-with-no-tests test/unit/a.test.ts` | deny |
| `npx vitest run --allowOnly test/unit/a.test.ts` | deny |
| `npx vitest run --allow-only test/unit/a.test.ts` | deny |

A runner option that names a file or folder must point inside the write scope: `--outputFile`, `--config`, `--root`, `--dir`, `--attachmentsDir`, `--fsModuleCachePath`, `--coverage.reportsDirectory`, `--coverage.htmlDir`, and the short forms `-c` and `-r`.

`--reporter` replaces Vitest's reporters, which removes the `QA-VERDICT:` line the kit reads. `--passWithNoTests` lets an empty run pass, and `--allowOnly` lets a stray `.only` pass; the kit's config sets both to false so the verdict is right, so the agent may not turn them back on. The npm scripts pass `--passWithNoTests` inside the script, where the hook does not see it, so `npm run test:unit` still works.

### Playwright

`playwright test` with a spec under `test/`, or `--list`.

| Command | Decision |
| --- | --- |
| `RTK_DISABLED=1 npx playwright test test/e2e/sign-in.spec.ts` | allow |
| `npx playwright test test/e2e/sign-in.spec.ts:63` | allow |
| `npx playwright test test/e2e/sign-in.spec.ts:63 --debug=cli` | allow |
| `npx playwright test test/e2e/sign-in.spec.ts --repeat-each=3` | allow |
| `npx playwright test test/e2e/sign-in.spec.ts --repeat-each=5` | allow |
| `npx playwright test test/e2e/sign-in.spec.ts --repeat-each=6` | deny |
| `npx playwright test test/e2e/sign-in.spec.ts --repeat-each 3 --repeat-each 100` | deny |
| `npx playwright test test/e2e/sign-in.spec.ts --reporter=line` | deny |
| `npx playwright test test/e2e/sign-in.spec.ts --add-reporter=line` | allow |
| `npx playwright test --list` | allow |
| `npx playwright test test/e2e/sign-in.spec.ts -g "Wrong password shows an error"` | allow |
| `npx playwright test` | deny |
| `npx playwright test -g checkout` | deny |
| `npx playwright test test/e2e/sign-in.spec.ts --ui` | deny |
| `npx playwright test test/e2e/sign-in.spec.ts --headed` | deny |
| `npx playwright test test/e2e/sign-in.spec.ts --debug` | deny |
| `npx playwright test test/e2e/sign-in.spec.ts --retries=2` | deny |
| `npx playwright test test/e2e/sign-in.spec.ts --timeout=60000` | deny |
| `npx playwright test test/e2e/sign-in.spec.ts -u` | deny |
| `npx playwright test test/e2e/sign-in.spec.ts --update-snapshots` | deny |
| `npx playwright test test/e2e/sign-in.spec.ts --output=src/out` | deny |
| `npx playwright test test/e2e/sign-in.spec.ts --config=src/playwright.config.ts` | deny |
| `npx playwright install` | deny |
| `npx playwright install chromium` | deny |
| `npx playwright codegen` | deny |
| `npx playwright show-report` | deny |
| `npx playwright --version` | deny |

`--output`, `--config`, `-c`, and `--last-failed-file` must point inside the write scope.

`--reporter` replaces Playwright's reporters and removes the `QA-VERDICT:` line the kit reads, so it is denied; `--add-reporter` keeps the kit's reporter and is allowed. `--repeat-each` may be at most 5, and every occurrence is checked, because Playwright uses the last value.

### npm scripts and npx

| Command | Decision |
| --- | --- |
| `npm run test:unit` | allow |
| `npm run test:integration` | allow |
| `npm run test:e2e` | allow |
| `npm run test:e2e:list` | allow |
| `npm run test:unit -- test/unit/a.test.ts` | allow |
| `npm run test:e2e -- --retries=2` | deny |
| `npm run test:e2e -- --headed` | deny |
| `npm run test:unit -- --watch` | deny |
| `npm run test:unit --script-shell=test/x.sh` | deny |
| `npm run build` | deny |
| `npm test` | deny |
| `npx --no-install vitest run test/unit/a.test.ts` | allow |
| `npx -c "ls"` | deny |
| `npx --package=cowsay vitest run test/unit/a.test.ts` | deny |
| `npx cowsay hi` | deny |

The four scripts may run the whole suite, so they need no path. The options a direct run may not use are denied after `--` too. `npx` may only run `vitest`, `playwright`, and `playwright-cli`.

### sleep

| Command | Decision |
| --- | --- |
| `sleep 5` | allow |
| `sleep 30` | allow |
| `sleep 31` | deny |
| `sleep 0.5` | deny |
| `sleep 5 5` | deny |

### playwright-cli

The kit browses the app with `playwright-cli`: the skills open a page, read it, and act on it with shell commands. The `qa-heal` skill also drives a test paused by `--debug=cli` with it. The hook allows that and nothing more. The rules were read from `playwright-cli --help` and the help of each command, in `@playwright/cli` 0.1.22.

The command line is an allow list. Each command takes a fixed number of arguments and a closed list of options.

| Command | Arguments | Options of its own |
| --- | --- | --- |
| `open`, `goto` | one URL of the app on this machine | none |
| `snapshot` | none, or one ref | `--depth`, `--boxes` |
| `find` | one text, or none with `--regex` | `--regex` |
| `generate-locator`, `check`, `uncheck`, `hover` | one ref | none |
| `click`, `dblclick` | one ref, and a button if you want one | `--modifiers` |
| `fill` | one ref and one text | `--submit` |
| `type` | one text | `--submit` |
| `press` | one key | none |
| `select` | one ref and one value | none |
| `close` | none | none |
| `console` | none, or one level | `--clear` |
| `requests` | none | `--static`, `--filter`, `--clear` |
| `request` | one number from the output of `requests` | none |
| `list` | none | `--all` |
| `attach` | the session name of a paused test | none |
| `pause-at` | one place, written as `file:line` | none |
| `step-over`, `resume` | none | none |

Every command but `attach` also takes a session name, written `-s=NAME`, `-s NAME`, `--session=NAME`, or `--session NAME`. Every command takes `--raw`, `--json`, and `--help`. With `--help`, `playwright-cli` prints the help of the command and runs nothing, so the arguments are not checked.

#### Browsing the app

| Command | Decision |
| --- | --- |
| `npx --no-install playwright-cli open http://localhost:3000/profile` | allow |
| `npx --no-install playwright-cli goto http://localhost:3000/profile` | allow |
| `npx --no-install playwright-cli open http://127.0.0.1:5173/` | allow |
| `npx --no-install playwright-cli snapshot` | allow |
| `npx --no-install playwright-cli snapshot --depth=2` | allow |
| `npx --no-install playwright-cli --raw snapshot` | allow |
| `npx --no-install playwright-cli find "Save profile"` | allow |
| `npx --no-install playwright-cli generate-locator e9` | allow |
| `npx --no-install playwright-cli click e9` | allow |
| `npx --no-install playwright-cli fill e5 "Ada Lovelace"` | allow |
| `npx --no-install playwright-cli type "Ada Lovelace"` | allow |
| `npx --no-install playwright-cli press Enter` | allow |
| `npx --no-install playwright-cli select e7 "Canada"` | allow |
| `npx --no-install playwright-cli check e4` | allow |
| `npx --no-install playwright-cli uncheck e4` | allow |
| `npx --no-install playwright-cli hover e3` | allow |
| `npx --no-install playwright-cli close` | allow |
| `npx --no-install playwright-cli -s=plan open http://localhost:3000/profile` | allow |
| `npx --no-install playwright-cli -s plan snapshot` | allow |
| `npx --no-install playwright-cli --session=plan find "Save profile"` | allow |
| `npx --no-install playwright-cli --session plan close` | allow |
| `npx --no-install playwright-cli open http://localhost:3000/profile 2>&1 \| tail -40` | allow |
| `npx --no-install playwright-cli open` | deny |
| `npx --no-install playwright-cli fill e5` | deny |
| `npx --no-install playwright-cli fill e5 Ada Lovelace` | deny |
| `npx --no-install playwright-cli type Ada Lovelace` | deny |
| `npx --no-install playwright-cli close now` | deny |
| `npx --no-install playwright-cli` | deny |
| `npx --no-install playwright-cli --help` | deny |
| `npx --no-install playwright-cli fill --help` | allow |

- A command with too few or too many arguments is denied with the form to copy. A text of several words goes in quotes: `fill e5 Ada Lovelace` has three arguments.
- A ref is the `e9` in a snapshot line such as `- button "Save profile" [ref=e9]`. The hook does not check its form, because `playwright-cli` also takes a selector there.
- After `open` or an action, `playwright-cli` may print a link to a file in `.playwright-cli/` in place of the page. Reading that file is denied. See "Paths the agent does not read". `snapshot` prints the page.
- `playwright-cli` with no command and `playwright-cli --help` are denied with the list of allowed commands. The full help is about 140 lines.

#### The URL of `open` and `goto`

The URL must start with `http://localhost` or `http://127.0.0.1`. After the host comes a port, a path, a query, or the end.

| Command | Decision |
| --- | --- |
| `npx --no-install playwright-cli open http://localhost` | allow |
| `npx --no-install playwright-cli open http://localhost:3000/#/profile` | allow |
| `npx --no-install playwright-cli open http://localhost:3000/users/ada@example.com` | allow |
| `npx --no-install playwright-cli open "http://localhost:3000/search?q=shoes&page=2"` | allow |
| `npx --no-install playwright-cli open 'http://localhost:3000/search?q=a;b'` | allow |
| `npx --no-install playwright-cli open http://localhost:3000/search?q=shoes` | deny |
| `npx --no-install playwright-cli open http://localhost:3000/search?q=shoes&page=2` | deny |
| `npx --no-install playwright-cli open https://example.com` | deny |
| `npx --no-install playwright-cli open http://localhost@example.com/` | deny |
| `npx --no-install playwright-cli open http://localhost:3000@example.com/` | deny |
| `npx --no-install playwright-cli open http://user:secret@localhost:3000/` | deny |
| `npx --no-install playwright-cli open http://localhost.example.com/` | deny |
| `npx --no-install playwright-cli open http://127.0.0.1.example.com/` | deny |
| `npx --no-install playwright-cli open http://0.0.0.0:3000/` | deny |
| `npx --no-install playwright-cli open "http://[::1]:3000/"` | deny |
| `npx --no-install playwright-cli open HTTP://LOCALHOST:3000/` | deny |
| `npx --no-install playwright-cli open https://localhost:3000/` | deny |
| `npx --no-install playwright-cli open file:///etc/passwd` | deny |
| `npx --no-install playwright-cli open "javascript:alert(1)"` | deny |
| `npx --no-install playwright-cli open about:blank` | deny |
| `npx --no-install playwright-cli open localhost:3000` | deny |
| `npx --no-install playwright-cli goto "http://localhost:3000/a b"` | deny |
| `npx --no-install playwright-cli goto 'http://localhost\@example.com/'` | deny |
| `npx --no-install playwright-cli open http://localhost:3000/;rm -rf src` | deny |
| `npx --no-install playwright-cli open "http://localhost:3000/?q=$(cat .env)"` | deny |
| `npx --no-install playwright-cli open http://localhost:3000/ > src/page.txt` | deny |

- Only the two spellings `localhost` and `127.0.0.1` are accepted, in lower case, with `http`. Other names for this machine (`[::1]`, `0.0.0.0`, `127.1`) and `https` are denied, to keep the rule short.
- A user name in front of a host (`localhost@example.com`), a host that only starts with `localhost` (`localhost.example.com`), and a port followed by `@` are denied: the browser would load the other host.
- The rest of the URL may hold letters, digits, and the characters a URL is written with. A space, a quote, a backslash, a tab, and a line break are denied. The URL standard that browsers follow drops a tab or a line break from a URL and reads a backslash as a slash, which would change the host. Checked with node's `URL`: `http://localhost`, a tab, and `.example.com/` give the host `localhost.example.com`.
- A URL with `?` or `*` outside quotes is denied with a message that says to put it in double quotes. bash reads them as wildcards and passes the word on when no file matches. zsh is documented to stop with "no matches found", which was not run here. A query usually has `&` too, where every shell ends the command.
- A `;`, `|`, `>`, or `&&` after the URL is shell syntax. What follows is checked as a command or a redirect of its own.
- A carriage return outside quotes is denied in a `playwright-cli` command. The hook splits words at one and bash does not, and the URL standard drops it from a URL. `open http://localhost`, a carriage return, and `--raw` would pass the hook as a URL and an option, and node's `URL` reads the one word bash passes as the host `localhost--raw`.

#### Options

| Command | Decision |
| --- | --- |
| `npx --no-install playwright-cli snapshot --boxes` | allow |
| `npx --no-install playwright-cli snapshot --depth 2` | allow |
| `npx --no-install playwright-cli find --regex 'Save.*'` | allow |
| `npx --no-install playwright-cli click e9 --modifiers=Shift` | allow |
| `npx --no-install playwright-cli fill e5 "Ada Lovelace" --submit` | allow |
| `npx --no-install playwright-cli --json list --all` | allow |
| `npx --no-install playwright-cli fill e5 -- "--submit"` | allow |
| `npx --no-install playwright-cli snapshot --filename=src/a.yml` | deny |
| `npx --no-install playwright-cli snapshot --filename=test/e2e/a.yml` | deny |
| `npx --no-install playwright-cli find "Save" --filename test/found.txt` | deny |
| `npx --no-install playwright-cli type "--filename=src/a.yml"` | deny |
| `npx --no-install playwright-cli open http://localhost:3000 --headed` | deny |
| `npx --no-install playwright-cli open http://localhost:3000 --config=test/cli.json` | deny |
| `npx --no-install playwright-cli open http://localhost:3000 --profile=test/profile` | deny |
| `npx --no-install playwright-cli open http://localhost:3000 --persistent` | deny |
| `npx --no-install playwright-cli open http://localhost:3000 --browser=firefox` | deny |
| `npx --no-install playwright-cli open http://localhost:3000 --extension` | deny |
| `npx --no-install playwright-cli attach --cdp=http://localhost:9222` | deny |
| `npx --no-install playwright-cli attach tw-6eef1e --config=test/cli.json` | deny |
| `npx --no-install playwright-cli click e9 --submit` | deny |
| `npx --no-install playwright-cli snapshot --zzz` | deny |
| `npx --no-install playwright-cli --zzz snapshot run-code "x"` | deny |
| `npx --no-install playwright-cli -- run-code "x"` | deny |
| `npx --no-install playwright-cli type --submit true` | deny |
| `npx --no-install playwright-cli snapshot --depth=two` | deny |
| `npx --no-install playwright-cli -s=../../x snapshot` | deny |
| `npx --no-install playwright-cli -s=a -s=b snapshot` | deny |

- No allowed option names a file, a configuration, a browser, a profile, an extension, or code. `--filename` is denied on every command, inside the write scope too: the shell may not write file content under `test/`. `--config`, `--profile`, `--persistent`, `--browser`, `--device`, `--mobile`, `--idle-timeout`, `--headed`, `--cdp`, `--endpoint`, and `--extension` are denied, each with its reason.
- An option of another command, or one `playwright-cli` does not have, is denied with the form of the command to copy.
- `playwright-cli` gives an option it does not know the next word as its value. In `--zzz snapshot run-code "x"` the command that runs is `run-code`. So an option the hook cannot place, and a `--` in front of the command, are denied.
- A flag takes no value, but `playwright-cli` reads `true` or `false` after it as one. Run: `fill e5 --submit true` stopped with `'text' argument: expected string, received undefined`. The hook denies such a command first. Put the flag at the end.
- A text that starts with two dashes is read by `playwright-cli` as an option. Put `--` in front of it: `fill e5 -- "--submit"` fills in the text `--submit`.
- A session name may hold only letters, digits, `-`, and `_`, and is given once. `playwright-cli` puts the name into the path of a file it writes, `<name>.err` in its cache folder. Run with `attach ../../../../tmp/zz`: it tried to open `/home/<user>/tmp/zz.err` for writing.
- `--depth` takes a number, and `--modifiers` one of `Alt`, `Control`, `ControlOrMeta`, `Meta`, and `Shift`.

`.cursor/hooks/test_cli_words_match_playwright_cli.py` compares the hook's reading of a command line with `playwright-cli`'s own parser, and the table above with the list of commands and options in the installed package.

#### Every other command

| Command | Decision |
| --- | --- |
| `npx --no-install playwright-cli run-code "async page => page.title()"` | deny |
| `npx --no-install playwright-cli eval "() => document.title"` | deny |
| `npx --no-install playwright-cli screenshot` | deny |
| `npx --no-install playwright-cli screenshot --filename=test/e2e/page.png` | deny |
| `npx --no-install playwright-cli pdf` | deny |
| `npx --no-install playwright-cli upload test/e2e/fixtures/avatar.png` | deny |
| `npx --no-install playwright-cli drop e4 --path=src/secret.env` | deny |
| `npx --no-install playwright-cli state-save test/e2e/state.json` | deny |
| `npx --no-install playwright-cli state-load test/e2e/state.json` | deny |
| `npx --no-install playwright-cli cookie-set session abc` | deny |
| `npx --no-install playwright-cli cookie-list` | deny |
| `npx --no-install playwright-cli localstorage-set theme dark` | deny |
| `npx --no-install playwright-cli route "**/api/session" --status=500` | deny |
| `npx --no-install playwright-cli tracing-start` | deny |
| `npx --no-install playwright-cli video-start test/e2e/run.webm` | deny |
| `npx --no-install playwright-cli install` | deny |
| `npx --no-install playwright-cli install-browser chromium` | deny |
| `npx --no-install playwright-cli config-print` | deny |
| `npx --no-install playwright-cli show` | deny |
| `npx --no-install playwright-cli tab-new http://localhost:3000/profile` | deny |
| `npx --no-install playwright-cli tab-new https://example.com` | deny |
| `npx --no-install playwright-cli reload` | deny |
| `npx --no-install playwright-cli delete-data` | deny |
| `npx --no-install playwright-cli kill-all` | deny |
| `npx --no-install playwright-cli close-all` | deny |
| `npx --no-install playwright-cli -s=plan run-code "x"` | deny |
| `node_modules/.bin/playwright-cli run-code "x"` | deny |

Every such deny carries one message with the list of allowed commands. For the commands a model reaches for most it ends with what to use instead. What a denied command does is taken from its help text. None of them was run.

| Denied | Why | What the message says to use |
| --- | --- | --- |
| `run-code`, `eval` | They run code the hook cannot check. | `snapshot` or `find` to read the page, and the action commands to act on it |
| `screenshot`, `pdf`, `video-start`, `tracing-start`, `show`, `highlight` | They write a file or open a window. | `snapshot`, which prints the page as text |
| `upload`, `drop`, `state-save`, `state-load` | They read or write a local file. | nothing |
| `install`, `install-browser` | They install files or a browser. | Stop and tell the user what is missing |
| `tab-new`, `tab-select`, `tab-close`, `tab-list`, `reload`, `go-back`, `go-forward` | A tab may load any URL. The tab commands are denied as a group to keep the URL rule in one place. | `goto` with the URL |
| `kill-all`, `close-all`, `delete-data` | They end or delete sessions the agent did not start. | `close`, or `resume` for a paused test |

The cookie, storage, and `route` commands read or change what the page stores or loads. They and the rest of the list (`drag`, `resize`, the mouse and key commands, the emulation commands, `webmcp-call`, and the others) are denied because no skill uses them.

#### A paused test

| Command | Decision |
| --- | --- |
| `npx --no-install playwright-cli attach tw-6eef1e` | allow |
| `npx --no-install playwright-cli -s=tw-6eef1e snapshot` | allow |
| `npx --no-install playwright-cli -s tw-6eef1e snapshot` | allow |
| `npx --no-install playwright-cli -s=tw-6eef1e pause-at test/e2e/sign-in.spec.ts:70` | allow |
| `npx --no-install playwright-cli -s=tw-6eef1e find "Sign in"` | allow |
| `npx --no-install playwright-cli -s=tw-6eef1e generate-locator e9` | allow |
| `npx --no-install playwright-cli -s=tw-6eef1e click e9` | allow |
| `npx --no-install playwright-cli -s=tw-6eef1e fill e5 ada@example.com` | allow |
| `npx --no-install playwright-cli -s=tw-6eef1e step-over` | allow |
| `npx --no-install playwright-cli -s=tw-6eef1e goto http://localhost:3000/profile` | allow |
| `npx --no-install playwright-cli -s=tw-6eef1e resume` | allow |
| `npx --no-install playwright-cli -s=tw-6eef1e detach` | deny |
| `npx --no-install playwright-cli -s=tw-6eef1e close` | deny |
| `npx --no-install playwright-cli -s=tw-6eef1e open http://localhost:3000/profile` | deny |
| `npx --no-install playwright-cli -s=tw-XXXXXX snapshot` | deny |
| `npx --no-install playwright-cli attach` | deny |
| `npx --no-install playwright-cli attach ../../../../tmp/zz` | deny |
| `npx --no-install playwright-cli attach ws://localhost:9222/` | deny |
| `npx --no-install playwright-cli attach tw-6eef1e --session=heal` | deny |
| `npx --no-install playwright-cli -s=tw-6eef1e screenshot` | deny |
| `npx --no-install playwright-cli -s=tw-6eef1e run-code "x"` | deny |

- `detach` is denied because it leaves the test paused, with no command to end it. The run is ended with `resume`.
- `close` and `open` on a session whose name starts with `tw-` are denied for the same reason. Run on a paused test: after `-s=tw-c928a3 close` the test run was still waiting, and after `-s=tw-c928a3 open http://localhost:4317/` the command `resume` answered "Debugger is not paused". A new `attach` and then `resume` ended the run.
- `attach` takes the name the `--debug=cli` run printed and no session name of its own. The session then has the name of the test, which is how the hook knows it. By its source, `playwright-cli` connects to a name it does not know as an endpoint, so a name with `://`, a dot, or a slash is denied.
- `tw-XXXXXX` is the stand-in the skills print for the session name. Copied as it is, it is denied with a message that says where to find the real name.

#### Text given to `fill`, `type`, and `find`

The text is data. Inside quotes `;`, `|`, `&`, `>`, `#`, and brackets stay text. A `$` or a backtick stays text only inside single quotes.

| Command | Decision |
| --- | --- |
| `npx --no-install playwright-cli fill e5 "a;b && c \| d > e"` | allow |
| `npx --no-install playwright-cli type "rm -rf src; echo done"` | allow |
| `npx --no-install playwright-cli fill e5 'Total: $5'` | allow |
| `npx --no-install playwright-cli fill e5 'pa$$word'` | allow |
| `npx --no-install playwright-cli fill e5 "Total: \$5"` | allow |
| `npx --no-install playwright-cli fill e5 "Total: $"` | allow |
| `npx --no-install playwright-cli fill e5 "Total: $5"` | deny |
| `npx --no-install playwright-cli fill e5 "$HOME"` | deny |
| `npx --no-install playwright-cli fill e5 "pa$$word"` | deny |
| `npx --no-install playwright-cli type "$(cat .env)"` | deny |
| ``npx --no-install playwright-cli type "`cat .env`"`` | deny |
| `npx --no-install playwright-cli type a; rm -rf src` | deny |
| `npx --no-install playwright-cli type hello > src/a.txt` | deny |
| `npx --no-install playwright-cli type "abc` | deny |
| `npx --no-install playwright-cli find "<text>"` | deny |

- In a `playwright-cli` command, a `$` that a shell would replace is denied with a message that says to put the text in single quotes, or to write `\$` inside double quotes when the text has an apostrophe. That covers `$NAME`, `${...}`, `$(...)`, `$5`, and also `$$`, `$?`, `$#`, and `$!`, which other commands may use: in `fill e5 "pa$$word"` the shell would fill in its process number. A `$` at the end of a word or in front of a space is left alone by bash and dash, and is allowed.
- A text outside quotes with `;`, `|`, or `>` in it is shell syntax. What follows is checked as a command or a redirect of its own.
- A text that looks like a placeholder, such as `"<text>"`, is denied as one. See "Text the shell rewrites or skips".

### maestro

An allow list. The mobile skills use `maestro check-syntax` and one `maestro test` command.

| Command | Decision |
| --- | --- |
| `maestro --version` | allow |
| `maestro check-syntax test/mobile/sign-in/01-valid-account.flow.yaml` | allow |
| `RTK_DISABLED=1 maestro test --platform android --exclude-tags=fixme -e APP_ID=com.example.app test/mobile/sign-in` | allow |
| `maestro test --platform ios -e APP_ID=com.example.app test/mobile/sign-in/01-valid-account.flow.yaml` | allow |
| `maestro test --platform=android --device emulator-5554 --include-tags=smoke test/mobile` | allow |
| `maestro --platform android test test/mobile/sign-in` | allow |
| `maestro test --exclude-tags fixme test/mobile/sign-in` | allow |
| `maestro test --platform web test/mobile/sign-in` | deny |
| `maestro test` | deny |
| `maestro test src/flows` | deny |
| `maestro test test/e2e/a.yaml` | deny |
| `maestro check-syntax src/a.yaml` | deny |
| `maestro check-syntax -` | deny |
| `maestro test @test/mobile/args.txt` | deny |
| `maestro test -c test/mobile/sign-in` | deny |
| `maestro test -ceAPP_ID=x test/mobile/sign-in` | deny |
| `maestro test -eAPP_ID=x test/mobile/sign-in` | deny |
| `maestro test -p android test/mobile/sign-in` | deny |
| `maestro test --continuous test/mobile/sign-in` | deny |
| `maestro test --test-output-dir=test/mobile/out test/mobile/sign-in` | deny |
| `maestro test --debug-output=test/mobile/debug test/mobile/sign-in` | deny |
| `maestro test --flatten-debug-output test/mobile/sign-in` | deny |
| `maestro test --format=JUNIT --output=test/mobile/report.xml test/mobile/sign-in` | deny |
| `maestro test --config=test/mobile/config.yaml test/mobile/sign-in` | deny |
| `maestro test --analyze test/mobile/sign-in` | deny |
| `maestro test --shards=2 test/mobile/sign-in` | deny |
| `maestro test --verbose test/mobile/sign-in` | deny |
| `maestro --help` | deny |
| `maestro list-devices` | deny |
| `maestro start-device --platform android` | deny |
| `maestro hierarchy` | deny |
| `maestro cloud app.apk test/mobile` | deny |
| `maestro login` | deny |
| `maestro record test/mobile/sign-in/01-valid-account.flow.yaml` | deny |
| `maestro download-samples` | deny |
| `maestro mcp` | deny |
| `MAESTRO_OPTS=-Dx maestro test test/mobile/sign-in` | deny |
| `~/.maestro/bin/maestro test test/mobile/sign-in` | deny |
| `adb devices` | deny |
| `xcrun simctl list devices booted` | deny |
| `emulator -avd Pixel_7` | deny |

The rules behind the rows:

- `maestro --version`, and nothing else without a command.
- `maestro check-syntax` with exactly one path and no option.
- `maestro test` with one or more paths. Its only options are `--platform android` or `ios`, `--device <id>`, `--include-tags=<tags>`, `--exclude-tags=<tags>`, and `-e KEY=VALUE`. The long options may take their value after `=` or as the next word. `--platform` and `--device` may also stand before the word `test`.
- Every path must be under `test/mobile/`, after symlinks are resolved.
- No word may start with `@`. maestro reads more arguments from a file named that way, and the agent can write such a file.
- The only short option is `-e`, as a word of its own. maestro reads `-ceKEY=VALUE` as `-c -e KEY=VALUE`, and `-c` is continuous mode, which never ends.
- No option that names an output file or folder is allowed: `--test-output-dir`, `--debug-output`, `--flatten-debug-output`, `--output`, `--format`, and `--config`. `--test-output-dir` also makes maestro delete older folders next to its output.
- `maestro test` on a folder is denied while that folder's `config.yaml` or `config.yml` holds the text `testOutputDir`. maestro reads that file from a folder it is given, and the key has the effect of `--test-output-dir`. Passing one flow file does not read it.
- `adb`, `xcrun`, `emulator`, and `maestro start-device` stay denied. You start the device and install the app.
- Every deny names the three allowed forms.

### Reads

The read programs are `ls`, `cat`, `head`, `tail`, `grep`, `rg`, `wc`, `cut`, `sort`, `uniq`, `tr`, `sed`, `find`, `file`, `stat`, `pwd`, `echo`, `printf`, `which`, `whereis`, `type`, `basename`, `dirname`, `realpath`, `readlink`, `test`, `[`, `true`, `false`, and `:`.

| Command | Decision |
| --- | --- |
| `cat src/components/SignIn.tsx` | allow |
| `head -40 src/components/SignIn.tsx` | allow |
| `grep -rn "SignIn" src test` | allow |
| `cat test-results/sign-in-chromium/error-context.md` | allow |
| `ls node_modules/.bin` | allow |
| `find src -name '*.tsx'` | allow |
| `sed -n '10,40p' src/a.ts` | allow |
| `cat /etc/hostname` | allow |
| `less src/a.ts` | deny |
| `awk '{print $1}' src/a.ts` | deny |
| `diff src/a.ts src/b.ts` | deny |
| `sed -i s/a/b/ src/a.ts` | deny |
| `sed 'w src/a.ts' test/a.ts` | deny |
| `sed -n 't x w src/a.ts' test/a.ts` | deny |
| `sed -n ':x;t x e touch src/x' test/a.ts` | deny |
| `sed -n ':a;ta;p' test/a.ts` | deny |
| `sed -f test/x.sed src/a.ts` | deny |
| `sed -i'src/*' -e p README.md` | deny |
| `sed -i.bak -e p README.md` | allow |
| `sort -o src/a.ts test/a` | deny |
| `uniq test/a src/a.ts` | deny |
| `find test -name '*.ts' -delete` | deny |
| `find test -exec rm {} +` | deny |
| `rg --pre=./test/x.sh foo` | deny |
| `file -C -m test/magic` | deny |
| `printf -v x 1` | deny |

- Reads are not limited to the project or to the write scope.
- `sed` may print and filter. A script that writes a file (`w`, `W`), runs a command (`e`, or the `w` or `e` flag of `s`), or uses `-f`, and an in-place edit of a file outside the write scope, are denied. A label or branch command (`:`, `b`, `t`, `T`) is denied too: GNU sed ends a label at whitespace and BSD sed at the end of the line, so a label can hide a following `w FILE` or `e CMD`, as in `sed 't x w src/a.ts'`, from a parser that picks the wrong rule. The skills use no label. An `a`, `i`, or `c` appends literal text, and `r` or `R` reads a file, so they are allowed. The backup suffix of `sed -i` may hold only letters, digits, dots, `~`, `_`, and dashes: GNU sed puts the file name in place of a `*` in the suffix, so `-i'src/*'` writes the backup into `src/`.
- `sort -o` and the second file of `uniq` must be inside the write scope. `sort --compress-program`, `rg --pre`, and `rg --hostname-bin` run a program and are denied.
- `find` may not use `-delete`, `-exec`, `-execdir`, `-ok`, `-okdir`, `-fprint`, `-fprint0`, `-fprintf`, or `-fls`.
- `file -C` writes a compiled magic file and is denied.

### Paths the agent does not read

[`.cursorignore`](../.cursorignore) keeps lockfiles, build output, and test reports out of the agent's context. Cursor does not apply it to shell commands, so the hook does. If `.cursorignore` is missing, the hook uses a built-in list of lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lock`, `bun.lockb`) and says so in its message.

| Command | Decision |
| --- | --- |
| `cat package-lock.json` | deny |
| `head -50 package-lock.json` | deny |
| `grep react package-lock.json` | deny |
| `sed -n 1,20p package-lock.json` | deny |
| `wc -l node_modules/vitest/package.json` | deny |
| `cat < package-lock.json` | deny |
| `cat <package-lock.json` | deny |
| `tr a b < package-lock.json` | deny |
| `head -5 node_modules/*/package.json` | deny |
| `git show HEAD:package-lock.json` | deny |
| `git cat-file -p HEAD:package-lock.json` | deny |
| `git diff -- package-lock.json` | deny |
| `git log -p package-lock.json` | deny |
| `git blame package-lock.json` | deny |
| `git grep lodash -- package-lock.json` | deny |
| `rtk read package-lock.json` | deny |
| `cat .playwright-cli/page-2026-10-09T12-07-31-808Z.yml` | deny |
| `grep -n button .playwright-cli/page-2026-10-09T12-07-31-808Z.yml` | deny |
| `cat package.json` | allow |
| `git show HEAD:package.json` | allow |
| `ls node_modules` | allow |
| `find node_modules -name package.json` | allow |
| `git diff` | allow |

`.playwright-cli/` is where `playwright-cli` saves page snapshots and console logs. After `open` or an action it prints a link to such a file in place of the page. A read of one is denied like any other path on the list, with a message of its own: run `npx --no-install playwright-cli snapshot` to print the page, with the same `-s` option as the command that saved the file, and use `console` for the console messages.

Three more cases depend on what is on disk, so they are not in the table:

- A wildcard. The hook looks up what the pattern matches. `cat ./package-lock.*` is denied when it matches `package-lock.json`. `cat src/*.ts` is allowed when no match is on the ignore list.
- A recursive search. `grep -r`, `grep -R`, `grep -d recurse`, and `rg` read every file below the folder they are given, and below the project root when they are given none. The search is denied when that folder holds a path on the ignore list. In an app, `grep -rn "text" .` is denied because the root holds `node_modules/` and the lockfile. `grep -rn "text" src test` is allowed. `rg --files` lists names and is allowed.
- `git grep` with no path searches the whole project and is denied in the same way. `git grep "text" -- src` is allowed.

What is covered: a file given to `cat`, `head`, `tail`, `grep`, `rg`, `wc`, `cut`, `sort`, `uniq`, or `sed`; a file fed to any program with `<`; and a path given to `git show`, `git cat-file`, `git diff`, `git log`, `git blame`, or `git grep`, also in the form `<revision>:<path>`. Listing names with `ls` and `find` is allowed.

A pattern in `.cursorignore` with a slash at its start or in its middle, such as `/build/`, matches from the project root only, as in `.gitignore`. Lines that start with `!` are skipped.

### File operations

`rm`, `mv`, `cp`, `mkdir`, `touch`, `tee`, and `truncate` are allowed when every path is inside the write scope.

| Command | Decision |
| --- | --- |
| `mkdir -p test/unit/components` | allow |
| `mkdir -m 755 test/unit/components` | allow |
| `rm test/unit/components/SignIn.test.ts` | allow |
| `rm -rf test/unit/old` | allow |
| `mv test/unit/a.test.ts test/unit/b.test.ts` | allow |
| `touch test/unit/a.test.ts` | allow |
| `truncate -s 0 test/unit/a.test.ts` | allow |
| `rm -rf src` | deny |
| `rm package.json` | deny |
| `mv src/a.ts test/a.ts` | deny |
| `cp test/a.ts src/a.ts` | deny |
| `cp --target-directory=src test/a.ts` | deny |
| `mkdir src/new` | deny |
| `touch test/a -- -x` | deny |
| `chmod +x test/run.sh` | deny |
| `ln -s ../src test/link` | deny |
| `ln test/unit/a.test.ts test/unit/b.test.ts` | deny |
| `install -m 755 test/a test/b` | deny |
| `rm -rf test/*/` | deny |
| `rm -R test/lin?/a.ts -rf` | deny |
| `mv test/lin?/a.ts -b test` | deny |
| `cp test/a.ts test/*/b.ts` | deny |
| `truncate -s 0 test/*.txt` | deny |

- A wildcard (`*`, `?`, `[`) in a path of `rm`, `mv`, `cp`, `mkdir`, `touch`, `tee`, or `truncate` is denied. The hook reads a glob such as `test/*/` as text and sees it inside `test/`, but the shell expands it to whatever it matches, which can be a symlink under `test/` that leads outside the write scope. Name each file in full.
- `ln` is not available. The hook checks a path before the command runs, so it cannot follow a link that the same command makes.
- The value of `mkdir -m`, `touch -d`, `-t`, and `-r`, and `truncate -s` and `-r` is not read as a path.
- A word after `--` is always read as a path, even when it starts with a dash.

### Writing file content from the shell

Files under `test/` are written with the file edit tool, never from the shell, because only the tool route passes the content rules.

| Command | Decision |
| --- | --- |
| `echo x > test/unit/a.test.ts` | deny |
| `npx vitest run test/unit/a.test.ts > test/out.txt` | deny |
| `ls \| tee test/out.txt` | deny |
| `sed -i s/a/b/ test/unit/a.test.ts` | deny |
| `cp .cursor/skills/qa-unit/templates/ui.test.ts test/unit/components/SignIn.test.ts` | deny |
| `echo x > src/a.ts` | deny |
| `echo x >> package.json` | deny |
| `ls > /dev/null` | allow |
| `ls 2>/dev/null` | allow |
| `echo x > .cursor/skills/x/notes.md` | allow |
| `npx vitest run test/unit/a.test.ts 2>&1 \| tail -40` | allow |

- A redirect (`>`, `>>`, `&>`, `>|`, `<>`) must write inside the write scope and outside `test/`, or to `/dev/null`.
- A heredoc (`<<`) is denied everywhere, with one exception that writes no file. See "Commit and pull request messages".

### git

| Command | Decision |
| --- | --- |
| `git status` | allow |
| `git diff` | allow |
| `git log --oneline -5` | allow |
| `git show HEAD` | allow |
| `git blame src/a.ts` | allow |
| `git add test` | allow |
| `git add -A` | allow |
| `git commit -m "Add sign-in tests"` | allow |
| `git commit -m "Add tests" -m "Cover the wrong password case."` | allow |
| `git switch -c add-tests` | allow |
| `git checkout -b add-tests` | allow |
| `git branch add-tests` | allow |
| `git tag v1` | allow |
| `git fetch origin` | allow |
| `git push -u origin add-tests` | allow |
| `git push origin HEAD` | allow |
| `git ls-remote origin` | allow |
| `git reset` | allow |
| `git reset HEAD test/a.ts` | allow |
| `git restore test/unit/a.test.ts` | allow |
| `git restore -s main test/unit/a.test.ts` | allow |
| `git checkout -- test/unit/a.test.ts` | allow |
| `git rm test/unit/old.test.ts` | allow |
| `git mv test/unit/a.test.ts test/unit/b.test.ts` | allow |
| `git remote -v` | allow |
| `git stash list` | allow |
| `git config --get user.name` | allow |
| `git config --list` | allow |
| `git config get user.name` | allow |
| `git config user.name` | allow |
| `git commit -F test/message.txt` | allow |
| `git push --force origin main` | deny |
| `git push --force-with-lease origin main` | deny |
| `git push origin --delete add-tests` | deny |
| `git push origin +main` | deny |
| `git push origin :main` | deny |
| `git push https://example.com/x.git main` | deny |
| `git push --all origin` | deny |
| `git branch -D add-tests` | deny |
| `git branch -m old new` | deny |
| `git tag -d v1` | deny |
| `git commit --amend -m x` | deny |
| `git reset --hard HEAD~1` | deny |
| `git reset HEAD~1` | deny |
| `git checkout main` | deny |
| `git switch main` | deny |
| `git pull` | deny |
| `git merge main` | deny |
| `git rebase main` | deny |
| `git cherry-pick abc123` | deny |
| `git stash` | deny |
| `git stash pop` | deny |
| `git clean -fd` | deny |
| `git apply test/x.patch` | deny |
| `git restore src/a.ts` | deny |
| `git checkout -- src/a.ts` | deny |
| `git rm src/a.ts` | deny |
| `git diff --output=src/a.ts` | deny |
| `git remote add other https://example.com/x.git` | deny |
| `git -c core.pager=less log` | deny |
| `git --git-dir=../other/.git log` | deny |
| `git -C ../other add .` | deny |
| `git -C ../other status` | allow |
| `git config user.name Ada` | deny |
| `git config user.name list` | deny |
| `git config --comment list core.fsmonitor "touch /tmp/x"` | deny |
| `git config set user.name Ada` | deny |
| `git config --unset user.name` | deny |
| `git config --edit` | deny |
| `git config --file list a.b c` | deny |
| `git commit -F ~/.ssh/id_rsa` | deny |
| `git tag -a v1 -F /etc/hostname` | deny |

- Allowed: inspecting (`status`, `log`, `diff`, `show`, `blame`, `grep`, `ls-files`, `ls-tree`, `rev-parse`, `rev-list`, `describe`, `shortlog`, `cat-file`, `merge-base`, `name-rev`, `for-each-ref`, `show-ref`, `check-ignore`, `reflog`, `stash list`, `stash show`, `worktree list`, `version`, `help`), `add`, `commit`, a new branch or tag, `fetch`, `ls-remote`, and `push` to a configured remote such as `origin`.
- `git reset` may unstage. `git restore`, `git rm`, `git mv`, and `git checkout --` work on files inside the write scope.
- `git config` may only read: `--get`, `--get-all`, `--get-regexp`, `--list`, `-l`, the subcommands `get` and `list` as the first word, or one key with no value. `--file`, `--blob`, `--comment`, and every other option the hook does not know are denied, so no value can pass for a read. `git config --comment list core.fsmonitor <program>` sets `core.fsmonitor`, and the next `git status` would run the program.
- A message file (`git commit -F`, `--file`, `-t`, `--template`, and `git tag -F`) must be inside the write scope, or `-` for standard input. Its content is published with the commit.
- With `git -C` to a directory outside this repository, only the inspecting commands are allowed.
- Shortened options such as `--del` for `--delete` are treated like the full option.
- Global options other than `-C`, `--no-pager`, `-P`, `--paginate`, `-p`, and `--no-optional-locks` are denied. That covers `-c`, `--git-dir`, and `--work-tree`.

### Commit and pull request messages

Cursor's agent passes a message of several lines in this form:

```bash
git commit -m "$(cat <<'EOF'
Add sign-in tests

Cover the wrong password case.
EOF
)"
```

The hook reads this one form as the text it stands for. The delimiter must be in quotes, and the closing `)"` must follow the delimiter line. It works for any argument, for example `gh pr create --body`.

The body may hold only plain text. A quote, a backtick, `$`, a backslash, or a round bracket in it is denied with a message that says to use `-m` once for each paragraph. The reason is bash 3.2, which macOS still ships as `/bin/bash`. It finds the end of `$(...)` by counting brackets and quotes. Run on bash 3.2: a body of the form `foo)"; <command>; echo "(` made the shell run the command in the middle. Without those characters, bash 3.2, 4.0, and 5.3 and dash all passed the body on as one word.

| Command | Decision |
| --- | --- |
| `git commit -m "$(cat <<EOF)"` | deny |
| `git commit -m "$(cat message.txt)"` | deny |
| `cat <<'EOF'` | deny |

Every other `$(...)` and every other heredoc is denied. The form itself spans several lines, so it has no row here. The tests `MessageHeredoc` and `SplitMatchesBash.test_message_heredoc` hold it.

### gh

| Command | Decision |
| --- | --- |
| `gh pr create --fill` | allow |
| `gh pr create --title "Add tests" --body "Sign-in tests."` | allow |
| `gh pr view 12` | allow |
| `gh pr list` | allow |
| `gh pr diff 12` | allow |
| `gh pr checks 12` | allow |
| `gh pr comment 12 --body "Done."` | allow |
| `gh issue create --title "Bug" --body "Steps."` | allow |
| `gh issue view 12` | allow |
| `gh issue comment 12 --body "Seen."` | allow |
| `gh run list` | allow |
| `gh run view 123` | allow |
| `gh repo view` | allow |
| `gh auth status` | allow |
| `gh api repos/o/r/issues` | allow |
| `gh api -X GET search/issues -f q=hook` | allow |
| `gh pr create --body-file test/pr-body.md` | allow |
| `gh pr create --body-file ../secret.md` | deny |
| `gh pr create --title x --template ../secret.md` | deny |
| `gh pr create --repo other/repo --fill` | deny |
| `gh pr merge 12` | deny |
| `gh pr close 12` | deny |
| `gh pr checkout 12` | deny |
| `gh pr comment 12 --delete-last` | deny |
| `gh issue close 12` | deny |
| `gh issue delete 12` | deny |
| `gh workflow run ci.yml` | deny |
| `gh repo clone o/r` | deny |
| `gh run download 123` | deny |
| `gh alias set x "pr merge"` | deny |
| `gh auth status --show-token` | deny |
| `gh auth token` | deny |
| `gh api -X POST repos/o/r/issues` | deny |
| `gh api repos/o/r/issues -f title=x` | deny |
| `gh api graphql -f query=x` | deny |
| `gh api --input test/x.json repos/o/r/issues` | deny |

- `create` and `comment` act on this repository only.
- A body file (`--body-file`, `-F`) and a pull request template file (`gh pr create --template`, `-T`) are published, so they must be inside the write scope.
- `gh api` may send GET requests only.

### Text the shell rewrites or skips

The hook checks the words it is given. Text that the shell turns into other words first, or skips, is denied.

| Command | Decision |
| --- | --- |
| `echo $(ls)` | deny |
| ``echo `ls` `` | deny |
| `cat <(ls)` | deny |
| `cat =(touch src/x)` | deny |
| `ls test/unit/*(.)` | deny |
| `echo $HOME` | deny |
| `echo ${HOME}` | deny |
| `echo $?` | allow |
| `echo '$HOME'` | allow |
| `rm test/{a,b}.ts` | deny |
| `ls *` | deny |
| `ls *.ts` | deny |
| `ls test/*.ts` | allow |
| `ls ./*` | allow |
| `grep -rn x --include=*.ts src` | allow |
| `find src -name '*.ts'` | allow |
| `ls # list the files` | deny |
| `gh issue view #12` | deny |
| `git commit -m "Fix #12"` | allow |
| `echo a#b` | allow |
| `cat ~-/README.md` | deny |
| `git -C ~- add .` | deny |
| `ls ~/.cursor` | allow |
| `git show HEAD~2` | allow |
| `npx vitest run <file>` | deny |
| `grep "<form>" src/a.tsx` | allow |
| `echo "unclosed` | deny |

- `$(...)`, backticks, `<(...)`, `$VARIABLE`, `${...}`, `$'...'`, and brace expansion such as `{a,b}` are denied. `$?`, `$$`, `$#`, and `$!` are allowed. To pass a literal `$`, put it in single quotes.
- A `(` joined to the word before it is denied. In zsh, `=(...)` runs a command and feeds its output as a file, and a glob qualifier such as `test/unit/*(.)` or `*(e:'cmd':)` runs a command. bash does not treat either specially, and the hook cannot know the shell. A `(` that starts a word is a subshell, denied as a compound command.
- A wildcard that could expand to an option is denied, because a file can be named `-delete`: a word that starts with `*`, `?`, or `[...]`, and an option with a wildcard in its name. A pattern with a fixed start is allowed.
- A `#` that starts a word begins a comment. The shell skips the rest of the line and the hook does not, so a quote inside a comment would hide the next line from the hook. Run on bash 5.3: `echo a #'`, a line break, `touch x`, a line break, `'` created the file `x`. A `#` inside a word or inside quotes is allowed.
- `~-`, `~+`, and `~1` at the start of a word stand for a directory only the shell knows. `~/` is the home directory, which the hook can follow.
- A placeholder such as `<file>` outside quotes is denied. Inside quotes it is denied in a test run (`-g "<title>"`) and allowed elsewhere.
- A quote that is not closed and a NUL character are denied.

### rtk

RTK's hook rewrites commands before this hook sees them. The hook reads `rtk git`, `rtk gh`, `rtk ls`, `rtk grep`, `rtk rg`, `rtk find`, `rtk wc`, `rtk stat`, `rtk npm`, `rtk npx`, `rtk vitest`, and `rtk playwright` as the command that follows, and `rtk read <file>` as `cat <file>`. Every other `rtk` command is denied, because rtk runs any name it does not know.

| Command | Decision |
| --- | --- |
| `rtk git status` | allow |
| `rtk read package.json` | allow |
| `rtk ls test` | allow |
| `rtk git push --force origin main` | deny |
| `rtk rm -rf src` | deny |
| `rtk test npm run build` | deny |
| `rtk proxy curl http://localhost:3000` | deny |
| `rtk maestro test test/mobile/sign-in` | deny |

What the `rtk` forms do when they run was not checked here. RTK is not installed on the machine these rules were written on.

## MCP tools

Cursor raises two events for one MCP call, according to its code (version 3.23.23) and its documentation. `preToolUse` carries the tool name with `MCP:` in front and the arguments as an object. `beforeMCPExecution` carries the bare tool name, the arguments as a JSON string, and the server's name. The hook gives the same answer to both. No real MCP call has been seen in a hook log, so this section is UNVERIFIED in Cursor. See "Known limits and unverified behaviour".

In a `beforeMCPExecution` payload, `command` is the line that started the MCP server. The hook never reads it as a shell command. Arguments in a shape the hook does not expect, such as text that is not JSON, are treated as no arguments, so an odd payload cannot make the hook deny every MCP call.

The kit's `.cursor/mcp.json` starts the Maestro server. The kit does not start a Playwright MCP server: it browses with `playwright-cli`, under the rules above. The `browser_*` rows below are for a Playwright MCP server you add yourself. The hook does not hold `browser_navigate` to a URL on this machine.

Most MCP tools pass. The hook does two things:

1. It denies a few tools by name.
2. It checks the files a tool names.

| Tool call | Decision |
| --- | --- |
| `MCP:browser_navigate {"url": "http://localhost:3000/sign-in"}` | allow |
| `MCP:browser_snapshot {}` | allow |
| `MCP:browser_click {"element": "Sign in", "target": "e8"}` | allow |
| `MCP:browser_type {"element": "Email", "target": "e5", "text": "ada@example.com"}` | allow |
| `MCP:browser_evaluate {"function": "() => document.title"}` | allow |
| `MCP:browser_take_screenshot {"type": "png"}` | allow |
| `MCP:browser_close {}` | allow |
| `MCP:browser_run_code_unsafe {"code": "async (page) => page.title()"}` | deny |
| `MCP:browser_install {}` | deny |
| `MCP:browser_snapshot {"filename": "src/app/page.tsx"}` | deny |
| `MCP:browser_snapshot {"filename": "snapshot.yml"}` | deny |
| `MCP:browser_snapshot {"filename": "test/e2e/plan/sign-in.yml"}` | allow |
| `MCP:browser_take_screenshot {"filename": "src/app.png"}` | deny |
| `MCP:browser_evaluate {"function": "() => 1", "filename": "../out.json"}` | deny |
| `MCP:browser_find {"text": "Sign in", "filename": "/tmp/found.txt"}` | deny |
| `MCP:browser_file_upload {"paths": ["test/e2e/fixtures/avatar.png"]}` | allow |
| `MCP:browser_file_upload {"paths": ["/home/ada/.ssh/id_rsa"]}` | deny |
| `MCP:browser_drop {"target": "e4", "paths": ["src/secret.env"]}` | deny |
| `MCP:list_devices {}` | allow |
| `MCP:inspect_screen {"device_id": "emulator-5554"}` | allow |
| `MCP:take_screenshot {"device_id": "emulator-5554"}` | allow |
| `MCP:cheat_sheet {}` | allow |
| `MCP:run {"device_id": "emulator-5554", "yaml": "- launchApp"}` | allow |
| `MCP:run {"device_id": "emulator-5554", "files": ["test/mobile/sign-in/01-valid-account.flow.yaml"]}` | allow |
| `MCP:run {"device_id": "emulator-5554", "dir": "test/mobile/sign-in"}` | allow |
| `MCP:run {"device_id": "emulator-5554", "files": ["src/flows/a.yaml"]}` | deny |
| `MCP:run {"device_id": "emulator-5554", "dir": "."}` | deny |
| `MCP:run_on_cloud {"app_file": "test/app.apk", "flows": "test/mobile"}` | deny |
| `MCP:list_cloud_devices {}` | deny |
| `MCP:get_cloud_run_status {"upload_id": "u", "project_id": "p"}` | deny |
| `MCP:describe_cloud_run {"run_id": "r"}` | deny |
| `MCP:open_maestro_viewer {}` | deny |
| `MCP:export_report {"output_path": "src/report.html"}` | deny |
| `MCP:edit_file {"path": "src/a.ts", "edits": []}` | deny |
| `MCP:create_directory {"path": "test/unit/new"}` | allow |
| `MCP:write_file {"path": "src/a.ts", "content": "x"}` | deny |
| `MCP:get_file_contents {"owner": "o", "repo": "r", "path": "src/index.ts"}` | allow |
| `MCP:read_file {"path": "/etc/hostname"}` | allow |
| `MCP:browser_cookie_set {"name": "a", "value": "b", "path": "/"}` | allow |
| `MCP:run_sql {"sql": "select 1"}` | allow |
| `FetchMcpResource {"server": "s", "uri": "x://y", "download_path": "src/a.json"}` | deny |
| `FetchMcpResource {"server": "s", "uri": "x://y", "download_path": "test/e2e/a.json"}` | allow |

### Tools denied by name

| Tool | Server | Why |
| --- | --- | --- |
| `browser_run_code_unsafe` | Playwright | It runs JavaScript in the server's own process, outside the page. Its description says "RCE-equivalent". It could write any file. |
| `browser_install` | Playwright | It would download and install a browser. `@playwright/mcp` 0.0.83, the version these rules were checked against, has no tool of this name: its README has a "Browser installation" section with nothing in it. The rule is there for a version that has one. |
| `run_on_cloud` | Maestro | It uploads the app and the flows to Maestro Cloud. |
| `list_cloud_devices`, `get_cloud_run_status`, `describe_cloud_run` | Maestro | They use Maestro Cloud. |
| `open_maestro_viewer` | Maestro | It returns a page for a person to watch. |

A name with a server name in front, such as `playwright_browser_run_code_unsafe`, is denied too.

Tools that stay allowed, and why:

- `browser_evaluate` runs JavaScript inside the page. The browser keeps it there: it cannot write files or start programs. Its `filename` argument is checked.
- The other 23 tools a Playwright MCP server lists (`@playwright/mcp` 0.0.83) drive the page or read from it.
- Maestro's `list_devices`, `inspect_screen`, `take_screenshot`, and `run` work on a connected device. `cheat_sheet` fetches a help text from Maestro's server and sends nothing.

### Files a tool names

Relative paths are resolved against the project root. A Playwright MCP server says in its tool descriptions that it resolves relative file names against the workspace root.

- **A file the tool writes** must be inside the write scope, whatever the tool is. The keys are `filename`, `output`, `output_path`, `output_file`, `output_dir`, `output_directory`, `outfile`, `outdir`, `save_path`, `save_as`, `save_to`, `download_path`, `download_dir`, `destination`, `destination_path`, `dest`, `dest_path`, `target_path`, and `target_file`, in any mix of upper case, `_`, and `-`.
- **A file or folder the tool is given** (`path`, `paths`, `file`, `files`, `file_path`, `file_paths`, `dir`, `directory`, `folder`, `notebook_path`, `target_notebook`) must be inside the write scope for `browser_file_upload`, `browser_drop`, and `run`, and for any tool whose name has one of these words in it: `write`, `create`, `edit`, `update`, `delete`, `remove`, `move`, `rename`, `copy`, `save`, `download`, `export`, `append`, `patch`, `replace`, `upload`, `mkdir`, `touch`.
- **A tool with a path and content** in its input is a write tool, as under "Write scope".

Why `path` is not checked on every tool: many tools use it for something that is not a local file to change. `browser_cookie_set` takes a cookie path, a GitHub tool takes a path in a remote repository, and a file server's `read_file` only reads.

`browser_file_upload` and `browser_drop` send local files to the page, so their files must be inside the write scope, as a `gh` body file must.

## What it does not check

The hook reads tool calls and command lines. It is a guardrail and not a sandbox.

- **Code the test runners run.** A test file, `vitest.config.ts`, `playwright.config.ts`, and a Maestro flow are code. The runners execute them with your permissions. A test can write to `src/`, read any file, or call the network, and the hook does not see it.
- **Output the runners write by default.** `coverage/`, `test-results/`, `playwright-report/`, `.vitest/`, and `.playwright-cli/` are outside the write scope and still get written. `playwright-cli` saves a page snapshot and a console log in `.playwright-cli/` after `open` and after an action. Only a path given on the command line is checked.
- **What an MCP tool does.** The hook sees the tool's name and arguments, not its effect. A tool of another server that runs commands or writes a file named by a key the hook does not know passes. Inline flow text given to Maestro's `run` tool is not read.
- **Where the browser goes after the first page.** `open` and `goto` take a URL on this machine. A link the agent clicks, a redirect, or a script on the page can take the browser to any site, and the hook does not see it. An MCP tool such as `browser_navigate` may open any URL.
- **What the page does with what is typed.** The text of `fill` and `type` goes to the page, and the page may send it anywhere.
- **The configuration of `playwright-cli`.** Its help says it reads `.playwright/cli.config.json` by default. The hook does not read that file. It is outside the write scope, so the agent cannot create or change it.
- **Reads.** The shell and the read tools may read any file on the machine. Only the paths in `.cursorignore` are held back, and only on the routes listed under "Paths the agent does not read". That list saves context. It does not keep secrets.
- **What is staged.** `git add -A` and `git add -f` stage any file in the repository, and `git push` publishes what is committed.
- **Text typed into a running program.** Cursor reports only the length of such input to the hook.
- **Anything that is not a tool call or a shell command of the agent.** Your own terminal, Cursor Tab, and other programs are not checked.
- **A workspace that is not trusted.** Cursor's documentation says project hooks load only in a trusted workspace. Not checked here.

## Known limits and unverified behaviour

Not seen in a real Cursor session:

- **MCP payloads.** No MCP call is in Cursor's hook logs on the machine these rules were written on. The two payload shapes are read from the code of Cursor 3.23.23 and from Cursor's documentation. The hook's tests send those shapes. Whether Cursor sends exactly these, whether both events fire in the command-line agent, and whether the agent sees the deny message are UNVERIFIED.
- **Where an MCP server resolves a relative path.** The hook uses the project root. Which directory Cursor starts an MCP server in was not checked.
- **The shell's directory.** Cursor sent an empty `cwd` with every logged shell command. The hook then assumes the project root. Whether Cursor's shell keeps a directory between commands is UNVERIFIED. The `cd` rule makes the answer not matter.
- **The `Delete` tool.** The name is read from Cursor's code. No call was logged.
- **Windows.** The hook accepts the byte order mark that Cursor on Windows puts in front of the payload. It was not run on Windows. `hooks.json` names a `.py` file, which Windows cannot start by itself.
- **macOS and zsh.** Not run. The comparison with the shell was made on bash 5.3 and 5.2. The message heredoc was also run on bash 3.2 and 4.0 and on dash.
- **Other versions of `playwright-cli`.** The command and option lists were read from `@playwright/cli` 0.1.22 on Linux. A version that adds an option to an allowed command fails `test_cli_words_match_playwright_cli.py` until the option is put on a list. Until then the hook denies the new option, because the lists are closed.

Rules that deny more than they must:

- `cat *.json` is denied by the wildcard rule. Write `cat ./*.json`, which is then checked against the ignore list.
- A test title with something like an HTML tag in it, as in `-g "renders <b> bold"`, is read as a placeholder. So is such a text given to `playwright-cli`, as in `fill e5 "<b>"`.
- `playwright-cli open https://localhost:3000` and `open "http://[::1]:3000/"` are denied, although they name this machine. `BASE_URL` may use `https`.
- A text for `playwright-cli` that starts with two dashes is read as an option and denied. Put `--` in front of it.
- `playwright-cli` commands that only read, such as `cookie-list`, `tab-list`, and `reload`, are denied because no skill uses them.
- `rg` skips what `.gitignore` names, but the hook denies `rg "text"` at the project root whenever the root holds an ignored path.
- A long option that takes its value as the next word is read correctly only in the cases listed above. `mkdir --mo 755 test/x` is denied for `755`.
- A message heredoc with an apostrophe or a bracket in it is denied, although current shells handle it.
- A wildcard in a path of `rm`, `mv`, `cp`, `mkdir`, `touch`, `tee`, or `truncate` is denied even when every file it would match is inside the write scope.
- The agent cannot remove a symlink loop under `test/`. Remove it yourself.

Rules that deny less than they could:

- With an empty `.cursorignore` the read protection is off. A file that exists is taken as your choice.
- A wildcard or a search that would make the hook look at more than 20,000 directory entries is allowed without an answer.
- `sed` can read a file with its `r` command, and the test runners can read anything. Neither is checked against the ignore list.
- `mv` and `git restore` can put a file under `test/` without the content rules.
- A paused test is known by its session name, which starts with `tw-`. `close` on a session of another name is allowed.
- Outside a `playwright-cli` command, the hook reads a carriage return as a space and bash reads it as part of a word. Each part is checked on its own, and no way to use the difference was found.

## How to debug a deny

1. Read the message. Every deny names the cause and what to do instead. The agent gets the same text.
2. Open the Output panel in Cursor and pick **Hooks** in its list. Cursor's documentation names this Hooks output channel and a Hooks tab under **Customize**. Neither was opened while these rules were written.
3. Read the log file. On Linux it is `~/.config/Cursor/logs/<session>/window1/output_<time>/cursor.hooks.workspaceId-<id>.log`. Each run has an `INPUT:` block with the JSON Cursor sent and an `OUTPUT:` block with the hook's answer. The paths on macOS and Windows were not checked.
4. Run the hook yourself with that input. From the project root:

   ```bash
   printf '%s' '{"hook_event_name":"beforeShellExecution","command":"npx vitest run","cwd":""}' | python3 .cursor/hooks/guard-test-writes.py
   ```

   It prints the answer as one line of JSON:

   ```json
   {"permission": "deny", "user_message": "Give the full path of a test file under test/, as in `RTK_DISABLED=1 npx vitest run test/unit/components/SignIn.test.ts`. A name alone, or no path, runs other files too.", "agent_message": "Give the full path of a test file under test/, as in `RTK_DISABLED=1 npx vitest run test/unit/components/SignIn.test.ts`. A name alone, or no path, runs other files too."}
   ```

5. If the message says "The write guard hook failed on this input", the hook has a bug. The Python error is in the Hooks output. Please report it with the input.

If no hook runs at all, check that the workspace is trusted and that `.cursor/hooks.json` is in the project root. When hooks load, the log has a line such as `Loaded 2 project hook(s) for steps: preToolUse, beforeShellExecution`. That line is from Cursor 3.22.12, before the third event was registered.

## How to test the hook

The hook needs Python 3.9 or later and no packages. From the project root:

```bash
python3 -m unittest discover -s .cursor/hooks
```

- The run takes a little over two minutes. Most of that is starting Python once for each case.
- `test_guard_test_writes.py` pipes payloads into the hook, as Cursor does, and checks the decision and the message.
- `test_split_matches_bash.py` runs random command lines through bash and through the hook and compares where each command starts and ends. It needs bash 4 or later and skips itself otherwise, so on macOS with the stock bash it reports OK without running.
- `test_cli_words_match_playwright_cli.py` compares the hook's list of `playwright-cli` commands and options with the installed package, and gives random command lines to the hook and to `playwright-cli`'s own parser. It needs `node_modules/playwright-core`, and node for the second part, and skips itself otherwise.
- `RulesDocument` in the first file runs every table row of this document that ends in `allow` or `deny`. In an app that has the kit but not this file, it skips itself.

To add a rule, add an allow case and a deny case, and a row here.
