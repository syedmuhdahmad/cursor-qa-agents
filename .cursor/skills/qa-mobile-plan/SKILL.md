---
name: qa-mobile-plan
description: "Plan Maestro coverage for one feature of a mobile app and save it as one plan file. Usage: /qa-mobile-plan profile. This is Android. App id com.example.app"
disable-model-invocation: true
---

# Plan Maestro coverage for one feature

You explore one feature of a mobile app on a device and write one plan file. You write no flow and you run no test. One plan serves Android and iOS. You walk it on the platform the prompt names.

Read application source (`app/`, `src/`, and similar). Never edit it.

- Plan: `test/mobile/plan/profile.plan.md`. `profile` is the feature name. Change only that part.
- Template: `.cursor/skills/qa-mobile-plan/templates/plan.md`.

The examples are from another app. Take your ids and texts from the prompt, the device, and the source.

Do the steps in order. In every table, use the first row that matches. When a step says BLOCKED, stop work, go to step 10, and put the sentence after `Verdict: BLOCKED:`.

## Device calls

You use three tools of the maestro MCP server: `list_devices`, `run`, and `inspect_screen`.

`run` does actions on the device. Give it the `device_id` and a `yaml`. Every `yaml` starts with the first two lines below and ends with the last line. Between them go the lines of the actions you need. Each comment names one action. Leave the comments out, and change only the app id, the ids, and the values.

```yaml
appId: com.example.app
---
# Start from a clean app.
- launchApp:
    clearState: true
    clearKeychain: true
# Type into a field.
- tapOn:
    id: "profile-name"
- inputText: "Grace Hopper"
# Tap an element. Straight after typing, and nowhere else, the hideKeyboard line comes first.
- hideKeyboard
- tapOn:
    id: "profile-save"
# Tap an element that has no id, by its whole text.
- tapOn: "Change photo"
- waitForAnimationToEnd
```

Why: with the keyboard open, a tap can close the keyboard and miss the button. With none open, `- hideKeyboard` presses back on Android. `inspect_screen` does not wait: without the last line it shows the screen from before the action.

An action that has no lines above: do not act. Name the step under `Not checked:`.

A `run` that failed replies with `Failed to run flow:` and the error. An error with `Device server died`, at any step: BLOCKED: `the maestro MCP server cannot read the device. Turn the server off and on in Cursor settings, then ask again.`

`inspect_screen` reads the screen. Give it the `device_id`. Do not take a screenshot. The reply is JSON: a tree of objects under `"elements"`. Each object holds the objects inside it under `"c"`: read those too. Here are a button and a message, with the keys `b` and `cls` left out.

```text
{"a11y":"Save profile","rid":"profile-save","clickable":true,"c":[{"txt":"Save profile"}]}
{"txt":"That name is taken","rid":"profile-error"}
```

| Key | Use in the plan |
| --- | --- |
| `rid` | The id. Copy it letter for letter. An object with no `rid`, inside the `c` of an object that has one, takes that `rid`, as "Save profile" does above. Neither has one: write `(no id)`. |
| `txt` | The text the user sees: the name of a button or a message. Copy it letter for letter, never from memory. In a field it is the typed value, not the name. |
| `hint` | The grey text in an empty field: the name of the field |
| `a11y` | The text a screen reader says: the name of a field with no `hint`, and of another element with no `txt` |
| No row matches | Ignore the key. |

- An id is only what `rid` shows. A React Native `testID` shows there as it is written, but check that before you copy an id from the source.
- The reply also holds the status bar, the keyboard when it is open, and the device's home screen when the app is closed. They are not the app. On Android, ignore every object whose `rid` starts with `com.android.systemui`, or has `inputmethod` or `launcher` in it.

## Steps

1. **Settings.** Take each value from the prompt.

   | Value | In the prompt | Not in the prompt |
   | --- | --- | --- |
   | Feature | In lower case with hyphens: `profile` | Reply `Which feature?` and stop. |
   | Platform | `This is Android.` or `This is iOS.` | Reply `Which platform? Say "This is Android." or "This is iOS."` and stop. |
   | App id | The id the app is installed under: `App id com.example.app` | Reply `Which app id?` and stop. Do not guess it. |

   The platform is iOS and the computer you run on is Linux or Windows: BLOCKED: `iOS needs a Mac with Xcode. This computer is not a Mac.`

