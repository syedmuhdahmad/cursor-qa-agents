---
name: qa-mobile-plan
description: "Plan Maestro coverage for one feature of a mobile app and save it as one plan file. Usage: /qa-mobile-plan sign-in. This is Android. App id com.example.app"
disable-model-invocation: true
---

# Plan Maestro coverage for one feature

You explore one feature of a mobile app on a device and write one plan file. You write no flow and you run no test.

Read application source (`app/`, `src/`, and similar). Never edit it.

- Plan: `test/mobile/plan/sign-in.plan.md`. `sign-in` is the feature name. Change only that part.
- Template: `.cursor/skills/qa-mobile-plan/templates/plan.md`.

Do the steps in order. In every table, use the first row that matches. When a step says BLOCKED, stop work, go to step 10, and put the sentence after `Verdict: BLOCKED:`.

## Device calls

You use three tools of the maestro MCP server: `list_devices`, `run`, and `inspect_screen`.

`run` does actions on the device. Give it the `device_id` and a `yaml`. The `yaml` always starts with the two lines `appId: com.example.app` and `---`, and always ends with the line `- waitForAnimationToEnd`. Change only the app id, the ids, and the values.

```yaml
appId: com.example.app
---
- launchApp:
    clearState: true
    clearKeychain: true
- tapOn:
    id: "sign-in-email"
- inputText: "ada@example.com"
- hideKeyboard
- tapOn:
    id: "sign-in-submit"
- waitForAnimationToEnd
```

Why: `inspect_screen` does not wait. Without that last line it shows the screen from before the launch or the tap.

| To do | Lines in the `yaml` |
| --- | --- |
| Start from a clean app | The `launchApp` block above, with both `clear` lines |
| Type into a field | `- tapOn:` with the field's `id`, then `- inputText: "ada@example.com"` |
| Tap an element | `- tapOn:` with its `id` |
| Tap an element that has no id | `- tapOn: "Forgot password?"`, with its whole text |
| Tap straight after typing | `- hideKeyboard`, then the `- tapOn:`. Without it the tap can close the keyboard and miss the button. Write `- hideKeyboard` nowhere else. |
| No row matches | Do not act. Name the step under `Not checked:`. |

A `run` that worked replies with `"success":true`. A `run` that failed replies with `Failed to run flow:` and the error. An error with `Device server died`, at any step: BLOCKED: `the maestro MCP server cannot read the device. Turn the server off and on in Cursor settings, then ask again.`

`inspect_screen` reads the screen. Give it the `device_id`. Do not take a screenshot. The reply is JSON: a tree of objects under `"elements"`, and each object holds the objects inside it under `"c"`. Here are a button and a message, with the keys `b` and `cls` left out.

```text
{"a11y":"Sign in","rid":"sign-in-submit","clickable":true,"c":[{"txt":"Sign in"}]}
{"txt":"Wrong email or password","rid":"sign-in-error"}
```

| Key | Meaning | In the plan |
| --- | --- | --- |
| `txt` | The text the user sees. In a field it is the typed value. | Copy it letter for letter. Do not write a text from memory. |
| `rid` | The id of the element | Copy it letter for letter. An object with no `rid`, inside the `c` of an object that has one: use that `rid`, as for "Sign in" above. Neither has a `rid`: write `(no id)`. |
| `hint` | The grey text in an empty field | The name of a field |
| `a11y` | The text a screen reader says | The name of a button, and of a field that has no `hint` |
| `c` | The objects inside this one | Read them too. |
| No row matches | Any other key | Ignore it. |

The quoted name in a plan line, such as "Sign in" or "Email", comes from these keys. For a field it is the `hint`, and with no `hint` the `a11y`, never the `txt`. For any other element it is the `txt`, and with no `txt` the `a11y`.

An id is only what `rid` shows. The source has a `testID` for the element: check that `rid` shows the same value before you write it down.

## Android and iOS

One plan serves both platforms. You walk it on the platform the prompt names.

| Topic | Android | iOS |
| --- | --- | --- |
| Stable id | The `rid` value in `inspect_screen`. A React Native `testID` shows there as it is written. | The `rid` value in `inspect_screen` |
| Not the app | The reply also holds the status bar, the keyboard when it is open, and the device's home screen when the app is closed. Ignore every object whose `rid` starts with `com.android.systemui`, or has `inputmethod` or `launcher` in it. | Ignore the status bar, the keyboard, and the home screen. |
| Back | The device has a system back button. On the app's first screen it closes the app. | The device has no system back button. |
| Permission dialog | A system dialog can cover the app. Its texts differ from iOS. | A system alert can cover the app. Its texts differ from Android. |
| Keyboard | `- hideKeyboard` closes it. With no keyboard open it presses back, which can close the app. | `- hideKeyboard` can fail with `Couldn't hide the keyboard`. Tap a text that is not a control in its place. |
| Clean state | `clearState: true` clears the app's data. | `clearState: true` clears the app's data. `clearKeychain: true` clears the keychain. |
| No row matches | Look with `inspect_screen`. Name what differs under `Not checked:`. | The same |

