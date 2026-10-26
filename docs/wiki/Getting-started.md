# Getting started

This page takes you through your first hour with the kit in a React or Next.js app. You install it, run one unit test job, then go from a plan to a passing end-to-end spec. A short part at the end does the same for a React Native or Expo app.

The examples use an imaginary app with a "Save profile" form at `/profile`. Its files are `src/components/ProfileForm.tsx`, `app/api/profile/route.ts`, and `lib/format.ts`. Put your own file names and routes in their place.

## 1. Check the requirements

Run these in a terminal:

```bash
node --version
npm --version
python3 --version
google-chrome --version
```

| Tool | You need |
| --- | --- |
| Node | `^22.22.2`, `^24.15.0`, or `26.0.0` and later |
| npm | Any version. The hook denies `pnpm`, `yarn`, and `bunx` to the agent. |
| Python | 3.9 or later, started as `python3`, with no packages. The hook is a Python script. |
| Google Chrome | Installed. The plan and generate jobs open it without a window. |
| Cursor | 2.4 or later. Earlier versions have no skills and no `preToolUse` hook event. |

The kit was run on Linux. On macOS only the hook's tests were run. Windows is not expected to work as shipped: it cannot start the hook by its `.py` path, so every action of the agent would be blocked.

## 2. Clone the kit

Clone it next to your app, so that the two folders sit side by side:

```bash
git clone https://github.com/syedmuhdahmad/qa-agent-kit.git
cd qa-agent-kit
```

The rest of this page assumes your app is in `../my-app`.

## 3. Install it into your app

Do a dry run first. It prints what would change and writes nothing:

```bash
node scripts/install-into.mjs ../my-app --dry-run
```

Read the output. The first lines say whether the installer found a web app or a React Native app. Then install:

```bash
node scripts/install-into.mjs ../my-app
```

The installer copies `.cursor/`, `.cursorignore`, `test/`, `AGENTS.md`, `vitest.config.ts`, and `playwright.config.ts`. It adds dev dependencies and four scripts to your `package.json`, adds lines to `.gitignore`, and adds `test/tsconfig.json` when your app has a `tsconfig.json`. It merges its entries into your own `.cursor/hooks.json` and `.cursor/mcp.json`. It skips any other file of yours that differs, and it never deletes a file.

Read the end of the output:

- A line that starts with `WARNING:` means a skipped file leaves part of the kit switched off. The line says what to do. The most serious is `the hook is not registered, so nothing is guarded`.
- A line that starts with `NOTE:` names something an earlier version of the kit left in your app.

If you prefer to copy the files by hand, [[Installation]] has the steps.

## 4. Install the dependencies

The installer does not run `npm install`. From your app folder:

```bash
cd ../my-app
npm install
npx playwright install chromium
```

If `npm install` stops with `ERESOLVE`, your app most likely has `"@types/node": "^20"`. Change it to the range in the kit's `package.json` and run `npm install` again.

To check that the hook can start, run this from the root of your app:

```bash
printf '%s' '{"hook_event_name":"beforeShellExecution","command":"npm run test:unit","cwd":""}' | .cursor/hooks/guard-test-writes.py
```

It should print `{"permission": "allow"}`. If it prints `Permission denied`, run `chmod +x .cursor/hooks/guard-test-writes.py`.

## 5. Open the app in Cursor

1. Open the app folder with **File → Open Folder**. In a monorepo, open the app package, such as `packages/web`, not the repository root.
2. Trust the workspace when Cursor asks. In an untrusted workspace Cursor loads no project hooks, so nothing is guarded.
3. In the chat panel, choose **Agent** mode.
4. Type `/` in the chat box. The menu should list `qa-unit`, `qa-plan`, `qa-generate`, `qa-heal`, and the other skills.

## 6. Start the app yourself

Plan and generate jobs open your running app in a browser. The hook denies `npm run dev` to the agent, so start it in a terminal of your own and leave it running:

```bash
npm run dev
```

The jobs expect the app at `http://localhost:3000`. If it runs on another port, you will name it in the prompt (see [[Skills and example prompts]]). A unit test job does not need the app running.

## 7. Your first job: a unit test

In Agent chat, type `/`, pick `qa-unit`, and add the file:

```text
/qa-unit src/components/ProfileForm.tsx
```

The agent then:

1. reads `package.json`, the source file, and the files it imports for texts;
2. lists 2 to 6 behaviors to test, such as each error message and the value one step past a length limit;
3. writes `test/unit/components/ProfileForm.test.ts`, a jsdom test because the source ends in `.tsx`;
4. runs `RTK_DISABLED=1 npx vitest run test/unit/components/ProfileForm.test.ts`;
5. fixes its own test in at most three rounds if the run fails for a reason in the test;
6. replies with a form and nothing else.

