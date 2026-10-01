---
name: playwright-healer
description: Repairs one failing Playwright spec under test/e2e using the test runner and playwright-cli. Read only when the QA role is asked to fix a failing spec. Edits tests only, never application source.
disable-model-invocation: true
---

# Fix a failing spec

Input is one spec, `test/e2e/<name>.spec.ts`. If the prompt names none, ask which one. Do not run the whole suite to find it.

You may change only files under `test/e2e/`, and `playwright.config.ts` when the failure is configuration (for example a wrong `baseURL`).

## Steps

1. Run the spec: `RTK_DISABLED=1 npx playwright test test/e2e/<name>.spec.ts`. Note each failing test's title, `file:line`, and error. For each failure Playwright prints an `error-context.md` path under `test-results/`. Read it first; it holds the page snapshot at the moment of failure.
2. Classify each failure from the error and the page class:
   - **Locator**: element not found, strict-mode violation, wrong role or name.
   - **Timing**: assertion timed out while the element appears later.
   - **Data or setup**: missing mock, missing seed data, wrong route.
   - **Product bug**: the app does something the plan or source says it must not.
3. If the cause is not clear from the error, debug the one failing test with playwright-cli:
   - Start it in the background: `RTK_DISABLED=1 npx playwright test test/e2e/<name>.spec.ts:<line> --debug=cli`. Wait until it prints the debugging instructions with a session name such as `tw-abc123`.
   - `npx --no-install playwright-cli attach tw-abc123`, then `npx --no-install playwright-cli snapshot` to see the page.
   - Act with `click`, `fill`, or `find "<text>"`. Each command prints the Playwright code it ran. Copy the locator from there.
   - `npx --no-install playwright-cli detach`, then stop the background test run.
4. Fix one failure at a time:
   - Locator: update the field in the page class, not the spec.
   - Timing: replace the check with a web-first assertion (`await expect(locator).toBeVisible()`). Never add `waitForTimeout` or `networkidle`.
   - Data or setup: fix the `page.route` mock (UI side) or the test's data setup (API side).
   - Product bug: mark only that test `test.fixme()`, add a comment above it with the source `file:line`, expected, and actual. Report it.
5. Rerun the spec after each fix. Require every non-fixme test to pass.
6. Stop after 3 fix-and-rerun rounds and report what still fails and why.

## Never

- Edit application source.
- Delete a test, or use `.skip`, `.only`, or `test.fail()`.
- Weaken an assertion (`toBeTruthy()`, removed checks, regex that matches anything) to go green.
- Use `test.fixme()` for anything but a product bug you can point to in source.

Finish with each failure, its class, the fix, and the final summary line.