## Steps

1. **Settings.** Take each value from the prompt.

   | Value | In the prompt | Not in the prompt |
   | --- | --- | --- |
   | Feature | In lower case with hyphens: `sign-in` | Reply `Which feature?` and stop. |
   | Platform | `This is Android.` or `This is iOS.` | Reply `Which platform? Say "This is Android." or "This is iOS."` and stop. |
   | App id | The id the app is installed under: `App id com.example.app` | Reply `Which app id?` and stop. Do not guess it. |

   The platform is iOS and the computer you run on is Linux or Windows: BLOCKED: `iOS needs a Mac with Xcode. This computer is not a Mac.` Do not plan for Android in its place.

2. **Find the device.** Call `list_devices`. Look for a device with `"connected":true` and the platform from step 1: `"platform":"android"` or `"platform":"ios"`. Note its `device_id`, such as `emulator-5554`. Every later call takes it. Then call `inspect_screen` once, to check that the server can read the device.

   | Result | Do |
   | --- | --- |
   | You have no `list_devices` tool | BLOCKED: `turn on the maestro MCP server in Cursor settings, then ask again.` |
   | Android, and no such device | BLOCKED: `no Android device is connected. Start an emulator or plug in a device, install the app on it, then ask again.` |
   | iOS, and no such device | BLOCKED: `no iOS simulator is booted. iOS needs a Mac with Xcode. Boot a simulator, install the app on it, then ask again.` |
   | The `inspect_screen` reply starts with `Failed to inspect screen` | BLOCKED: `the maestro MCP server cannot read the device. Turn the server off and on in Cursor settings, then ask again.` |
   | No row matches | You have the `device_id`. Go to step 3. |

   A device with `"connected":false` is off. Leave it off: never start a device. Never use a device of the other platform, and never the device `chromium`.

3. **Launch the app.** Call `run` with a `yaml` of these lines from "Device calls": the two first lines, the `launchApp` block, and `- waitForAnimationToEnd`.

   | The reply contains | Do |
   | --- | --- |
   | `"success":true` | The app is open. Go to step 4. |
   | `is not connected` | BLOCKED, with the sentence for your platform from step 2. |
   | No row matches | BLOCKED: `the app com.example.app did not launch. Check that it is installed on the device.` Put the error from the reply under `Not checked:`. |

4. **Read the screen.** Call `inspect_screen`. Note the `txt` or `a11y`, and the `rid`, of each field, button, and message. The reply shows nothing of the app, only the status bar, the device's home screen, or a screen of another app: call `inspect_screen` again. Still nothing of the app after 3 calls: BLOCKED: `the app com.example.app is not on the screen of the device. Close what covers it, then ask again.`

5. **Reach the feature's screen.**

   | The screen shows | Do |
   | --- | --- |
   | The feature | There are no start steps. Go to step 6. |
   | A sign-in form, and the prompt gives no account | BLOCKED: `this feature needs a signed-in user. Ask again with a test account.` |
   | A system dialog | Tap its button with `run`. Note the dialog's question and the button, then read the screen again. |
   | No row matches: another screen of the app | Do the actions that open the feature, with `run`. Call `inspect_screen` after each new screen. These actions are the start steps. Note each one. |

   After 6 actions the feature's screen is still not open: BLOCKED: `no way found from the first screen to the feature. Ask again and say how to open it.`

6. **Read the source for this screen only.** Search the source for one text from the screen, for example `Sign in`. Read the screen's file, the app files it imports, and the code it calls on the server. At most 6 files. Note each validation message, each error message, and any test account the source creates.

7. **List 3 to 8 scenarios**, one line each. Name each scenario in plain words, with no quotes and no colon. This table is a list: go through every row, top to bottom.

   | Scenario | Group | Count |
   | --- | --- | --- |
   | The main flow that ends in success | `Main flow` | 1 |
   | A validation message from the source | `Validation` | 1 for each message |
   | An error message the screen shows when the server refuses, such as a wrong password | `Errors` | 1 for each message |
   | More than 8 lines | | Keep the first 8. Name the others under `Not checked:`. |
   | Fewer than 3 lines | | Keep them. Say so under `Not checked:`. |

   A scenario that needs an account or a record uses one from the prompt or from the source you read. None found: drop the scenario and name it under `Not checked:`. Do not invent data. A scenario that needs the server to fail cannot be walked, because Maestro cannot mock the network. Name it under `Not checked:`.

