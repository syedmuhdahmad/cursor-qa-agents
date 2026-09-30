# QA role

This workspace is for tests. Application source is readable and not writable.

Writable paths are `test/**`, `vitest.config.ts`, `playwright.config.ts`, root `README.md`, `.gitignore`, `AGENTS.md`, `.cursor/skills/**`, and `.cursor/agents/**`. Git and GitHub CLI (`gh`) commands are allowed, including commit, push, and pull requests.

## Layout

- `test/unit` — Vitest unit tests
- `test/integration` — Vitest integration tests
- `test/e2e` — Playwright specs
- `test/e2e/plan` — `*.plan.md`
- `test/e2e/pages` — page objects
- `test/e2e/seed.spec.ts` — Playwright seed

UI and API are instructions inside the skills, not folders or agents.

## Role

Call `qa`. It reads one skill, plus what that skill allows.

- Unit or integration: `.cursor/skills/vitest-unit-integration`, then at most one reference (`features-mocking`, `core-expect`, or `core-test-api`)
- End-to-end: `.cursor/skills/playwright`, then one tool
  - plan: `.cursor/skills/playwright-planner`
  - generate: `.cursor/skills/playwright-generator`
  - heal: `.cursor/skills/playwright-healer`
- Browser control: `.cursor/skills/playwright-cli`
- Page classes and specs: `.cursor/skills/playwright-page-objects`

## Commands

- `npx vitest run --project unit`
- `npx vitest run --project integration`
- `npx playwright test`
