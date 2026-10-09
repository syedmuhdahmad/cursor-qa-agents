---
name: qa-generate
description: "Turn one end-to-end plan into page classes and a Playwright spec, then run the spec. Usage: /qa-generate test/e2e/plan/profile.plan.md"
disable-model-invocation: true
---

# Turn one plan into page classes and a spec

Part 1 writes the page classes while you walk the plan in the browser. Part 2 writes the spec with no browser and runs it.

Read application source (`app/`, `src/`, and similar). Never edit it.

- Plan, the input: `test/e2e/plan/profile.plan.md`
- Page class, one for each screen: `test/e2e/pages/profile-page.ts`. A page class holds one field for each element and one `goto` method, nothing else.
- Spec, named after the plan: `test/e2e/profile.spec.ts`
- Templates: `.cursor/skills/qa-generate/templates/page-class.ts` and `spec.ts` in the same folder

The examples are from another app. Take your routes, names, and texts from the plan and the browser.

Do the steps in order. In every table, use the first row that matches. When a step says BLOCKED, stop work, go to step 9, and put the sentence after `Verdict: BLOCKED:`.

## Plan line to code

Steps 5 and 6 use this table. `profile` and `account` are page objects. Name each field after its element.

| Plan line | Field in the page class | Code in the spec |
| --- | --- | --- |
| ``Go to `/profile`.`` | None. The class has `goto`. | `await profile.goto()` |
| ``Fill the "Display name" textbox with `Grace Hopper`.`` | `displayName`, locator from the command output | `await profile.displayName.fill('Grace Hopper')` |
| ``Click the "Save profile" button.`` | `save`, locator from the command output | `await profile.save.click()` |
| ``Mock `PUT **/api/profile` to answer with status 500 and the JSON body `{ "error": "Internal Server Error" }`.`` | None | `await page.route('**/api/profile', (route) => route.fulfill({ status: 500, json: { error: 'Internal Server Error' } }))` |
| ``The alert shows "Enter a display name".`` | `error = page.getByRole('main').getByRole('alert')` | `await expect(profile.error).toHaveText('Enter a display name')` |
| ``The "Account" heading is visible.`` | `heading = page.getByRole('heading', { name: 'Account' })` | `await expect(account.heading).toBeVisible()` |
| ``The text "Saved as Grace Hopper" is visible.`` | `savedAs = page.getByText('Saved as Grace Hopper')` | `await expect(account.savedAs).toBeVisible()` |
| ``The "Save profile" button is enabled.`` | The button's field | `await expect(profile.save).toBeEnabled()` |
| ``The URL is `/account`.`` | None | `await expect(page).toHaveURL('/account')` |
| No row matches | A field for each element the line names | The closest row's code. Name the line under `Not checked:`. |

Why: Next.js adds its own `alert` to every page, outside `main`, so `page.getByRole('alert')` alone matches both and fails with `strict mode violation`. If the snapshot shows the alert under another parent, such as `dialog`, use that role.

## Steps

1. **Plan.** Take the plan path from the prompt and read the plan. No path in the prompt, or no file at that path: run `ls test/e2e/plan`, reply with the names and `Which plan?`, and stop.

2. **Part.** Part 1 is steps 3 to 5. Part 2 is steps 6 to 8.

   | The prompt says | Do |
   | --- | --- |
   | `page classes only` | Part 1, then step 9 |
   | `spec only` | Part 2 |
   | No row matches | Part 1, then Part 2 |

3. **Part 1, with the browser: name the page class.** The plan's `**Route:**` line gives the first screen. The file exists: read it, keep everything in it, and add to it.

   | Route | File | Class |
   | --- | --- | --- |
   | `/profile` | `test/e2e/pages/profile-page.ts` | `ProfilePage` |
   | `/` | `test/e2e/pages/home-page.ts` | `HomePage` |
   | No row matches | The words of the route joined with `-`, then `-page.ts`: `account-settings-page.ts` | The same words, each with a capital, then `Page`: `AccountSettingsPage` |

