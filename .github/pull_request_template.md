<!-- markdownlint-disable-file MD041 -->
<!-- Say what changed and why, in one or two full sentences. Then go through the two lists. -->

## Checks

Run each command from the repository root. Tick it when it passes.

- [ ] `npm run test:hook`
- [ ] `npm run test:reporters`
- [ ] `npm run lint:md`
- [ ] `npm run typecheck`
- [ ] `node --test "scripts/*.test.mjs"`
- [ ] `node scripts/test-example.mjs`

## Kept in step

Tick a line when it is done. Leave a line unticked and write "does not apply" after it when the change does not touch that area.

- [ ] The write scope or an allowed command changed: `AGENTS.md`, `README.md`, `docs/hook-rules.md`, and `WRITE_SCOPE` in `.cursor/hooks/guard-test-writes.py` say the same thing.
- [ ] A hook rule changed: it has an allow test and a deny test, and its deny message says what to do instead.
- [ ] A skill was added, renamed, or removed: the tables in `AGENTS.md` and `.cursor/agents/qa.md` are the same, line for line.
- [ ] A user has to do something after this change: `CHANGELOG.md` says what, under `Unreleased`.
- [ ] `vitest` moved to a new major version: `.cursor/skills/qa-unit/references/` is refreshed as the `GENERATION.md` in that folder says, and `THIRD_PARTY_NOTICES.md` names the new commit.
- [ ] `@playwright/cli` or `@playwright/mcp` changed version: the `playwright-cli` commands that `qa-heal` names and the `browser_*` tools that `qa-plan` and `qa-generate` name still exist, and the hook still allows them. This repository no longer keeps a copy of the `playwright-cli` skill, so there is no folder to refresh.
