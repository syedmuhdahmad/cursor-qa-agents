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
3. Do not edit until you can point to the cause in the error, `error-context.md`, or a playwright-cli snapshot. A guess is not a cause. If the cause is not clear from the error, debug the one failing test with playwright-cli:
   - Start it in the background: `RTK_DISABLED=1 npx playwright test test/e2e/<name>.spec.ts:<line> --debug=cli`, where `<line>` is the line of the `test(` call. Wait until it prints `playwright-cli attach tw-abc123`.
   - Attach with `npx --no-install playwright-cli attach tw-abc123`. Every later command names the session: `npx --no-install playwright-cli -s=tw-abc123 <command>`. Without `-s=` the command fails.
   - The test is paused before its first step. Run it up to the failing step with `pause-at test/e2e/<name>.spec.ts:<line of the failing step>`.
   - `snapshot` prints the page. `find "<text>"` searches it. `generate-locator <ref>` prints the locator for an element in the snapshot.
   - Try an action with `click <ref>` or `fill <ref> <text>`. Each prints the Playwright code it ran. Copy the locator from there.
   - `resume` lets the test run to its end, and the background run then exits. To stop early, use `detach` and stop the background run.
   - The hook allows only these and a few other read-only playwright-cli commands. `screenshot`, `run-code`, and `open` are denied.
4. Before you edit a page class, list every spec that uses it: `grep -rl "<screen>-page" test/e2e`. Your change reaches all of them.
5. Fix one failure at a time, following "Smallest fix" below:
   - Locator: update the field in the page class, not the spec.
   - Timing: replace the check with a web-first assertion (`await expect(locator).toBeVisible()`). Never add `waitForTimeout` or `networkidle`.
   - Data or setup: fix the `page.route` mock (UI side) or the test's data setup (API side).
   - Product bug: mark only that test `test.fixme()`, add a comment above it with the source `file:line`, expected, and actual. Report it.
6. Rerun the spec after each fix. Require every non-fixme test to pass.
   - If the failure did not change, undo that edit before you try another. Do not stack fixes.
   - After a Timing fix, run it again with `--repeat-each=3`. All three must pass.
   - If you changed a page class, also run each other spec from step 4 once.
7. Stop after 3 fix-and-rerun rounds and report what still fails and why.

## Smallest fix

Take the first option that fully fixes the failure, then stop.

1. Does the test need to change at all? If the app is wrong, the only edit is the `test.fixme()` mark and its comment.
2. Does the page class already have a locator or method for this? Use it.
3. Does Playwright already do it (auto-waiting, a web-first assertion, `getByRole`)? Use it.
4. Otherwise change the one line that is wrong.

- Change only the lines that caused the failure. Do not rewrite, rename, reorder, or reformat anything else.
- Fix the cause once in the page class. Do not patch each spec that uses it.
- Do not add helpers, wrappers, retries, longer timeouts, or config options.
- Keep every existing assertion and mock.

## Never

- Edit application source.
- Delete a test, or use `.skip`, `.only`, or `test.fail()`.
- Weaken an assertion (`toBeTruthy()`, removed checks, regex that matches anything) to go green.
- Use `test.fixme()` for anything but a product bug you can point to in source.
- Hide a failure behind a guard: `if (await locator.isVisible())`, `try`/`catch`, `.catch(() => {})`, or a longer `timeout`.

## Finish

For each failure, six short lines:

- **Test:** title and `file:line`.
- **Class:** Locator, Timing, Data or setup, or Product bug.
- **Cause:** one sentence on what was wrong.
- **Fix:** the file and line you changed, or `test.fixme()` with the source `file:line`.
- **Before:** the error line from the first run, copied exactly.
- **After:** the summary line from the last run, copied exactly.

End with `Not checked:` and one line on what you did not run or verify, for example other browsers or specs you did not rerun.