2. **Find the device.** Call `list_devices`. Look for a device with `"connected":true` and the platform from step 1: `"platform":"android"` or `"platform":"ios"`. Note its `device_id`, such as `emulator-5554`. Every later call takes it. Then call `inspect_screen` once, to check that the server can read the device.

   | Result | Do |
   | --- | --- |
   | You have no `list_devices` tool | BLOCKED: `turn on the maestro MCP server in Cursor settings, then ask again.` |
   | Android, and no such device | BLOCKED: `no Android device is connected. Start an emulator or plug in a device, install the app on it, then ask again.` |
   | iOS, and no such device | BLOCKED: `no iOS simulator is booted. iOS needs a Mac with Xcode. Boot a simulator, install the app on it, then ask again.` |
   | The `inspect_screen` reply starts with `Failed to inspect screen` | BLOCKED: `the maestro MCP server cannot read the device. Turn the server off and on in Cursor settings, then ask again.` |
   | No row matches | You have the `device_id`. Go to step 3. |

   A device with `"connected":false` is off. Leave it off: you never start a device or install the app. Never use a device of the other platform, or the device `chromium`.

3. **Launch the app.** Call `run` with the two first lines, the `launchApp` block, and the last line.

   | The reply contains | Do |
   | --- | --- |
   | `"success":true` | The app is open. Go to step 4. |
   | `is not connected` | BLOCKED, with the sentence for your platform from step 2. |
   | No row matches | BLOCKED: `the app com.example.app did not launch. Check that it is installed on the device.` Put the error from the reply under `Not checked:`. |

4. **Read the screen.** Call `inspect_screen`. Note the name and the `rid` of each field, button, and message. The reply shows nothing of the app, only the status bar, the home screen, or another app: call `inspect_screen` again. Still nothing of the app after 3 calls: BLOCKED: `the app com.example.app is not on the screen of the device. Close what covers it, then ask again.`

5. **Reach the feature's screen.**

   | The screen shows | Do |
   | --- | --- |
   | The feature | There are no start steps. Go to step 6. |
   | A sign-in form, and the prompt gives no account | BLOCKED: `this feature needs a signed-in user. Ask again with a test account.` |
   | A system dialog | Tap its button with `run`. Note the dialog's question and the button for section A, then read the screen again. |
   | No row matches: another screen of the app | Do the actions that open the feature, with `run`. Call `inspect_screen` after each new screen. These actions are the start steps. Note each one. |

   After 6 actions the feature's screen is still not open: BLOCKED: `no way found from the first screen to the feature. Ask again and say how to open it.`

6. **Read the source for this screen only.** Search the source for one text from the screen, for example `Save profile`. Read the screen's file, the app files it imports, and the code it calls on the server. At most 6 files. Note each validation message, each error message, and any test account the source creates.

7. **List 3 to 8 scenarios**, one line each. Name each scenario in plain words, with no quotes and no colon. This table is a list: go through every row, top to bottom.

   | Scenario | Group | Count |
   | --- | --- | --- |
   | The main flow that ends in success | `Main flow` | 1 |
   | A validation message from the source | `Validation` | 1 for each message |
   | An error message the screen shows when the server refuses, such as a name that is taken | `Errors` | 1 for each message |
   | More than 8 lines | | Keep the first 8. Name the others under `Not checked:`. |
   | Fewer than 3 lines | | Keep them. Say so under `Not checked:`. |

   A scenario that needs an account or a record uses one from the prompt or from the source you read. None found: drop the scenario and name it under `Not checked:`. Do not invent data. A scenario that needs the server to fail cannot be walked, because Maestro cannot mock the network. Name it under `Not checked:`.

8. **Start the plan file.** Read the template. Write the plan file with only the lines above `## 1. GROUP`, the words in CAPITALS replaced.

   - `PLATFORM` is `Android` or `iOS`, the platform from step 1.
   - The app id from the prompt goes on the line of your platform. The other line gets `not given`.
   - `SOURCE_FILE` is the screen's file from step 6, or `not found`. `DATA` is the account or records the scenarios use, or `none`.
   - Step 5 gave start steps: write the `**Subflow:**` line with the feature name, then one numbered line for each start step. It gave none: leave the whole `## Start steps` section out.

