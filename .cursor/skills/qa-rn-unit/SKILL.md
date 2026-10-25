---
name: qa-rn-unit
description: "Write or fix one Jest unit test in a React Native or Expo app. Usage: /qa-rn-unit src/components/ProfileForm.tsx"
disable-model-invocation: true
---

# Write or fix one Jest test in a React Native app

You write test files under `test/unit/`. Read application source (`app/`, `src/`, and similar). Never edit it, and never edit `package.json` or a Jest config. Do the steps in order. In every table, use the first row that matches.

The examples are from another app. Take your file names and values from the prompt and the source file.

When a step says BLOCKED, stop work, go to step 10, and put the sentence after `Verdict: BLOCKED:`.

## Steps

1. **Job.** Read `package.json` in the project root first.

   | Check | Do |
   | --- | --- |
   | `package.json` lists neither `react-native` nor `expo` | Reply `This is not a React Native app. Use /qa-unit for a web app.` and stop. |
   | `package.json` has no `"jest"` key, and the project root has no `jest.config.js`, `jest.config.cjs`, `jest.config.mjs`, or `jest.config.json` | BLOCKED: `the app has no Jest preset. For an Expo app add "jest": { "preset": "jest-expo" } to package.json, then run npm install.` |
   | The prompt names no file, or more than one | Reply `Which file? For example: /qa-rn-unit src/components/ProfileForm.tsx` and stop. |
   | A path with no file at it, counted from the project root | Do not use a file of the same name in another folder. Reply `No file at that path. Which file?` and stop. |
   | One file under `test/` | Fix job. Go to step 7 and run that file. |
   | Any other file | Write job. Go to step 2. |

2. **Read the source file.** If a text or value comes from a file it imports, read that file too. An import that starts with `@/` names the path after `@/`, counted from the folder that `paths` in `tsconfig.json` gives for `@/*`. List 2 to 6 behaviors to test, one line each: what the screen shows, what each button or field does, each branch, each error message. For a limit on a length or a number, also test the value one step past it, such as a display name of 31 characters for a maximum of 30. Copy texts exactly. More than 6: keep 6 and name the rest under `Not checked:`.

3. **Test file path.** `test/unit/`, then the source path, ending in `.test.ts`. Drop a leading `src/` or `app/` (the first folder only). Import: `../` once for each `/` in the test path, then the source path without its extension.

   | Source file | Test file | Import |
   | --- | --- | --- |
   | `src/components/ProfileForm.tsx` | `test/unit/components/ProfileForm.test.ts` | `../../../src/components/ProfileForm` |
   | `lib/format.ts` | `test/unit/lib/format.test.ts` | `../../../lib/format` |
   | `src/screens/settings/ProfileScreen.tsx` | `test/unit/screens/settings/ProfileScreen.test.ts` | `../../../../src/screens/settings/ProfileScreen` |
   | No row has your folders | Apply the two rules above | |

   The test goes in `test/unit/` also when the app keeps its own tests in `__tests__/` folders.
   Why: the hook denies a `__tests__/` folder under `test/`, and the kit's Jest config runs only `test/unit/` and `test/integration/`.

4. **Template.** Read one of the two test templates in `.cursor/skills/qa-rn-unit/templates/`.

   | Check | Template |
   | --- | --- |
   | The prompt says `UI`, or the source file ends in `.tsx` or `.jsx` | `component.test.ts` |
   | No row matches | `function.test.ts` |

5. **Mocks.** Do every row that matches the source file. A row names a block: read `.cursor/skills/qa-rn-unit/templates/mocks.ts` and copy that block only.

   | The source file | Do in the test file |
   | --- | --- |
   | imports `@react-navigation/native` | Add the `react-navigation` block. |
   | imports `expo-router` | Add the `expo-router` block. |
   | imports `@react-native-async-storage/async-storage` | Add the `async-storage` block. |
   | calls `fetch(` | Add the `fetch` block. |
   | imports a module that reads a database or calls a server, such as `axios`, a `repository.ts`, or a local `api.ts` | Add the `data module` block. |
   | calls `setTimeout(` or `setInterval(` | Add the `timers` block. |
   | No row matches | Nothing. |

   Mock nothing else. Child components, helper modules, and the file under test stay real.

