# Changelog

All notable changes to this kit are recorded in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the version is below 1.0, a minor version may need action from you.

The version of your copy is the one line in `.cursor/qa/VERSION`.

## Unreleased

These entries become version 0.1.0, the first tagged version. `.cursor/qa/VERSION` already says `0.1.0`. No changes were recorded before it. A copy with no `.cursor/qa/VERSION` file is an earlier version.

### Action needed if you copied an earlier version

"Upgrading" in the [README](README.md#upgrading) says which files to overwrite and which to merge by hand.

1. Delete the old skill folders from `.cursor/skills/` in your app: `vitest-unit-integration`, `playwright-planner`, `playwright-generator`, `playwright-healer`, `playwright-page-objects`, and `playwright-cli`. A copy over the old `.cursor/` leaves them behind.
2. Start a job with `/qa-unit`, `/qa-plan`, `/qa-generate`, or `/qa-heal` and one file, feature, or plan. `/qa` still works, as a router only, and a prompt no longer needs `This is UI.`
3. Copy `.cursor/qa/`. The two config files load a reporter from it. Without it Vitest stops with `Failed to load custom Reporter from ./.cursor/qa/vitest-verdict.mjs`, and Playwright stops with `Cannot find module './.cursor/qa/playwright-verdict.mjs'`.
4. Copy `.cursorignore`. The old install steps left it out ([#12](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/12)). Without it the hook holds back lockfiles only. If you have the file, add `.playwright-mcp/` and `.maestro/tests/`.
5. Take the new `vitest.config.ts` and `playwright.config.ts`, and move your own settings into them. `vitest.config.ts` now needs Vite 8.
6. Change two scripts in your `package.json`. Without the flag they exit 1 while a test folder is empty.

   ```json
   "test:unit": "vitest run --project unit --passWithNoTests",
   "test:integration": "vitest run --project integration --passWithNoTests"
   ```

7. Copy the new `.cursor/hooks.json`, or add its third entry, `beforeMCPExecution`, to your own file.
8. Replace the kit's part of your `AGENTS.md`. The old text sent all test work to the `qa` role and said not to open skills. The new text routes each request to one skill file.
9. Add the new `.gitignore` lines: `.next/`, `.playwright-mcp/`, `.maestro/tests/`, `/report.xml`, and `/report.html`.
10. Only for mobile work: add the `maestro` entry to your `.cursor/mcp.json`.
11. Check your own skills, rules, and habits against the list below.

The hook now denies these. It allowed them before.

- `cd` into any folder but the project root, and a command that starts in another folder. Pass paths from the root, such as `test/unit/x.test.ts`.
- A test run that names no path: `npx vitest run` and `npx playwright test`. Give a path under `test/`, or use `npm run test:unit` and `npm run test:e2e` for the whole suite. `npx vitest` without `run`, `vitest list`, and `vitest related` are denied too.
- Runner options that wait for a person or hide a failure. For Vitest: `--watch`, `--ui`, `-u`, and `--update`. For Playwright: `--ui`, `--headed`, `--debug` in any form but `--debug=cli`, `--retries`, `--timeout`, `-u`, `--update-snapshots`, and `--repeat-each` above 5. The same options are denied after `npm run test:e2e --`.
- Writing file content under `test/` from the shell: a redirect, `tee`, `sed -i`, `cp`, and a heredoc. The agent writes those files with its file edit tool. A skill of yours that copies a template with `cp` must change.
- Creating or editing a file under `test/` whose name is outside the layout: a `.tsx` or `.jsx` file, a `__tests__/` folder, a `tests/` or `specs/` folder at the top of `test/` or under `test/e2e/`, a page class that is not `test/e2e/pages/<name>-page.ts`, and a plan that is not `<name>.plan.md` in a `plan/` folder. The agent can move or delete such a file of yours. It cannot edit it.
- A write to test code that adds `.only(`, `.skip(`, `.todo(`, `.fails(`, `test.fail(`, `skipIf(`, or `runIf(`, and under `test/e2e/` `waitForTimeout(`, `networkidle`, or `force: true`. `test.fixme(` needs a `// product bug:` line above it and is allowed in specs only. Text that is already in a file may stay.
- `BASE_URL` with a host other than `localhost` or `127.0.0.1`.
- `playwright-cli detach`. A debug run ends with `resume`.
- A search of a whole folder that holds a `.cursorignore` path: `grep -r "text" .`, `rg "text"`, and `git grep "text"`. Name the folders: `grep -rn "text" src test`.
- More ways to read a `.cursorignore` path: `cat <package-lock.json`, a wildcard that matches one, and `git show`, `git diff`, `git log`, `git blame`, or `git cat-file` of one.
- `ln`, a shell comment such as `ls # list`, and `~-`, `~+`, and `~1`.
- `git commit -F`, `git tag -F`, and `gh pr create --template` with a file outside the write scope, and every form of `git config` that writes.
- An MCP tool call that writes a file outside the write scope, and the tools `browser_run_code_unsafe`, `browser_install`, `run_on_cloud`, `list_cloud_devices`, `get_cloud_run_status`, `describe_cloud_run`, and `open_maestro_viewer`.
- A tool the hook does not know by name, when its input has a path and content and the path is outside the write scope.

### Added

- One skill for each job: `/qa-unit`, `/qa-plan`, `/qa-generate`, and `/qa-heal`. Each is complete on its own and is built from numbered steps, lookup tables, templates, `BLOCKED` exits that say what you must do, and a reply form that ends with `Verdict:` and `Not checked:`. They are written so that a small model has no routing decision to make ([#27](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/27)).
- `/qa-unit` with the path of a test file fixes a failing unit or integration test. `/qa-unit` and `/qa-heal` name the cause before they edit, try the smallest fix first, and stop after 3 rounds ([#28](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/28)).
- `/qa-generate` takes `page classes only` and `spec only`, so one plan can be done in two prompts.
- A verdict line. Every Vitest run and every Playwright run ends with one line that starts with `QA-VERDICT:` and says `PASS`, `FAIL`, or `PASS-WITH-FIXME`. A skipped or todo test, a test that passed only on a retry, a stray `.only`, and a run with no tests are `FAIL`. The reporters are in `.cursor/qa/`.
- `.cursor/qa/VERSION`, which holds the version of the kit, and this changelog ([#18](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/18)).
- A preview of mobile testing with Maestro: `/qa-mobile-plan`, `/qa-mobile-generate`, and `/qa-mobile-heal`, the rule file `.cursor/rules/mobile-test-conventions.mdc`, the folders `test/mobile/plan/` and `test/mobile/subflows/`, and a `maestro` entry in `.cursor/mcp.json`. The skills were checked against Maestro 2.10.0 with no device attached. No flow has run on a device, and nothing was checked on iOS ([#21](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/21), [#22](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/22), [#23](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/23), [#24](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/24)).
- In the hook:
  - A message of its own for every deny, with the cause and what to do instead. Before, 14 causes shared one message.
  - Rules for the names and the content of files under `test/`.
  - Checks of MCP tool calls, and a third hook event, `beforeMCPExecution`.
  - The Maestro commands `maestro --version`, `maestro check-syntax` with a flow under `test/mobile/`, and `maestro test` with `--platform`, `--device`, `--include-tags`, `--exclude-tags`, `-e KEY=VALUE`, and paths under `test/mobile/`.
  - `sleep 1` to `sleep 30`, and `playwright-cli -s tw-1` with a space after `-s`.
  - The commit message form `git commit -m "$(cat <<'EOF' ... EOF)"`, when the message is plain text.
  - `git config user.name`, and `git config get` and `list`, as reads.
  - A built-in list of lockfiles, used when `.cursorignore` is missing.
  - A message for a command that still has a placeholder in it, such as `<file>` or `tw-XXXXXX`.
- `docs/hook-rules.md`: every rule of the hook, with examples that the hook's own tests run.
- `examples/next-app/`, an example app with reference tests. `scripts/install-into.mjs`, which does the install steps for an existing app and takes `--dry-run` and `--force`. `scripts/test-example.mjs`, which installs the kit into a copy of the example and runs the build and the tests ([#19](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/19)).
- `eval/`: nine fixed test jobs on the example app, a sandbox maker, a prompt printer, and a scorer that needs no model. It is for maintainers.
- `THIRD_PARTY_NOTICES.md`, and the upstream license files next to the copied Vitest reference files ([#15](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/15)).
- `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, two issue forms, and a pull request template ([#16](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/16)), and a Dependabot config ([#17](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/17)). None of them is copied into an app.
- In `package.json`: a description, the license, repository links, and `engines.node` set to `^22.22.2 || ^24.15.0 || >=26.0.0` ([#14](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/14)). Maintainer scripts `test:hook`, `test:reporters`, `lint:md`, and `typecheck`, with `tsconfig.json` and `.markdownlint-cli2.jsonc`. `typescript` and `markdownlint-cli2` are dev dependencies of this repository only.
- In the README: requirements ([#13](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/13)), what to do when your app already has the kit's files, the installer, things that go wrong on install, the limits of the hook ([#10](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/10)), mobile, the example app and the evaluation, and upgrading.

### Changed

- `/qa` is a router only. `.cursor/agents/qa.md` holds a table from the request to one skill file. `AGENTS.md` holds the same table, so a plain request needs no subagent.
- A prompt no longer needs `This is UI.` or `This is API.` Each skill decides from the file. Say `API` in a `/qa-plan` prompt for a plan with no mocked request.
- The test commands the agent uses are `RTK_DISABLED=1 npx vitest run test/unit/components/SignIn.test.ts` and `RTK_DISABLED=1 npx playwright test test/e2e/sign-in.spec.ts`. `--project` and `--no-passWithNoTests` are gone: the path selects the Vitest project.
- `vitest.config.ts` fails a run that collects no tests, fails a stray `.only`, resolves the import aliases in `tsconfig.json`, compiles JSX by itself, and registers the verdict reporter. `playwright.config.ts` fails a stray `test.only` on every machine, not only on CI, and registers the verdict reporter.
- The `test:unit` and `test:integration` scripts pass `--passWithNoTests`.
- Plans use fixed sentence forms and a `**Data:**` line. A plan from the old planner still works. Its lines in other forms are listed under `Not checked:`.
- Generated page classes hold fields and a `goto` method. A spec calls the fields, with one comment and one line of code for each plan step. Specs with helper methods keep working, and `/qa-heal` fixes both kinds.
- A product bug in a spec is marked with `test.fixme(` and a `// product bug:` line above it, by `/qa-heal` only. `/qa-unit` and `/qa-generate` leave the test failing and name the source line.
- `/qa-heal` no longer edits `playwright.config.ts`.
- The agent no longer edits `vitest.config.ts` for an import alias. `/qa-unit` replies `BLOCKED` when an alias of the app is not in `tsconfig.json`.
- `.cursor/rules/test-file-conventions.mdc` is a table of where each kind of test file goes, `test/mobile/` included.
- The hook denies more. See the list under "Action needed".
- In the hook, a `.cursorignore` pattern that starts with `/` matches from the project root only. When Cursor sends no working directory, the hook checks relative paths against the project root.
- `.cursorignore` also lists `.playwright-mcp/` and `.maestro/tests/`. `.gitignore` also lists `.next/`, `.playwright-mcp/`, `.maestro/tests/`, `/report.xml`, and `/report.html`.
- `.cursor/mcp.json` has a second server, `maestro`. It needs Maestro CLI 2.6.0 or later.
- The three Vitest reference files that remain are byte for byte the same as upstream again.
- `package.json` is named `cursor-qa-agents`. It was `cursor-agent-testing-for-react`.
- The install steps in the README list the dev dependencies by name. Do not copy every entry of this repository's `devDependencies`.
- The full list of hook rules moved from the README to `docs/hook-rules.md`.

### Removed

- The skills `vitest-unit-integration`, `playwright-planner`, `playwright-generator`, `playwright-healer`, and `playwright-page-objects`. The `qa-` skills replace them.
- The `playwright-cli` skill. Nothing routed to it, and the hook denied most of the commands it taught. `/qa-heal` carries the commands it needs.
- 16 of the 19 Vitest reference files.
- From `.cursor/agents/qa.md`: the UI or API rule, the tool list, the paths, the failing-test rule, and the finish format. Each skill has its own.
- `ln` and `playwright-cli detach` from the commands the hook allows.
- The "Roadmap" section of the README. "Mobile" replaces it.

### Fixed

- `next build` failed in an app that had the kit, with `'passWithNoTests' does not exist in type`, because `vitest.config.ts` set that option inside its two project blocks.
- An import through an alias from `tsconfig.json`, such as `@/lib/db`, did not resolve in Vitest.
- UI tests failed to parse in an app whose `tsconfig.json` has `"jsx": "preserve"`.
- The install steps left out `.cursorignore`. Without the file the hook stopped denying reads of lockfiles, build output, and test reports, and gave no sign of it ([#12](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/12)).
- The hook denied two writes that Cursor makes for itself: a long tool result in `~/.cursor/projects/<project>/agent-tools/`, and a Plan mode plan in `~/.cursor/plans/`.
- The hook rejected input that starts with a UTF-8 byte order mark, which Cursor on Windows sends. The kit is still not expected to work on Windows. See "Requirements" in the README.
- An error inside the hook blocked the action with no reason. It is now a deny with a message.
- `npx vitest run -t init` with a test file was taken for `vitest init` and denied.
- `truncate -s 0`, `mkdir -m 755`, `touch -d`, and `git restore -s` on a path under `test/` were denied, because the hook read the option's value as a path.
- A heredoc into `test/` was denied with a message that said the shell cannot write outside `test/`.
- An `EditNotebook` call was denied for a missing path.
- The README and `AGENTS.md` said that the hook blocks every write outside the write scope. They now say what it checks and what it does not ([#10](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/10)).

### Security

All of these are in the hook, `.cursor/hooks/guard-test-writes.py`. Copy the new `.cursor/hooks/` and `.cursor/hooks.json`.

- `git config` could write when `list` or `get` stood among its arguments. For example, `git config --comment list core.fsmonitor <program>` was allowed, and it makes the next `git status` run the program. Only reads are allowed now.
- A `#` comment with a quote in it hid the lines after it from the hook.
- MCP tool calls were not checked ([#10](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/10)). The hook now checks the files a tool writes and denies the tools named under "Action needed". These rules have not been seen working in a live Cursor session.
- A write tool with a name the hook did not know was allowed, whatever it wrote.
- An `ApplyPatch` call was checked for its `path` key only, not for the files named inside the patch.
- After `cd`, the hook could not know which folder the shell was in, so it could check a relative path against the wrong folder. `cd` into another folder is now denied. The gap was not reproduced in a live Cursor session.
- `playwright-cli` with an unknown option in front of the command: the hook took one word for the command, and the tool's argument parser takes another. This was read in the parser and not run.
- Vitest path options written as `--r` or `--c`, or with three dashes, were not checked against the write scope.
- `sed -i` with a backup suffix that holds `/` or `*` could write a file outside the write scope.
- `ln -s` was allowed for a link under `test/` that leads outside it. `git -C ~-` was allowed, although the shell turns `~-` into the name of another folder.
- `git commit -F`, `git tag -F`, and `gh pr create --template` were allowed with a file outside the write scope, which publishes that file's content.
- A path through a symlink loop made the hook stop with an error on Python 3.12 and older, and was allowed on Python 3.13 and newer. It is denied on every version now.
- A `.cursorignore` path could still be read through an input redirect, a wildcard, a recursive search, and `git show`.
- The README has a "Limits" section. The hook is a guardrail and not a sandbox: it does not see what a test, a config file, or an MCP tool does once it runs.
