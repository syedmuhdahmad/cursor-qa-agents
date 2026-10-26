# Skills and example prompts

This page has one section for each job skill: what it does, when to use it, the prompts it takes, the files it writes, how it ends, and the `BLOCKED` replies you are likely to see. Every prompt here was checked against the text of the skill in `.cursor/skills/<name>/SKILL.md`.

The examples come from the imaginary app that the skills themselves use: a "Save profile" form at `/profile`, with `src/components/ProfileForm.tsx`, `app/api/profile/route.ts`, `lib/format.ts`, and the mobile app id `com.example.app`. Put your own names in their place.

Start every job from the `/` menu in Agent chat, in **Agent** mode. [[Jobs and commands]] explains the reply form and the `QA-VERDICT:` line that every section below refers to.

| Skill | Job | Needs |
| --- | --- | --- |
| [`/qa-unit`](#qa-unit) | Write or fix one Vitest unit or integration test | Nothing running |
| [`/qa-plan`](#qa-plan) | Plan end-to-end coverage for one feature | The app running, Google Chrome |
| [`/qa-generate`](#qa-generate) | Turn one plan into page classes and a Playwright spec | The app running, Google Chrome |
| [`/qa-heal`](#qa-heal) | Fix one failing Playwright spec | The app on this machine |
| [`/qa-rn-unit`](#qa-rn-unit) | Write or fix one Jest test in a React Native or Expo app | A Jest preset |
| [`/qa-mobile-plan`](#qa-mobile-plan) | Plan Maestro coverage for one feature (preview) | A device, the app installed, the `maestro` MCP server |
| [`/qa-mobile-generate`](#qa-mobile-generate) | Turn one mobile plan into element files and flows (preview) | A device, the app installed, the `maestro` MCP server, the Maestro CLI |
| [`/qa-mobile-heal`](#qa-mobile-heal) | Fix one failing Maestro flow (preview) | A device, the app installed, the `maestro` MCP server |
| [`/security-audit`](#security-audit) | Audit the source for security vulnerabilities | A high-tier model |

## Writing a good prompt

- **One job in one prompt.** Do not ask for a plan and a spec together, or for tests of two files.
- **Name exactly one thing.** One source file or test file, one feature, one plan, one spec, or one flow. A unit job with two files replies `Which file?` and stops.
- **Give a path from the project root.** `/qa-unit` does not look for a file of the same name in another folder.
- **Give settings in words.** The skills look for these words in the prompt: `Base URL http://localhost:4000.`, `Route /settings/profile.`, `Test account grace@example.org / profile-test-1.`, `This is Android.`, `App id com.example.app`. Only `localhost` and `127.0.0.1` work as a base URL.
- **Use the switch words as written.** `integration`, `unit test`, `UI`, `page classes only`, `spec only`, `element files only`, `flows only`.
- **Split generate for a small model.** Ask for `page classes only` first, then `spec only`. The first uses the browser and the second does not.
- **Prefer the `/` menu.** `/qa` and a plain request such as "Write a unit test for src/components/ProfileForm.tsx" also work, through the table in `AGENTS.md`. The model then has one more choice to make. Whether a skill name that you type or paste, instead of picking it from the menu, attaches the skill was not checked.
- **After `BLOCKED`, do what the line says and send the same prompt again.**

## qa-unit

Writes or fixes one Vitest test. In a write job it reads the source file and the files it imports, picks 2 to 6 behaviors (each branch, each error message, the value one step past a limit), writes the test, runs it, and fixes its own test in at most three rounds. In a fix job it runs the test file you name and fixes it in at most three rounds.

Use it for a component, a plain function, or an API route handler in a web app. In a React Native app it replies `This is a React Native app. Use /qa-rn-unit for a Jest test.`

| Prompt | What happens |
| --- | --- |
| `/qa-unit src/components/ProfileForm.tsx` | Writes `test/unit/components/ProfileForm.test.ts`, a jsdom test, because the source ends in `.tsx` |
| `/qa-unit lib/format.ts` | Writes `test/unit/lib/format.test.ts`, a Node test |
| `/qa-unit app/api/profile/route.ts` | Writes `test/integration/api/profile/route.test.ts`, because the file is named `route.ts` |
| `/qa-unit lib/format.ts integration` | Writes `test/integration/lib/format.test.ts`. The word `integration` picks the folder. |
| `/qa-unit app/api/profile/route.ts unit test` | Writes `test/unit/api/profile/route.test.ts`. The words `unit test` pick the folder. |
| `/qa-unit lib/format.ts UI` | Uses the jsdom template for a `.ts` file. The word `UI` picks it. |
| `/qa-unit test/unit/components/ProfileForm.test.ts` | Fix job: runs that file and fixes it |
| `/qa-unit test/unit/components/ProfileForm.test.ts. The error text changed to "Name unavailable" on purpose.` | Fix job. Because the prompt says the behavior changed, the agent may change the expected value. |

- **Files it writes:** one test file under `test/unit/` or `test/integration/`. The path mirrors the source path without a leading `src/` or `app/`. It mocks `next/navigation`, `next/headers`, `fetch`, and a data module when the source uses them, and nothing else.
- **Command:** `RTK_DISABLED=1 npx vitest run test/unit/components/ProfileForm.test.ts`
- **How it ends:** `Verdict: PASS`, `FAIL`, or `BLOCKED:`. A product bug ends with `FAIL` and a `Bug:` line, and the test stays failing.

| Reply | What to do |
| --- | --- |
| `Which file? For example: /qa-unit src/components/ProfileForm.tsx` | Name one file. |
| `No file at that path. Which file?` | Give the path from the project root. |
| `BLOCKED: the test command did not finish.` | Run the test yourself and read the last line, which is under `Not checked:`. |
| `BLOCKED: Vitest cannot resolve an import in the app. Check paths in tsconfig.json and the installed packages.` | The import under `Cause:` does not resolve. Check `test/tsconfig.json` and your `paths`. See [[Troubleshooting]]. |
| `BLOCKED: the app and the test tools load two copies of React.` | Check that only one version of `react` is installed (`npm ls react`). |

## qa-plan

Opens one feature of your running app in Chrome with `playwright-cli`, reads the source of that page (at most 6 files), lists 3 to 8 scenarios, walks each one in the browser, and saves one plan. Groups are `Main flow`, `Validation` (one scenario for each validation message), and `Errors` (each server error message, and a server failure with status 500 that the spec will mock). It writes no spec and runs no test.

Use it as the first step of end-to-end coverage for a page.

| Prompt | What happens |
| --- | --- |
| `/qa-plan profile` | Opens `http://localhost:3000/profile` and saves `test/e2e/plan/profile.plan.md` |
| `/qa-plan profile. Base URL http://localhost:4000.` | Opens `http://localhost:4000/profile` |
| `/qa-plan profile. Route /settings/profile.` | Opens `http://localhost:3000/settings/profile`. The plan is still `profile.plan.md`. |
| `/qa-plan profile. Test account grace@example.org / profile-test-1.` | When the app redirects to its login page, logs in with that account, and starts every scenario with the login steps |
| `/qa-plan profile. Base URL http://localhost:4000. Route /settings/profile. Test account grace@example.org / profile-test-1.` | All three settings together |
| `/qa-plan profile. Side API.` | The plan's `**Side:**` line says `API` instead of `UI`: it plans no mocked server failure, and the spec gets no `page.route`. The skill takes `API` only when the prompt says it. |

- **Files it writes:** `test/e2e/plan/<feature>.plan.md`, the feature in lower case with hyphens.
- **How it ends:** `Verdict: DONE`, or `BLOCKED:`. Read the plan before you generate from it: the tests will check against it.
- The agent never invents an account or a record. A scenario that needs one and has none in the prompt or the source is named under `Not checked:`.

| Reply | What to do |
| --- | --- |
| `Which feature?` | Name the feature. |
| `BLOCKED: start the app with npm run dev, then ask again.` | Start the app in your own terminal. |
| `BLOCKED: the tests run only against an app on this machine.` | Use `localhost` or `127.0.0.1` in the base URL. |
| `BLOCKED: playwright-cli found no browser. Install Google Chrome, then ask again.` | Install Google Chrome. |
| `BLOCKED: playwright-cli is not installed. Add the dev dependency @playwright/cli, then ask again.` | Run `npm install -D @playwright/cli` yourself. |
| `BLOCKED: no page at http://localhost:3000/profile. Ask again with the route.` | Add `Route /...` to the prompt. |
| `BLOCKED: this page needs a signed-in user. Ask again with a test account.` | Add `Test account <email> / <password>` with a test account, never a real one. |
| `BLOCKED: the browser did not open.` | Read the first line of the output under `Not checked:`. If a browser is left open, run `npx --no-install playwright-cli close`. |

## qa-generate

Turns one plan into page classes and a spec, then runs the spec. Part 1 walks the plan in the browser and writes each locator into a page class right after the command that showed it. Part 2 writes the spec from the plan and the page classes, with no browser, and runs it. Each plan line becomes a comment and one line of code.

Use it after you have read and corrected the plan.

| Prompt | What happens |
| --- | --- |
| `/qa-generate test/e2e/plan/profile.plan.md` | Part 1, then Part 2 |
| `/qa-generate test/e2e/plan/profile.plan.md page classes only` | Part 1 only. Ends with `DONE`. |
| `/qa-generate test/e2e/plan/profile.plan.md spec only` | Part 2 only. Needs the page classes. |
| `/qa-generate test/e2e/plan/profile.plan.md. Base URL http://localhost:4000.` | Opens and runs against port 4000. The run command gets `BASE_URL=http://localhost:4000` in front. |

- **Files it writes:** one page class for each screen, such as `test/e2e/pages/profile-page.ts` and `test/e2e/pages/account-page.ts`, and the spec `test/e2e/profile.spec.ts`, named after the plan. An existing page class or spec is kept and added to.
- The route comes from the plan's `**Route:**` line, not from the prompt. To change it, edit the plan.
- **Command:** `RTK_DISABLED=1 npx playwright test test/e2e/profile.spec.ts`
- **How it ends:** `PASS`, `FAIL`, `DONE` (page classes only), or `BLOCKED:`. A plan line with no code in the spec makes it `FAIL`, even when the run passed. When the app contradicts the plan, the test stays failing, and `Bug:` names the plan line, the source `file:line`, the expected value, and the received value.

| Reply | What to do |
| --- | --- |
| A list of plans and `Which plan?` | Give one path from the list. |
| `BLOCKED: start the app with npm run dev, then ask again.` | Start the app. |
| `BLOCKED: no page at http://localhost:3000/profile. Correct the route in the plan.` | Edit the `**Route:**` line of the plan. |
| `BLOCKED: http://localhost:3000/profile redirects to another page. Correct the plan.` | Plan again with a test account, so that each scenario starts with the login steps. |
| `BLOCKED: a page class or field is missing. Ask again with page classes only.` | Send the prompt with `page classes only`, then `spec only`. |
| `BLOCKED: Playwright has no browser to start. Run npx playwright install chromium yourself, then ask again.` | Run that command. |
| `BLOCKED: Playwright has no browser to start. Install Google Chrome, or run npx playwright install chromium yourself, then ask again.` | Do one of the two. |
| `BLOCKED: the test command did not finish.` | Run the spec yourself and read the end of the output. |

The browser replies of `/qa-plan` (no browser, `playwright-cli` not installed, another host, the browser did not open) apply here too.

## qa-heal

Fixes one failing Playwright spec. It runs the spec, takes the first failure, reads its `error-context.md`, and sorts it into one class: `Locator`, `Timing`, `Data or setup`, or `Product bug`. It writes a cause that quotes the error and the proof, then makes the smallest fix, one line at a time, in at most three rounds. When it cannot find the cause, it pauses the test with `--debug=cli` and looks at the page with `playwright-cli attach`. It also takes a spec that fails with no failing test: a `.skip` or `.only` mark, or a spec that does not load.

Use it when a spec that used to pass fails.

| Prompt | What happens |
| --- | --- |
| `/qa-heal test/e2e/profile.spec.ts` | Runs and fixes that spec |
| `/qa-heal test/e2e/profile.spec.ts. Base URL http://localhost:4000.` | Runs against port 4000 |

- **Files it edits:** the spec, and the page classes it imports. Before it edits a page class it lists the other specs that use it and runs them after the fix. It never edits `playwright.config.ts`.
- **The plan decides.** A value that differs from the plan is a product bug. A value the plan already has is `Data or setup`, and the spec is corrected to the plan. If the page changed on purpose, edit the plan first.
- **How it ends:** `PASS`, `FAIL`, or `BLOCKED:`. A product bug gets `test.fixme(` with a `// product bug:` line above it. The run then ends with `PASS-WITH-FIXME`, and `Verdict:` is `PASS`. No skill removes the mark later: change it back yourself when the bug is fixed.

| Reply | What to do |
| --- | --- |
| `Which spec?` | Give the path of one spec. |
| `BLOCKED: start the app with npm run dev, then ask again.` | Start the app. |
| `BLOCKED: Playwright has no browser to start. ...` | Run `npx playwright install chromium`, or install Google Chrome. |
| `BLOCKED: the tests run only against an app on this machine.` | Use `localhost` or `127.0.0.1`. |
| `BLOCKED: the test command did not finish.` | Run the spec yourself and read the end of the output. |
| `Verdict: FAIL` with `Cause: not found` | The agent could not prove a cause. Read the failure yourself. |

## qa-rn-unit

Writes or fixes one Jest test in a React Native or Expo app, the way `/qa-unit` does for Vitest. It renders a component with React Native Testing Library, finds elements by role, label, or text, and presses them with `userEvent`. It writes no snapshot: the hook denies the snapshot matchers. It writes tests for components and plain functions, not yet for hooks or navigation.

In a web app it replies `This is not a React Native app. Use /qa-unit for a web app.`

| Prompt | What happens |
| --- | --- |
| `/qa-rn-unit src/components/ProfileForm.tsx` | Writes `test/unit/components/ProfileForm.test.ts` from the component template |
| `/qa-rn-unit src/screens/settings/ProfileScreen.tsx` | Writes `test/unit/screens/settings/ProfileScreen.test.ts` |
| `/qa-rn-unit lib/format.ts` | Writes `test/unit/lib/format.test.ts` from the function template |
| `/qa-rn-unit lib/format.ts UI` | Uses the component template for a `.ts` file |
| `/qa-rn-unit test/unit/components/ProfileForm.test.ts` | Fix job |
| `/qa-rn-unit test/unit/components/ProfileForm.test.ts. The error text changed to "Name unavailable" on purpose.` | Fix job that may change the expected value |

- **Files it writes:** one test file under `test/unit/`, also when the app keeps its tests in `__tests__/` folders. There is no `integration` switch.
- **Command:** `RTK_DISABLED=1 npx jest --config .cursor/qa/jest.config.cjs --ci test/unit/components/ProfileForm.test.ts`
- **How it ends:** `PASS`, `FAIL` (with `Bug:` for a product bug), or `BLOCKED:`.

| Reply after `BLOCKED:` | What to do |
| --- | --- |
| `the app has no Jest preset. For an Expo app add "jest": { "preset": "jest-expo" } to package.json, then run npm install.` | Run `npx expo install jest-expo`, add the key, run `npm install`. |
| `the Jest preset of the app is not installed. Run npm install.` | Run `npm install`. |
| `Jest does not transform the package PACKAGE_NAME. Add it to transformIgnorePatterns in the app's Jest config.` | Add the named package to `transformIgnorePatterns` yourself. |
| `@testing-library/react-native needs the dev dependency test-renderer. Install it.` | Install `test-renderer` in the line of your React version. |
| `Jest cannot resolve MODULE_NAME. Check moduleNameMapper in the app's Jest config and the installed packages.` | Check `moduleNameMapper` and `npm install`. |
| `the app and the test tools load two copies of React.` | Check `npm ls react`. |
| `the test command did not finish.` | Run the test yourself. |

A sentence that starts after `QA kit, .cursor/qa/jest.config.cjs:` is copied as it is: for example, the kit cannot read a Jest config in TypeScript or one with `projects`.

## qa-mobile-plan

A preview. Walks one feature of a mobile app on a device through the `maestro` MCP server, reads the source of that screen, and saves one plan with 3 to 8 scenarios. The plan names screens and elements the way a user sees them, such as `On the Profile screen, tap "Save profile".`, and holds no id. One plan serves Android and iOS. Only Android was run.

Use it as the first step of Maestro coverage. Start the device and install a real build of the app first: the agent never starts a device or installs the app.

| Prompt | What happens |
| --- | --- |
| `/qa-mobile-plan profile. This is Android. App id com.example.app` | Walks the feature on the connected Android device and saves `test/mobile/plan/profile.plan.md` |
| `/qa-mobile-plan profile. This is Android. App id com.example.app. Test account grace@example.org / profile-test-1.` | Logs in when the app shows a login form |
| `/qa-mobile-plan profile. This is iOS. App id com.example.app` | On a Mac with a booted simulator. Not run. On Linux or Windows it stops with `BLOCKED`. |

- **Files it writes:** `test/mobile/plan/<feature>.plan.md`. It also names the flow file of each scenario, such as `test/mobile/profile/01-new-name.flow.yaml`, and a subflow when the feature needs start steps.
- Maestro cannot mock the network, so a scenario that needs the server to fail is named under `Not checked:`.
- **How it ends:** `DONE` or `BLOCKED:`. `Not checked:` always names the platform it did not walk.

| Reply | What to do |
| --- | --- |
| `Which feature?`, `Which platform? Say "This is Android." or "This is iOS."`, or `Which app id?` | Add what is missing. The app id is required for a plan. |
| `BLOCKED: iOS needs a Mac with Xcode. This computer is not a Mac.` | Use Android, or a Mac. |
| `BLOCKED: turn on the maestro MCP server in Cursor settings, then ask again.` | Turn the server on. |
| `BLOCKED: no Android device is connected. Start an emulator or plug in a device, install the app on it, then ask again.` | Start an emulator and install the app. |
| `BLOCKED: the maestro MCP server cannot read the device. Turn the server off and on in Cursor settings, then ask again.` | Restart the server. This happens after every `maestro test` run. |
| `BLOCKED: the app com.example.app did not launch. Check that it is installed on the device.` | Check the app id and the install. |
| `BLOCKED: the app com.example.app is not on the screen of the device. Close what covers it, then ask again.` | Close the other app or dialog on the device. |
| `BLOCKED: this feature needs a signed-in user. Ask again with a test account.` | Add a test account. |
| `BLOCKED: no way found from the first screen to the feature. Ask again and say how to open it.` | Say in words how to reach the screen. No step of the skill reads such a hint on purpose, so it may still fail. |

## qa-mobile-generate

A preview. Turns one mobile plan into element files and Maestro flows, then runs them. Part 1 walks the plan on the device and writes one element file for each screen, with the id of each element, and the loader. Part 2 writes one flow for each scenario, with no device call, checks each file with `maestro check-syntax`, and runs the feature's folder with `maestro test`.

| Prompt | What happens |
| --- | --- |
| `/qa-mobile-generate test/mobile/plan/profile.plan.md. This is Android. App id com.example.app` | Part 1, then Part 2 |
| `/qa-mobile-generate test/mobile/plan/profile.plan.md. This is Android.` | Takes the app id from the plan's `**App id (Android):**` line |
| `/qa-mobile-generate test/mobile/plan/profile.plan.md. This is Android. element files only` | Part 1 only. Needs the `maestro` server. Ends with `DONE`. |
| `/qa-mobile-generate test/mobile/plan/profile.plan.md. This is Android. flows only` | Part 2 only. Needs the device and the element files, not the server. |
| `/qa-mobile-generate test/mobile/plan/profile.plan.md. This is iOS. App id com.example.app` | Writes the iOS element files and an iOS block in the loader, and keeps the flows. Not run. |

- **Files it writes:** `test/mobile/elements/android/profile.js` (or `ios/`), `test/mobile/elements/load.yaml`, one flow for each scenario such as `test/mobile/profile/01-new-name.flow.yaml`, a subflow such as `test/mobile/subflows/open-profile.yaml` when the plan has start steps, and `test/mobile/config.yaml`. An existing flow is kept: delete it to have it written again.
- **Command:** `RTK_DISABLED=1 maestro test --platform android --exclude-tags=fixme -e APP_ID=com.example.app test/mobile/profile`
- **How it ends:** `PASS`, `FAIL`, `DONE` (element files only), or `BLOCKED:`. `Result:` is Maestro's summary line, such as `2/2 Flows Passed in 48s`. A scenario with no flow makes it `FAIL`. When the app does not do what the plan says, the flow stays failing: use `/qa-mobile-heal` next.
- A full job ends with `maestro test`, which ends the `maestro` MCP session. Turn the server off and on before the next plan or heal job.

| Reply after `BLOCKED:` | What to do |
| --- | --- |
| The device and server replies of `/qa-mobile-plan` | The same as there. |
| `an element name is missing. Ask again with element files only.` | Send the prompt with `element files only`, then `flows only`. |
| `the maestro command is not installed, or not on the PATH.` | Install the Maestro CLI and check your `PATH`. |
| `the loader names an element file of the other platform that does not exist.` | Correct the other platform's block in `load.yaml` yourself. |
| `the app com.example.app is not installed on the device. Install it, then ask again.` | Install the app. |
| `the test command did not finish.` | Run the folder yourself and read the end of the output. |

## qa-mobile-heal

A preview. Fixes one failing Maestro flow. It runs the one flow through the `maestro` MCP server, never with `maestro test`, reads the screen where it stops, and sorts the failure into `Selector`, `Timing`, `Data or setup`, or `Product bug`. A wrong id is fixed once, in the element file of that platform, and no flow is edited. It stops after three rounds.

| Prompt | What happens |
| --- | --- |
| `/qa-mobile-heal test/mobile/profile/02-taken-name.flow.yaml. This is Android. App id com.example.app` | Runs and fixes that flow |
| `/qa-mobile-heal test/mobile/profile/02-taken-name.flow.yaml. This is Android.` | Takes the app id from the plan named on line 1 of the flow |

- **Files it edits:** the flow, the subflow it runs, the loader, and the element files of your platform.
- **How it ends:** `PASS`, `FAIL`, or `BLOCKED:`. A product bug gets the tag `fixme` with a `# product bug:` comment, and `After: marked fixme` with `Verdict: PASS`. A flow that already has the tag is not run. A folder run with `--exclude-tags=fixme` leaves a marked flow out. Remove the tag yourself when the bug is fixed.

| Reply | What to do |
| --- | --- |
| A list of folders and `Which flow?` | Give the path of one flow. |
| The device and server `BLOCKED` replies of `/qa-mobile-plan` | The same as there. |
| `BLOCKED: the app com.example.app is not installed on the device. Install it, then ask again.` | Install the app. |
| `BLOCKED: the element file test/mobile/elements/android/profile.js does not exist. Ask /qa-mobile-generate with element files only.` | Run that job first. |
| `BLOCKED: another app covers the app on the device. Close it, then ask again.` | Close it on the device. A Google account screen can appear on a new Play emulator. |
| `BLOCKED: the run did not finish.` | Read the reply under `Not checked:`. |

## security-audit

Cloudflare's security audit skill, copied with only its frontmatter changed. It is not a test job: it writes no test and prints no `QA-VERDICT:` line. Subagents look for vulnerabilities that cross a real trust boundary, other subagents try to disprove each finding, and it writes a report of the ones that hold.

Use it with a high-tier model such as Claude Opus 5. It was not run on Composer 2.5 or Gemini 3.8 Flash. One quick run of a small app took about 86 minutes.

| Prompt | What happens |
| --- | --- |
| `/security-audit Run a quick audit of this codebase (quick profile), with a budget of 20 agent invocations.` | A full run of the `quick` profile, at most 20 subagent calls |
| `/security-audit Audit app/api/ only, standard profile, budget 20.` | A full run limited to one folder |
| `/security-audit Is the PUT handler in app/api/profile/route.ts safe?` | A question: guidance mode, with no run folder |

- **Files it writes:** a full run writes `REPORT.md`, `FINDINGS-DETAIL.md`, `NEEDS-VALIDATION.md`, and four more files to `~/security-audit-skill/<repo-name>/run-<N>/`, outside your project.
- **How it ends:** a report, not a verdict. A run that runs out of budget ends as `incomplete`, and the report says why. If the request could mean a question or a full audit, it asks one question first.
- It runs none of your code, so a finding that needs a run stays in `NEEDS-VALIDATION.md` with the check to run. Run that check yourself, in a sandbox.

[docs/security-audit.md](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/security-audit.md) has the detail.

## playwright-cli

`/playwright-cli` is the manual of the `playwright-cli` tool, copied from the `@playwright/cli` package. It is not a job: use it to look a command up, as in `/playwright-cli what does find print`. No job reads it, and the hook denies many of its commands.
