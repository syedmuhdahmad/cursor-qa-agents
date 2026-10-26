# Contributing

[CONTRIBUTING.md](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/CONTRIBUTING.md) is the full guide. Everyone who takes part follows the [code of conduct](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/CODE_OF_CONDUCT.md).

The kit has two kinds of readers. People read the README, `docs/`, and this wiki. Models read `AGENTS.md` and the skills under `.cursor/skills/`, and follow the text literally.

## Set up

You need Node `^22.22.2 || ^24.15.0 || >=26.0.0`, Python 3.9 or later as `python3`, and `git`.

```bash
git clone https://github.com/syedmuhdahmad/qa-agent-kit.git
cd qa-agent-kit
npm ci
```

## Check a change

Run all thirteen checks from the repository root before you open a pull request:

```bash
npm run test:hook
npm run test:reporters
node --test "scripts/*.test.mjs"
node --test "eval/*.test.mjs"
npm run lint:md
npm run check:playwright-cli-skill
npm run check:security-audit-skill
npm run test:audit-skill
npm run typecheck
npx vitest run --passWithNoTests
npx playwright test --list
node scripts/test-example.mjs
node scripts/test-rn-example.mjs
```

- `npm run test:hook` takes about three minutes.
- `npx vitest run --passWithNoTests` ends with `QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: no tests ran` and exit code 0. That is the expected result: the repository has no unit tests of its own.
- `node scripts/test-example.mjs` installs the kit into a copy of the web example app and runs its build and tests. It needs a network connection and port 3000. Pass `--no-browse` on a machine without Google Chrome.

CI runs the same commands on every pull request and on every push to `main`. A separate workflow builds the React Native example and runs its Maestro flows on an Android emulator, when a change touches the example, the mobile skills, or the hook. [Checks](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/CONTRIBUTING.md#checks) says what each command checks.

## Before you change a skill

- Each job has one skill: one `SKILL.md` of numbered steps, one action each, with a table for every decision and templates in `templates/`. It is complete on its own and never tells the model to read another skill.
- Every table ends with a "No row matches" row. Limits are numbers, such as 2 to 6 tests or 3 fix rounds.
- The reply form ends with a `Verdict:` line from a closed set and a `Not checked:` line.
- Every test command keeps `RTK_DISABLED=1` in front.
- **Take every example from the imaginary app the skills use:** a "Save profile" form at `/profile`, `src/components/ProfileForm.tsx`, `test/e2e/profile.spec.ts`, `test/mobile/profile/`, and the app id `com.example.app`. Never take a path, a text, or a line number from `examples/next-app` or `examples/expo-app`. The evaluation runs on those apps, so an example from them gives a model the answer to a case.
- Several files must stay in step with a skill: `AGENTS.md`, `.cursor/agents/qa.md`, the hook, the README, `docs/`, and the evaluation cases. See [What must stay in step](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/CONTRIBUTING.md#what-must-stay-in-step).
- After a change to a skill, `AGENTS.md`, or a deny message of the hook, run the evaluation. See [[Supported models and evaluation]].

Three folders are copies of other projects and are not edited by hand: the Vitest reference files in `.cursor/skills/qa-unit/references/`, `.cursor/skills/playwright-cli/`, and `.cursor/skills/security-audit/`. `npm run check:playwright-cli-skill` and `npm run check:security-audit-skill` check the last two against their source. CONTRIBUTING.md says how to take a newer version of each.

## Before you change the hook

- The hook denies by default. A new rule allows one more thing.
- Every new rule has an allow test and a deny test in `.cursor/hooks/test_guard_test_writes.py`, and a row in [docs/hook-rules.md](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/hook-rules.md).
- Every deny message says what to do instead.
- Use only the Python standard library, and nothing newer than Python 3.9.

To try one command:

```bash
echo '{"hook_event_name":"beforeShellExecution","command":"cat package-lock.json","cwd":"'"$PWD"'"}' | python3 .cursor/hooks/guard-test-writes.py
```

## Writing style

Plain English, short sentences, sentence-case headings, no marketing words, no em dashes, and no emoji. Write only what you checked. If you could not run something, say so. See [Writing style](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/CONTRIBUTING.md#writing-style).

## Commits, pull requests, and Jira

- Branch from `main` and open a pull request. The template has the checklist.
- A commit message is one full sentence that says what changed and why, with a period at the end. Add the issue number when there is one.
- Work on the roadmap is tracked in Jira. A branch for an item is named after its key, such as `feat/SCRUM-26-detect-stack`, and its commits and pull request title start with the key. See [docs/jira-workflow.md](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/jira-workflow.md) and [[Roadmap and open issues]].
- A change that users must act on after an upgrade goes into `CHANGELOG.md`, under `Unreleased`.

## The wiki

The wiki is a repository of its own. Update a page here when a change in the main repository makes it out of date. When the wiki and the repository differ, the repository wins.

## Releases

Versions follow Semantic Versioning. While the version is below 1.0, a minor version may need action from users.

1. Write the new version into `.cursor/qa/VERSION`.
2. In `CHANGELOG.md`, move the entries under `Unreleased` to a heading with the version and the date.
3. Run the checks, open a pull request, and merge it.
4. Tag the merge commit and push the tag. The tag is `v` followed by the content of `.cursor/qa/VERSION`:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

5. Publish a GitHub release for the tag, with the new changelog section as its notes.

See [Release](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/CONTRIBUTING.md#release).

## Report a vulnerability

Do not open a public issue for a way around the hook. Follow the [security policy](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/SECURITY.md).
