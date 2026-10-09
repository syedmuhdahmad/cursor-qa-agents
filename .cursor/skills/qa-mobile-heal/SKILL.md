---
name: qa-mobile-heal
description: "Fix one failing Maestro flow. Fixes a selector once in the element file and reports a product bug instead of hiding it. Usage: /qa-mobile-heal test/mobile/profile/02-taken-name.flow.yaml. This is Android. App id com.example.app"
disable-model-invocation: true
---

# Fix one failing Maestro flow

Read application source (`app/`, `src/`, and similar). Never edit it. Edit only the flow, the subflow it runs, the loader, and the element files of your platform.

- Flow, the input: `test/mobile/profile/02-taken-name.flow.yaml`
- Subflow, when the flow runs one: `test/mobile/subflows/open-profile.yaml`
- Element file, which holds the selectors of one screen: `test/mobile/elements/android/profile.js` on Android, `test/mobile/elements/ios/profile.js` on iOS. `${output.profile.saveProfile}` in a flow is the name `saveProfile` in `profile.js`, and `output.orderHistory` is in `order-history.js`.
- Loader, which runs the element files: `test/mobile/elements/load.yaml`
- Plan, named on line 1 of the flow: `test/mobile/plan/profile.plan.md`

One flow file serves Android and iOS: never copy a flow for the other platform. The element files are separate: work only in the folder of your platform, `android` or `ios`, and never read, create, or edit a file in the other one. The paths and commands below show `android`: on iOS, write `ios` there. A wrong selector is fixed once, in the element file. Never write an id into a flow.

The examples are from another app. Take your names, texts, and paths from the prompt, the flow, and the device.

Do the steps in order. In every table, use the first row that matches. When a step says BLOCKED, stop work, go to step 10, and put the sentence after `Verdict: BLOCKED:`.

## Device calls

You use three tools of the maestro MCP server: `list_devices`, `run`, and `inspect_screen`. Do not run `maestro test` in this job.

Why: `maestro test` removes Maestro's helper app from the device when it ends. The MCP server then cannot reach the device until it is turned off and on.

`run` runs the one flow on the device. Give it these arguments. Change only the device id, the flow path, and the app id.

```json
{
  "device_id": "emulator-5554",
  "files": ["test/mobile/profile/02-taken-name.flow.yaml"],
  "env": { "APP_ID": "com.example.app" }
}
```

`inspect_screen` reads the screen. Give it the `device_id`. Do not take a screenshot. The reply is JSON: a tree of objects under `"elements"`. Each object holds the objects inside it under `"c"`: read those too. Here are a button and a message, with the keys `b` and `cls` left out.

```text
{"a11y":"Save profile","rid":"profile-save","clickable":true,"c":[{"txt":"Save profile"}]}
{"txt":"That name is taken","rid":"profile-error"}
```

- `rid` is the id of the element. An object with no `rid`, inside the `c` of an object that has one, belongs to that id. A React Native `testID` shows here as it is written.
- `txt` is the text the user sees. In a field it is the typed value.
- `a11y` is the name of a button or a field that has no `txt`. Ignore the other keys.
- The reply also holds the status bar, the keyboard when it is open, and the device's home screen when the app is closed. They are not the app. On Android, ignore every object whose `rid` starts with `com.android.systemui`, or has `inputmethod` or `launcher` in it.

## Steps

1. **Flow.** Take the flow path from the prompt. No path in the prompt, or no file at that path: run `ls test/mobile`, reply with the folder names and `Which flow?`, and stop. Read the flow. It has `- fixme` under `tags:`: it is marked as a product bug. Do not run it. Go to step 10 with `After: marked fixme`.

2. **Platform and app id.**

   | Value | Take it from | Not there |
   | --- | --- | --- |
   | Platform | The prompt: `This is Android.` or `This is iOS.` | Reply `Which platform? Say "This is Android." or "This is iOS."` and stop. |
   | App id | The prompt: `App id com.example.app`. Otherwise the plan's `**App id (Android):**` or `**App id (iOS):**` line. | The line says `not given`, or there is no plan: reply `Which app id?` and stop. Do not use the other platform's id. |

   The platform is iOS and the computer you run on is Linux or Windows: BLOCKED: `iOS needs a Mac with Xcode. This computer is not a Mac.`

