---
name: qa-mobile-generate
description: "Turn one mobile plan into element files and Maestro flows, then run the flows. Usage: /qa-mobile-generate test/mobile/plan/profile.plan.md. This is Android. App id com.example.app"
disable-model-invocation: true
---

# Turn one mobile plan into element files and flows

Part 1 writes the element files while you walk the plan on a device. Part 2 writes the flows with no device call and runs them.

Read application source (`app/`, `src/`, and similar). Never edit it.

- Plan, the input: `test/mobile/plan/profile.plan.md`
- Element file, one for each screen: `test/mobile/elements/android/profile.js` on Android, `test/mobile/elements/ios/profile.js` on iOS
- Loader, which runs the element files: `test/mobile/elements/load.yaml`
- Flow, one for each scenario: the path on the scenario's `**Flow:**` line, such as `test/mobile/profile/01-new-name.flow.yaml`
- Subflow, only when the plan has `## Start steps`: the path on the plan's `**Subflow:**` line
- Suite file: `test/mobile/config.yaml`
- Templates: `.cursor/skills/qa-mobile-generate/templates/elements.js`, and `load.yaml`, `flow.yaml`, `subflow.yaml`, `config.yaml` in the same folder

One flow file serves Android and iOS. The element files are separate: work only in the folder of your platform, `android` or `ios`, and never read, create, or edit a file in the other one.

A flow holds no id. What a step taps or types into is a name from an element file, written `${output.profile.saveProfile}`. A text that a check expects stays in the flow, because it is the thing under test.

The examples are from another app. Take your names, texts, and paths from the prompt, the plan, and the device.

Do the steps in order. In every table, use the first row that matches. When a step says BLOCKED, stop work, go to step 10, and put the sentence after `Verdict: BLOCKED:`.

## Names

A plan line gives the file, the object, and the name of its element. This table is a list: every row gives one part.

| Part | Take | Example |
| --- | --- | --- |
| The file | The screen name of the line in lower case, with a hyphen between its words, then `.js`. It goes in the folder of your platform. | `On the Order history screen` gives `test/mobile/elements/android/order-history.js` |
| The object | `output.`, then the words of the screen name joined, with a capital at the start of each word but the first | `output.orderHistory` |
| The name | The words of the first text in double quotes, joined: letters and digits only, a capital at the start of each word but the first | `"Save profile"` gives `saveProfile` |
| The name, in a line with `next to` | The words of the first text, then `next to`, then the words of the second text, joined the same way | `"+" next to "Work email"` gives `nextToWorkEmail` |
| The name, when it comes out empty or starts with a digit | One or two words for what the element does, in the same form. Name it under `Not checked:`. | `"3 items"` gives `itemCount` |

An element file looks like this. Each line in the braces is a name, a colon, the selector in single quotes, and a comma. A selector with `'` in it goes in double quotes.

```js
// Profile screen, Android.
output.profile = {
  displayName: 'profile-name',
  saveProfile: 'profile-save',
  changePhotoText: 'Change photo',
}
```

The selector is the id of the element. Only an element with no id gets its whole text, and then its name ends in `Text`, as in the last line. Never write screen coordinates.

## Plan line to commands

Each comment is a plan line. The lines under it are its commands.

```yaml
# 1. Launch the app with cleared state.
- launchApp:
    clearState: true
    clearKeychain: true
# 2. Do the start steps.
- runFlow: ../subflows/open-profile.yaml
# 3. On the Profile screen, type `Grace Hopper` into "Display name".
- tapOn:
    id: ${output.profile.displayName}
- inputText: "Grace Hopper"
# 4. On the Profile screen, tap "Save profile".
- hideKeyboard
- tapOn:
    id: ${output.profile.saveProfile}
# 5. On the Profile screen, tap "Change photo".
- tapOn: ${output.profile.changePhotoText}
# Expect: On the Account screen, "Edit profile" is visible.
- assertVisible:
    id: ${output.account.editProfile}
    text: "Edit profile"
# Expect: On the Account screen, "Profile saved" is visible.
- assertVisible: "Profile saved"
# Expect: On the Account screen, a text that starts with "Saved at" is visible.
- assertVisible:
    id: ${output.account.savedAt}
    text: "Saved at.*"
# Expect: On the Profile screen, "That name is taken" is not visible.
- assertNotVisible: "That name is taken"
```