6. **Write the test file.** New file: start from the template. Existing file: read it, keep everything in it, and add to it. Replace every token (a word in capitals with an underscore) with a value from the source. `SOURCE_IMPORT` is the import from step 3. Import each export you test, a default export without braces. `DATA_IMPORT` is the same `../` prefix, then the path of the data module, never the `@/` path the source uses. Replace the example `it` with one `it` per behavior from step 2.
   - No JSX. Props go in the second argument: `await render(createElement(ProfileForm, { initialName: 'Ada' }))`.
   - Put `await` in front of `render(`, every `user.` call, and every `findBy`. Every `it` that renders is `async`.
   - Find an element the way a user does, in this order: `getByRole` with its `name`, `getByLabelText`, `getByPlaceholderText`, `getByText`. Use `getByTestId` only when nothing else names the element.
   - A text that appears after a press, a `fetch`, or a timer: `expect(await screen.findByText('Profile saved')).toBeOnTheScreen()`.
   - A text that must not be there: `expect(screen.queryByText('Profile saved')).not.toBeOnTheScreen()`.
   - Set every mock return value inside the `it`, never in a `jest.mock` factory.
     Why: `resetAllMocks` in `afterEach` wipes factory values, so the next test gets `undefined`.
   - A function that renders nothing: call it with its own arguments and check what it returns.
   - Before you save, check that no token is left.

7. **Run.** `RTK_DISABLED=1 npx jest --config .cursor/qa/jest.config.cjs --ci test/unit/components/ProfileForm.test.ts`. Change only the path. Give the full path of the test file. Read the output where it prints. Do not save it to a file.

8. **Verdict.** Copy the line that starts with `QA-VERDICT:`. PASS means done. Anything else is not a pass.

   | The output has | Do |
   | --- | --- |
   | `QA-VERDICT: PASS` | Go to step 10. |
   | Another `QA-VERDICT:` line | Go to step 9. |
   | No `QA-VERDICT:` line | BLOCKED: `the test command did not finish.` Put the last output line under `Not checked:`. |

9. **Fix one failure.** You have 3 rounds. One edit and one rerun is one round. After round 3, go to step 10 with `Verdict: FAIL`.
   1. Take the first failing test. Copy the first line under its `●` line, and its `Expected` and `Received` lines if it has them. In round 1 this is `Before:` in the reply. In round 2 or 3, the same error as before means the last fix was wrong: put the old line back by editing the file. Do not use `git restore` or `git checkout`: they also remove your earlier fixes.
   2. Fix job, round 1: read the test file and the source file it imports.
   3. Find the error in "Errors" and do what the row says. Do not edit until you can point to the cause in the error or the source. A guess is not a cause.
   4. Make the smallest fix. Take the first option that fully fixes the failure:
      - The product is wrong (section A): change nothing.
      - The test file already has a helper, mock, or setup for this: use it.
      - Testing Library already does it (`findBy` waits): use it.
      - Otherwise change the one line that is wrong.

      Change only the lines that caused the failure. Do not rewrite, rename, reorder, or reformat anything else. Do not add helpers, wrappers, retries, longer timeouts, or config options. Keep every existing assertion and mock.
   5. Go to step 7.

10. **Reply** with the form in "Reply".

## Errors

