# Mobile testing with Maestro

Three skills plan, write, and fix [Maestro](https://maestro.dev) flows for an Android or iOS app: `/qa-mobile-plan`, `/qa-mobile-generate`, and `/qa-mobile-heal`. Treat them as a preview. Only Android was run, and no model has run the skills. [What was run](#what-was-run) says what stands behind them, and [Open points](#open-points) lists what is known to be missing.

## What you need

- The [Maestro CLI](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli), 2.6.0 or later, and Java 17 or later.
- Android: `adb` on your `PATH`, and a running emulator or a device with USB debugging.
- iOS: a Mac with Xcode and a booted Simulator. Physical iOS devices are not supported. This line is from Maestro's documentation and was not run.

You start the device and install the app. The agent never boots a device, never installs an app, and never switches to the other platform. Install a real build of the app, not Expo Go: the flows launch the app under its own id.

For plan, heal, and the first part of generate, turn on the `maestro` MCP server in Cursor settings, and keep it off when you do no mobile work.

Every flow starts by clearing the app's data on the device, and Maestro installs two helper apps of its own there. Do not point the skills at a device whose app data you need.

A React Native `testID` is the id that the agent reads from the device and writes into an element file. On Android it shows on the device exactly as it is written in the source.

## Start a job

Name the platform in every prompt. Plan needs the app id as well. Generate and heal take it from the plan when the prompt has none. The prompts below are the skills' own examples, for an app with a profile form.

| Job | Prompt | What the agent does |
| --- | --- | --- |
| Plan | `/qa-mobile-plan profile. This is Android. App id com.example.app` | Walks one feature on the device, reads the source of that screen, and saves `test/mobile/plan/profile.plan.md` with 3 to 8 scenarios. A plan line names the screen and the element the way a user sees them: `On the Profile screen, tap "Save profile".` The plan holds no id. |
| Generate | `/qa-mobile-generate test/mobile/plan/profile.plan.md. This is Android. App id com.example.app` | First walks the plan on the device and writes one element file for each screen, with the id of each element, and the loader. Then writes one flow file for each scenario in `test/mobile/profile/` and runs that folder with `maestro test`. |
| Heal | `/qa-mobile-heal test/mobile/profile/02-taken-name.flow.yaml. This is Android. App id com.example.app` | Runs one failing flow, reads the screen where it stops, names the cause, and makes the smallest fix, in at most three rounds. A wrong id is corrected once, in the element file of that platform, and no flow is edited. |

- Add `element files only` or `flows only` to the generate prompt to do one half. The first half needs the device and the `maestro` server. It runs no flow, and its verdict is `DONE` unless it was blocked. The second half needs the device and the element files, and not the server.
- A product bug is not hidden. `/qa-mobile-generate` leaves the flow failing and replies `FAIL`. `/qa-mobile-heal` gives the flow the tag `fixme` and a `# product bug:` comment that names the source line.
- The reply form of each skill ends with `Verdict:` and `Not checked:`. `Not checked:` always names the platform that the job did not run on.

## Layout

The flows follow Maestro's [page object model recipe](https://docs.maestro.dev/examples/recipes/implementing-the-page-object-model-pom). Selectors live in element files, and a flow names an element instead of holding its id. This is the mobile form of the page classes in the web skills.

```text
test/mobile/plan/<feature>.plan.md                Plans, shared by both platforms
test/mobile/<feature>/<nn>-<scenario>.flow.yaml   Flows, one scenario per file, shared by both platforms
test/mobile/elements/android/<screen>.js          Names and selectors of one screen, Android only
test/mobile/elements/ios/<screen>.js              Names and selectors of one screen, iOS only
test/mobile/elements/load.yaml                    Loader: runs the element files of the current platform
test/mobile/subflows/<name>.yaml                  Start steps shared by the flows of one plan
test/mobile/config.yaml                           Settings for a run of the whole folder
```

A flow names an element as `${output.<screen>.<name>}`, for example `${output.profile.saveProfile}`.

Flows are shared and element files are split because the selectors are where the design expects the platforms to differ. The steps and the expected texts of a scenario are written once. The selectors are read from a device, one platform at a time. A job that is told `This is Android.` works only in `test/mobile/elements/android/`. It never reads, creates, edits, or guesses a file in `test/mobile/elements/ios/`. That matters because only Android has been run: nothing for iOS is written from an Android screen.

## Element files

An element file gives each element of one screen a name. This is `test/mobile/elements/android/profile.js`:

```js
// Profile screen, Android.
output.profile = {
  displayName: 'profile-name',
  saveProfile: 'profile-save',
  changePhotoText: 'Change photo',
}
```

The loader, `test/mobile/elements/load.yaml`, runs the element files of the platform that the flow runs on:

```yaml
appId: ${APP_ID}
---
- runFlow:
    when:
      platform: Android
    commands:
      - runScript: android/profile.js
```

A flow starts with the loader and then uses the names:

```yaml
- runFlow: ../elements/load.yaml
- launchApp:
    clearState: true
    clearKeychain: true
- tapOn:
    id: ${output.profile.displayName}
- inputText: "Grace Hopper"
- hideKeyboard
- tapOn:
    id: ${output.profile.saveProfile}
- assertVisible: "Profile saved"
```

- A name comes from the words of the plan: "Save profile" on the Profile screen is `saveProfile` in `profile.js`. A job on the second platform is meant to reach the same names without reading the first platform's files.
- The value is the id of the element. An element with no id is found by its whole text, and its name ends in `Text`, as in the last line of the element file above. The reply of `/qa-mobile-generate` lists those under `Elements found by text:`.
- A text that a check expects stays in the flow, so a changed text shows up as a failing flow and not as an edit of an element file. A check compares the id and the text when the text has an id of its own. Otherwise it compares the text alone.
- The loader has one block for each platform. A job writes only the block of its own platform.
- When an id changes in the app, `/qa-mobile-heal` changes one line of one element file and no flow.
- To add the second platform, run `/qa-mobile-generate` on the same plan again, with `This is iOS.` and the iOS app id in the prompt. The skill then writes the iOS element files and an iOS block in the loader, and keeps the flows. This was not run.
- An element file is JavaScript that Maestro runs on your machine. It should hold the one object and nothing else. Only the skill text says so: the hook does not check it. See [Open points](#open-points).
- The global `output` comes from Maestro. A lint or a type check of JavaScript under `test/` in your app may need to leave `test/mobile/elements/` out. This was not tried.

## Run the flows yourself

To run the flows of one feature:

```bash
maestro test --platform android --exclude-tags=fixme -e APP_ID=com.example.app test/mobile/profile
```

`--exclude-tags=fixme` leaves out the flows that record a product bug. It has no effect when you pass a single file: a marked flow run alone still runs and fails.

A run prints one line for each flow and then a summary line:

```text
[Failed] A missing element fails (23s) (Element not found: Id matching regex: nav-wishlist)
[Passed] One item shows in the cart (10s)

1/2 Flow Failed
```

When every flow passes, the summary line is `2/2 Flows Passed in 46s` and the exit code is 0. Otherwise the exit code is 1. A flow takes 15 to 60 seconds on an emulator, and a step that fails waits 17 seconds first. Maestro writes its logs, and a screenshot of each failed step, to `~/.maestro/tests/`, outside the project.

A `[Failed]` line with no error after the time means that an element file did not load: the flow or the loader lacks a line, or an element file has a JavaScript fault. Run that one flow file to see the error. `maestro check-syntax` does not read an element file and does not check a name: it prints `OK` for a flow with any of these faults.

## Known limits

- With no device, each skill stops and tells you what to start. On Linux or Windows the skills stop when the prompt says iOS.
- `maestro test` and the `maestro` MCP server cannot share a device. `maestro test` removes Maestro's helper apps from the device when it ends, and a server that was running then answers `Device server died`. This happens after a full `/qa-mobile-generate` job, which ends with `maestro test`, and after a run from your terminal. Plan, heal, and the next generate then stop and ask you to turn the server off and on in Cursor settings. Checked on Android.
- A line in `test/mobile/elements/load.yaml` that names a file that does not exist stops every flow with `Parsing Failed`. Seen on Android for a line in either platform's block.
- `/qa-mobile-generate` writes no flow for a scenario that it could not walk to the end on the device. It names the scenario under `Not checked:`, and the verdict is `FAIL`.
- `/qa-mobile-generate` keeps a flow file that exists. To have a flow written again, delete it first.
- A text that changes from run to run, such as an order number, is checked by its id and by the start that stays the same: `text: "Saved at.*"`. Its plan line has the form `a text that starts with "Saved at"`. Maestro reads that text as a pattern, so the skills put `\\` in front of a character such as `(` or `.` in the start.
- An element with no id is found by its text. The agent does not add a `testID` to your source.
- On a fresh Google Play emulator, a Google sign-in screen can cover the app a few minutes after boot. A flow that runs at that moment fails with `Element not found`. Run it again.
- Once, in the walk of a generate job, the app was gone from the screen after a step that replied `"success":true`, about four minutes after the emulator started. The cause was not found. The walk stopped that scenario, and a second walk finished it.
- Twice, the first text typed after the emulator started came out with its first letter doubled, such as `aandroid` for `android`. This is not explained, and no skill handles it.
- Maestro cannot mock the network, so the skills plan no scenario that needs the server to fail.
- Maestro sends usage analytics unless `MAESTRO_CLI_NO_ANALYTICS` is set in your environment.

## What was run

All of it was run by a maintainer on one machine: a Linux host, Maestro 2.10.0, Java 17, and one Android emulator (a Pixel 7 image with Android 17 and Google Play). The app was a React Native sample app with a product list, a cart with a promo code field, and a checkout form that shows three validation messages. No model ran any of it.

Run on that emulator, about Maestro itself:

- `maestro test` with one file and with a folder, passing and failing, with the output lines and exit codes shown above.
- The folder run with `--exclude-tags=fixme`, and a run of all of `test/mobile` with the `config.yaml` template. That run takes neither the loader nor an element file for a flow.
- The three MCP tools the skills call, `list_devices`, `inspect_screen`, and `run`, with the replies the skills describe.
- That a `maestro test` run ends a running MCP session.
- That a React Native `testID` is the id on the device. This was seen for 39 ids.

Run on that emulator, about element files:

- A loader with one block for each platform. The Android block ran and the iOS block was skipped.
- Names from an element file in `tapOn`, in `assertVisible` with and without a `text:` line, in `inputText`, and in `extendedWaitUntil`. Flows with such names ran through `maestro test` and through the MCP `run` tool with a flow file.
- The error that each mistake gives: a name that the element file does not have, a loader line for a file that does not exist, a missing loader line, and a JavaScript fault in an element file.
- That `maestro check-syntax` prints `OK` for a flow with any of those mistakes.
- That the MCP `run` tool with inline text does not find the loader by a relative path. The walks of plan and generate therefore use the ids themselves and no loader.

Jobs run on that emulator:

- Before the element files, one small job for each skill, done by a maintainer who followed the skill text line by line: a plan for the checkout form, three flows generated from it (`3/3 Flows Passed`), a heal of a wrong id, and a heal that ended in the `fixme` mark. After that the skills were made shorter, their examples were changed to another app, and they were moved to element files.
- With element files, one generate job for a feature with two scenarios on two screens. The plan was written by hand in the new sentence forms. Two scripts that know nothing of the app applied the tables of the skill. The first walk made 23 MCP calls in 2 minutes 13 seconds and lost the app in one scenario, see [Known limits](#known-limits). A second walk added the two names that were missing. The result was two element files with 7 names, a loader, a subflow, and two flows, and the last run printed `2/2 Flows Passed in 59s`.
- With element files, one heal job. A wrong id in an element file was traced from the error to its line there and corrected by one edit, with no flow touched. Four more faults were made on purpose, run, and put right: a loader line left out, a missing comma in an element file, a name missing from an element file, and a loader line for a file that does not exist.

Not run:

- A check with `id:` and a `text:` that ends in `.*`, which the skills write for a text that changes from run to run. A `.*` text alone was run, and `id:` with a whole text was run. The two together were not. Neither was a start with `\\` in front of a character.
- Anything on iOS: an iOS element file, the iOS block of the loader on an iOS device, the ids there, and every iOS line of the three skills. Those lines are from Maestro's documentation and source.
- The skills on a model, in Cursor or outside it. The evaluation has no mobile case. The two scripts show that the tables of the generate skill can be applied to one feature. They do not show that a model can apply them.
- The skills as they are now. After the run with element files, a review added and changed rows and rules in the three skills, for example how a name is made from a text that starts with a digit, and what the walk does at a system dialog. One more rule came after the review: a scenario with no flow makes the verdict `FAIL`. Checked without a device, on the text as it is now: every `yaml` block and template passes `maestro check-syntax`, the element template parses in Node, and the hook allows every command and file of the skills. The new text was not followed on a device.
- `/qa-mobile-plan` as a whole job since its sentence forms changed. Its device steps did not change.
- A second platform: a generate job that finds flows already written on the other platform, and the loader steps that add a block or a line.
- An element with no id in a whole job, and the reply line `Elements found by text:`. A name as the whole value of `tapOn:` ran in an experiment. The sample app has an id on every element.
- That an expected text with no id of its own, inside an element that has one, fails a check with that outer id. This was read in Maestro's source. The skills check such a text by text alone, a form that ran.
- The name for a text that starts with a digit. Node rejects `3Items:` as a name. Maestro's own script engine was not asked.
- A scenario that the walk stops, as part of a job: that it gets no flow, and that the verdict is then `FAIL`.
- The fix steps of `/qa-mobile-generate` after a failed run. The error lines they react to were seen.
- These parts of `/qa-mobile-heal` as whole jobs: the two `BLOCKED` exits of its error table, a waiting check, the `fixme` mark in a flow with element files, a text that changes from run to run, a check that fails with `is not visible`, and another app on top of the app.
- A system permission dialog, a physical device, and a native Android app, where an id has the form `com.example.app:id/name`.
- A sample app with a sign-in screen. The sample has none. The prompts and examples on this page are from the imaginary app of the skills and were not walked.
- CI. No emulator job exists.
- Cursor itself: the folder it starts the `maestro` server in, its time limit for one MCP call, and what a walk costs a model. One `run` call took up to 45 seconds.
- A lint or a type check of an element file in an app.

A sample app with a sign-in screen and a CI job are tracked in [issue 23](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/23), and iOS in [issue 24](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/24).

## Open points

- **The skills are long, and no small model has tried them.** `wc -w` counts 2,485 words in `/qa-mobile-plan`, 4,112 in `/qa-mobile-generate`, and 3,324 in `/qa-mobile-heal`. The four web skills have 1,648 to 2,507. The generate skill had 1,914 words before the element files: it now finds the device and walks the plan, which it did not do before. The kit is written for small models, and the mobile skills have not been tried on a low-tier model, or on any model.
- **System dialog texts are still in flows.** The block for a system dialog holds the dialog's question and its button as texts, and the heal skill's block for the iOS keyboard taps a text. The skills take these texts to differ by platform, so they belong in element files. That change waits for a device run with a real dialog.
- **An element with an id on one platform only has no rule.** The shared flow fixes whether a name stands under `id:` or alone. No rule says what to do when that differs between Android and iOS. A text that differs by platform would be marked as a product bug. This waits for the first iOS run.
- **The hook does not check the code in an element file.** It allows any JavaScript in an element file, a `.js` file anywhere under `test/mobile/`, `runScript` and `evalScript` in a flow, and `runScript` in the inline text of the MCP `run` tool. Maestro's script engine can make network calls. Only the skill text forbids these.
- **A plan made before the element files is not read.** `/qa-mobile-generate` does not read a plan with lines such as ``Tap "Save profile" (id `profile-save`)``. Plan the feature again. The mobile skills were never on the `main` branch or in a tagged version, so only a plan made from this branch can have that form.
- **Smaller gaps in the skill text.** In a `flows only` job, one missing name stops the whole job. `/qa-mobile-heal` has no row for a fault in the flow file itself. The walk of generate has no row for `Couldn't hide the keyboard`, which the other two skills treat as an iOS error. A name made from an expected text can be odd: "Discount: 2.45" gives `discount245`, and a second amount gives a second name for the same id.
