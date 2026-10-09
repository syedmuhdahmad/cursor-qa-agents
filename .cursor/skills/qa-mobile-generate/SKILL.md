---
name: qa-mobile-generate
description: "Turn one mobile plan into Maestro flows, one file for each scenario, then run them. Usage: /qa-mobile-generate test/mobile/plan/profile.plan.md. This is Android. App id com.example.app"
disable-model-invocation: true
---

# Turn one mobile plan into Maestro flows

You write one flow file for each scenario of the plan, then run the feature's folder on a device. One flow file serves Android and iOS. Never write a second file for the other platform.

Read application source (`app/`, `src/`, and similar). Never edit it.

- Plan, the input: `test/mobile/plan/profile.plan.md`
- Flow, one for each scenario: `test/mobile/profile/01-new-name.flow.yaml`. The scenario's `**Flow:**` line in the plan gives the path.
- Subflow, only when the plan has `## Start steps`: `test/mobile/subflows/open-profile.yaml`. The plan's `**Subflow:**` line gives the path.
- Suite file: `test/mobile/config.yaml`
- Templates: `.cursor/skills/qa-mobile-generate/templates/flow.yaml`, and `subflow.yaml` and `config.yaml` in the same folder

The examples are from another app. Take your ids, texts, and paths from the prompt and the plan.

Do the steps in order. In every table, use the first row that matches. When a step says BLOCKED, stop work, go to step 9, and put the sentence after `Verdict: BLOCKED:`.

## Plan line to commands

Steps 3 and 4 use this list. Each comment is a plan line. The lines under it are its commands.

```yaml
# 1. Launch the app with cleared state.
- launchApp:
    clearState: true
    clearKeychain: true
# 2. Do the start steps.
- runFlow: ../subflows/open-profile.yaml
# 3. Type `Grace Hopper` into "Display name" (id `profile-name`).
- tapOn:
    id: "profile-name"
- inputText: "Grace Hopper"
# 4. Tap "Save profile" (id `profile-save`).
- hideKeyboard
- tapOn:
    id: "profile-save"
# 5. Tap "Change photo" (no id).
- tapOn: "Change photo"
# Expect: The text "Profile saved" is visible.
- assertVisible: "Profile saved"
# Expect: "Edit profile" (id `account-edit`) is visible.
- assertVisible:
    id: "account-edit"
    text: "Edit profile"
# Expect: The element with id `profile-updated` is visible.
- assertVisible:
    id: "profile-updated"
# Expect: The text "That name is taken" is not visible.
- assertNotVisible: "That name is taken"
```

| The plan line | Write |
| --- | --- |
| A `Type` or `Tap` line with an id | `id:` with that id. Not the text. |
| An `Expect` line with an id and a quoted text | `id:` and `text:`, both, as in the `account-edit` lines |
| An `Expect` line that starts with `The element with id` | `id:` only |
| A line with `(no id)` | The whole text in quotes, as in line 5 |
| `Do the start steps.` | `../subflows/` and the file name from the plan's `**Subflow:**` line |
| `If "..." shows, tap "...".` or `Press the system back button.` | The block from section A |
| No row matches | The commands of the closest form. Name the line under `Not checked:`. |

- A `Tap` line straight after a `Type` line gets `- hideKeyboard` first, as in line 4. Write `- hideKeyboard` nowhere else.
  Why: with the keyboard open, a tap can close the keyboard and miss the button. With no keyboard open, `- hideKeyboard` presses back on Android, which can close the app.
- Put every id, text, and value in double quotes, letter for letter from the plan.
- Never use `point:` or any other screen coordinates.
- There is no command that waits a fixed time. `tapOn` and `assertVisible` wait up to 17 seconds for the element by themselves.
- Indent with two spaces. A tab breaks the file.

## Steps

1. **Plan.** Take the plan path from the prompt and read the plan. No path in the prompt: run `ls test/mobile/plan`, reply with the names and `Which plan?`, and stop.

2. **Platform and app id.**

   | Value | Take it from | Not there |
   | --- | --- | --- |
   | Platform | The prompt: `This is Android.` gives `android`. `This is iOS.` gives `ios`. | Reply `Which platform? Say "This is Android." or "This is iOS."` and stop. |
   | App id | The prompt: `App id com.example.app`. Otherwise the plan's `**App id (Android):**` or `**App id (iOS):**` line. | The line says `not given`: reply `Which app id?` and stop. Do not use the other platform's id. |

   The platform is iOS and the computer you run on is Linux or Windows: BLOCKED: `iOS needs a Mac with Xcode. This computer is not a Mac.`

3. **Subflow.** The plan has no `## Start steps`: go to step 4. The subflow file exists: keep it and go to step 4. Otherwise read the subflow template and write the subflow file, the words in CAPITALS replaced: one comment and its commands for each start step, from "Plan line to commands". Line 2 stays `appId: ${APP_ID}`, letter for letter.