Look the name of the line up in the element file of its screen.

| The plan line | The element file has | Write |
| --- | --- | --- |
| `Launch the app with cleared state.` | | The `launchApp` block, as in line 1 |
| `Do the start steps.` | | `../subflows/` and the file name from the plan's `**Subflow:**` line, as in line 2 |
| `If "..." shows, tap "...".` or `Press the system back button.` | | The block from section A |
| `type` or `tap` | The name | `id:` and the name, as in lines 3 and 4 |
| `type` or `tap` | The name with `Text` at the end | The name alone, as in line 5 |
| `type` or `tap` | Neither | BLOCKED: `an element name is missing. Ask again with element files only.` Put the plan line under `Not checked:`. |
| `is not visible` | | `assertNotVisible` and the quoted text |
| `a text that starts with` | The name | `id:` and the name, then `text:` with the quoted start and `.*` after it, as in the `Saved at` lines |
| `a text that starts with` | No name | `assertVisible` with the quoted start and `.*` after it: `- assertVisible: "Saved at.*"` |
| `"..." is visible` | The name | `id:` and the name, then `text:` and the quoted text |
| `"..." is visible` | No name | The quoted text alone, as for "Profile saved" |
| No row matches | | The commands of the closest form. Name the line under `Not checked:`. |

- A `tap` line straight after a `type` line gets `- hideKeyboard` first, as in line 4. Write `- hideKeyboard` nowhere else.
  Why: with the keyboard open, a tap can close the keyboard and miss the button. With no keyboard open, `- hideKeyboard` presses back on Android, which can close the app.
- Write a name such as `${output.profile.saveProfile}` with no quotes around it. Put every text and value in double quotes, letter for letter from the plan.
- There is no command that waits a fixed time. `tapOn` and `assertVisible` wait up to 17 seconds for the element by themselves.
- Indent with two spaces. A tab breaks the file.

## Device calls

Part 1 uses three tools of the maestro MCP server: `list_devices`, `run`, and `inspect_screen`.

`run` does actions on the device. Give it the `device_id` and a `yaml`. Every `yaml` starts with the first two lines below and ends with the last line. Between them go the actions you need. Here they are the `launchApp` block, typing, a tap by id straight after typing, and a tap by text. Change only the app id, the selectors, and the values. A `yaml` is not a flow file: it holds the selector itself in double quotes, and no loader line.

```yaml
appId: com.example.app
---
- launchApp:
    clearState: true
    clearKeychain: true
- tapOn:
    id: "profile-name"
- inputText: "Grace Hopper"
- hideKeyboard
- tapOn:
    id: "profile-save"
- tapOn: "Change photo"
- waitForAnimationToEnd
```

`inspect_screen` reads the screen. Give it the `device_id`. It does not wait: without the last line above it shows the screen from before the action. The reply is JSON: a tree of objects under `"elements"`. Each object holds the objects inside it under `"c"`: read those too. Here are a button and a message, with the keys `b` and `cls` left out.

```text
{"a11y":"Save profile","rid":"profile-save","clickable":true,"c":[{"txt":"Save profile"}]}
{"txt":"That name is taken","rid":"profile-error"}
```

- `rid` is the id. Copy it letter for letter. A React Native `testID` shows there as it is written, but an id is only what `rid` shows.
- `txt` is the text the user sees. In a field it is the typed value. `hint` and `a11y` are the name of a field, and of a button with no `txt`.
- The reply also holds the status bar, the keyboard when it is open, and the device's home screen when the app is closed. They are not the app. On Android, ignore every object whose `rid` starts with `com.android.systemui`, or has `inputmethod` or `launcher` in it.

## Steps

1. **Plan.** Take the plan path from the prompt and read the plan. No path in the prompt, or no file at that path: run `ls test/mobile/plan`, reply with the names and `Which plan?`, and stop.

