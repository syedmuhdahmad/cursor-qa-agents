# Changelog

All notable changes to this kit are recorded in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the version is below 1.0, a minor version may need action from you.

The version of your copy is the one line in `.cursor/qa/VERSION`.

## Unreleased

These entries become version 0.1.0, the first tagged version. `.cursor/qa/VERSION` already says `0.1.0`. No changes were recorded before it. A copy with no `.cursor/qa/VERSION` file is an earlier version.

### Action needed if you copied an earlier version

[Upgrading](docs/install-notes.md#upgrading) in the install notes says which files to overwrite and which to merge by hand. `node scripts/install-into.mjs ../my-app --dry-run`, run from a clone of the kit, lists what differs in your app.

1. Delete the old skill folders from `.cursor/skills/` in your app: `vitest-unit-integration`, `playwright-planner`, `playwright-generator`, `playwright-healer`, and `playwright-page-objects`. A copy over the old `.cursor/` leaves them behind. Overwrite the `playwright-cli` folder with the new one. The installer skips its files that differ, unless you pass `--force`.
2. Start a job with `/qa-unit`, `/qa-plan`, `/qa-generate`, or `/qa-heal` and one file, feature, or plan. `/qa` still works, as a router only, and a prompt no longer needs `This is UI.`
3. Copy `.cursor/qa/`. The two config files load a reporter from it. Without it Vitest stops with `Failed to load custom Reporter from ./.cursor/qa/vitest-verdict.mjs`, and Playwright stops with `Cannot find module './.cursor/qa/playwright-verdict.mjs'`.
4. Copy `.cursorignore`. The old install steps left it out ([#12](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/12)). Without it the hook holds back lockfiles only. If you have the file, add `.maestro/tests/`, and put a slash in front of four lines: `/dist/`, `/build/`, `/out/`, and `/coverage/`. Without the slash the hook denies the agent a read of application source in a folder of that name, such as `app/build/page.tsx`.
5. Take the new `vitest.config.ts` and `playwright.config.ts`, and move your own settings into them. `vitest.config.ts` now needs Vite 8.
6. Change two scripts in your `package.json`. Without the flag they exit 1 while a test folder is empty.

   ```json
   "test:unit": "vitest run --project unit --passWithNoTests",
   "test:integration": "vitest run --project integration --passWithNoTests"
   ```

7. Copy the new `.cursor/hooks.json`, or add its third entry, `beforeMCPExecution`, to your own file. The installer does this.
8. Replace the kit's part of your `AGENTS.md`. The old text sent all test work to the `qa` role and said not to open skills. The new text routes each request to one skill file.
9. Add the new `.gitignore` lines: `.next/` and `.maestro/tests/`. Put a slash in front of the four report folders that the old install steps had you add: `/coverage/`, `/playwright-report/`, `/test-results/`, and `/blob-report/`. Without the slash git also hides your own files in a folder of that name, such as `app/coverage/page.tsx`.
10. Only for mobile work: add the `maestro` entry to your `.cursor/mcp.json`. The installer does this. If you do not test a mobile app, leave the entry out: the server cannot start without the Maestro CLI.
11. If your `tsconfig.json` leaves out `test/`, add `test/tsconfig.json` as shown under [Things that go wrong on install](docs/install-notes.md#things-that-go-wrong-on-install). Without it an import alias such as `@/lib/db` does not resolve in a test file, and `vi.mock('@/lib/db')` replaces nothing. The installer adds the file.
12. Remove the Playwright MCP server. `/qa-plan` and `/qa-generate` now look at the app with `playwright-cli` shell commands, and no job uses the server. Delete the `playwright` entry from your `.cursor/mcp.json`, and run `npm uninstall @playwright/mcp`, unless you use the server for something else. The installer names both in a `NOTE:` and removes neither.
13. For the plan and generate jobs, have `@playwright/cli` in your dev dependencies and Google Chrome on your machine. `playwright-cli` starts that Chrome. Copy the new `.cursor/hooks/` with the skills: the old hook denies `playwright-cli open`, `goto`, and `close`.
14. Start the app on this machine for every web job. The hook lets the browser open only `http://localhost` and `http://127.0.0.1`. With another host in the prompt, `/qa-plan`, `/qa-generate`, and `/qa-heal` stop with `BLOCKED: the tests run only against an app on this machine.`
15. Check your own skills, rules, and habits against the list below.

The hook now denies these. It allowed them before.

- `cd` into any folder but the project root, and a command that starts in another folder. Pass paths from the root, such as `test/unit/x.test.ts`.
- A test run that names no path: `npx vitest run` and `npx playwright test`. Give a path under `test/`, or use `npm run test:unit` and `npm run test:e2e` for the whole suite. `npx vitest` without `run`, `vitest list`, and `vitest related` are denied too.
- Runner options that wait for a person or hide a failure. For Vitest: `--watch`, `--ui`, `-u`, and `--update`. For Playwright: `--ui`, `--headed`, `--debug` in any form but `--debug=cli`, `--retries`, `--timeout`, `-u`, `--update-snapshots`, and `--repeat-each` above 5. The same options are denied after `npm run test:e2e --`.
- Runner options that remove or weaken the verdict line. On `vitest run`: `--reporter`, `--passWithNoTests`, and `--allowOnly`. On `playwright test`: `--reporter`. Use `--add-reporter` to add a Playwright reporter. The four `npm run test:*` scripts are not affected.
- Writing file content under `test/` from the shell: a redirect, `tee`, `sed -i`, `cp`, and a heredoc. The agent writes those files with its file edit tool. A skill of yours that copies a template with `cp` must change.
- A wildcard in the path of `rm`, `mv`, `cp`, `mkdir`, `touch`, `tee`, or `truncate`, such as `rm test/unit/*.snap`. Name each file.
- Creating a file under `test/` whose name is outside the layout: a `.tsx` or `.jsx` file, a `__tests__/` folder, a `tests/` or `specs/` folder at the top of `test/` or under `test/e2e/`, a page class that is not `test/e2e/pages/<name>-page.ts`, and a plan that is not `<name>.plan.md` in a `plan/` folder. A file that already exists can be edited whatever its name. Its content is still checked.
- A write to test code that adds `.only(`, `.skip(`, `.todo(`, `.fails(`, `test.fail(`, `skipIf(`, or `runIf(`, and under `test/e2e/` `waitForTimeout(`, `networkidle`, or `force: true` on a Playwright action such as a click. `test.fixme(` needs a `// product bug:` line above it and is allowed in specs only. Text that is already in a file may stay.
- `BASE_URL` with a host other than `localhost` or `127.0.0.1`.
- `playwright-cli detach`. A debug run ends with `resume`.
- `playwright-cli` arguments and options outside a closed list. `--filename` is denied on every command, inside `test/` too: read the output instead. A command with too few or too many arguments is denied, so a text of several words needs quotes, as in `fill e5 "Ada Lovelace"`. A session name may hold only letters, digits, `-`, and `_`. `attach` takes the name that the debug run printed and no option.
- `$$`, `$?`, `$#`, and `$!` in a `playwright-cli` command, where the shell would replace them inside the text. Put the text in single quotes.
- A search of a whole folder that holds a `.cursorignore` path: `grep -r "text" .`, `rg "text"`, and `git grep "text"`. Name the folders: `grep -rn "text" src test`.
- More ways to read a `.cursorignore` path: `cat <package-lock.json`, a wildcard that matches one, and `git show`, `git diff`, `git log`, `git blame`, or `git cat-file` of one.
- `ln`, a shell comment such as `ls # list`, and `~-`, `~+`, and `~1`.
- A `sed` script with a label or a branch (`:`, `b`, `t`, `T`), and the zsh forms `=(...)` and a glob qualifier such as `*(e:'cmd':)`.
- `git commit -F`, `git tag -F`, and `gh pr create --template` with a file outside the write scope, and every form of `git config` that writes.
- An MCP tool call that writes a file outside the write scope, and the tools `browser_run_code_unsafe`, `browser_install`, `run_on_cloud`, `list_cloud_devices`, `get_cloud_run_status`, `describe_cloud_run`, and `open_maestro_viewer`. The two `browser_` rules are for a Playwright MCP server. The kit no longer starts one, so they matter only when you add such a server yourself.
- A tool the hook does not know by name, when its input has a path and content and the path is outside the write scope.

### Added

- One skill for each job: `/qa-unit`, `/qa-plan`, `/qa-generate`, and `/qa-heal`. Each is complete on its own and is built from numbered steps, lookup tables, templates, `BLOCKED` exits that say what you must do, and a reply form that ends with `Verdict:` and `Not checked:`. They are written so that a small model has no routing decision to make ([#27](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/27)).
- `/qa-unit` with the path of a test file fixes a failing unit or integration test. `/qa-unit` and `/qa-heal` name the cause before they edit, try the smallest fix first, and stop after 3 rounds ([#28](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/28)).
- `/qa-generate` takes `page classes only` and `spec only`, so one plan can be done in two prompts.
- `/qa-heal` also takes a run that fails with a `reason:` and no failing test. It removes a `.skip` or `.only` mark, or corrects an import that does not load, and runs the spec again.
- `/qa-plan`, `/qa-generate`, and `/qa-heal` stop with `BLOCKED` when the prompt gives a base URL on another host. The hook allows only `localhost` and `127.0.0.1`, on the test command and in the browser.
- `/qa-plan` puts every scenario of its list into the plan file, the one with the mocked server error included, and counts the scenarios before it replies. The `Expect` list of every scenario names at least one text that the user sees. In the second evaluation round a small model left out both ([#27](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/27)).
- `BLOCKED` exits for the browser steps of `/qa-plan` and `/qa-generate`: `playwright-cli found no browser. Install Google Chrome, then ask again.`, `playwright-cli is not installed. Add the dev dependency @playwright/cli, then ask again.`, `the browser did not open.`, and in `/qa-generate` a page that redirects when the plan does not start on the page it redirects to.
- `/qa-unit` ignores the Vite warning that starts with `(!) Your Vite config uses features that are unsupported`, and writes a `../` path in place of an `@/` path in a test file. A `vi.mock` of an `@/` path can replace nothing.
- The examples in all seven skills come from an imaginary app with a profile form, and not from `examples/next-app`. The evaluation runs on the example app, so no skill shows the answer to a case ([#27](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/27)).
- A verdict line. Every Vitest run and every Playwright run ends with one line that starts with `QA-VERDICT:` and says `PASS`, `FAIL`, or `PASS-WITH-FIXME`. A skipped or todo test, a test that passed only on a retry, a stray `.only`, and a run with no tests are `FAIL`. With `--coverage`, a run that Vitest fails for a coverage threshold says `FAIL`. The reporters are in `.cursor/qa/`.
- `.cursor/qa/VERSION`, which holds the version of the kit, and this changelog ([#18](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/18)).
- A preview of mobile testing with Maestro: `/qa-mobile-plan`, `/qa-mobile-generate`, and `/qa-mobile-heal`, the rule file `.cursor/rules/mobile-test-conventions.mdc`, the folders `test/mobile/plan/`, `test/mobile/subflows/`, `test/mobile/elements/android/`, and `test/mobile/elements/ios/`, and a `maestro` entry in `.cursor/mcp.json`. The skills were checked with Maestro 2.10.0 on an Android emulator and a React Native sample app, by a maintainer and not by a model. Nothing was checked on iOS, on an app with a sign-in screen, or in CI, and no model has run them. [docs/mobile.md](docs/mobile.md) lists what was run and what is open ([#21](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/21), [#22](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/22), [#23](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/23), [#24](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/24)).
- The Maestro flows follow the page object model, after Maestro's [recipe](https://docs.maestro.dev/examples/recipes/implementing-the-page-object-model-pom). `/qa-mobile-generate` walks the plan on the device and writes one element file for each screen, `test/mobile/elements/android/<screen>.js` or `test/mobile/elements/ios/<screen>.js`, and a loader, `test/mobile/elements/load.yaml`. A flow holds no id: it uses a name such as `${output.profile.saveProfile}`. One flow file serves both platforms, and each platform has its own element files. A job that is told `This is Android.` never reads, creates, or edits the iOS files. `/qa-mobile-plan` writes no id into the plan, and `/qa-mobile-heal` corrects a wrong id once, in the element file. New templates: `elements.js` and `load.yaml`. On an Android emulator, scripts applied the tables of the generate skill to one feature, and a wrong id was healed by one edit in an element file. Not checked: iOS, any model, and the skill text as it is after a later review ([#22](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/22), [#23](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/23), [#24](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/24)).
- `/qa-mobile-generate` takes `element files only` and `flows only`. Its first part needs the `maestro` MCP server.
- The mobile skills were never on the `main` branch or in a tagged version, so the move to element files needs no step under "Action needed". A plan made from this branch before the move, with lines such as ``Tap "Save profile" (id `profile-save`)``, is not read by `/qa-mobile-generate`: plan the feature again.
- Known gaps of the mobile preview, listed under [Open points](docs/mobile.md#open-points): the three skills have 2,485 to 4,039 words and have not been tried on a low-tier model, the hook does not check the JavaScript in an element file or `runScript` in a flow, the texts of a system dialog are still in the flow, and no rule covers an element that has an id on one platform only.
- In the hook:
  - A message of its own for every deny, with the cause and what to do instead. Before, 14 causes shared one message.
  - Rules for the names of new files under `test/`, and for the content of every file there. A file that already exists can be edited whatever its name.
  - Checks of MCP tool calls, and a third hook event, `beforeMCPExecution`.
  - The Maestro commands `maestro --version`, `maestro check-syntax` with a flow under `test/mobile/`, and `maestro test` with `--platform`, `--device`, `--include-tags`, `--exclude-tags`, `-e KEY=VALUE`, and paths under `test/mobile/`.
  - Browsing the app with `playwright-cli`: `open` and `goto` with a URL on `http://localhost` or `http://127.0.0.1`, and commands such as `snapshot`, `find`, `generate-locator`, `click`, `fill`, `type`, `press`, `select`, `check`, `uncheck`, `hover`, and `close`. [docs/hook-rules.md](docs/hook-rules.md#playwright-cli) has the whole list. A command outside it is denied with a message that names the allowed ones. A read of a file in `.playwright-cli/` is denied with a message that names the `snapshot` command.
  - `sleep 1` to `sleep 30`, and `playwright-cli -s tw-1` with a space after `-s`.
  - The commit message form `git commit -m "$(cat <<'EOF' ... EOF)"`, when the message is plain text.
  - `git config user.name`, and `git config get` and `list`, as reads.
  - A built-in list of lockfiles, used when `.cursorignore` is missing.
  - A message for a command that still has a placeholder in it, such as `<file>` or `tw-XXXXXX`.
- `docs/hook-rules.md`: every rule of the hook, with examples that the hook's own tests run.
- Two more tests of the hook. `.cursor/hooks/test_cli_words_match_playwright_cli.py` checks the hook's list of `playwright-cli` commands and options against the installed package. `scripts/skills-and-hook.test.mjs` puts every `playwright-cli` command of the web skills to the hook.
- `examples/next-app/`, an example app with reference tests. `scripts/test-example.mjs`, which installs the kit into a copy of the example, runs the build and the tests, type-checks the tests, and in its last stage opens the app with `playwright-cli`. `--no-browse` leaves that stage out on a machine without Google Chrome ([#19](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/19)).
- `scripts/install-into.mjs`, which does the install steps for an existing app and takes `--dry-run` and `--force`. It merges `.cursor/hooks.json` and `.cursor/mcp.json` into your own files, adds `test/tsconfig.json` when your app has a `tsconfig.json`, never writes through a symbolic link, and sets the hook's executable bit again. It ends with a `WARNING:` when a skipped file leaves the hook, the verdict line, or the kit's MCP server off, and with a `NOTE:` when your app still has the Playwright MCP server of an earlier version.
- `eval/`: nine fixed test jobs on the example app, a sandbox maker, a prompt printer, and a scorer that needs no model. It is for maintainers.
  - The scorer runs the tests itself and follows the rules of the verdict line. It marks a reply that says the work passed over a failing run as `FALSE PASS`, in whatever form the reply says it.
  - `make-sandbox.mjs --clean` and `score.mjs --clean` free the space of a scored run and keep its diff, reply, and score. `make-sandbox.mjs --relink` puts `node_modules` back.
  - `make-sandbox.mjs` warns when the file system has few free inodes and stops when a sandbox does not fit. On a tmpfs such as `/tmp` one sandbox uses about 16,000.
  - `make-sandbox.mjs` warns when a skill prints the answer of a product-bug case, and a test fails for it.
  - The files that `playwright-cli` saves in a sandbox do not count as changes of the agent. The scorer prints the note `browser-open` when an agent left a browser open, and `--clean` closes it.
- Two evaluation rounds, in `eval/results/runs.jsonl` and [docs/evaluation.md](docs/evaluation.md). [eval/results/README.md](eval/results/README.md) says how they were run and what was wrong with them. Round 1, with one run for each case: the new skills passed 9 of 9 cases on a low-tier and on a mid-tier stand-in model, and the old skills 7 of 9 on the low-tier one. Two of its cases could be passed by copying the skills' own examples, which were replaced before round 2. Round 2: the mid-tier model passed 9 of 9 runs, and the low-tier model 13 of its 16 valid runs. The models ran outside Cursor and without the hook in the loop, and both rounds ran before the skills browsed with `playwright-cli` themselves ([#27](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/27), [#28](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/28)).
- A CI workflow, `.github/workflows/ci.yml`. It runs the hook tests, the reporter, script, and evaluation tests, the Markdown lint, the check of the copied `playwright-cli` skill, the type check, the config loading checks, and the example app on every pull request and on every push to `main`. It has not run on GitHub yet. It is for maintainers and is not copied into an app ([#11](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/11), [#19](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/19)).
- `npm run check:playwright-cli-skill`, for maintainers. It fails when `.cursor/skills/playwright-cli/` differs from the skill inside the installed `@playwright/cli` package. `node scripts/ci/playwright-cli-skill.mjs --write` makes the copy again after a version change.
- `THIRD_PARTY_NOTICES.md`, and the upstream license files next to the copied Vitest reference files and in the copied `playwright-cli` skill ([#15](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/15)).
- `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, two issue forms, and a pull request template ([#16](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/16)), and a Dependabot config ([#17](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/17)). None of them is copied into an app.
- In `package.json`: a description, the license, repository links, and `engines.node` set to `^22.22.2 || ^24.15.0 || >=26.0.0` ([#14](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/14)). Maintainer scripts `test:hook`, `test:reporters`, `lint:md`, and `typecheck`, with `tsconfig.json` and `.markdownlint-cli2.jsonc`. `typescript` and `markdownlint-cli2` are dev dependencies of this repository only.
- In the README: requirements ([#13](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/13)), what to do when your app already has the kit's files, the installer, things that go wrong on install, the limits of the hook ([#10](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/10)), mobile, the example app and the evaluation, the checks to run, and upgrading.
- Four documents that hold the detail the README links to: `docs/install-notes.md` (requirements, the installer, existing files, install problems, a hook that does not start, upgrading), `docs/jobs.md` (each job, the reply form, the verdict line), `docs/mobile.md`, and `docs/evaluation.md`.

### Changed

- `/qa-plan` and `/qa-generate` look at the app with `playwright-cli` shell commands, such as `npx --no-install playwright-cli open http://localhost:3000/profile`, and no longer with the Playwright MCP server. The shell commands cost fewer tokens: no MCP tool list goes into every request, and the page is printed only when the agent asks for a snapshot. The saving was not measured. Each job closes the browser when it ends, also when it stops with `BLOCKED`.
- The `playwright-cli` skill is now the manual that ships inside the `@playwright/cli` package, version 0.1.22, with its Apache-2.0 `LICENSE` file. Only the frontmatter of its `SKILL.md` differs from the package. It is a reference and not a job: nothing routes to it, and each job skill lists the commands it needs. The earlier copy had formatting edits in its text and no license file ([#15](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/15)).
- `/qa` is a router only. `.cursor/agents/qa.md` holds a table from the request to one skill file. `AGENTS.md` holds the same table, so a plain request needs no subagent.
- A prompt no longer needs `This is UI.` or `This is API.` Each skill decides from the file. Say `API` in a `/qa-plan` prompt for a plan with no mocked request.
- The test commands the agent uses are `RTK_DISABLED=1 npx vitest run test/unit/components/SignIn.test.ts` and `RTK_DISABLED=1 npx playwright test test/e2e/sign-in.spec.ts`. `--project` and `--no-passWithNoTests` are gone: the path selects the Vitest project.
- `vitest.config.ts` fails a run that collects no tests, fails a stray `.only`, resolves the import aliases in `tsconfig.json`, compiles JSX by itself, and registers the verdict reporter. `playwright.config.ts` fails a stray `test.only` on every machine, not only on CI, and registers the verdict reporter.
- The `test:unit` and `test:integration` scripts pass `--passWithNoTests`.
- Plans use fixed sentence forms and a `**Data:**` line. A plan from the old planner still works. Its lines in other forms are listed under `Not checked:`.
- Generated page classes hold fields and a `goto` method. A spec calls the fields, with one comment and one line of code for each plan step. Specs with helper methods keep working, and `/qa-heal` fixes both kinds.
- A product bug in a spec is marked with `test.fixme(` and a `// product bug:` line above it that names the application source file and line, by `/qa-heal` only. The hook denies a `test.fixme(` whose line above names no source file and line. `/qa-unit` and `/qa-generate` leave the test failing and name the source line.
- `/qa-heal` no longer edits `playwright.config.ts`.
- The agent no longer edits `vitest.config.ts` for an import alias. `/qa-unit` replies `BLOCKED` when an alias of the app is not in `tsconfig.json`.
- `.cursor/rules/test-file-conventions.mdc` is a table of where each kind of test file goes, `test/mobile/` included.
- The hook denies more. See the list under "Action needed".
- In the hook, a `.cursorignore` pattern that starts with `/` matches from the project root only. When Cursor sends no working directory, the hook checks relative paths against the project root.
- `.cursorignore` also lists `.maestro/tests/`. `.gitignore` also lists `.next/` and `.maestro/tests/`. `.playwright-cli/`, where `playwright-cli` saves page snapshots and console logs, stays in both.
- Four lines in `.cursorignore` and four in `.gitignore` start with a slash, so they match in the project root only: `/dist/`, `/build/`, `/out/`, and `/coverage/` in the first, and `/coverage/`, `/playwright-report/`, `/test-results/`, and `/blob-report/` in the second. Before, `coverage/` also matched `app/coverage/page.tsx`: git hid that file after an install, and the hook denied the agent a read of it.
- `.cursor/mcp.json` lists one server, `maestro`. It needs Maestro CLI 2.6.0 or later. The `playwright` server is gone, see "Removed".
- The three Vitest reference files that remain are byte for byte the same as upstream again.
- `package.json` is named `cursor-qa-agents`. It was `cursor-agent-testing-for-react`.
- The install steps in the README list the dev dependencies by name. Do not copy every entry of this repository's `devDependencies`.
- The full list of hook rules moved from the README to `docs/hook-rules.md`. The detail on installing, on each job, and on mobile is in `docs/install-notes.md`, `docs/jobs.md`, and `docs/mobile.md`, and the README links to it.

### Removed

- The skills `vitest-unit-integration`, `playwright-planner`, `playwright-generator`, `playwright-healer`, and `playwright-page-objects`. The `qa-` skills replace them.
- The Playwright MCP server: the `playwright` entry in `.cursor/mcp.json` and the dev dependency `@playwright/mcp`. The installer no longer adds them and never removes them from your app, see "Action needed".
- 16 of the 19 Vitest reference files.
- From `.cursor/agents/qa.md`: the UI or API rule, the tool list, the paths, the failing-test rule, and the finish format. Each skill has its own.
- `ln` and `playwright-cli detach` from the commands the hook allows.
- The "Roadmap" section of the README. "Mobile" replaces it.

### Fixed

- `next build` failed in an app that had the kit, with `'passWithNoTests' does not exist in type`, because `vitest.config.ts` set that option inside its two project blocks.
- An import through an alias from `tsconfig.json`, such as `@/lib/db`, did not resolve in Vitest. It now resolves in every file that `tsconfig.json` includes. For test files in an app that leaves out `test/`, `test/tsconfig.json` is needed.
- UI tests failed to parse in an app whose `tsconfig.json` has `"jsx": "preserve"`.
- The install steps left out `.cursorignore`. Without the file the hook stopped denying reads of lockfiles, build output, and test reports, and gave no sign of it ([#12](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/12)).
- The hook denied two writes that Cursor makes for itself: a long tool result in `~/.cursor/projects/<project>/agent-tools/`, and a Plan mode plan in `~/.cursor/plans/`.
- The hook rejected input that starts with a UTF-8 byte order mark, which Cursor on Windows sends. The kit is still not expected to work on Windows. See "Requirements" in the README.
- An error inside the hook blocked the action with no reason. It is now a deny with a message.
- `npx vitest run -t init` with a test file was taken for `vitest init` and denied.
- `truncate -s 0`, `mkdir -m 755`, `touch -d`, and `git restore -s` on a path under `test/` were denied, because the hook read the option's value as a path.
- A heredoc into `test/` was denied with a message that said the shell cannot write outside `test/`.
- An `EditNotebook` call was denied for a missing path.
- `force: true` in a `fs.rm` or `rmSync` cleanup inside a fixture under `test/e2e/` was denied with a message about locators. It is now denied only as an option of a Playwright action, such as a click.
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
- `playwright-cli attach` and the `-s` option took any text as a session name, such as `attach ../../../../tmp/zz` and `attach ws://example.com:9222/`. The tool puts the name into the path of a file it writes. A name may now hold only letters, digits, `-`, and `_`. That the hook allowed these names was run. What the tool does with a name was read in its code.
- Vitest path options written as `--r` or `--c`, or with three dashes, were not checked against the write scope.
- `sed -i` with a backup suffix that holds `/` or `*` could write a file outside the write scope.
- `ln -s` was allowed for a link under `test/` that leads outside it. `git -C ~-` was allowed, although the shell turns `~-` into the name of another folder.
- `git commit -F`, `git tag -F`, and `gh pr create --template` were allowed with a file outside the write scope, which publishes that file's content.
- A path through a symlink loop made the hook stop with an error on Python 3.12 and older, and was allowed on Python 3.13 and newer. It is denied on every version now.
- A `.cursorignore` path could still be read through an input redirect, a wildcard, a recursive search, and `git show`.
- `sed` could write a file by hiding a `w FILE` command behind a label, as in `sed -n -e ':a w src/x.ts' file`, because GNU sed ends a label at a space. Every `sed` label and branch command is denied now.
- A wildcard in the path of `rm`, `mv`, `cp`, `mkdir`, `touch`, `tee`, or `truncate`, such as `rm -rf test/*/`, was allowed, although the shell can expand it to a symbolic link under `test/` that leads outside the write scope. It is denied now.
- The zsh form `=(...)`, which runs a command, was allowed. It is denied now, with the zsh glob qualifiers that run a command. This was not run in zsh.
- `--repeat-each` could pass its limit of 5 when the option was given twice. Every value is checked now.
- The README has a "Limits" section. The hook is a guardrail and not a sandbox: it does not see what a test, a config file, or an MCP tool does once it runs.
