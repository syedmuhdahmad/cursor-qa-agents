# Contributing

This repository is a kit that people copy into their own app. It has two kinds of readers:

- People read `README.md`, `docs/`, and this file.
- Models read `AGENTS.md` and the skills under `.cursor/skills/`. The skills are written for small and mid-size models, which follow the text literally.

For a security problem, follow [SECURITY.md](SECURITY.md) and do not open a public issue. Everyone who takes part follows the [code of conduct](CODE_OF_CONDUCT.md).

## Set up

You need:

- Node in the range that `engines` in `package.json` gives: `^22.22.2 || ^24.15.0 || >=26.0.0`.
- Python 3.9 or later, started as `python3`. The hook and its tests use it.
- `git`. Two tests of the evaluation scripts make a small repository in the temporary folder.

```bash
git clone https://github.com/syedmuhdahmad/cursor-qa-agents.git
cd cursor-qa-agents
npm ci
```

## Checks

Run all ten from the repository root, after `npm ci`, before you open a pull request.

| Command | What it checks |
| --- | --- |
| `npm run test:hook` | The unit tests of the hook in `.cursor/hooks/`. This takes about three minutes. |
| `npm run test:reporters` | The tests of the two verdict reporters in `.cursor/qa/`. |
| `node --test "scripts/*.test.mjs"` | The tests of the installer, `scripts/install-into.mjs`. They also read the two marked blocks in `README.md`. |
| `node --test "eval/*.test.mjs"` | The tests of the evaluation scripts in `eval/`, and that every case still fits `examples/next-app` and the skills. |
| `npm run lint:md` | Markdown lint over the `.md` and `.mdc` files. The settings and the skipped folders are in `.markdownlint-cli2.jsonc`. |
| `npm run check:playwright-cli-skill` | That `.cursor/skills/playwright-cli/` is still the skill inside the installed `@playwright/cli` package. See [The copied playwright-cli skill](#the-copied-playwright-cli-skill). |
| `npm run typecheck` | The types in `vitest.config.ts`, `playwright.config.ts`, and the files under `test/`. The settings are in `tsconfig.json`. |
| `npx vitest run --passWithNoTests` | That `vitest.config.ts` loads. This repository has no unit or integration tests of its own, so the last line is `QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: no tests ran` and the exit code is 0. That is the expected result. |
| `npx playwright test --list` | That `playwright.config.ts` loads. It prints `Total: 1 test in 1 file` and needs no browser. |
| `node scripts/test-example.mjs` | The whole kit, the way a new user sets it up. See below. |

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the same ten commands on every pull request and on every push to `main`. [Checks and CI](README.md#checks-and-ci) in the README says on which systems and versions, and what has run so far. When you add a check to the workflow, add it to this table, to the pull request template, and to that section of the README.

`node scripts/test-example.mjs` copies `examples/next-app` to a temporary folder and installs the kit into the copy with `scripts/install-into.mjs`. Then it runs `npm install`, downloads Chromium, builds the app, and runs the unit, integration, and end-to-end tests there. It also runs two throwaway tests that use the `@/` import alias, and type-checks the tests with `npx tsc --noEmit -p test`. It stops at the first failure. It needs a network connection. It takes about a minute when npm's cache and Chromium are already on the machine, and longer the first time. It uses port 3000. Pass `--port 3210` when port 3000 is busy, and `--keep` to keep the temporary folder.

## What must stay in step

One fact is often written in more than one file. Change every copy in the same pull request.

| When you change | Also change |
| --- | --- |
| The write scope (`ALLOWED_FILES`, `ALLOWED_DIRS`, and `WRITE_SCOPE` in `.cursor/hooks/guard-test-writes.py`) | `AGENTS.md`, `README.md`, and `docs/hook-rules.md` |
| A command the hook allows or denies | The hook's tests, `docs/hook-rules.md`, and every skill that teaches that command |
| The list of skills | The tables in `AGENTS.md` and `.cursor/agents/qa.md`. The two tables are the same, line for line. |
| An install step, or what the installer does with a file the app already has | "Add it to your app" in `README.md`, and `docs/install-notes.md` |
| A file or folder that users must copy | The block after `<!-- install:copy -->` in `README.md` |
| A dev dependency that users need | `package.json`, and the block after `<!-- install:dev-dependencies -->` in `README.md` |
| The version of `@playwright/cli` | The copy in `.cursor/skills/playwright-cli/`, and the version in `THIRD_PARTY_NOTICES.md`. See [The copied playwright-cli skill](#the-copied-playwright-cli-skill). |
| The Node range | `engines` in `package.json`, and the requirements in `README.md` |
| Something a user must do after an upgrade | `CHANGELOG.md`, under `Unreleased` |
| A skill's reply form, the example app, or a reference test | The cases in `eval/cases/`. `node --test "eval/*.test.mjs"` names the case that no longer fits. |
| The prompt a skill takes, a reply form, or the verdict line | "Start a job" in `README.md`, and `docs/jobs.md` |
| A mobile skill, or what was run on a device | `docs/mobile.md` |

Five things to know about these files:

- `scripts/install-into.mjs` reads the two marked blocks in `README.md`. A path or a package that is missing from a block is missing from every install.
- `typescript` and `markdownlint-cli2` are tools for this repository only. Keep them out of the README block, so they do not reach users' apps.
- The installer adds every line of `.gitignore` that the user's `.gitignore` lacks, and users copy `.cursorignore` as it is. Put a path in those two files only when it belongs in a user's app.
- In those two files, start a folder name with a slash when an app could have a folder of that name in its source, such as `/coverage/` or `/build/`. Without the slash the line also matches `app/coverage/`. Then git hides the user's own files, and the hook denies the agent a read of application source.
- `README.md` holds what a new user needs, in about 3,000 words. Detail goes into a file under `docs/`, with a short paragraph and a link in the README. The two marked blocks stay in `README.md`.

## Skills

Each job has one skill. The user starts it by name.

```text
.cursor/skills/qa-unit/SKILL.md
.cursor/skills/qa-unit/templates/
```

- The folder name starts with `qa-` and equals `name` in the frontmatter.
- The frontmatter has three keys: `name`, `description`, and `disable-model-invocation: true`. `description` is what a person sees in the `/` menu. It says what the skill does and shows the usage, for example `Write or fix one Vitest unit or integration test. Usage: /qa-unit src/components/ProfileForm.tsx`.
- `SKILL.md` is complete on its own: the paths, the rule never to edit application source, the commands, and the reply form. It never tells the model to read another skill.
- Files the model copies from sit in `templates/` inside the skill folder.

One folder under `.cursor/skills/` is not a job, and these rules do not apply to it: `.cursor/skills/playwright-cli/` is a copy of another project's manual. See [The copied playwright-cli skill](#the-copied-playwright-cli-skill).

Rules for the text of a skill:

1. Use numbered steps, one action each, in the order they are done. Keep to about ten. End each step with what to look at or do next.
2. Use a table for every decision. End every table with a "No row matches" row that says what to do.
3. Write literal strings. A command has a real example path, such as `test/unit/components/ProfileForm.test.ts`, and never a placeholder in angle brackets. A word to replace in a template is in CAPITALS.
4. Put a prohibition in the step where the model is tempted. The closing "Never" list has five lines at most.
5. Put optional depth in a lettered section at the end. Only a step that names the section sends the model there.
6. A rule that is not obvious may have one line under it that starts with `Why:`.
7. Write limits as numbers: 2 to 6 tests, 3 fix rounds.
8. Describe actions, such as "read the file", and not tool names. Shell commands and the tools of the Maestro MCP server, such as `inspect_screen`, are the exceptions.
9. Word the same fact the same way in every file.
10. Keep `RTK_DISABLED=1` in front of every test command.
11. End the skill with a reply form to fill in. It has a `Verdict:` line with a closed set of words (`PASS`, `FAIL`, `BLOCKED`, and `DONE` for a job that runs no test: a plan, and `/qa-generate` with `page classes only`), and its last line is `Not checked:`.
12. Take every example from the imaginary app that the skills already use: a "Save profile" form at `/profile`, `src/components/ProfileForm.tsx`, and `test/mobile/profile/`. Never take a path, a text, or a line number from `examples/next-app`. The evaluation runs on that app, so an example from it gives a model the answer to a case. `node --test "eval/*.test.mjs"` fails when a skill prints the answer of a product-bug case.

After you change a skill, run the evaluation. See [The evaluation](#the-evaluation).

### Copied reference files

`.cursor/skills/qa-unit/references/` holds three Vitest reference files that are copied from another project, with that project's license files next to them.

- Do not edit them. They are kept byte for byte, so that they stay unmodified copies.
- Markdown lint skips the folder for the same reason.
- When Vitest moves to a new major version, refresh the three files from upstream. The steps are in `GENERATION.md` in that folder. Then update [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

### The copied playwright-cli skill

`.cursor/skills/playwright-cli/` is a copy of the skill that ships inside the `@playwright/cli` package, in `node_modules/@playwright/cli/skills/playwright-cli/`. It is the manual of the `playwright-cli` commands. It is not a job, so the tables in `AGENTS.md` and `.cursor/agents/qa.md` have no row for it.

- Only the frontmatter of `SKILL.md` is written here. The text after the frontmatter, the files in `references/`, and `LICENSE` are the package's, byte for byte. Do not edit them, and do not let an editor or a tool reformat them. Markdown lint skips the folder.
- `npm run check:playwright-cli-skill` compares the folder with the installed package. It fails when a file differs, is missing, or is not in the package. It also fails when `version` in the frontmatter is not the installed version.
- Nothing else keeps the copy current. The package's own `playwright-cli install --skills` writes to `.claude/skills/` or `.agents/skills/`, and its warning about an old skill looks only there.

When `@playwright/cli` moves to a new version, do this in the same pull request:

1. Run `npm ci`, so that `node_modules/` holds the new version.
2. Copy the skill again:

   ```bash
   node scripts/ci/playwright-cli-skill.mjs --write
   ```

   It deletes the folder and copies the skill and `LICENSE` from the package. It keeps the frontmatter of `SKILL.md` and puts the new version number into it.
3. Run `npm run check:playwright-cli-skill`. It must pass.
4. In [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), change the version in the entry for this folder, in the text and in the link. If the copyright line in the new `LICENSE` changed, change it there and in the frontmatter of `SKILL.md`.
5. Run `npx --no-install playwright-cli --help`. Every `playwright-cli` command that a skill names must still be in the list. Then check that the hook still allows each one. See [The hook](#the-hook).

## The hook

`.cursor/hooks/guard-test-writes.py` decides whether a file edit, a shell command, or an MCP tool call may run. Its rules are listed in `docs/hook-rules.md`.

- The hook denies by default. A new rule allows one more thing.
- Every new rule has a test that it allows what it should and a test that it denies what it should, in `.cursor/hooks/test_guard_test_writes.py`.
- Every deny message says what to do instead. `user_message` and `agent_message` hold the same text.
- Use only the Python standard library, and nothing newer than Python 3.9.

To try one command, pipe a payload into the hook:

```bash
echo '{"hook_event_name":"beforeShellExecution","command":"cat package-lock.json","cwd":"'"$PWD"'"}' | python3 .cursor/hooks/guard-test-writes.py
```

It prints `{"permission": "deny", ...}` with the message, or `{"permission": "allow"}`.

## The verdict reporters

`.cursor/qa/vitest-verdict.mjs` and `.cursor/qa/playwright-verdict.mjs` print the last line of every test run. The skills take the result of a run from that line, so its form is fixed:

```text
QA-VERDICT: PASS (passed 3, failed 0, skipped 0, files 1)
```

- The line starts with `QA-VERDICT:`, then one of `PASS`, `FAIL`, or `PASS-WITH-FIXME`.
- The reporters are plain JavaScript modules with no dependencies and no TypeScript. They sit outside the agent's write scope.

## The evaluation

`eval/` holds the evaluation of the skills: the cases, a script that makes a sandbox app, a scorer that gives the same score for the same output, and a results file. The steps are in [eval/README.md](eval/README.md).

Run it after you change a text that a model reads: a skill, `AGENTS.md`, `.cursor/agents/qa.md`, or a deny message of the hook. The scripts start no model. You build one sandbox for each case, run your agent in it, and score what it left:

```bash
node eval/make-sandbox.mjs --list
node eval/make-sandbox.mjs --case unit-ui --out ~/qa-eval-runs/run-01
node eval/prompt.mjs ~/qa-eval-runs/run-01
node eval/score.mjs ~/qa-eval-runs/run-01 --reply ~/qa-eval-runs/run-01/reply.txt --clean
```

Keep the run folders on a disk and not in `/tmp`: on a tmpfs one sandbox uses about 16,000 inodes. Compare the new scores with the recorded ones. `node eval/report.mjs eval/results/runs.jsonl` prints them as a table, and [docs/evaluation.md](docs/evaluation.md) says how each recorded round was run.

Before you trust a change to `eval/` itself, run `node --test "eval/*.test.mjs"` and `node eval/self-test.mjs --out ~/qa-eval-runs/self-test`. The self-test scores the reference tests and a list of wrong solutions, and each wrong solution must fail the checks named for it. It starts two app servers, on ports 3424 and 3425. A run with `--kit-ref origin/main` took 5 minutes 30 seconds here.

## Writing style

This applies to documents, skills, comments, and commit messages.

- Short sentences in plain English.
- No marketing words, no em dashes, no emoji.
- Headings in sentence case.
- Write only what you checked. If you could not run something, say so.

## Commits and pull requests

- Branch from `main` and open a pull request. The template has the checklist.
- A commit message is one full sentence that says what changed and why, with a period at the end. Add the issue number when there is one. An example from this repository: `Give the healer a smallest-fix ladder, an evidence-before-edit rule, and a fixed report so a small model changes only the failing line (#28).`

## Release

The version of the kit is the one line in `.cursor/qa/VERSION`. Users copy that file with `.cursor/`, so it tells them which version they have.

1. Pick the new version, for example `0.2.0`.
2. Write it into `.cursor/qa/VERSION`.
3. In `CHANGELOG.md`, move the entries under `Unreleased` to a new heading with the version and the date. Leave the `Unreleased` heading in place, with nothing under it.
4. Run the ten checks. Open a pull request with these two changes and merge it.
5. Tag the merge commit on `main` and push the tag:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

6. Publish a GitHub release for the tag. Save the new section of `CHANGELOG.md` in a file outside the repository, for example `/tmp/notes.md`, and use it as the notes:

   ```bash
   gh release create v0.2.0 --verify-tag --title v0.2.0 --notes-file /tmp/notes.md
   ```

The tag is `v` followed by the content of `.cursor/qa/VERSION`.