2. **Platform, app id, and part.**

   | Value | Take it from | Not there |
   | --- | --- | --- |
   | Platform | The prompt: `This is Android.` gives `android`. `This is iOS.` gives `ios`. | Reply `Which platform? Say "This is Android." or "This is iOS."` and stop. |
   | App id | The prompt: `App id com.example.app`. Otherwise the plan's `**App id (Android):**` or `**App id (iOS):**` line. | The line says `not given`: reply `Which app id?` and stop. Do not use the other platform's id. |

   The platform is iOS and the computer you run on is Linux or Windows: BLOCKED: `iOS needs a Mac with Xcode. This computer is not a Mac.`

   | The prompt says | Do |
   | --- | --- |
   | `element files only` | Part 1, steps 3 to 5, then step 10 |
   | `flows only` | Part 2, steps 6 to 9 |
   | No row matches | Part 1, then Part 2 |

3. **Part 1, on the device: find the device.** Call `list_devices`. Look for a device with `"connected":true` and your platform: `"platform":"android"` or `"platform":"ios"`. Note its `device_id`. Then call `inspect_screen` once, to check that the server can read the device.

   | Result | Do |
   | --- | --- |
   | You have no `list_devices` tool | BLOCKED: `turn on the maestro MCP server in Cursor settings, then ask again.` |
   | Android, and no such device | BLOCKED: `no Android device is connected. Start an emulator or plug in a device, install the app on it, then ask again.` |
   | iOS, and no such device | BLOCKED: `no iOS simulator is booted. iOS needs a Mac with Xcode. Boot a simulator, install the app on it, then ask again.` |
   | The `inspect_screen` reply starts with `Failed to inspect screen` | BLOCKED: `the maestro MCP server cannot read the device. Turn the server off and on in Cursor settings, then ask again.` |
   | No row matches | You have the `device_id`. Go to step 4. |

   A device with `"connected":false` is off. Leave it off: you never start a device or install the app. Never use a device of the other platform, or the device `chromium`.

4. **Part 1: walk each scenario. Write each name right after the `inspect_screen` reply that shows its element.** Start a scenario with a `run` of the `launchApp` block, then `inspect_screen`. The reply shows nothing of the app: call it again. Still nothing after 3 calls: BLOCKED: `the app com.example.app is not on the screen of the device. Close what covers it, then ask again.` Then take the plan lines in order, the start steps first.

   | The plan line | Do |
   | --- | --- |
   | `If "..." shows, tap "...".` or `Press the system back button.` | `run` its block from section A, then call `inspect_screen`. It gets no line in an element file. |
   | `type` or `tap` | Find its element in the latest reply and write its line into the element file. Then `run` the action with that selector, and call `inspect_screen`. A tap straight after typing has `- hideKeyboard` above it. |
   | `is visible` | Find its element in the latest reply and write its line. |
   | No row matches | Nothing. |

   | The element in the reply | Line in the element file of the line's screen |
   | --- | --- |
   | An object whose `txt`, `a11y`, or `hint` is the quoted text, and it has a `rid` | The name and that `rid`: `saveProfile: 'profile-save',` |
   | Such an object with no `rid`, for an `is visible` line | None. The flow checks the text. |
   | Such an object with no `rid`, directly inside the `c` of an object that has one | The name and the `rid` of that outer object |
   | Such an object, and neither has a `rid` | The name with `Text` and the whole text: `changePhotoText: 'Change photo',` |
   | No such object | Call `inspect_screen` once more. Still none: stop this scenario, name it and the plan line under `Not checked:`, and take the next one. |

   - The file does not exist: read the elements template and write the file with the words in CAPITALS replaced, as in the example under "Names", with your line in the braces. It exists: read it, keep every line, and add yours above the closing `}`. It has the name already: write nothing.
   - A line with `next to`: several objects have the first text. Take the first one that comes after the object with the second text.
   - A line with `a text that starts with`: take the object whose `txt` starts with the quoted text.
   - The flows of this plan exist already, written on the other platform: use the names their lines have, letter for letter.

   | A `run` reply contains | Do |
   | --- | --- |
   | `"success":true` | Go on. |
   | `Device server died` | BLOCKED, with the sentence of the `Failed to inspect screen` row in step 3. |
   | `is not connected` | BLOCKED, with the sentence for your platform from step 3. |
   | `Element not found` | The selector is not on the screen. Call `inspect_screen`, correct the line in the element file, and call `run` again. After 2 tries, stop this scenario and name it under `Not checked:`. |
   | No row matches, for the `launchApp` block | BLOCKED: `the app com.example.app did not launch. Check that it is installed on the device.` Put the error from the reply under `Not checked:`. |
   | No row matches | Stop this scenario. Name it and the error under `Not checked:`. |

