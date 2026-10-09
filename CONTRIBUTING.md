# Contributing

This repository is a kit that people copy into their own app. It has two kinds of readers:

- People read `README.md`, `docs/`, and this file.
- Models read `AGENTS.md` and the skills under `.cursor/skills/`. The skills are written for small and mid-size models, which follow the text literally.

For a security problem, follow [SECURITY.md](SECURITY.md) and do not open a public issue. Everyone who takes part follows the [code of conduct](CODE_OF_CONDUCT.md).

## Set up

You need:

- Node in the range that `engines` in `package.json` gives: `^22.22.2 || ^24.15.0 || >=26.0.0`.
- Python 3, started as `python3`. The hook and its tests use it.

```bash
git clone https://github.com/syedmuhdahmad/cursor-qa-agents.git
cd cursor-qa-agents
npm ci
```

## Checks

Run all six from the repository root before you open a pull request.

| Command | What it checks |
| --- | --- |
| `npm run test:hook` | The unit tests of the hook in `.cursor/hooks/`. This takes about a minute. |
| `npm run test:reporters` | The tests of the two verdict reporters in `.cursor/qa/`. |
| `npm run lint:md` | Markdown lint over the `.md` and `.mdc` files. The settings and the skipped folders are in `.markdownlint-cli2.jsonc`. |
| `npm run typecheck` | The types in `vitest.config.ts`, `playwright.config.ts`, and the files under `test/`. The settings are in `tsconfig.json`. |
| `node --test "scripts/*.test.mjs"` | The tests of the installer, `scripts/install-into.mjs`. |
| `node scripts/test-example.mjs` | The whole kit, the way a new user sets it up. See below. |

`node scripts/test-example.mjs` copies `examples/next-app` to a temporary folder and installs the kit into the copy with `scripts/install-into.mjs`. Then it runs `npm install`, downloads Chromium, builds the app, and runs the unit, integration, and end-to-end tests there. It needs a network connection. It takes about a minute when npm's cache and Chromium are already on the machine, and longer the first time. It uses port 3000. Pass `--port 3210` when port 3000 is busy, and `--keep` to keep the temporary folder.

## What must stay in step

One fact is often written in more than one file. Change every copy in the same pull request.

| When you change | Also change |
| --- | --- |
| The write scope (`ALLOWED_FILES`, `ALLOWED_DIRS`, and `WRITE_SCOPE` in `.cursor/hooks/guard-test-writes.py`) | `AGENTS.md`, `README.md`, and `docs/hook-rules.md` |
| A command the hook allows or denies | The hook's tests, `docs/hook-rules.md`, and every skill that teaches that command |
| The list of skills | The tables in `AGENTS.md` and `.cursor/agents/qa.md`. The two tables are the same, line for line. |
| A file or folder that users must copy | The block after `<!-- install:copy -->` in `README.md` |
| A dev dependency that users need | `package.json`, and the block after `<!-- install:dev-dependencies -->` in `README.md` |
| The Node range | `engines` in `package.json`, and the requirements in `README.md` |
| Something a user must do after an upgrade | `CHANGELOG.md`, under `Unreleased` |

Three things to know about these files:

- `scripts/install-into.mjs` reads the two marked blocks in `README.md`. A path or a package that is missing from a block is missing from every install.
- `typescript` and `markdownlint-cli2` are tools for this repository only. Keep them out of the README block, so they do not reach users' apps.
- The installer adds every line of `.gitignore` that the user's `.gitignore` lacks, and users copy `.cursorignore` as it is. Put a path in those two files only when it belongs in a user's app.

## Skills

Each job has one skill. The user starts it by name.

```text
.cursor/skills/qa-unit/SKILL.md
.cursor/skills/qa-unit/templates/
```

- The folder name starts with `qa-` and equals `name` in the frontmatter.
- The frontmatter has three keys: `name`, `description`, and `disable-model-invocation: true`. `description` is what a person sees in the `/` menu. It says what the skill does and shows the usage, for example `Write or fix one Vitest unit or integration test. Usage: /qa-unit src/components/SignIn.tsx`.
- `SKILL.md` is complete on its own: the paths, the rule never to edit application source, the commands, and the reply form. It never tells the model to read another skill.
- Files the model copies from sit in `templates/` inside the skill folder.

Rules for the text of a skill:

1. Use numbered steps, one action each, in the order they are done. Keep to about ten. End each step with what to look at or do next.
2. Use a table for every decision. End every table with a "No row matches" row that says what to do.
3. Write literal strings. A command has a real example path, such as `test/unit/components/SignIn.test.ts`, and never a placeholder in angle brackets. A word to replace in a template is in CAPITALS.
4. Put a prohibition in the step where the model is tempted. The closing "Never" list has five lines at most.
5. Put optional depth in a lettered section at the end. Only a step that names the section sends the model there.
6. A rule that is not obvious may have one line under it that starts with `Why:`.
7. Write limits as numbers: 2 to 6 tests, 3 fix rounds.
8. Describe actions, such as "read the file", and not tool names. The MCP `browser_*` tools and shell commands are the exceptions.
9. Word the same fact the same way in every file.
10. Keep `RTK_DISABLED=1` in front of every test command.
11. End the skill with a reply form to fill in. It has a `Verdict:` line with a closed set of words (`PASS`, `FAIL`, `BLOCKED`, and `DONE` for a plan), and its last line is `Not checked:`.

After you change a skill, run the evaluation. See [The evaluation](#the-evaluation).

### Copied reference files

`.cursor/skills/qa-unit/references/` holds three Vitest reference files that are copied from another project, with that project's license files next to them.

- Do not edit them. They are kept byte for byte, so that they stay unmodified copies.
- Markdown lint skips the folder for the same reason.
- When Vitest moves to a new major version, refresh the three files from upstream. The steps are in `GENERATION.md` in that folder. Then update [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## The hook

`.cursor/hooks/guard-test-writes.py` decides whether a file edit or a shell command may run. Its rules are listed in `docs/hook-rules.md`.

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

`eval/` holds the evaluation of the skills: the cases, a script that makes a sandbox app, a scorer that gives the same score for the same output, and a results file.

Run it after you change a text that a model reads: a skill, `AGENTS.md`, `.cursor/agents/qa.md`, or a deny message of the hook. Compare the new scores with the results file.

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
4. Run the six checks. Open a pull request with these two changes and merge it.
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