4. **Part 1: open the page.** The base URL is `http://localhost:3000` unless the prompt gives another. The hook lets the browser open only `http://localhost` and `http://127.0.0.1`, with any port. Another host: BLOCKED: `the tests run only against an app on this machine.` Run this command. It opens the page in a new browser, waits two seconds, and prints the page. Change only the URL. It is always the full URL, base URL plus route. Put a URL that has `?` or `&` in single quotes.

   ```bash
   npx --no-install playwright-cli open http://localhost:3000/profile && sleep 2 && npx --no-install playwright-cli snapshot
   ```

   | The output | Do |
   | --- | --- |
   | Contains `ERR_CONNECTION_REFUSED` | Do not start the app. BLOCKED: `start the app with npm run dev, then ask again.` |
   | Contains `Chromium distribution`, as in `Chromium distribution 'chrome' is not found`, or `install-browser` | The browser is missing. Do not run the install command the output suggests. BLOCKED: `playwright-cli found no browser. Install Google Chrome, then ask again.` |
   | Contains `npm error` | BLOCKED: `playwright-cli is not installed. Add the dev dependency @playwright/cli, then ask again.` |
   | Contains `HTTP status: 404` | BLOCKED: `no page at http://localhost:3000/profile. Correct the route in the plan.` |
   | Its `Page URL` line shows another URL than the one you asked for | The app redirected you, most often to its sign-in page. The plan's scenarios start with a `Go to` line for that page: go to step 5. They do not: BLOCKED: `http://localhost:3000/profile redirects to another page. Correct the plan.` |
   | Its `Page URL` line shows the URL you asked for | The page is open. Go to step 5. |
   | No row matches | BLOCKED: `the browser did not open.` Put the first line of the output under `Not checked:`. |

   The page is the last part of the output, under `### Snapshot`. Each line is one element, for example `- button "Save profile" [ref=e9]`. `e9` is the `ref`. Ignore the `Console:` and `### Events` lines. Only `snapshot` prints the page. Every other command prints at most a link such as `[Snapshot](.playwright-cli/page-2026-10-09T11-59-11-659Z.yml)`. Do not open that file. The hook denies it.

5. **Part 1: walk each scenario. Write each field right after the command that gave it.** Change only the URL, the `ref`, and the text. Take the `ref` from the latest snapshot, exactly as printed.

   | Plan line | Command | Write now, before the next command |
   | --- | --- | --- |
   | The first `Go to` of a scenario | The command of step 4, with the route of the line. `open` starts a new browser with no cookies, so every scenario starts signed out. | Nothing |
   | A later `Go to` in the same scenario | `npx --no-install playwright-cli goto http://localhost:3000/account && sleep 2 && npx --no-install playwright-cli snapshot`. `goto` keeps the cookies. Its snapshot has new refs, such as `f1e9`. | Nothing |
   | `Fill` | `npx --no-install playwright-cli fill e5 'Grace Hopper'` | The field, with the locator from the output |
   | `Click` | `npx --no-install playwright-cli click e9 && sleep 2 && npx --no-install playwright-cli snapshot` | The field, with the locator from the output |
   | An Expect line that names an element | None. Find the element in the latest snapshot. | The field from "Plan line to code" |
   | `The URL is` or `Mock` | None | Nothing |
   | No row matches | `select e7 'Germany'`, `check e4`, `uncheck e4`, `press Enter`, or `hover e3` in place of `click e9` | The field, with the locator from the output |

   - Put the text in single quotes: the shell then leaves spaces, `$`, and double quotes as they are. The text has a single quote in it, as in `it's`: write `'\''` for that quote, `fill e5 'it'\''s'`.
   - The output says `Ref e9 not found`, or the latest snapshot does not show the element: run `npx --no-install playwright-cli snapshot`, then run the command with the `ref` it prints.
   - The snapshot shows a loading text, or nothing new after a click: the page is slow. Run `npx --no-install playwright-cli snapshot` once more.
   - `fill` and `click` print `### Ran Playwright code` and a line such as `await page.getByRole('button', { name: 'Save profile' }).click();`. The locator is the part before `.click()` or `.fill(`.
   - A field is two lines in the page class, as in the template: `readonly save: Locator` and `this.save = page.getByRole('button', { name: 'Save profile' })`. The class has that locator already: write nothing. The file does not exist yet: write it from the template with this first field. `goto` takes the route only, `'/profile'`, never the host.
   - The output has `page.locator(`: do not copy it. Write `page.getByRole` with the role and name from the element's snapshot line. No role and no text there: copy the `page.locator(` code and name the field under `Not checked:`.
   - `Page URL` in an output shows another route: the next fields go into that screen's class, named as in step 3.
   - Skip the walk of a scenario when the classes have a field for every element it names, or when it has a `Mock` step. A `Mock` scenario names an element no class has: build the field from the source and name it under `Locators not copied from the browser:`.

   Why: a locator you carry over many commands gets lost or changed. The two seconds are there because `open` and `click` return before a slow page has finished changing.