9. **Walk one scenario, add it to the plan file, then take the next.**

   1. Call `run` with one `yaml`: the two first lines, the `launchApp` block, the start steps, the scenario's actions, and the last line. Stop at an action that opens a new screen or shows a message.
   2. Call `inspect_screen`. Copy each name and id that the scenario uses from it. More actions follow on the new screen: call `run` again without the `launchApp` block.
   3. Add the scenario to the plan file, in the template's form, with the sentence forms below.

   | The `run` reply contains | Do |
   | --- | --- |
   | `"success":true` | Go on. |
   | `Element not found` | The id or text is not on the screen. The step waited 17 seconds for it. Call `inspect_screen`, copy the right `rid` or `txt`, and call `run` again. After 2 tries, drop the scenario and name it under `Not checked:`. |
   | `Couldn't hide the keyboard` | Do A3. |
   | No row matches | Drop the scenario. Name it and the error under `Not checked:`. |

   Sentence forms. Change only the quoted text, the values, and the ids. Step 1 of every scenario is the `Launch` line. With start steps, step 2 is the `Do the start steps.` line. Without them, leave that line out. Do not write a step for closing the keyboard.

   ```markdown
   1. Launch the app with cleared state.
   2. Do the start steps.
   3. Type `Grace Hopper` into "Display name" (id `profile-name`).
   4. Tap "Save profile" (id `profile-save`).
   5. Tap "Change photo" (no id).

   - The text "Profile saved" is visible.
   - "Edit profile" (id `account-edit`) is visible.
   - The element with id `profile-updated` is visible.
   - The text "That name is taken" is not visible.
   ```

   | The element you expect | Expect line |
   | --- | --- |
   | Has an id, and its text holds an order number, a date, a time, or another value that changes from run to run | The `The element with id` form, with no text |
   | Has an id | The `"Edit profile" (id ...)` form. The flow checks the id and the text. |
   | No row matches: it has no id | The `The text` form |

   - The `**Flow:**` line of a scenario is `test/mobile/profile/01-new-name.flow.yaml`: the feature's folder, the scenario's place in the plan as `01` to `08`, and two or three words of its name.
   - A scenario passes a system dialog, or must go back: do section A.
   - No form fits: write one short sentence in the same style and name it under `Not checked:`.

10. **Reply** with this form and nothing else. The values shown are examples. A line you have nothing for gets `none`.

    ```text
    Plan file: test/mobile/plan/profile.plan.md
    Platform: Android
    Device: emulator-5554
    Scenarios: 4
    Elements with no id: "Change photo" on the profile screen
    Texts from source, not seen on the device: none
    Verdict: DONE
    Not checked: iOS
    ```

    `Verdict:` is `DONE`, or `BLOCKED:` and the sentence from the step that stopped you. `Not checked:` always names the platform you did not walk.

## Never

- Call another tool of the maestro server. The others upload to a cloud service, open a viewer, or fetch from the network.
- Use `takeScreenshot`, `startRecording`, `runScript`, or `evalScript` in a `yaml`. They write files or run code outside the device.
- Add a `testID` to the source. Report the element under `Elements with no id:`.

## A. Dialogs, going back, and the iOS keyboard

Enter only from step 5 or step 9.

- **A1. A system dialog you tapped away.** Write this step at that place in every scenario that passes it, with the dialog's question and its button: `If "Allow Example to send you notifications?" shows, tap "Allow".` The texts differ on the other platform.
- **A2. Going back.** Tap the app's own back control: it works on both platforms. iOS has no system back button, and on the app's first screen the Android one closes the app. Only when the screen has no back control, write the step `Press the system back button.` and name the scenario under `Not checked:` as Android only.
- **A3. `Couldn't hide the keyboard`.** This is an iOS error. In place of `- hideKeyboard`, tap a text that is not a control: `- tapOn: "Edit your profile"`.
