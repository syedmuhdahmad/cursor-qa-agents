# QA workspace

This workspace is for tests. Application source (`app/`, `src/`, and similar) is readable and never writable.

Writable: `test/**`, `vitest.config.ts`, `playwright.config.ts`, root `README.md`, `.gitignore`, `AGENTS.md`, `.cursor/skills/**`, `.cursor/agents/**`. A hook blocks every other write.

For any test work, use the `qa` role in `.cursor/agents/qa.md`. It says which single skill to read. Do not open skills on your own.

If a test fails because the product is wrong, report the bug. Do not change application source to make a test pass.

## Commands

- `npx vitest run --project unit --no-passWithNoTests <file>`
- `npx vitest run --project integration --no-passWithNoTests <file>`
- `npx playwright test <file>`