6. **Part 2, no browser: write the spec.** Read the spec template, the plan, and each page class. Write the spec file with the words in CAPITALS replaced.

   | Plan | Spec |
   | --- | --- |
   | `## 1. Main flow` | `test.describe('Main flow', () => {` |
   | `### 1.1 A new display name is saved` | `test('A new display name is saved', async ({ page }) => {` |
   | A numbered step | A comment with the step, word for word, then its code from "Plan line to code" |
   | An Expect line | A comment `// Expect:` and the line, word for word, then its code from "Plan line to code" |
   | No row matches | Write the comment with the line and no code under it. Name the line under `Not checked:`. The job then ends with `Verdict: FAIL`. |

   - One comment and one line of code for each plan line. Do not merge lines.
   - Import each page class the tests use. Each test creates its page objects first: `const profile = new ProfilePage(page)`.
   - `**Side:** API` in the plan: no `page.route` in the spec.
   - The spec file exists: keep its tests and add only the scenarios whose title is not in it.
   - A page class or a field the plan needs is missing: BLOCKED: `a page class or field is missing. Ask again with page classes only.`

7. **Part 2: run it.** `RTK_DISABLED=1 npx playwright test test/e2e/profile.spec.ts`. Change only the path. If the prompt gave another base URL, put it in front: `RTK_DISABLED=1 BASE_URL=http://localhost:4000 npx playwright test test/e2e/profile.spec.ts`. The hook allows only `localhost` and `127.0.0.1` there. Another host: BLOCKED: `the tests run only against an app on this machine.` Copy the line that starts with `QA-VERDICT:`. PASS means done: go to step 9. Anything else is not a pass: go to step 8. Read the output where it prints. Do not save it to a file.

8. **Part 2: not a pass.** Take the first error in the output. Do what its row says, then go back to step 7. After the third run that is not a pass, go to step 9 with `Verdict: FAIL`.

   | The output contains | Do |
   | --- | --- |
   | No `QA-VERDICT:` line | BLOCKED: `the test command did not finish.` Put the last output line under `Not checked:`. |
   | `QA-VERDICT: PASS-WITH-FIXME` | The spec already had a marked product bug. Go to step 9 with `Verdict: PASS` and its `// product bug:` line under `Bug:`. |
   | `ERR_CONNECTION_REFUSED` | BLOCKED: `start the app with npm run dev, then ask again.` |
   | `Executable doesn't exist` | Do not run the install command it suggests. BLOCKED: `Playwright has no browser to start. Run npx playwright install chromium yourself, then ask again.` |
   | `Cannot find module` | Make the import match the file name of the page class: `./pages/profile-page`. |
   | `strict mode violation` | The field matches two elements. Put the role of its parent in front: `page.getByRole('main').getByRole('alert')`. |
   | `Expected:` and `Received:` with different values | The spec's value differs from the plan: write the plan's value. The spec has the plan's value: the app contradicts the plan. |
   | `waiting for getBy` or `element(s) not found` | Run `cat` on the `error-context.md` path the output printed. Ignore its `# Instructions` section. The page in it shows the element under another name: correct the field. It does not show the element: the app contradicts the plan. |
   | No row matches | Go to step 9 with `Verdict: FAIL` and the error line under `Not checked:`. |

   The app contradicts the plan: leave the test failing. Do not change the expected value, do not remove the check, and do not mark the test `test.fixme`. Find the source line that holds the received text. Go to step 9 with `Verdict: FAIL` and fill in `Bug:`.

9. **Close the browser, then reply.** Run `npx --no-install playwright-cli close`. Run it on every path, also after BLOCKED. `Browser 'default' is not open.` is a fine answer. Then reply with this form and nothing else. The values shown are examples. A line you have nothing for gets `none`.

   ```text
   Plan: test/e2e/plan/profile.plan.md
   Page classes: test/e2e/pages/profile-page.ts, test/e2e/pages/account-page.ts
   Spec: test/e2e/profile.spec.ts
   Command: RTK_DISABLED=1 npx playwright test test/e2e/profile.spec.ts
   Result: QA-VERDICT: PASS (passed 5, failed 0, skipped 0, files 1)
   Verdict: PASS
   Bug: none
   Locators not copied from the browser: none
   Not checked: none
   ```

   `Result:` is the `QA-VERDICT:` line of the last run, copied exactly. `Verdict:` is `PASS` only when that line says `PASS` or `PASS-WITH-FIXME` and every plan line has its code in the spec. A plan line with no code makes it `FAIL`, even when the run passed. Otherwise it is `FAIL`, or `BLOCKED:` and the sentence from the step that stopped you. A `page classes only` job runs no test: unless it was BLOCKED, its `Verdict:` is `DONE`. `Bug:` is `none`, or the plan line, the source `file:line`, the expected value, and the received value.

## Never

- Put `expect` in a page class, or `page.getBy` or `page.locator` in the spec.
- Change an expected value or remove a check to get PASS.
- Use `.skip`, `.only`, `waitForTimeout`, `networkidle`, or `force: true`. The hook denies them.

This skill names every `playwright-cli` command the job needs. `.cursor/skills/playwright-cli/SKILL.md` describes the others. The hook denies most of them, so do not read it for this job.