5. **Part 1: loader.** The loader names each element file of your platform once, in a line such as `- runScript: android/profile.js`. Run `ls test/mobile/elements/android`, or `ios`, to list the files. The template shows the Android block: `platform: Android`, and paths that start with `android/`. The iOS block has `platform: iOS` and `ios/`.

   | `test/mobile/elements/load.yaml` | Do |
   | --- | --- |
   | Does not exist | Read the loader template and write it there, with one `- runScript:` line for each element file of your platform. The line `appId: ${APP_ID}` stays as it is. |
   | Has no block for your platform | Add the template's `- runFlow:` block at the end of the file, with those lines. |
   | No row matches | In the block of your platform, add a `- runScript:` line for each element file that has none. |

   Never name a file that does not exist: the loader then stops every flow on both platforms with `Parsing Failed`. Never change the block of the other platform.

6. **Part 2, no device call: write the subflow and the flows.** Read the plan and the element files of your platform. Read the templates, and write each file with the words in CAPITALS replaced.

   | Plan | File |
   | --- | --- |
   | `## Start steps` | The subflow: one comment and its commands for each start step. The plan has no such section, or the file exists: write no subflow. |
   | `### 2.1 A taken name shows an error` | The flow at its `**Flow:**` path. Line 1: `# plan: test/mobile/plan/profile.plan.md`. Line 2: `# scenario: 2.1 A taken name shows an error`. Then `name: "A taken name shows an error"`. |
   | The feature name | The one line under `tags:`: `- profile` |
   | A numbered step | A comment with the step, word for word, then its commands from "Plan line to commands" |
   | An Expect line | A comment `# Expect:` and the line, word for word, then its command |
   | No row matches | Leave that plan line out and name it under `Not checked:`. |

   - Line 3 of a flow and line 2 of a subflow stay `appId: ${APP_ID}`, letter for letter. The run command gives the app id.
   - The first command of every flow is `- runFlow: ../elements/load.yaml`. The second is the `launchApp` block with both `clear` lines. A subflow has neither.
   - Do not merge plan lines.
   - A flow file exists: keep it. Write only the flows that do not exist. A scenario you stopped in step 4 gets no flow.

7. **Part 2: suite file, then check each file.** `test/mobile/config.yaml` does not exist: read the config template and write it there, unchanged. Then run `maestro check-syntax test/mobile/profile/01-new-name.flow.yaml`. Change only the path. One command for each flow, for the subflow, and for the loader. Not for an element file: the check reads no element file, so `OK` does not mean the names are right.

   | The output | Do |
   | --- | --- |
   | `OK` | Take the next file. After the last one, go to step 8. |
   | `command not found` | BLOCKED: `the maestro command is not installed, or not on the PATH.` |
   | One line such as `Invalid Command: tapOnn at /syntax-checker:13:9` | The line names the fault. The number after `/syntax-checker:` is about the line of your file. Correct the file and check it again. |
   | No row matches | Go to step 10 with `Verdict: FAIL` and the output under `Not checked:`. |

8. **Part 2: run the feature's folder.** `RTK_DISABLED=1 maestro test --platform android --exclude-tags=fixme -e APP_ID=com.example.app test/mobile/profile`. Change only the platform word, the app id, and the folder. Never start a device and never run on the other platform. A flow takes 15 to 60 seconds. The output has one line for each flow, `[Passed]` or `[Failed]` and the flow's name, not in the order of the files. Then comes the summary line: `2/2 Flows Passed in 48s` when all passed, `1/2 Flow Failed` when one did not. Ignore the box drawn with lines. You have 3 runs: after the third run that is not a pass, go to step 10 with `Verdict: FAIL`.

   | The output contains | Do |
   | --- | --- |
   | `Not enough devices connected` | BLOCKED, with the sentence for your platform from step 3. |
   | `Parsing Failed at`, then the path of the loader | A `- runScript:` line there names a file that does not exist. Run `ls test/mobile/elements/android`, or `ios`. A line in the block of your platform names a file that `ls` does not print: correct that line and run again. Otherwise: BLOCKED: `the loader names an element file of the other platform that does not exist.` |
   | `Invalid File Path at`, then a file and a line | The `runFlow` line there names a file that does not exist. Correct the path and run again. |
   | `Flows Passed` or `Flow Passed`, with the same number on both sides of the `/` | It passed. Go to step 10. |
   | `[Failed]` | Go to step 9. |
   | No row matches | BLOCKED: `the test command did not finish.` Put the last output line under `Not checked:`. |