8. **Start the plan file.** Read the template. Write the plan file with only the lines above `## 1. GROUP`, the words in CAPITALS replaced.

   | Line | Write |
   | --- | --- |
   | `**Walked on:**` | `Android` or `iOS`, the platform from step 1 |
   | `**App id (Android):**` and `**App id (iOS):**` | The app id from the prompt on the line of your platform. `not given` on the other line. |
   | `**Source:**` | The screen's file from step 6, or `not found` |
   | `**Data:**` | The account or records the scenarios use, or `none` |
   | `## Start steps` | Step 5 gave start steps: the `**Subflow:**` line with the feature name, then one numbered line for each start step. It gave none: leave the whole section out. |
   | No row matches | Copy the template line. |

9. **Walk one scenario, add it to the plan file, then take the next.**

   1. Call `run` with one `yaml`: the two first lines, the `launchApp` block, the start steps, then the scenario's actions. Stop at an action that opens a new screen or shows a message. The last line is `- waitForAnimationToEnd`.
   2. Call `inspect_screen`. Copy each text and id that the scenario names from `txt`, `a11y`, and `rid`. More actions follow on the new screen: call `run` again without the `launchApp` block.
   3. Add the scenario to the plan file, in the template's form, with the sentence forms below.

   | The `run` reply contains | Do |
   | --- | --- |
   | `"success":true` | Go on. |
   | `Element not found` | The id or text is not on the screen. The step waited 17 seconds for it. Call `inspect_screen`, copy the right `rid` or `txt`, and call `run` again. After 2 tries, drop the scenario and name it under `Not checked:`. |
   | `Couldn't hide the keyboard` | Use the Keyboard row of "Android and iOS". |
   | No row matches | Drop the scenario. Name it and the error under `Not checked:`. |

   Sentence forms. Change only the quoted text, the values, and the ids. Step 1 of every scenario is the `Launch` line. With start steps, step 2 is the `Do the start steps.` line. Without them, leave that line out.

   ```markdown
   1. Launch the app with cleared state.
   2. Do the start steps.
   3. Type `ada@example.com` into "Email" (id `sign-in-email`).
   4. Tap "Sign in" (id `sign-in-submit`).
   5. Tap "Forgot password?" (no id).
   6. If "Allow Example to send you notifications?" shows, tap "Allow".
   7. Press the system back button.

   - The text "Welcome back, Ada" is visible.
   - "Sign out" (id `home-sign-out`) is visible.
   - The element with id `order-number` is visible.
   - The text "Wrong email or password" is not visible.
   ```

   | The element you expect | Expect line |
   | --- | --- |
   | Has an id, and its text is the same on every run | The `"Sign out" (id ...)` form. The flow checks the id and the text. |
   | Has an id, and its text holds an order number, a date, a time, or another value that changes from run to run | The `The element with id` form, with no text |
   | Has no id | The `The text` form |
   | No row matches | The `The text` form. Name the line under `Not checked:`. |

   - The `**Flow:**` line of a scenario is `test/mobile/sign-in/01-valid-account.flow.yaml`: the feature's folder, the scenario's place in the plan as `01` to `08`, and two or three words of its name.
   - To go back, tap the app's own back control: it works on both platforms. Write `Press the system back button.` only when the screen has no back control, and name the scenario under `Not checked:` as Android only.
   - A system dialog you tapped away: write the `If "..." shows, tap "...".` line at that place in every scenario that passes it.
   - Do not write a step for closing the keyboard.
   - No form fits: write one short sentence in the same style and name it under `Not checked:`.

10. **Reply** with this form and nothing else. The values shown are examples.

    ```text
    Plan file: test/mobile/plan/sign-in.plan.md
    Platform: Android
    Device: emulator-5554
    Scenarios: 4
    Elements with no id: "Forgot password?" on the sign-in screen
    Texts from source, not seen on the device: none
    Verdict: DONE
    Not checked: iOS
    ```

    `Verdict:` is `DONE`, or `BLOCKED:` and the sentence from the step that stopped you. `Not checked:` always names the platform you did not walk.

## Never

- Start, create, or change a device, or install the app. The user does that.
- Switch to the other platform when yours has no device.
- Call another tool of the maestro server. The others upload to a cloud service, open a viewer, or fetch from the network.
- Use `takeScreenshot`, `startRecording`, `runScript`, or `evalScript` in a `yaml`. They write files or run code outside the device.
- Add a `testID` to the source. Report the element under `Elements with no id:`.