3. **Find the device.** Call `list_devices`. Look for a device with `"connected":true` and your platform: `"platform":"android"` or `"platform":"ios"`. Note its `device_id`. Then call `inspect_screen` once, to check that the server can read the device.

   | Result | Do |
   | --- | --- |
   | You have no `list_devices` tool | BLOCKED: `turn on the maestro MCP server in Cursor settings, then ask again.` |
   | Android, and no such device | BLOCKED: `no Android device is connected. Start an emulator or plug in a device, install the app on it, then ask again.` |
   | iOS, and no such device | BLOCKED: `no iOS simulator is booted. iOS needs a Mac with Xcode. Boot a simulator, install the app on it, then ask again.` |
   | The `inspect_screen` reply starts with `Failed to inspect screen` | BLOCKED: `the maestro MCP server cannot read the device. Turn the server off and on in Cursor settings, then ask again.` |
   | No row matches | You have the `device_id`. Go to step 4. |

   A device with `"connected":false` is off. Leave it off: you never start a device or install the app. Never use a device of the other platform, or the device `chromium`.

4. **Run the flow.** Call `run` with the arguments from "Device calls". A run takes up to a minute: a line that fails waits 17 seconds first. The flow stops at the first line that fails and leaves that screen open.

   | The reply contains | Do |
   | --- | --- |
   | `Files not found` | Call `run` again with the full path of the flow file, from the root of the disk. |
   | `is not connected` | BLOCKED, with the sentence for your platform from step 3. |
   | `Device server died` | BLOCKED, with the sentence of the `Failed to inspect screen` row in step 3. |
   | `Package undefined is not installed` | The `env` argument was missing. Call `run` again with `env` and the app id. |
   | `is not installed` | BLOCKED: `the app com.example.app is not installed on the device. Install it, then ask again.` |
   | `"success":true` | Nothing fails. Go to step 10. |
   | `"success":false` | The `error` value in the reply is the failure. Go to step 5. |
   | No row matches | BLOCKED: `the run did not finish.` Put the reply under `Not checked:`. |

