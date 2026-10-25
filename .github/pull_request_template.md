<!-- markdownlint-disable-file MD041 -->
<!-- Say what changed and why, in one or two full sentences. Then go through the two lists. -->

## Checks

Run each command from the repository root, after `npm ci`. Tick it when it passes. CI runs the same thirteen. `CONTRIBUTING.md` says what each one checks.

- [ ] `npm run test:hook` (about three minutes)
- [ ] `npm run test:reporters`
- [ ] `node --test "scripts/*.test.mjs"`
- [ ] `node --test "eval/*.test.mjs"`
- [ ] `npm run lint:md`
- [ ] `npm run check:playwright-cli-skill`
- [ ] `npm run check:security-audit-skill`
- [ ] `npm run test:audit-skill`
- [ ] `npm run typecheck`
- [ ] `npx vitest run --passWithNoTests` (exit code 0, and the last line says `no tests ran`)
- [ ] `npx playwright test --list`
- [ ] `node scripts/test-example.mjs`
- [ ] `node scripts/test-rn-example.mjs`

## Kept in step

Tick a line when it is done. Leave a line unticked and write "does not apply" after it when the change does not touch that area.

- [ ] The write scope or an allowed command changed: `AGENTS.md`, `README.md`, `docs/hook-rules.md`, and `WRITE_SCOPE` in `.cursor/hooks/guard-test-writes.py` say the same thing.
- [ ] A hook rule changed: it has an allow test and a deny test, and its deny message says what to do instead.
- [ ] A skill was added, renamed, or removed: the tables in `AGENTS.md` and `.cursor/agents/qa.md` are the same, line for line.
- [ ] A user has to do something after this change: `CHANGELOG.md` says what, under `Unreleased`.
- [ ] A text that a model reads changed (a skill, `AGENTS.md`, `.cursor/agents/qa.md`, or a deny message of the hook): the evaluation was run as `eval/README.md` says, and this pull request gives the scores.
- [ ] An install step changed: "Add it to your app" in `README.md` and `docs/install-notes.md` say the same thing.
- [ ] `vitest` moved to a new major version: `.cursor/skills/qa-unit/references/` is refreshed as the `GENERATION.md` in that folder says, and `THIRD_PARTY_NOTICES.md` names the new commit.
- [ ] The copied security audit skill was taken again: `node scripts/ci/security-audit-skill.mjs --write main` wrote the copy and the manifest, `THIRD_PARTY_NOTICES.md` names the new commit, and the hook still allows every command and path the new text asks for.
- [ ] A React Native dev dependency changed: the block after `<!-- install:react-native-dev-dependencies -->` in `README.md` and `examples/expo-app/package.json` agree.
- [ ] `@playwright/cli` changed version: `.cursor/skills/playwright-cli/` was copied again with `node scripts/ci/playwright-cli-skill.mjs --write`, and `THIRD_PARTY_NOTICES.md` names the new version. Every `playwright-cli` command that a skill names is still in `npx --no-install playwright-cli --help`, and the hook still allows it.