| The output contains | Do |
| --- | --- |
| `An update to` and `was not wrapped in act(...)`, or `Warning:` | A warning, not an error. Do nothing about it, and take the next row that matches. |
| Not the output, but the test file: it has `from '@/` or `jest.mock('@/` | In each such line, write the `../` path from step 3 in place of the `@/` path. Keep this edit even if the error stays. Why: `@/` may not resolve in a test, and a `jest.mock` of an `@/` path may mock nothing, so the real module runs. |
| `No tests found` or `no tests ran` | Wrong path, or the file has no `it`. The file must end in `.test.ts` under `test/unit/`. Run the full path. |
| `skipped or todo` | Remove the `.skip`, `.todo`, `.only`, `xit`, or `fit` mark and run again. |
| `Cannot find module`, and the file after `from` is your test file | A token is left, or the import is wrong. Build it again with step 3. |
| `SyntaxError` or `Cannot use import statement outside a module`, and the file named is under `node_modules/` | BLOCKED: `Jest does not transform the package PACKAGE_NAME. Add it to transformIgnorePatterns in the app's Jest config.` Put the package name in the sentence and under `Cause:`. Do not edit the config. |
| `Cannot find module 'test-renderer'` | BLOCKED: `@testing-library/react-native needs the dev dependency test-renderer. Install it.` |
| `Cannot find module`, and the module is a package or a source file | BLOCKED: `Jest cannot resolve MODULE_NAME. Check moduleNameMapper in the app's Jest config and the installed packages.` Do not add an alias or install anything. |
| `QA kit, .cursor/qa/jest.config.cjs:`, or `Preset` and `not found` | BLOCKED: copy the sentence after the colon, or `the Jest preset of the app is not installed. Run npm install.` |
| `TurboModuleRegistry`, `could not be found`, `Native module`, or `NativeModule` and `is null` | A native module has no code in Jest. Find the package in the stack lines under the error, add the `native module` block from `mocks.ts`, and put that package's name in it. |
| `PARSE_ERROR` or `Unexpected token '<'`, and the file named is your test file | JSX in the test file. Use `createElement`. |
| `Unable to find an element` | The element appears after a press, a `fetch`, or a timer: use `await screen.findBy...`. It is there at once: query it by another name from the source. Still failing: go to section A. |
| `Found multiple elements` | The query matches two elements: add the `name` from the source, or use the text of the one you mean. |
| `Exceeded timeout of` | Something the test waits for never happens. A mock has no return value: set it inside the `it`. A `findBy` never matches: go to section A. |
| `Invalid hook call` or `older version of React` | BLOCKED: `the app and the test tools load two copies of React.` Do not install anything. |
| `A worker process has failed to exit gracefully` | A timer or a subscription is still running. If the source calls `setTimeout(` or `setInterval(`, add the `timers` block. Otherwise it is not an error: take the next row. |
| `expect(`, or `Expected` and `Received` | Go to section A. |
| No row matches | Use the closest row and name it under `Not checked:`. |

## A. Test or product

An assertion failed: the test expects one value and the source gives another.

| Check | Do |
| --- | --- |
| The test's steps do not do what its title says: a wrong input, a wrong mock value, a missing step, or a missing `await` | Fix that line. Leave the expected value. |
| The prompt says the behavior changed | Change the expected value. |
| A name, message, or comment in the source says what the test expects, but the code does something else | Product bug. Leave the test. Go to step 10 with `Verdict: FAIL` and the source `file:line`. |
| You wrote this `it` in this job | You misread the source. Change the expected value. |
| The expected value is also in another source file, another test, or a plan in `test/mobile/plan/`. Search the project for it. | Product bug. Leave the test. Go to step 10 with `Verdict: FAIL` and the source `file:line`. |
| The received value is in another test or another source file, and the expected value is only in this test | The test is wrong. Change the expected value. |
| No row matches | Treat it as a product bug. Write `which value is intended` under `Not checked:`. |

## Never

- Edit application source, `package.json`, the app's Jest config, or `.cursor/qa/jest.config.cjs`.
- Delete a failing test, or mark it `.skip`, `.only`, `.todo`, `xit`, or `fit`. The hook denies the marks.
- Weaken an assertion to go green: `toBeTruthy()`, `expect.anything()`, a removed check, or a snapshot. The hook denies snapshots.
- Change an expected value to the received value, unless section A says the test is wrong.
- Install a package, or run a test command other than the one in step 7.

## Reply

Reply with this form and nothing else, as plain lines with no ``` fence around them. The values shown are examples. A line you have nothing for gets `none`.

```text
Job: write
Source: src/components/ProfileForm.tsx
Test file: test/unit/components/ProfileForm.test.ts
Command: RTK_DISABLED=1 npx jest --config .cursor/qa/jest.config.cjs --ci test/unit/components/ProfileForm.test.ts
Cause: none
Fix: none
Before: none
After: QA-VERDICT: PASS (passed 4, failed 0, skipped 0, files 1)
Verdict: PASS
Bug: none
Not checked: the other test files
```

- `Job:` is `write` or `fix`.
- `Cause:` is one sentence on what was wrong. `Fix:` is the file and line you changed.
- `Before:` is what you copied in round 1, or `none`.
- `After:` is the `QA-VERDICT:` line of the last run, copied exactly.
- `Verdict:` is `PASS` only when that line says `PASS`. Otherwise it is `FAIL`, or `BLOCKED:` and the sentence from the step that stopped you.
- `Bug:` is the source `file:line`, the expected value, and the received value. The test stays failing.
- `Not checked:` is one line on what you did not run or verify.
