---
name: qa-unit
description: "Write or fix one Vitest unit or integration test. Usage: /qa-unit src/components/ProfileForm.tsx"
disable-model-invocation: true
---

# Write or fix one Vitest test

You write test files under `test/unit/` and `test/integration/`. Read application source (`app/`, `src/`, and similar). Never edit it. Do the steps in order. In every table, use the first row that matches.

The examples are from another app. Take your file names and values from the prompt and the source file.

When a step says BLOCKED, stop work, go to step 10, and put the sentence after `Verdict: BLOCKED:`.

## Steps

1. **Job.**

   | The prompt names | Do |
   | --- | --- |
   | No file, more than one, or a file that does not exist | Reply `Which file? For example: /qa-unit src/components/ProfileForm.tsx` and stop. |
   | One file under `test/` | Fix job. Go to step 7 and run that file. |
   | Any other file | Write job. Go to step 2. |

2. **Read the source file.** If a text or value comes from a file it imports, read that file too. List 2 to 6 behaviors to test, one line each: what it shows or returns, each branch, each error message. Copy texts exactly. More than 6: keep 6 and name the rest under `Not checked:`.

3. **Test file path.**

   | Check | Folder |
   | --- | --- |
   | The prompt says `integration` | `test/integration/` |
   | The prompt says `unit test` | `test/unit/` |
   | The source file is named `route.ts`, or is under an `api/` folder | `test/integration/` |
   | No row matches | `test/unit/` |

   Path: the folder, then the source path, ending in `.test.ts`. Drop a leading `src/` or `app/` (the first folder only). Import: `../` once for each `/` in the test path, then the source path without its extension.

   | Source file | Test file | Import |
   | --- | --- | --- |
   | `src/components/ProfileForm.tsx` | `test/unit/components/ProfileForm.test.ts` | `../../../src/components/ProfileForm` |
   | `lib/format.ts` | `test/unit/lib/format.test.ts` | `../../../lib/format` |
   | `app/api/profile/route.ts` | `test/integration/api/profile/route.test.ts` | `../../../../app/api/profile/route` |
   | No row has your folders | Apply the two rules above | |

4. **Template.** Read one of the two test templates in `.cursor/skills/qa-unit/templates/`.

   | Check | Template |
   | --- | --- |
   | The prompt says `UI`, or the source file ends in `.tsx` or `.jsx` | `ui.test.ts` |
   | No row matches | `node.test.ts` |

5. **Mocks.** Do every row that matches the source file. A row names a block: read `.cursor/skills/qa-unit/templates/mocks.ts` and copy that block only.

   | The source file | Do in the test file |
   | --- | --- |
   | imports `next/navigation` | Add the `next/navigation` block. |
   | imports `next/headers` | Add the `next/headers` block. |
   | calls `fetch(` | Add the `fetch` block. |
   | imports a module that reads a database or calls another server, such as `prisma`, `axios`, a `repository.ts`, or a local `api.ts` | `node.test.ts`: keep the two `DATA_IMPORT` lines. `ui.test.ts`: add the `data module` block. |
   | imports no such module | `node.test.ts`: delete the two lines that contain `DATA_IMPORT`. `ui.test.ts`: nothing. |
   | has no `import` line | `node.test.ts`: also delete the `server-only` line. |

   Mock nothing else. Child components, helper modules, and the file under test stay real.

6. **Write the test file.** New file: start from the template. Existing file: read it, keep everything in it, and add to it. Replace every token (a word in capitals with an underscore) with a value from the source. `SOURCE_IMPORT` is the import from step 3. Import each export you test, a default export without braces. `DATA_IMPORT` is the same `../` prefix, then the path of the data module, never the `@/` path the source uses. For `DATA_FUNCTION` write one `name: vi.fn()` for each function the source imports from that module. Replace the example `it` with one `it` per behavior from step 2.
   - Set every mock return value inside the `it`, never in a `vi.mock` factory.
     Why: `resetAllMocks` in `afterEach` wipes factory values, so the next test gets `undefined`.
   - No JSX. Props go in the second argument: `createElement(Card, { title: 'Hello' })`.
   - An `async` component: `render(await Page())`, not `createElement`.
   - A check on something that happens after a `fetch`: wrap it as the template does, `await waitFor(() => expect(push).toHaveBeenCalledWith('/account'))`.
   - A function that takes no `Request`: call it with its own arguments and check what it returns.
   - Before you save, check that no token is left.

7. **Run.** `RTK_DISABLED=1 npx vitest run test/unit/components/ProfileForm.test.ts`. Change only the path. Give the full path of the test file.

8. **Verdict.** Copy the line that starts with `QA-VERDICT:`. PASS means done. Anything else is not a pass.

   | The output has | Do |
   | --- | --- |
   | `QA-VERDICT: PASS` | Go to step 10. |
   | Another `QA-VERDICT:` line | Go to step 9. |
   | No `QA-VERDICT:` line | BLOCKED: `the test command did not finish.` Put the last output line under `Not checked:`. |

9. **Fix one failure.** You have 3 rounds. One edit and one rerun is one round. After round 3, go to step 10 with `Verdict: FAIL`.
   1. Take the first failing test. Copy the first line under its `FAIL` line, and its `Expected` and `Received` lines if it has them. In round 1 this is `Before:` in the reply. In round 2 or 3, the same error as before means the last fix was wrong: put the old line back by editing the file. Do not use `git restore` or `git checkout`: they also remove your earlier fixes.
   2. Fix job, round 1: read the test file and the source file it imports.
   3. Find the error in "Errors" and do what the row says. Do not edit until you can point to the cause in the error or the source. A guess is not a cause.
   4. Make the smallest fix. Take the first option that fully fixes the failure:
      - The product is wrong (section A): change nothing.
      - The test file already has a helper, mock, or setup for this: use it.
      - Vitest or Testing Library already does it (`waitFor` waits): use it.
      - Otherwise change the one line that is wrong.

      Change only the lines that caused the failure. Do not rewrite, rename, reorder, or reformat anything else. Do not add helpers, wrappers, retries, longer timeouts, or config options. Keep every existing assertion and mock.
   5. Go to step 7.