The reply looks like this:

```text
Job: write
Source: src/components/ProfileForm.tsx
Test file: test/unit/components/ProfileForm.test.ts
Command: RTK_DISABLED=1 npx vitest run test/unit/components/ProfileForm.test.ts
Cause: none
Fix: none
Before: none
After: QA-VERDICT: PASS (passed 4, failed 0, skipped 0, files 1)
Verdict: PASS
Bug: none
Not checked: the other test files
```

- `After:` is the last line of the test run, copied word for word. The agent does not judge the output itself: the kit's reporter prints that line.
- `Verdict:` is `PASS` only when the `QA-VERDICT:` line says `PASS`.
- `Not checked:` is always the last line. It says what the agent did not run or verify.

Open the test file and read it. It is your file now.

Other prompts for the same job:

| You want | Prompt |
| --- | --- |
| A test of a plain function | `/qa-unit lib/format.ts` |
| An integration test of an API route | `/qa-unit app/api/profile/route.ts` |
| To fix a failing test | `/qa-unit test/unit/components/ProfileForm.test.ts` |

## 8. From a plan to a passing end-to-end spec

The app must be running (step 6).

### Plan the feature

```text
/qa-plan profile
```

The agent opens `http://localhost:3000/profile` in Chrome with `playwright-cli`, reads the source of that page, walks each scenario in the browser, and saves `test/e2e/plan/profile.plan.md` with 3 to 8 scenarios. The reply:

```text
Plan file: test/e2e/plan/profile.plan.md
Side: UI
Scenarios: 5
Texts from source, not seen in the browser: "We could not save your profile" (src/components/ProfileForm.tsx:10)
Verdict: DONE
Not checked: none
```

A plan runs no test, so it ends with `DONE` and not `PASS`. `Texts from source, not seen in the browser:` names texts the agent copied from the source, such as the message of a server failure that the browser cannot produce.

### Read the plan

Open `test/e2e/plan/profile.plan.md`. A scenario looks like this:

```markdown
### 1.1 A new display name is saved

**Steps:**

1. Go to `/profile`.
2. Fill the "Display name" textbox with `Grace Hopper`.
3. Click the "Save profile" button.

**Expect:**

- The "Account" heading is visible.
- The text "Saved as Grace Hopper" is visible.
```

Read it before you go on. It matters more than any other file:

- The plan is what the tests check against. Later, when a test fails, the heal job compares the page with the plan to decide whether the test or the product is wrong.
- The agent copies texts from the app as it is today. If the app shows a wrong message now, the plan holds the wrong message. Correct it by hand to what the product should do.
- Delete a scenario you do not want, and fix a step that does not match how a user works.

### Generate the spec

```text
/qa-generate test/e2e/plan/profile.plan.md
```

The job has two parts. Part 1 walks the plan in the browser and writes one page class for each screen, such as `test/e2e/pages/profile-page.ts`. Part 2 writes the spec `test/e2e/profile.spec.ts` with no browser, and runs it. The reply:

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

With a small model, ask for the two parts in two prompts:

```text
/qa-generate test/e2e/plan/profile.plan.md page classes only
/qa-generate test/e2e/plan/profile.plan.md spec only
```

The first ends with `DONE`, because it runs no test.

### Heal the spec when it fails later

A week later someone changes the page and `test/e2e/profile.spec.ts` fails. Ask:

```text
/qa-heal test/e2e/profile.spec.ts
```

The agent runs the spec, reads the first failure, sorts it into one class (`Locator`, `Timing`, `Data or setup`, or `Product bug`), writes the cause, and makes the smallest fix. It edits only the spec and the page classes it imports, and stops after three rounds. The reply names the test, the class, the cause, the fix, and the `QA-VERDICT:` line before and after.

If the change was on purpose, for example a new button name, correct the plan first. The heal job then takes the new value from the plan.

## 9. How to read the verdict

| Verdict | Means | What to do next |
| --- | --- | --- |
| `PASS` | The last test run passed. For Playwright that includes `PASS-WITH-FIXME`: every test passed except ones marked as a product bug. | Read the test file. Commit it when you agree with it. |
| `FAIL` | The last run did not pass, or the job could not finish its work. | Read `Bug:` first. If it names a source line, the product is wrong: see the next section. If `Bug:` is `none`, read `Cause:` and `Not checked:`. Run the heal or fix job once more, or fix the test yourself. |
| `BLOCKED: ...` | The agent stopped before the work was done. The words after it say what you must do. | Do exactly that, then send the same prompt again. |
| `DONE` | A job that runs no test wrote its file: a plan, or `page classes only`. | Read the file, then start the next job. |

The commonest `BLOCKED` replies in the first hour:

| Reply after `Verdict: BLOCKED:` | What to do |
| --- | --- |
| `start the app with npm run dev, then ask again.` | Start the app in your own terminal. |
| `playwright-cli found no browser. Install Google Chrome, then ask again.` | Install Google Chrome. |
| `Playwright has no browser to start. Run npx playwright install chromium yourself, then ask again.` | Run that command in your terminal. |
| `no page at http://localhost:3000/profile. Ask again with the route.` | Add the route in words: `/qa-plan profile. Route /settings/profile.` |
| `this page needs a signed-in user. Ask again with a test account.` | Add a test account: `/qa-plan profile. Test account grace@example.org / profile-test-1.` |
| `the tests run only against an app on this machine.` | Run the app on `localhost` or `127.0.0.1`. |

[[Skills and example prompts]] lists every `BLOCKED` reply of every skill.

## 10. When the agent finds a product bug

No skill changes what a test expects to get a pass. When the app is wrong:

- `/qa-unit`, `/qa-rn-unit`, and `/qa-generate` leave the test failing. The reply says `Verdict: FAIL` and fills in `Bug:` with the source `file:line`, the expected value, and the received value.
- `/qa-heal` marks that one test with `test.fixme(` and a comment on the line above it. The run then ends with `PASS-WITH-FIXME`, and the reply says `Verdict: PASS`:

  ```ts
  // product bug: src/components/ProfileForm.tsx:9 expected "That name is taken", got "Name unavailable"
  test.fixme('A taken name shows an error', async ({ page }) => {
  ```

What you do:

1. Check the bug. Open the source line the reply names, and the plan line or the test it contradicts.
2. Report it to the developers with the `Bug:` line, or the `// product bug:` line.
3. Do not ask the agent to make the test pass. It will refuse, and the hook denies the marks that would hide the failure.
4. When the bug is fixed, run the test again. For a `test.fixme(` mark, change it back to `test(` and delete the comment line yourself: no skill removes the mark. Then run the spec, and use `/qa-heal` if it still fails.

If the test was right before and the behavior changed on purpose, say so. For a unit test, put it in the prompt: `/qa-unit test/unit/components/ProfileForm.test.ts. The error text changed to "Name unavailable" on purpose.` For an end-to-end test, correct the plan, then run `/qa-heal`.

## 11. Run the tests yourself

From your app folder:

```bash
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:e2e:list
```

- `npm run test:e2e` starts the app with `npm run dev` when nothing answers at `http://localhost:3000`. For another address: `BASE_URL=http://localhost:4000 npm run test:e2e`.
- `npm run test:e2e:list` lists the Playwright tests without running them. It prints no `QA-VERDICT:` line.
- One file: `npx vitest run test/unit/components/ProfileForm.test.ts` or `npx playwright test test/e2e/profile.spec.ts`.
- On a new install with no tests, `npm run test:unit` exits 0 and still prints `QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: no tests ran`.

Every command of the agent starts with `RTK_DISABLED=1`. That matters only if you use RTK: see [[Using RTK]].

## 12. In a React Native or Expo app

The installer finds `expo` or `react-native` in your `package.json` and installs the React Native set: no Vitest or Playwright files, the dev dependencies `@testing-library/react-native`, `@types/jest`, `jest`, and `test-renderer`, and one script, `test:rn-unit`.

Jest needs your app's own preset. For an Expo app:

```bash
npx expo install jest-expo
```

Then add `"jest": { "preset": "jest-expo" }` to `package.json`, and run `npm install`. Without a preset the job replies `BLOCKED: the app has no Jest preset. ...`.

Open the app folder in Cursor as in step 5. No app needs to run. Then:

```text
/qa-rn-unit src/components/ProfileForm.tsx
```

The agent writes `test/unit/components/ProfileForm.test.ts`, renders the component with React Native Testing Library, and runs:

```bash
RTK_DISABLED=1 npx jest --config .cursor/qa/jest.config.cjs --ci test/unit/components/ProfileForm.test.ts
```

The reply has the same form as `/qa-unit`, and the same `QA-VERDICT:` line. The test goes in `test/unit/` even when your app keeps its tests in `__tests__/` folders. It writes tests for components and plain functions, not yet for hooks or navigation. Run all of them yourself with `npm run test:rn-unit`.

Maestro flows on a device are a preview: only Android was run, and nothing on iOS. See [[QA manual for React Native]].

## Next steps

- [[Skills and example prompts]]: every prompt each skill takes, and every `BLOCKED` reply.
- [[QA manual for web apps]]: how to work with the web jobs day to day.
- [[QA manual for React Native]]: Jest tests and Maestro flows in a mobile app.
- [[Troubleshooting]]: install problems, denies, and replies that stop.
- [[Jobs and commands]]: the reply form, the verdict line, and the tools each job uses.