4. **Flows.** For each scenario, read the flow template and write the flow file at the scenario's `**Flow:**` path, the words in CAPITALS replaced.

   | Plan | Flow file |
   | --- | --- |
   | The plan's path | Line 1: `# plan: test/mobile/plan/profile.plan.md` |
   | `### 2.1 A taken name shows an error` | Line 2: `# scenario: 2.1 A taken name shows an error`, and `name: "A taken name shows an error"` |
   | The feature name | The one line under `tags:`: `- profile` |
   | A numbered step | A comment with the step, word for word, then its commands |
   | An Expect line | A comment `# Expect:` and the line, word for word, then its command |
   | No row matches | Leave that plan line out and name it under `Not checked:`. |

   - Line 3 stays `appId: ${APP_ID}`, letter for letter. Do not put the app id there. The run command gives it.
   - The first command of every flow is the `launchApp` block with both `clear` lines. No flow needs another flow to run first.
   - One comment and its commands for each plan line. Do not merge lines.
   - The flow file exists: keep it. Write only the flows that do not exist.

   Why: Android and iOS builds of one app can have different app ids, and one file serves both.

5. **Suite file.** `test/mobile/config.yaml` exists: go to step 6. Otherwise read the config template and write it there, unchanged.

6. **Check each file you wrote.** `maestro check-syntax test/mobile/profile/01-new-name.flow.yaml`. Change only the path. One command for each flow and for the subflow.

   | The output | Do |
   | --- | --- |
   | `OK` | Take the next file. After the last one, go to step 7. |
   | `command not found` | BLOCKED: `the maestro command is not installed, or not on the PATH.` |
   | One line such as `Invalid Command: tapOnn at /syntax-checker:13:9` | The line names the fault and, after the first `:`, about which line of your file. Correct the file and check it again. |
   | No row matches | Go to step 9 with `Verdict: FAIL` and the output under `Not checked:`. |

7. **Run the feature's folder.** `RTK_DISABLED=1 maestro test --platform android --exclude-tags=fixme -e APP_ID=com.example.app test/mobile/profile`. Change only the platform word, the app id, and the folder. Never start a device and never run on the other platform. A flow takes 15 to 60 seconds. The output has one line for each flow, `[Passed]` or `[Failed]` and the flow's name, not in the order of the files. Then comes the summary line: `2/2 Flows Passed in 48s` when all passed, `1/2 Flow Failed` when one did not. Ignore the box drawn with lines after it.

   | The output contains | Do |
   | --- | --- |
   | `Not enough devices connected`, and the platform is Android | BLOCKED: `no Android device is connected. Start an emulator or plug in a device, install the app on it, then ask again.` |
   | `Not enough devices connected`, and the platform is iOS | BLOCKED: `no iOS simulator is booted. iOS needs a Mac with Xcode. Boot a simulator, install the app on it, then ask again.` |
   | `Invalid File Path at`, then a file and a line | The `runFlow` line there names a file that does not exist. Correct the path and run again. |
   | `Flows Passed` or `Flow Passed`, with the same number on both sides of the `/` | It passed. Go to step 9. |
   | `[Failed]` | Go to step 8. |
   | No row matches | BLOCKED: `the test command did not finish.` Put the last output line under `Not checked:`. |

8. **Not a pass.** Take the first `[Failed]` line, for example `[Failed] A taken name shows an error (23s) (Element not found: Id matching regex: profile-save)`. The error is the text in the last pair of brackets. Another error is `Assertion is false: "Edit profile", id: account-edit is visible`. Do what its row says, then go back to step 7. After the third run that is not a pass, go to step 9 with `Verdict: FAIL`.

   | The error contains | Do |
   | --- | --- |
   | `is not installed` | BLOCKED: `the app com.example.app is not installed on the device. Install it, then ask again.` |
   | `Element not found` or `Assertion is false` | Find the flow line that has the id or text from the error. Compare it with the plan line in the comment above it. They differ: write the plan's id or text. They are the same: the app does not do what the plan says. |
   | No row matches | Go to step 9 with `Verdict: FAIL`. |

   The app does not do what the plan says: leave the flow failing. Do not change the id, the text, or the check, and do not tag the flow. Go to step 9 with `Verdict: FAIL`.

9. **Reply** with this form and nothing else. The values shown are examples. A line you have nothing for gets `none`.

   ```text
   Plan: test/mobile/plan/profile.plan.md
   Platform: Android
   Flows: test/mobile/profile/01-new-name.flow.yaml, test/mobile/profile/02-taken-name.flow.yaml
   Subflow: none
   Command: RTK_DISABLED=1 maestro test --platform android --exclude-tags=fixme -e APP_ID=com.example.app test/mobile/profile
   Result: 2/2 Flows Passed in 48s
   Failed: none
   Verdict: PASS
   Not checked: iOS
   ```

   `Result:` is the summary line of the run, copied. `Failed:` is each `[Failed]` line, copied, or `none`. `Verdict:` is `PASS`, `FAIL`, or `BLOCKED:` and the sentence from the step that stopped you. `Not checked:` always names the platform you did not run on.

## Never

- Change an id, a text, or a check to get a pass, or add `optional: true` to a step.
- Use `retry`, `repeat`, `takeScreenshot`, `startRecording`, `runScript`, or `evalScript`.
- Create or change a device, or install the app.
- Pass `maestro` any option that is not in the command of step 7. The hook denies the others.

## A. Dialogs and steps that differ by platform

Enter only from "Plan line to commands". A step that must differ goes into the one file, in a `runFlow` block with `when:`. Write such a block only for these two plan lines.

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