10. **Reply** with the form in "Reply".

## Errors

| The output contains | Do |
| --- | --- |
| `(!) Your Vite config uses features that are unsupported` | A warning, not an error. Do nothing about it, and take the next row that matches. |
| Not the output, but the test file: it has `from '@/` or `vi.mock('@/` | In each such line, write the `../` path from step 3 in place of the `@/` path. Keep this edit even if the error stays. Why: `@/` may not resolve in a test file, and a `vi.mock` of an `@/` path may mock nothing, so the real module runs. |
| `No test files found` or `no tests ran` | Wrong path, or the file has no `it`. The file must end in `.test.ts` under `test/unit/` or `test/integration/`. Run the full path. |
| `skipped or todo` or `.only is not allowed` | Remove the `.skip`, `.todo`, or `.only` mark and run again. |
| `@testing-library/user-event` | It is not installed. Use `fireEvent`. |
| `Failed to resolve import`, `Cannot find module`, or `Cannot find package`, and the file after `from` is your test file | A token is left, or the import is wrong. Build it again with step 3. |
| The same, and the file after `from` is a source file | BLOCKED: `Vitest cannot resolve an import in the app. Check paths in tsconfig.json and the installed packages.` Name the import under `Cause:`. Do not add an alias or install anything. Why: `vitest.config.ts` already resolves the aliases in `tsconfig.json`. |
| `document is not defined` | Line 1 of the test file must be `// @vitest-environment jsdom`. |
| `PARSE_ERROR` | Syntax error in the test file, often JSX. Use `createElement`. |
| `expected app router to be mounted` | Add the `next/navigation` block from `mocks.ts`. |
| `outside a request scope` | Add the `next/headers` block from `mocks.ts`. |
| `export is defined on the` | Add the name in the error to that `vi.mock` factory: `NAME: vi.fn()`. |
| `cannot be imported from a Client Component module` | Add `vi.mock('server-only', () => ({}))` under the imports. |
| `Cannot read properties of undefined` at a source line that uses a mock | Set that mock's return value inside the `it`. For `redirect`, see `mocks.ts`. |
| `A component suspended` | The component is `async`. Use `render(await Page())`. |
| `Found multiple elements` | `afterEach` must call `cleanup()` first, in the test file, not in `test/setup.ts`. If it does, the query matches two elements: add the name from the source. |
| `Unable to find` or `Number of calls: 0` | It happens after a `fetch` or another `await`. UI test: wrap the check in `await waitFor(() => ...)`. Node test: `await` the call. Still failing: go to section A. |
| `Invalid hook call` or `older version of React` | BLOCKED: `the app and the test tools load two copies of React.` Do not install anything. |
| `Failed to parse URL` or `fetch failed` | The source called the real `fetch`. Add the `fetch` block from `mocks.ts` to that `it`. |
| `AssertionError`, or `Expected` and `Received` | Go to section A. |
| No row matches | Do section B once. Then use the closest row and name it under `Not checked:`. |

## A. Test or product

An assertion failed: the test expects one value and the source gives another.

| Check | Do |
| --- | --- |
| The test's steps do not do what its title says: a wrong input, a wrong mock value, a missing step, or a missing `await` | Fix that line. Leave the expected value. |
| The prompt says the behavior changed | Change the expected value. |
| A name, message, or comment in the source says what the test expects, but the code does something else | Product bug. Leave the test. Go to step 10 with `Verdict: FAIL` and the source `file:line`. |
| You wrote this `it` in this job | You misread the source. Change the expected value. |
| The expected value is also in another source file, another test, or a plan in `test/e2e/plan/`. Search the project for it. | Product bug. Leave the test. Go to step 10 with `Verdict: FAIL` and the source `file:line`. |
| The received value is in another test or another source file, and the expected value is only in this test | The test is wrong. Change the expected value. |
| No row matches | Treat it as a product bug. Write `which value is intended` under `Not checked:`. |

## B. Vitest reference

Read at most one file in `.cursor/skills/qa-unit/references/`.

| The failing line uses | Read |
| --- | --- |
| `vi.` | `features-mocking.md` |
| `expect(` | `core-expect.md` |
| A test option, `async`, or a timeout | `core-test-api.md` |
| No row matches | None |

## Never

- Edit application source, `test/setup.ts`, or `vitest.config.ts`.
- Delete a failing test, or mark it `.skip`, `.only`, `.todo`, or `.fails`. The hook denies the marks.
- Weaken an assertion to go green: `toBeTruthy()`, `expect.anything()`, a removed check, or a snapshot as the only assertion.
- Change an expected value to the received value, unless section A says the test is wrong.
- Install a package, or run a test command other than the one in step 7.

## Reply

Reply with this form and nothing else. The values shown are examples. A line you have nothing for gets `none`.

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

- `Job:` is `write` or `fix`.
- `Cause:` is one sentence on what was wrong. `Fix:` is the file and line you changed.
- `Before:` is what you copied in round 1, or `none`.
- `After:` is the `QA-VERDICT:` line of the last run, copied exactly.
- `Verdict:` is `PASS` only when that line says `PASS`. Otherwise it is `FAIL`, or `BLOCKED:` and the sentence from the step that stopped you.
- `Bug:` is the source `file:line`, the expected value, and the received value. The test stays failing.
- `Not checked:` is one line on what you did not run or verify.
