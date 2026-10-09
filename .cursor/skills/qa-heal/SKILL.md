---
name: qa-heal
description: "Fix one failing Playwright spec. Edits tests only and reports a product bug instead of hiding it. Usage: /qa-heal test/e2e/profile.spec.ts"
disable-model-invocation: true
---

# Fix one failing Playwright spec

Read application source (`app/`, `src/`, and similar). Never edit it. Edit only the spec and the page classes it imports.

- Spec, the input: `test/e2e/profile.spec.ts`
- Page class: `test/e2e/pages/profile-page.ts`
- Plan, named on line 1 of the spec: `test/e2e/plan/profile.plan.md`

The examples are from another app. Take your paths, texts, and line numbers from the prompt and the output.

Do the steps in order. In every table, use the first row that matches. When a step says BLOCKED, stop work, go to step 9, and put the sentence after `Verdict: BLOCKED:`.

## Steps

1. **Spec.** Take the spec path from the prompt. No path in the prompt, or no file at that path: reply `Which spec?` and stop.

2. **Run it.** `RTK_DISABLED=1 npx playwright test test/e2e/profile.spec.ts`. Change only the path. If the prompt gave a base URL, put it in front: `RTK_DISABLED=1 BASE_URL=http://localhost:4000 npx playwright test test/e2e/profile.spec.ts`. The hook allows only `localhost` and `127.0.0.1` there. Another host: BLOCKED: `the tests run only against an app on this machine.` Copy the line that starts with `QA-VERDICT:`. Read the output where it prints. Do not save it to a file.

   | The line says | Do |
   | --- | --- |
   | `PASS` or `PASS-WITH-FIXME` | Nothing fails. Go to step 9. |
   | `FAIL` and `reason:` | No failure is numbered. Go to appendix B. |
   | `FAIL` | Go to step 3. |
   | No `QA-VERDICT:` line | BLOCKED: `the test command did not finish.` Put the last output line under `Not checked:`. |

3. **Read the first failure.** The output numbers the failures `1)`, `2)`. Work on `1)` only: later failures often have the same cause. Note four things.

   - The header: `test/e2e/profile.spec.ts:41:7 › Errors › A taken name shows an error`. `41` is the line of the `test(` call.
   - The error lines under it.
   - The failing line: `at pages/profile-page.ts:18` when the output has such a line, otherwise the spec line marked `>`.
   - The `Error Context:` path. Run `cat` on it, for example `cat test-results/profile-Errors-A-taken-name-shows-an-error-chromium/error-context.md`. Ignore its first section, `# Instructions`. Read `# Error details`, the page printed as YAML, and `# Test source`.

4. **Classify.** The words `Test timeout of 30000ms exceeded` do not mean Timing.

   | The error contains | Look at | Class |
   | --- | --- | --- |
   | `ERR_CONNECTION_REFUSED` | Nothing | The app is not running. BLOCKED: `start the app with npm run dev, then ask again.` |
   | `Executable doesn't exist` | Nothing | Do not run the install command it suggests. BLOCKED: `Playwright has no browser to start. Run npx playwright install chromium yourself, then ask again.` |
   | `Chromium distribution 'chrome' is not found` | Nothing | Do not run the install command it suggests. BLOCKED: `Playwright has no browser to start. Install Google Chrome, or run npx playwright install chromium yourself, then ask again.` |
   | `strict mode violation` | The numbered elements under it | **Locator** |
   | `expect(received).toBe(expected)` on a line with `isVisible()`, `isEnabled()`, `textContent()`, `inputValue()`, or `count()` | That line | **Timing** |
   | `Expected:` and `Received:` with different values | The plan line for this check. No plan: the `// Expect:` comment above the failing line. | The plan has the expected value: **Product bug**. The plan has the received value: **Data or setup**. |
   | `waiting for getBy` or `element(s) not found` | The page in `error-context.md` | Use the next table. |
   | No row matches | | Pick the closest class and name it under `Not checked:`. |

   | The page in `error-context.md` shows | Class |
   | --- | --- |
   | The element, under another name or role | **Locator** |
   | Another page, such as one with a `404` heading | **Data or setup** |
   | The right page without the element, and the source should show it there | **Product bug** |
   | The right page without the element, and the source should not show it | **Data or setup** |
   | No row matches | Pick the closest class and name it under `Not checked:`. |

