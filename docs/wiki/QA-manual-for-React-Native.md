# QA manual for React Native

This manual is for a QA engineer, or a developer doing QA, in a React Native or Expo app that has the kit installed. It says which test to ask for, how to run each everyday job with the agent, and how to check what the agent wrote.

In a React Native app the kit gives Cursor's agent two kinds of test:

- **Jest unit tests** with React Native Testing Library, through `/qa-rn-unit`. Every Jest run ends with one `QA-VERDICT:` line, and the agent copies it.
- **Maestro flows** on an Android device, through `/qa-mobile-plan`, `/qa-mobile-generate`, and `/qa-mobile-heal`. These three are a preview. Maestro prints its own summary line, such as `2/2 Flows Passed in 46s`, and the agent copies that.

The agent reads your application source and never edits it. When a test fails because the product is wrong, it reports the bug and leaves the test as it is.

New to the kit? Start with [[Installation]] and [[Getting started]]. [[Skills and example prompts]] lists every prompt each skill takes, and [[Mobile testing with Maestro]] has the detail of the flows.

## What the kit covers

| You want | The kit does it | Skill |
| --- | --- | --- |
| A unit test for a component, such as `src/components/ProfileForm.tsx` | Yes. 2 to 6 tests: what the screen shows, what each button or field does, each message | `/qa-rn-unit` |
| A unit test for plain functions, such as `lib/format.ts` | Yes. 2 to 6 tests | `/qa-rn-unit` |
| A fix for one failing Jest file | Yes. At most three rounds of one edit and one run | `/qa-rn-unit` with the test file |
| A plan of Maestro flows for one feature, walked on a device | Yes, as a preview. 3 to 8 scenarios | `/qa-mobile-plan` |
| Element files and Maestro flows from a plan, then a run | Yes, as a preview | `/qa-mobile-generate` |
| A fix for one failing flow | Yes, as a preview. At most three rounds | `/qa-mobile-heal` |
| A product bug made visible | Yes. `Bug:` in a Jest reply, or the tag `fixme` on a flow | All of them |