9. **Part 2: not a pass.** Take the first `[Failed]` line, for example `[Failed] A taken name shows an error (23s) (Element not found: Id matching regex: profile-save)`. The error is the text in the last pair of brackets. Another error is `Assertion is false: "Edit profile", id: account-edit is visible`. Do what its row says, then go back to step 8.

   | The `[Failed]` line | Do |
   | --- | --- |
   | Has `is not installed` | BLOCKED: `the app com.example.app is not installed on the device. Install it, then ask again.` |
   | Ends with the time, such as `(316ms)`, and has no error | An element file did not load. Check three things and correct the first that is wrong. The first command of the flow is `- runFlow: ../elements/load.yaml`. The loader has a `- runScript:` line for the element file of each screen the flow names. Each element file has the form shown under "Names", with a comma at the end of every line in the braces. None is wrong: go to step 10 with `Verdict: FAIL`. |
   | Has `undefined` | A line of the flow, or of its subflow, has a name that its element file does not have. Find the first such line and write it again from "Plan line to commands", with the name the element file has. |
   | Has `Element not found` or `Assertion is false` | A text from the error is in the flow: compare that line with the plan line in the comment above it. They differ: write the plan's text. Otherwise the app does not do what the plan says. |
   | No row matches | Go to step 10 with `Verdict: FAIL`. |

   The app does not do what the plan says: leave the flow failing. Do not change a selector, a text, or a check, and do not tag the flow. Go to step 10 with `Verdict: FAIL`. `/qa-mobile-heal` reads the screen and finds the cause.

10. **Reply** with this form and nothing else. The values shown are examples. A line you have nothing for gets `none`.

    ```text
    Plan: test/mobile/plan/profile.plan.md
    Platform: Android
    Element files: test/mobile/elements/android/profile.js, test/mobile/elements/android/account.js
    Elements found by text: "Change photo" on the Profile screen
    Flows: test/mobile/profile/01-new-name.flow.yaml, test/mobile/profile/02-taken-name.flow.yaml
    Subflow: none
    Command: RTK_DISABLED=1 maestro test --platform android --exclude-tags=fixme -e APP_ID=com.example.app test/mobile/profile
    Result: 2/2 Flows Passed in 48s
    Failed: none
    Verdict: PASS
    Not checked: iOS
    ```

    `Elements found by text:` is the text and the screen of each name that ends in `Text`. `Result:` is the summary line of the run, copied. `Failed:` is each `[Failed]` line, copied. `Verdict:` is `PASS`, `FAIL`, or `BLOCKED:` and the sentence from the step that stopped you. `PASS` needs a flow for every scenario of the plan: if a scenario got no flow, the verdict is `FAIL`, and `Not checked:` names that scenario. An `element files only` job runs no flow: unless it was BLOCKED, its `Verdict:` is `DONE`. `Not checked:` always names the platform you did not run on.

## Never

- Write an id into a flow, or an expected text into an element file.
- Put anything in an element file but the one `output` object, or write `runScript` anywhere but the loader.
- Change a selector, a text, or a check to get a pass, or add `optional: true`, `retry`, or `repeat`.
- Call another tool of the maestro server, add a `testID` to the source, or pass `maestro` an option that is not in the command of step 8.

## A. Dialogs and steps that differ by platform

Enter only from "Plan line to commands" or step 4. A step that must differ goes into the one flow file, in a `runFlow` block with `when:`. Write such a block only for these two plan lines. The two texts of a system dialog stay in the flow.

```yaml
# 6. If "Allow Example to send you notifications?" shows, tap "Allow".
- runFlow:
    when:
      visible: "Allow Example to send you notifications?"
    commands:
      - tapOn: "Allow"
# 7. Press the system back button.
- runFlow:
    when:
      platform: Android
    commands:
      - back
```

`- back` presses the system back button on Android. On the app's first screen that closes the app. On iOS it does nothing, so the block is for Android only.