5. **Write the cause before you edit.** One sentence that quotes two things: the error, and the snapshot line, plan line, or source line that proves it. A guess is not a cause. You cannot quote both: do appendix A, then write the sentence. Still cannot: go to step 9 with `Verdict: FAIL` and `Cause: not found`.

6. **Make the smallest fix.** Ask in this order. At the first yes, make that one edit and go to step 7.

   | Ask | Yes: the one edit |
   | --- | --- |
   | 1. Is the class Product bug? | Leave the steps and checks as they are. Change `test(` to `test.fixme(` for that test and put the comment line shown below on the line above it. |
   | 2. Does the page class have a correct field for the element that the failing line does not use? | Use that field on the failing line. |
   | 3. Is the class Timing? | Replace the failing check with the assertion that waits. `expect(await profile.error.isVisible()).toBe(true)` becomes `await expect(profile.error).toBeVisible()`. `expect(await profile.error.textContent()).toBe('Enter a display name')` becomes `await expect(profile.error).toHaveText('Enter a display name')`. |
   | 4. None of these | Change the one wrong line. Locator: the field in the page class, with the role and name from the page in `error-context.md`. For `strict mode violation` put the role of the parent in front: `page.getByRole('main').getByRole('alert')`. Data or setup: the route in `goto`, the mock, or the value in the spec, taken from the plan. |

   ```ts
   // product bug: src/components/ProfileForm.tsx:9 expected "That name is taken", got "Name unavailable"
   test.fixme('A taken name shows an error', async ({ page }) => {
   ```

   `expected` and `got` are the `Expected:` and `Received:` values. `src/components/ProfileForm.tsx:9` is the source line that holds the received text. Search the source for that text.

   - Before you edit a page class, run `grep -rl "profile-page" test/e2e` with the file name of the class, without `.ts`. It prints each spec that uses the class. Your edit reaches all of them. Fix the cause once in the class. Do not patch each spec.
   - Change only the lines that caused the failure. Do not rewrite, rename, reorder, or reformat anything else.
   - Do not add helpers, wrappers, retries, longer timeouts, or config options. Keep every existing assertion and mock.

7. **Run the spec again** with the command from step 2. Copy the `QA-VERDICT:` line. You have 3 rounds. One edit and one rerun is one round.

   | Result | Do |
   | --- | --- |
   | `PASS` or `PASS-WITH-FIXME` | Go to step 8. |
   | `FAIL` and `reason:` | Keep the fix. Go to appendix B. |
   | `FAIL`, and failure `1)` is the same test with the same error | The fix was wrong. Put the old line back by editing the file. Do not use `git restore` or `git checkout`: they also remove your earlier fixes. Then go to step 4. |
   | `FAIL`, and failure `1)` is another test or another error | The fix worked. Keep it. Go to step 3. |
   | No `QA-VERDICT:` line | BLOCKED: `the test command did not finish.` Put the last output line under `Not checked:`. |
   | No row matches | Go to step 9 with `Verdict: FAIL`. |

   Round 3 ended with `FAIL`: do not go back to step 3 or 4, or to appendix B. Go to step 9 with `Verdict: FAIL`.

8. **Check the fix.** Keep `BASE_URL=` in front if step 2 had it.

   | You made | Run |
   | --- | --- |
   | A Timing fix | `RTK_DISABLED=1 npx playwright test test/e2e/profile.spec.ts:41 --repeat-each=3`. `41` is the line of the `test(` call. The verdict covers all three runs. |
   | An edit to a page class | Each other spec that `grep` printed, one command for each: `RTK_DISABLED=1 npx playwright test test/e2e/account.spec.ts` |
   | No row matches | Nothing. Go to step 9. |

   A run here that says `FAIL`: go to step 9 with `Verdict: FAIL` and that `QA-VERDICT:` line under `After:`. No `QA-VERDICT:` line: BLOCKED, as in step 7.