| You want | The kit does not do it | What you do by hand |
| --- | --- | --- |
| A test of a custom hook on its own, or of navigation between screens in Jest | `/qa-rn-unit` writes tests for components and plain functions only, not yet for hooks or navigation | Test the hook through a component that uses it, or write the test yourself. Cover navigation with a Maestro flow |
| A Jest integration test | `/qa-rn-unit` writes under `test/unit/` only. The kit's Jest config also runs `test/integration/` | Write it yourself in `test/integration/` |
| Snapshot tests | The hook denies snapshot matchers to the agent | None from the kit. A snapshot passes for whatever the code renders once it is written |
| Jest coverage | The kit's Jest config turns coverage off, and the hook denies `--coverage` to the agent | Run coverage with your own Jest config and command |
| iOS | Nothing was run on iOS. It is left for later | This manual covers Android only |
| A flow where the server fails | Maestro cannot mock the network | Cover the error with a Jest test and a `fetch` mock |
| Starting a device, installing the app | The agent never boots a device or installs an app | Start the emulator and install a build yourself |
| Maestro flows in CI | The kit ships no workflow for your app | See [Maestro in CI](#maestro-in-ci) |
| A bug ticket | No skill files an issue. Jira is planned for v0.5.0 | File it yourself |
| Installing a package | The hook denies `npm install` to the agent | Install it yourself |

## Where tests go

The hook holds these names for every new file under `test/`. A Jest test ends in `.test.ts`, never `.tsx`, and has no JSX. It goes under `test/unit/` also when your app keeps its own tests in `__tests__/` folders. [[Layout and files]] lists every path.

| File | Path | Example |
| --- | --- | --- |
| Jest unit test | `test/unit/` plus the source path, without a leading `src/` or `app/` | `test/unit/components/ProfileForm.test.ts`, `test/unit/lib/format.test.ts` |
| Jest setup, optional | `test/jest.setup.ts` | Runs after your app's own setup files |
| Maestro plan | `test/mobile/plan/<feature>.plan.md` | `test/mobile/plan/profile.plan.md` |
| Flow, one scenario | `test/mobile/<feature>/<nn>-<scenario>.flow.yaml` | `test/mobile/profile/02-taken-name.flow.yaml` |
| Element file, one screen on one platform | `test/mobile/elements/android/<screen>.js` | `test/mobile/elements/android/profile.js` |
| Loader | `test/mobile/elements/load.yaml` | Runs the element files of the platform |
| Subflow | `test/mobile/subflows/<name>.yaml` | `test/mobile/subflows/open-profile.yaml` |
| Suite file | `test/mobile/config.yaml` | Settings for a run of all of `test/mobile` |

A flow holds no id. It names an element as `${output.profile.saveProfile}`, and the element file of the screen gives that name its id:

```js
// Profile screen, Android.
output.profile = {
  displayName: 'profile-name',
  saveProfile: 'profile-save',
  changePhotoText: 'Change photo',
}
```

The id is the React Native `testID`. A name that ends in `Text` is an element with no id, found by its whole text. The texts a check expects stay in the flow.

## Which layer to pick

| You want to check | Layer | Prompt |
| --- | --- | --- |
| What a pure function returns, each branch, a limit and the value one past it | Jest | `/qa-rn-unit lib/format.ts` |
| What a screen shows, its validation messages, what a press does, with `fetch` and the router mocked | Jest | `/qa-rn-unit src/components/ProfileForm.tsx` |
| The message the screen shows when the server fails | Jest, with the `fetch` mock | `/qa-rn-unit src/components/ProfileForm.tsx` |
| The real app on a device: typing, the keyboard, a flow across screens, the real server | Maestro | `/qa-mobile-plan profile. This is Android. App id com.example.app` |
| A message the server sends back, such as a taken name | Maestro, when the server can produce it, otherwise Jest | Either |

Put each check in the lowest layer that can see it. A Jest test is fast and names the line that broke. A flow takes 15 to 60 seconds on an emulator, needs a device and a build, and clears the app's data each time.

## Setup for a React Native app

Install the kit as [[Installation]] says. The installer finds a React Native app when `package.json` lists `expo` or `react-native`. It then leaves out the web files, adds `@testing-library/react-native`, `@types/jest`, `jest`, and `test-renderer`, and adds the script `test:rn-unit`. An Expo app that also builds for the web can take the web files with `--app web`.

### Jest

- **A preset.** Jest needs your app's preset, and the installer does not add it. For an Expo app:

  ```bash
  npx expo install jest-expo
  ```

  Then add `"jest": { "preset": "jest-expo" }` to `package.json`. Without a Jest config, `/qa-rn-unit` replies `BLOCKED: the app has no Jest preset. For an Expo app add "jest": { "preset": "jest-expo" } to package.json, then run npm install.`
- **Your Jest config.** The kit runs Jest with `.cursor/qa/jest.config.cjs`, which loads your config and adds the kit's test folders and reporter. It reads `jest.config.js`, `.cjs`, `.mjs`, `.json`, or `"jest"` in `package.json`. It stops with a message for `jest.config.ts` and for a config with `projects`.
- **A package Jest cannot parse.** A test that stops with `SyntaxError` or `Cannot use import statement outside a module` in a file under `node_modules/` makes `/qa-rn-unit` stop with `BLOCKED` and name the package. Add it to `transformIgnorePatterns` in your Jest config. The agent never edits the config.
- **TypeScript 6 or later.** Add `"types": ["jest"]` to `compilerOptions` in `tsconfig.json`, or `tsc` does not know `describe`, `it`, and `expect` in a test. Jest runs the tests either way.
- **`test-renderer`.** It must match your React version: `~1.2.0` for React 19.2. The installer picks it.
- **Tried on.** An Expo SDK 58 app. A bare React Native app without Expo was not tried.

### Maestro

- **Tools.** The [Maestro CLI](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli) 2.6.0 or later, Java 17 or later, and `adb` on your `PATH`.
- **The device.** Start an Android emulator, or connect a device with USB debugging. The hook denies `adb`, `emulator`, and `maestro start-device` to the agent.
- **The app.** Build it and install it on the device yourself. Install a real build, not Expo Go: the flows launch the app under its own id, such as `com.example.app`.
- **The MCP server.** Turn on the `maestro` MCP server in Cursor settings for plan, heal, and the first half of generate. Keep it off when you do no mobile work.
- **App data.** Every flow clears the app's data on the device, and Maestro installs two helper apps there. Do not use a device whose app data you need.
- **Analytics.** Maestro sends usage analytics unless `MAESTRO_CLI_NO_ANALYTICS` is set in your environment.
- **Platform.** Name the platform in every mobile prompt: `This is Android.` iOS has not been run. On Linux the skills stop with `BLOCKED: iOS needs a Mac with Xcode. This computer is not a Mac.`

### The mocks `/qa-rn-unit` knows

`/qa-rn-unit` adds a mock only when the source file needs it, and mocks nothing else. Child components, helper modules, and the file under test stay real. Every mock return value is set inside the `it`.

| The source file | The test gets |
| --- | --- |
| imports `@react-navigation/native` | `useNavigation` mocked, with a `navigate` spy |
| imports `expo-router` | `useRouter` and `useLocalSearchParams` mocked, with a `push` spy |
| imports `@react-native-async-storage/async-storage` | `getItem`, `setItem`, and `removeItem` mocked |
| calls `fetch(` | `globalThis.fetch` replaced by a mock that always answers |
| imports a module that reads a database or calls a server, such as `axios`, a `repository.ts`, or a local `api.ts` | That module mocked, one `jest.fn()` for each function the source imports |
| calls `setTimeout(` or `setInterval(` | Fake timers. `findBy` and `userEvent` move the clock by themselves |
| uses a native module that has no code in Jest | That package mocked, when the error names it |

The test finds elements the way a user does: by role and name, then label, then placeholder, then text. It uses `getByTestId` only when nothing else names the element. It drives them with `userEvent`, and waits with `findBy`.

## Workflows

Each workflow is a list of steps with the exact prompts. Ask for one job in one prompt, and pick the skill from the `/` menu.

### A new feature to cover

The example is a "Save profile" form in an app installed as `com.example.app`.

1. Cover the plain functions:

   ```text
   /qa-rn-unit lib/format.ts
   ```

2. Cover the component:

   ```text
   /qa-rn-unit src/components/ProfileForm.tsx
   ```

3. Start the emulator, install the app, and turn on the `maestro` MCP server.
4. Plan the flows. Add a test account when the feature needs a signed-in user:

   ```text
   /qa-mobile-plan profile. This is Android. App id com.example.app
   ```

5. Read `test/mobile/plan/profile.plan.md`. Each scenario has a `**Flow:**` line, steps such as `On the Profile screen, tap "Save profile".`, and Expect lines. The plan holds no id. Delete a scenario you do not want.
6. Generate the element files and flows, and run them:

   ```text
   /qa-mobile-generate test/mobile/plan/profile.plan.md. This is Android. App id com.example.app
   ```

7. The full generate ends with `maestro test`, which leaves the `maestro` MCP server unable to reach the device. Turn the server off and on in Cursor settings before the next plan, heal, or generate.
8. Check each reply with the [review checklist](#review-checklist), then run the tests yourself. See [Run the tests yourself](#run-the-tests-yourself).
9. Commit the files under `test/`.

### A bug report to reproduce as a failing test

The write jobs test what the app does now. `/qa-rn-unit` copies texts from the source, and `/qa-mobile-plan` copies them from the device. Neither takes an expected value from your prompt. So write the expected behaviour down first, in the plan.

The example report: "When the name is taken, the profile screen says `Name unavailable`. It should say `That name is taken`."

1. Open `test/mobile/plan/profile.plan.md`. Add a scenario in the plan's own sentence forms, with the text from the report and not from the app. Give it a `**Flow:**` line with the next free number. When the plan has start steps, step 2 is `Do the start steps.`

   ```markdown
   ### 2.1 A taken name shows an error

   **Flow:** `test/mobile/profile/02-taken-name.flow.yaml`

   **Steps:**

   1. Launch the app with cleared state.
   2. On the Profile screen, type `Grace Hopper` into "Display name".
   3. On the Profile screen, tap "Save profile".

   **Expect:**

   - On the Profile screen, "That name is taken" is visible.
   ```

   The server must answer that the name is taken. Name the record on the plan's `**Data:**` line.
2. Ask for the flow:

   ```text
   /qa-mobile-generate test/mobile/plan/profile.plan.md flows only. This is Android. App id com.example.app
   ```

   Generate keeps the flows that exist and writes the missing ones. If an element has no name yet, the reply is `BLOCKED: an element name is missing. Ask again with element files only.` Then ask with `element files only` first.
3. The run fails, and the reply says `Verdict: FAIL` with the `[Failed]` line under `Failed:`. Generate leaves a flow that fails because of the app as it is. That is the reproduction.
4. Go on with [The agent reports a product bug](#the-agent-reports-a-product-bug).

At the Jest layer, write the failing `it` yourself in `test/unit/components/ProfileForm.test.ts` and run it yourself:

```bash
npm run test:rn-unit -- test/unit/components/ProfileForm.test.ts
```

Do not ask `/qa-rn-unit` to fix that file. Its table for a failed assertion can change an expected value that is only in that test, when the received value is in another test or another source file. It treats the failure as a product bug when the expected value is also in a plan in `test/mobile/plan/`, in another test, or in another source file.

### A test that fails in CI

No skill reads CI logs. The agent runs the test on your machine and works from that run.

1. In the CI log, find the failing file, the test title, and the error.
2. Run the same file on your machine:

   ```bash
   npm run test:rn-unit -- test/unit/components/ProfileForm.test.ts
   maestro test --platform android -e APP_ID=com.example.app test/mobile/profile/02-taken-name.flow.yaml
   ```

3. It fails on your machine too: ask the agent to fix it.

   ```text
   /qa-rn-unit test/unit/components/ProfileForm.test.ts
   /qa-mobile-heal test/mobile/profile/02-taken-name.flow.yaml. This is Android. App id com.example.app
   ```

4. It passes on your machine: the agent has nothing to fix. Look for the difference yourself: the build, the emulator image, the data on the server, and the time a step takes. A test that passed only on a retry makes the Jest verdict line `FAIL`.

### A flaky or broken flow after a UI change

1. Run the flow and see it fail:

   ```bash
   maestro test --platform android -e APP_ID=com.example.app test/mobile/profile/02-taken-name.flow.yaml
   ```

2. Was a text on the screen changed on purpose? Then correct the plan first. `/qa-mobile-heal` reads the plan: when the plan still has the old text, it marks the flow as a product bug.
3. Make sure the `maestro` MCP server can reach the device. After a `maestro test` run, turn it off and on in Cursor settings.
4. Ask for the fix:

   ```text
   /qa-mobile-heal test/mobile/profile/02-taken-name.flow.yaml. This is Android. App id com.example.app
   ```

5. Read `Class:` in the reply.

   | Class | What the agent did |
   | --- | --- |
   | `Selector` | Changed one id in `test/mobile/elements/android/profile.js` to the id the screen shows now. No flow changed |
   | `Timing` | Added an `extendedWaitUntil` check with a 60-second limit above the failing line, and ran the flow twice |
   | `Data or setup` | Tapped away a system dialog, handled the keyboard, corrected a loader line or an element file, or relaxed a text that changes from run to run, such as `text: "Saved at.*"` |
   | `Product bug` | Tagged the flow `fixme` under a `# product bug:` comment. See the next workflow |

6. Heal runs the one flow. An element file is shared, so `Not checked:` names every other flow that uses the name it changed. Run those yourself.
7. `Verdict: FAIL` after three rounds means the agent stopped. Read `Cause:` and take over.

Two known causes of a flaky flow on an emulator: a Google account screen that covers the app a few minutes after a fresh Google Play emulator boots, and the first text typed after boot with its first letter doubled. Run the flow again.

### The agent reports a product bug

| Skill | The reply | The test |
| --- | --- | --- |
| `/qa-rn-unit` | `Verdict: FAIL`, and `Bug:` names the source `file:line`, the expected value, and the received value | Left failing, unchanged |
| `/qa-mobile-generate` | `Verdict: FAIL`, and the `[Failed]` line under `Failed:` | Left failing, untagged |
| `/qa-mobile-heal` | `Class: Product bug`, `Fix:` names the tag and the source line, `After: marked fixme`, and `Verdict: PASS` | Tagged `fixme` |

The mark from `/qa-mobile-heal` is two lines at the end of `tags:`:

```yaml
appId: ${APP_ID}
name: "A taken name shows an error"
tags:
  - profile
  # product bug: src/components/ProfileForm.tsx:9 expected "That name is taken", got "Name unavailable"
  - fixme
---
```

1. Open the source line the reply names, and check that the expected value is the intended one: in the plan, the design, or the ticket. `Not checked: which value is intended` means the agent could not tell.
2. File the bug in your tracker. Copy the `Bug:` or `# product bug:` line, the test file, the command, and the result line. The kit files nothing.
3. Decide what the test does until the fix:
   - **A flow.** Ask `/qa-mobile-heal` for the mark, as in step 4 of the previous workflow. A folder run with `--exclude-tags=fixme`, or a run of all of `test/mobile` with `config.yaml`, leaves the flow out. A run of that one file still runs it, and it fails.
   - **A Jest test.** The kit has no mark for it. A skipped test makes the verdict line `FAIL` too. The test stays failing until the product is fixed.
4. When the fix is merged, delete the two lines, the comment and `- fixme`, yourself. Run the flow.

### A refactor where tests must stay green

The hook denies every Cursor agent in the folder an edit to application source, so the refactor itself is yours.

1. Run everything before you start. Jest must end with `QA-VERDICT: PASS`, and Maestro with `Flows Passed`:

   ```bash
   npm run test:rn-unit
   maestro test --platform android -e APP_ID=com.example.app test/mobile
   ```

2. Make the refactor. Build the app and install it on the device again.
3. Run both again.
4. For each failure, decide what changed:
   - **The behaviour changed.** The refactor broke something. Fix the source.
   - **A source file moved or was renamed.** Move the test file to mirror the new path, for example with `git mv`, then ask `/qa-rn-unit test/unit/lib/format.test.ts` to fix its import.
   - **A `testID` changed.** Ask `/qa-mobile-heal` with the flow. It changes the id once, in the element file.
5. Do not tell the agent that the behaviour changed. That one sentence lets `/qa-rn-unit` change an expected value.

### Reviewing a pull request the agent's tests are in

1. List the changed files:

   ```bash
   gh pr diff 12 --name-only
   ```

2. Expect files under `test/` only. The mobile skills write only under `test/mobile/`, and a job told `This is Android.` never writes under `test/mobile/elements/ios/`.
3. Go through the [review checklist](#review-checklist).
4. Check out the branch, install the build on the device, and run the tests yourself. The result lines must match the replies.

## Review checklist

Check every reply before you keep its files.

- [ ] **The result line is copied.** For Jest, `After:` is a `QA-VERDICT:` line, word for word, and `Verdict: PASS` stands only over a line that says `PASS`. For Maestro, `Result:` is Maestro's summary line, and `Verdict: PASS` needs a flow for every scenario of the plan. Run the command yourself and get the same line.
- [ ] **No expectation was weakened.** No `toBeTruthy()`, no `expect.anything()`, no removed check, no snapshot. In a flow: no `optional: true`, `retry`, or `repeat`, and no text such as `".*"` that matches anything. The one allowed pattern keeps the start of a text that changes from run to run, such as `"Saved at.*"`.
- [ ] **No hidden failure.** No `.skip`, `.only`, `.todo`, `xit`, or `fit` in a Jest test.
- [ ] **`fixme` only for a filed bug.** Each tag sits under a `# product bug:` line that names a source file and line, and has a ticket.
- [ ] **The diff is small.** A fix changes the lines that caused the failure and nothing else. A selector fix changes one line of one element file and no flow.
- [ ] **No id in a flow.** A flow names elements as `${output.<screen>.<name>}`, and its first command is `- runFlow: ../elements/load.yaml`.
- [ ] **Element files hold one object.** Each holds the `output.<screen> = { ... }` object and nothing else. The hook does not check the JavaScript in an element file, and Maestro runs it on your machine.
- [ ] **`runScript` only in the loader.** And each loader line names a file that exists.
- [ ] **Mocks are the ones the source needs.** Each return value is set inside the `it`.
- [ ] **Texts match the app.** Spot-check the plan against the screen. Read `Texts from source, not seen on the device:` and `Elements found by text:` when they are not `none`.
- [ ] **`Not checked:` is read.** It always names the platform the job did not run on, and for heal, the other flows it did not run.

To search the test folder for the marks yourself:

```bash
grep -rnE '\.(only|skip|todo)\(|\bx(it|test|describe)\(|\bf(it|describe)\(|toMatch(Inline)?Snapshot|optional: true' test/
```

## Run the tests yourself

### Jest

```bash
npm run test:rn-unit
npm run test:rn-unit -- test/unit/components/ProfileForm.test.ts
```

The script runs `jest --config .cursor/qa/jest.config.cjs --ci`. Keep `--ci`: without it Jest writes a new snapshot for a snapshot matcher. The run ends with the `QA-VERDICT:` line. Jest exits with 0 for a skipped test, a `todo`, a stray `.only`, and a pass on a retry, and the line says `FAIL` for each.

### Maestro

One feature, leaving out flows tagged `fixme`:

```bash
maestro test --platform android --exclude-tags=fixme -e APP_ID=com.example.app test/mobile/profile
```

All features, with the settings in `test/mobile/config.yaml`, which also leaves out `fixme`:

```bash
maestro test --platform android -e APP_ID=com.example.app test/mobile
```

A syntax check of one flow:

```bash
maestro check-syntax test/mobile/profile/01-new-name.flow.yaml
```

`maestro check-syntax` does not read element files, so `OK` does not mean the names are right. A run prints `[Passed]` or `[Failed]` for each flow and a summary line. The exit code is 0 only when every flow passed. A `[Failed]` line with no error after the time means an element file did not load. Maestro writes logs and a screenshot of each failed step to `~/.maestro/tests/`, outside the project.

After a run from your terminal, turn the `maestro` MCP server off and on before the next agent job.

### Jest in CI

The kit ships no CI workflow for your app. Add the steps to your pipeline:

```bash
npm ci
npm run test:rn-unit
```

Commit `.cursor/`: the Jest config and the verdict reporter live in `.cursor/qa/`. CI reads the exit code, and the verdict line is stricter. To fail the job on the line as well, keep the output and check it. This is not part of the kit and was not run by its maintainers:

```bash
npm run test:rn-unit 2>&1 | tee jest.log
grep '^QA-VERDICT:' jest.log | tail -n 1 | grep -q '^QA-VERDICT: PASS'
```

### Maestro in CI

A CI job for flows must build the app, start an Android emulator, install the build, and run `maestro test`. The kit's own [`.github/workflows/android.yml`](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/.github/workflows/android.yml) does that for the kit's example on a Linux runner, and shows one way. An emulator job takes many minutes.

## Choose a model for each job

The kit was tested in Cursor's agent on three tiers. The table shows what was run for the React Native jobs. [[Supported models and evaluation]] has every round.

| Job | Low: Gemini 3.8 Flash | Mid: Composer 2.5 | High: Claude Opus 5 |
| --- | --- | --- | --- |
| `/qa-rn-unit`, a component or plain functions | Passed, one run each | Passed, two runs each | Passed, one run each |
| `/qa-rn-unit`, a fix or a product bug | Not run | Passed, two runs each | Not run |
| `/qa-mobile-plan` | Failed, one run | Passed, one run | Passed, one run |
| `/qa-mobile-generate` | Passed, one run | Passed, one run | Failed in the reply form only, one run |
| `/qa-mobile-heal` | Passed, one run | Passed, one run | Passed, one run |

- **Composer 2.5** passed every React Native case and every mobile job it ran. It is a sound default.
- **Gemini 3.8 Flash's plan** merged two scenarios and put checks after the step that leaves the screen. The plan skill was changed after that run, and the change was not run again on a device.
- **The mobile jobs ran once on each model.** Five skill changes came after those runs and were not run on a device. Read every mobile reply with the checklist.

With a small model:

- Pick the skill from the `/` menu, and keep each prompt to one file, one feature, or one plan.
- Ask for mobile generate in two prompts. The first needs the device and the `maestro` server, and the second only the device:

  ```text
  /qa-mobile-generate test/mobile/plan/profile.plan.md element files only. This is Android. App id com.example.app
  /qa-mobile-generate test/mobile/plan/profile.plan.md flows only. This is Android. App id com.example.app
  ```

- When the reply says `BLOCKED`, do what the line says and ask again.

## Limits

- **Maestro is a preview.** On one Android emulator each mobile skill ran once on each of three models, and 7 of the 9 jobs met every check. The mobile skills are long: 2,500 to 4,200 words each.
- **Android only.** Nothing was run on iOS. Physical devices, system permission dialogs, and a native Android app were not run either.
- **No network mocks in flows.** A scenario that needs the server to fail is named under `Not checked:` and gets no flow.
- **One device at a time.** `maestro test` and the `maestro` MCP server cannot share a device.
- **Generate keeps flows.** To have a flow written again, delete it first.
- **Jest.** Components and plain functions only. A bare React Native app without Expo was not tried.
- **Systems.** Everything was run on Linux. Windows is not expected to work: it cannot start the hook.
- **The hook is a guardrail, not a sandbox.** It does not check the code in an element file. See [[The hook]].

[docs/mobile.md](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/mobile.md) lists every known limit and what was run. When a job stops or a command is denied, see [[Troubleshooting]].