5. **Read the failure.** In the reply, each `"` inside the error has a `\` in front of it. Leave the `\` out when you copy the error. This table is for an error that names no element. Your error is in it: do the fix and go to step 9. The class is **Data or setup**, and the cause is the first sentence of the row.

   | The error has | The one fix |
   | --- | --- |
   | `Parsing Failed at` and the path of the loader | A `- runScript:` line of the loader names a file that does not exist. Run `ls test/mobile/elements/android`. A line in the block of your platform names a file that `ls` does not print: correct that line. Otherwise: BLOCKED: `the loader names an element file of the other platform that does not exist.` |
   | `Invalid File Path at` and the path of a flow | The `runFlow` line there names a file that does not exist. Write `../elements/load.yaml`, or `../subflows/` and the file name. |
   | `SyntaxError`, as in `SyntaxError: <eval>:4:2 Expected comma but found ident` | An element file is broken at line `4`. The error ends with that line, such as `saveProfile: 'profile-save',`. Run `grep -rn "saveProfile" test/mobile/elements/android` with a word of it to find the file. Give every line in the braces that form. Most often a comma or a quote is missing one line up. |
   | `TypeError`, as in `TypeError: Cannot read property 'saveProfile' of undefined` | The element file of a screen did not run. The flow line with `.saveProfile}` names it: `output.profile` is `profile.js`. Run `ls test/mobile/elements/android`. The file is not there: BLOCKED: `the element file test/mobile/elements/android/profile.js does not exist. Ask /qa-mobile-generate with element files only.` Otherwise correct the first of these that is wrong. The first command of the flow is `- runFlow: ../elements/load.yaml`. The block of your platform in the loader has `- runScript: android/profile.js`. The file has the line `output.profile = {`. |
   | `regex: undefined` or `id: undefined` | A flow line has a name that its element file does not have: the first `${output...}` of the flow, or of its subflow, whose name is not in the file. Call `inspect_screen` and find the element that the comment above that line names. Add the name to the element file, above the closing `}`, with its `rid`, or with its whole text when the name ends in `Text`. The element is not on the screen: go to step 10 with `Verdict: FAIL`. |
   | No row matches | The error names an element. Go on below this table. |

   An error that names an element has one of these forms.

   ```text
   Element not found: Id matching regex: profile-save
   Element not found: Text matching regex: Change photo
   Assertion is false: id: account-edit is visible
   Assertion is false: "That name is taken" is visible
   Assertion is false: "Edit profile", id: account-edit is visible
   Assertion is false: "That name is taken" is not visible
   ```

   Find the failing line. A text of the error is in the flow, or in the subflow it runs: that line fails. Otherwise run `grep -rn "profile-save" test/mobile/elements/android` with the id or text. It prints the line of the element file, such as `saveProfile: 'profile-save',`. The first line of the flow or its subflow with `.saveProfile}` fails. Then call `inspect_screen`.

6. **Classify.** The plan line is the comment above the failing line. Check it against the plan file. The row gives the class and the one edit. Step 8 shows the mark and the waiting check. Do not edit yet.

   | The error, or the screen from step 5 | Class | The one edit |
   | --- | --- | --- |
   | The error has `Couldn't hide the keyboard` | **Data or setup** | Section A, the keyboard |
   | The error has `is not visible`, and you can name the source line that shows the element | **Product bug** | The product bug mark |
   | The error has `is not visible` | **Data or setup** | None. Go to step 10 with `Verdict: FAIL`. |
   | The error names no id and no text | None | BLOCKED: `the app com.example.app did not launch. Check that it is installed on the device.` Put the error under `Not checked:`. |
   | The screen shows the element of the failing line, with every id and text that the line and its element file give, letter for letter | **Timing** | The waiting check on the line above the failing line. Keep the failing line. |
   | A system dialog on top of the app | **Data or setup** | Section A, the dialog |
   | A screen of another app with no button to close it, such as a Google sign-in screen | None | BLOCKED: `another app covers the app on the device. Close it, then ask again.` |
   | The element with another id | **Selector** | In the element file of your platform, change the selector of that name to the `rid` from the screen, letter for letter. Change no flow. |
   | Another text where the flow has an expected text, and only an order number, a date, or a time that changes from run to run differs | **Data or setup** | In the `text:` line, keep the start that stays the same and put `.*` in place of the rest: `text: "Order .*"`. Nothing at the start stays the same: delete the `text:` line, keep the `id:` line, and name the element under `Not checked:`. |
   | Another text than the flow or the element file has, and the plan has that old text | **Product bug** | The product bug mark |
   | Another text than the flow or the element file has, and the plan has the screen's text | **Data or setup** | Write the plan's text: in the flow for an expected text, in the element file for a name that ends in `Text`. |
   | Another screen than the plan line describes | **Data or setup** | A line of the flow differs from its plan line: write the plan's value. Otherwise section A, the keyboard or going back. |
   | The right screen without the element, and the source should show it there | **Product bug** | The product bug mark |
   | No row matches | Pick the closest class and name it under `Not checked:`. | The edit of that class's row |

   A `text:` line that ends in `.*`: Maestro reads the text of a check as a pattern. In the start that you keep, put `\\` in front of each of these characters: `. * + ? ( ) [ ] { } | ^ $`. `"Total (USD)"` gives `"Total \\(USD\\).*"`. Write a `\` in the start as `\\\\`.

7. **Write the cause before you edit.** One sentence that quotes two things: the error, and the `txt` or `rid` from the screen, the plan line, or the source line that proves it. A guess is not a cause. You cannot quote both: go to step 10 with `Verdict: FAIL` and `Cause: not found`.

8. **Make the smallest fix.** Make the one edit of your row in step 6, then go to step 9.

   The product bug mark is two lines at the end of `tags:`: the comment line, then `- fixme`. Leave every step and check as it is. `expected` is the flow's text and `got` is the text on the screen. For an error with `is not visible`, write `expected no "That name is taken", got "That name is taken"`. `src/screens/EditProfile.tsx:41` is the source line that holds the text on the screen. Search the source for that text.

   ```yaml
   appId: ${APP_ID}
   name: "A taken name shows an error"
   tags:
     - profile
     # product bug: src/screens/EditProfile.tsx:41 expected "That name is taken", got "Name unavailable"
     - fixme
   ---
   ```

   The waiting check. Under `visible:` go the same lines as under the failing command. Keep `timeout: 60000`: `tapOn` and `assertVisible` already wait 17 seconds by themselves.

   ```yaml
   - extendedWaitUntil:
       visible:
         id: ${output.account.editProfile}
       timeout: 60000
   - extendedWaitUntil:
       visible: "Profile saved"
       timeout: 60000
   ```

   - An edit of an element file or a subflow reaches every flow that uses it: the cause is fixed once. Run `grep -rl "profile.saveProfile}" test/mobile` with the name, or `grep -rl "subflows/open-profile.yaml" test/mobile` with the file name. It prints those flows. Name each of them but your own under `Not checked:`, because you do not run them.
   - Change only the lines that caused the failure. Do not rewrite, rename, reorder, or reformat anything else. In an element file, never rename or remove a name, and never add code.
   - Do not add `optional: true`, `retry`, `repeat`, or a longer timeout on another line. Keep every existing check.

   Why: Maestro has no command that marks a flow as an expected failure. A folder run with `--exclude-tags=fixme` leaves the tagged flow out, and the comment says why.

9. **Check the file, then run again.** You edited a flow, a subflow, or the loader: run `maestro check-syntax test/mobile/profile/02-taken-name.flow.yaml` with that file. It prints `OK`. Anything else names the fault: correct the file and check again. Do not run it on an element file. You marked a product bug: do not run the flow again, because it still fails. Go to step 10 with `After: marked fixme`. Otherwise call `run` as in step 4. You have 3 rounds. One edit and one `run` call is one round.

   | The reply contains | Do |
   | --- | --- |
   | `"success":true`, after a Timing fix | Call `run` once more. `"success":true` again: go to step 10. Otherwise go to step 10 with `Verdict: FAIL`. |
   | `"success":true` | Go to step 10. |
   | `"success":false` with the same error | The fix was wrong. Put the old line back by editing the file. Do not use `git restore` or `git checkout`: they also remove your earlier fixes. Then go to step 5. |
   | `"success":false` with another error | The fix worked. Keep it. Go to step 5. |
   | No row matches | Go to step 10 with `Verdict: FAIL`. |

   After round 3, do not go back to step 5. Go to step 10 with `Verdict: FAIL`.

10. **Reply** with this form and nothing else. The values shown are examples. A line you have nothing for gets `none`.

    ```text
    Flow: test/mobile/profile/02-taken-name.flow.yaml
    Platform: Android
    Class: Selector
    Cause: the error has the id profile-save and the screen shows "Save profile" with the rid profile-save-button
    Fix: saveProfile in test/mobile/elements/android/profile.js, from 'profile-save' to 'profile-save-button'
    Before: Element not found: Id matching regex: profile-save
    After: "success":true
    Verdict: PASS
    Not checked: iOS, test/mobile/profile/01-new-name.flow.yaml
    ```

    `Class:` is `Selector`, `Timing`, `Data or setup`, or `Product bug`. `Fix:` is the file and the line you changed, or `tag fixme` and the source line of the bug. `Before:` is the `error` value of the first run, copied exactly. `After:` is `"success":true`, or the `error` value of the last run, or `marked fixme`. `Verdict:` is `PASS` when `After:` is `"success":true` or `marked fixme`. Otherwise it is `FAIL`, or `BLOCKED:` and the sentence from the step that stopped you. `Not checked:` always names the platform you did not run on.

## Never

- Delete a flow or a check, or weaken one: `optional: true`, or a text such as `".*"` that matches anything. The `text:` line of step 6, for a text that changes from run to run, is the one exception.
- Tag a flow `fixme` for anything but a product bug you can point to in the source.
- Write an id, `point:`, or other screen coordinates into a flow, or use any wait but `extendedWaitUntil`.
- Call a tool of the maestro server other than `list_devices`, `run`, and `inspect_screen`.

## A. Dialogs, the keyboard, and going back

Enter only from step 6. A line that must differ by platform goes into the one flow file, in a `runFlow` block with `platform: Android` or `platform: iOS`. Leave out the block of a platform that needs no line. The texts of a system dialog, and the text that the iOS block taps, stay in the flow.

- **The dialog.** Add this block above the failing line. Copy both texts from the screen. They differ on the other platform.

  ```yaml
  - runFlow:
      when:
        visible: "Allow Example to send you notifications?"
      commands:
        - tapOn: "Allow"
  ```

- **The keyboard.** With the keyboard open, a tap can close the keyboard and miss the button: put `- hideKeyboard` above the tap. With no keyboard open, `- hideKeyboard` presses back on Android, which can close the app: delete that line. `Couldn't hide the keyboard` is an iOS error: put these blocks in place of the line. The iOS block taps a text that is not a control.

  ```yaml
  - runFlow:
      when:
        platform: Android
      commands:
        - hideKeyboard
  - runFlow:
      when:
        platform: iOS
      commands:
        - tapOn: "Edit your profile"
  ```

- **Going back.** `- back` presses the system back button on Android. On the app's first screen that closes the app. On iOS it does nothing: the flow taps the app's own back control. Find it with `inspect_screen`.

None of the three fits: go to step 10 with `Verdict: FAIL`.