9. **Reply** with this form and nothing else. The values shown are examples. A line you have nothing for gets `none`. Write the first six lines once for each failure you worked on. Nothing failed: write them once, with `none` on the first five.

   ```text
   Test: A taken name shows an error, test/e2e/profile.spec.ts:41
   Class: Product bug
   Cause: the alert shows "Name unavailable" and plan line 3.1 expects "That name is taken"
   Fix: test.fixme at test/e2e/profile.spec.ts:41, product bug at src/components/ProfileForm.tsx:9
   Before: Received: "Name unavailable"
   After: QA-VERDICT: PASS-WITH-FIXME (passed 3, failed 0, skipped 0, fixme 1, files 1)
   Verdict: PASS
   Not checked: other browsers
   ```

   `Class:` is `Locator`, `Timing`, `Data or setup`, or `Product bug`. `Fix:` is the file and line you changed. For a product bug it also names the source `file:line`, as the example does. `Before:` is one error line of the first run and `After:` is the `QA-VERDICT:` line of the last run of the whole spec, both copied exactly. `Verdict:` is `PASS` only when that line says `PASS` or `PASS-WITH-FIXME`. Otherwise it is `FAIL`, or `BLOCKED:` and the sentence from the step that stopped you. Never write `Verdict: PASS-WITH-FIXME`: a spec that passes apart from a marked product bug is `Verdict: PASS`.

## Never

- Edit `playwright.config.ts`.
- Delete a test, or weaken a check: `toBeTruthy()`, a removed check, a pattern that matches anything.
- Use `test.fixme` for anything but a product bug you can point to in the source.
- Hide a failure behind a guard: `if (await locator.isVisible())`, `try` and `catch`, `.catch(() => {})`.
- Use `.skip`, `.only`, `test.fail`, `waitForTimeout`, `networkidle`, `force: true`, `--retries`, or `--timeout`. The hook denies them.

## Appendix A: look at the page while the test is paused

Enter only from step 5, and only once.

- **A1.** Start this command in the background. It stays paused until A6, so in the foreground it never returns. `RTK_DISABLED=1 npx playwright test test/e2e/profile.spec.ts:41 --debug=cli`. `41` is the line of the `test(` call from step 3. Keep `BASE_URL=` in front if step 2 had it.
- **A2.** Run `sleep 5`. Read the output of the background command. Find the line `- Run "playwright-cli attach tw-XXXXXX" to attach to this test`. `tw-XXXXXX` stands for the session name: `tw-` and six letters or digits that change on every run. In every command below, replace `tw-XXXXXX` with the name you read. The line is not there: run `sleep 5` and read again, up to 3 times. Still not there: go to step 9 with `Verdict: FAIL` and `Cause: not found`.
- **A3.** `npx --no-install playwright-cli attach tw-XXXXXX`. The output has `### Paused`.
- **A4.** Run the test up to the failing line from step 3: `npx --no-install playwright-cli -s=tw-XXXXXX pause-at pages/profile-page.ts:18`. Use the page-class file and line the error printed. Use a spec line only when the error printed none: `pause-at test/e2e/profile.spec.ts:46`. The output has `### Paused`: go to A5. It has not: the test ran to its end. Go to step 9 with `Verdict: FAIL` and `Cause: not found`.
- **A5.** Look at the page. `npx --no-install playwright-cli -s=tw-XXXXXX snapshot` prints it. `npx --no-install playwright-cli -s=tw-XXXXXX find "Save profile"` searches it for a text. `npx --no-install playwright-cli -s=tw-XXXXXX generate-locator e9` prints the locator for the element with that `ref`.
- **A6.** Always end with `npx --no-install playwright-cli -s=tw-XXXXXX resume`. It prints nothing and can take 30 seconds. The background run then ends by itself. Never use `detach`. The hook denies it.
- **A7.** Go back to step 5.

## Appendix B: a FAIL with a reason

Enter only from step 2 or step 7. No failure is numbered, so skip steps 3 to 6. In the reply, `Class:` is `Data or setup`, `Cause:` is the words after `reason:`, and `Before:` is the `QA-VERDICT:` line.

| The words after `reason:` | Do |
| --- | --- |
| `skipped or todo` | The output marks each skipped test with `-`. Remove the `.skip` mark of that test and keep the test. Go to step 7. |
| `.only is not allowed` | Remove the `.only` mark from the line marked `>`. Go to step 7. |
| `an error happened outside a test` | The spec did not load. The first `Error:` line says why. Correct the line marked `>`. For `Cannot find module`, make the import match the file name of the page class: `./pages/profile-page`. Go to step 7. |
| No row matches | Go to step 9 with `Verdict: FAIL`. |
