---
name: qa-mobile-heal
description: "Fix one failing Maestro flow. Edits flows only and reports a product bug instead of hiding it. Usage: /qa-mobile-heal test/mobile/sign-in/02-wrong-password.flow.yaml. This is Android. App id com.example.app"
disable-model-invocation: true
---

# Fix one failing Maestro flow

Read application source (`app/`, `src/`, and similar). Never edit it. Edit only the flow and the subflow it runs.

- Flow, the input: `test/mobile/sign-in/02-wrong-password.flow.yaml`
- Subflow, when the flow has a `runFlow` line: `test/mobile/subflows/open-sign-in.yaml`
- Plan, named on line 1 of the flow: `test/mobile/plan/sign-in.plan.md`

Do the steps in order. In every table, use the first row that matches. When a step says BLOCKED, stop work, go to step 10, and put the sentence after `Verdict: BLOCKED:`.

## Device calls

You use three tools of the maestro MCP server: `list_devices`, `run`, and `inspect_screen`.

`run` runs the one flow on the device. Give it these arguments. Change only the device id, the flow path, and the app id.

```json
{
  "device_id": "emulator-5554",
  "files": ["test/mobile/sign-in/02-wrong-password.flow.yaml"],
  "env": { "APP_ID": "com.example.app" }
}
```

`inspect_screen` reads the screen. Give it the `device_id`. Do not take a screenshot. The reply is JSON. `txt` is the text the user sees. `rid` is the id of the element.

Do not run `maestro test` in this job.

Why: `maestro test` puts Maestro's helper app on the device again, and the MCP server can then lose the device.

## Android and iOS

One flow file serves both platforms. Never copy a flow for the other platform.

| Topic | Android | iOS |
| --- | --- | --- |
| Stable id | The `rid` value in `inspect_screen` | The `rid` value in `inspect_screen` |
| Back | `- back` presses the system back button. | `- back` does nothing. The flow taps the app's own back control. Find it with `inspect_screen`. |
| Permission dialog | A system dialog can cover the app. Copy its texts from `inspect_screen`. | A system alert can cover the app. Copy its texts from `inspect_screen`. They differ from Android. |
| Keyboard | `- hideKeyboard` presses back. With no keyboard open it leaves the screen. | `- hideKeyboard` can fail with `Couldn't hide the keyboard`. A tap on a text that is not a control closes it. |
| Clean state | `clearState: true` clears the app's data. | `clearState: true` clears the app's data. `clearKeychain: true` clears the keychain. |
| No row matches | Look with `inspect_screen`. Name what differs under `Not checked:`. | The same |

A line that must differ goes into the one file, in a `runFlow` block for each platform. Leave out the block of a platform that needs no line.

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
      - tapOn: "Sign in to your account"
```

## Steps

1. **Flow.** Take the flow path from the prompt. No path in the prompt, or no file at that path: run `ls test/mobile`, reply with the folder names and `Which flow?`, and stop. Read the flow. It has `- fixme` under `tags:`: it is marked as a product bug. Do not run it. Go to step 10 with `After: marked fixme`.

2. **Platform and app id.**

   | Value | Take it from | Not there |
   | --- | --- | --- |
   | Platform | The prompt: `This is Android.` or `This is iOS.` | Reply `Which platform? Say "This is Android." or "This is iOS."` and stop. |
   | App id | The prompt: `App id com.example.app`. Otherwise the plan's `**App id (Android):**` or `**App id (iOS):**` line. | The line says `not given`, or there is no plan: reply `Which app id?` and stop. Do not use the other platform's id. |

   The platform is iOS and the computer you run on is Linux or Windows: BLOCKED: `iOS needs a Mac with Xcode. This computer is not a Mac.` Do not run on Android in its place.

3. **Find the device.** Call `list_devices`. Look for a device with `"connected":true` and your platform: `"platform":"android"` or `"platform":"ios"`. Note its `device_id`. Then call `inspect_screen` once, to check that the server can read the device.

   | Result | Do |
   | --- | --- |
   | You have no `list_devices` tool | BLOCKED: `turn on the maestro MCP server in Cursor settings, then ask again.` |
   | Android, and no such device | BLOCKED: `no Android device is connected. Start an emulator or plug in a device, install the app on it, then ask again.` |
   | iOS, and no such device | BLOCKED: `no iOS simulator is booted. iOS needs a Mac with Xcode. Boot a simulator, install the app on it, then ask again.` |
   | The `inspect_screen` reply starts with `Failed to inspect screen` | BLOCKED: `the maestro MCP server cannot read the device. Turn the server off and on in Cursor settings, then ask again.` |
   | No row matches | You have the `device_id`. Go to step 4. |

   A device with `"connected":false` is off. Leave it off: never start a device. Never use a device of the other platform, and never the device `chromium`.

4. **Run the flow.** Call `run` with the arguments from "Device calls". The flow stops at the first line that fails and leaves that screen open.

   | The reply contains | Do |
   | --- | --- |
   | `Files not found` | Call `run` again with the full path of the flow file, from the root of the disk. |
   | `is not connected` | BLOCKED, with the sentence for your platform from step 3. |
   | `"success":true` | Nothing fails. Go to step 10. |
   | `"success":false` | The `error` value in the reply is the failure. Go to step 5. |
   | No row matches | BLOCKED: `the run did not finish.` Put the reply under `Not checked:`. |

5. **Read the failure and the screen.** The error is, for example, `Assertion is false: "Wrong email or password" is visible` or `Element not found: Id matching regex: sign-in-submit`. Find the line of the flow that has the id or text from the error. That is the failing line. The flow does not have it: look in the subflow that the flow's `runFlow` line names. Then call `inspect_screen`.

6. **Classify.** The plan line is the comment above the failing line. Check it against the plan file.

   | The error contains | The screen from step 5 shows | Class |
   | --- | --- | --- |
   | `Invalid File Path` | | **Data or setup**. The `runFlow` line names a file that does not exist. |
   | `Couldn't hide the keyboard` | | **Data or setup** |
   | `Element not found` or `Assertion is false` | The element of the failing line, with the same id or the same whole text | **Timing** |
   | The same | A system dialog on top of the app | **Data or setup** |
   | The same | The element with another id | **Selector** |
   | The same | Another text where the failing line has its text, and the plan has the flow's text | **Product bug** |
   | The same | Another text where the failing line has its text, and the plan has the screen's text | **Data or setup** |
   | The same | Another screen than the plan line describes | **Data or setup** |
   | The same | The right screen without the element, and the source should show it there | **Product bug** |
   | No row matches | | The error names no id and no text: BLOCKED: `the app com.example.app did not launch. Check that it is installed on the device.` Otherwise pick the closest class and name it under `Not checked:`. |

7. **Write the cause before you edit.** One sentence that quotes two things: the error, and the `txt` or `rid` from the screen, the plan line, or the source line that proves it. A guess is not a cause. You cannot quote both: go to step 10 with `Verdict: FAIL` and `Cause: not found`.

8. **Make the smallest fix.** Ask in this order. At the first yes, make that one edit and go to step 9.

   | Ask | Yes: the one edit |
   | --- | --- |
   | 1. Is the class Product bug? | Leave every step and check as it is. Add two lines at the end of `tags:`, as shown below: the comment line, then `- fixme`. |
   | 2. Is the class Timing? | Put the waiting check shown below in place of a failing `assertVisible`, or on the line above a failing `tapOn`. |
   | 3. Is the class Selector? | Change the id in the failing line to the `rid` from the screen, letter for letter. |
   | 4. None of these | Change the one wrong line. The flow differs from the plan: write the plan's value or text. A system dialog: add the block shown below above the failing line. The keyboard: use the Keyboard row of "Android and iOS". A `runFlow` path: `../subflows/` and the file name. |

   The product bug mark. `expected` is the flow's text and `got` is the text on the screen. `src/screens/SignIn.tsx:41` is the source line that holds the text on the screen. Search the source for that text.

   ```yaml
   appId: ${APP_ID}
   name: "Wrong password shows an error"
   tags:
     - sign-in
     # product bug: src/screens/SignIn.tsx:41 expected "Wrong email or password", got "Invalid credentials"
     - fixme
   ---
   ```

   The waiting check. The first form is for a failing line with an id, the second for one with a text. Change only the id or the text. Keep `timeout: 20000`.

   ```yaml
   - extendedWaitUntil:
       visible:
         id: "home-sign-out"
       timeout: 20000
   - extendedWaitUntil:
       visible: "Welcome back, Ada"
       timeout: 20000
   ```

   The block for a system dialog. Copy both texts from the screen.

   ```yaml
   - runFlow:
       when:
         visible: "Allow Example to send you notifications?"
       commands:
         - tapOn: "Allow"
   ```

   - Before you edit a subflow, run `grep -rl "subflows/open-sign-in.yaml" test/mobile` with the file name of the subflow. It prints each flow that runs it. Your edit reaches all of them.
   - Change only the lines that caused the failure. Do not rewrite, rename, reorder, or reformat anything else.
   - Do not add `optional: true`, `retry`, `repeat`, or a longer timeout on another line. Keep every existing check.

   Why: Maestro has no command that marks a flow as an expected failure. A folder run with `--exclude-tags=fixme` leaves the tagged flow out, and the comment says why.

9. **Check the file, then run again.** `maestro check-syntax test/mobile/sign-in/02-wrong-password.flow.yaml` with the file you edited. It prints `OK`. Anything else names the fault: correct the file and check again. You marked a product bug: do not run the flow again, because it still fails. Go to step 10 with `After: marked fixme`. Otherwise call `run` as in step 4. You have 3 rounds. One edit and one `run` call is one round.

   | The reply contains | Do |
   | --- | --- |
   | `"success":true`, after a Timing fix | Call `run` once more. `"success":true` again: go to step 10. Otherwise go to step 10 with `Verdict: FAIL`. |
   | `"success":true` | Go to step 10. |
   | `"success":false` with the same error | The fix was wrong. Put the old line back by editing the file. Do not use `git restore` or `git checkout`: they also remove your earlier fixes. Then call `inspect_screen` and go to step 6. |
   | `"success":false` with another error | The fix worked. Keep it. Go to step 5. |
   | No row matches | Go to step 10 with `Verdict: FAIL`. |

   After round 3, do not go back to step 5 or 6. Go to step 10 with `Verdict: FAIL`. You edited a subflow: name each other flow that `grep` printed under `Not checked:`.

10. **Reply** with this form and nothing else. The values shown are examples. A line you have nothing for gets `none`.

    ```text
    Flow: test/mobile/sign-in/02-wrong-password.flow.yaml
    Platform: Android
    Class: Product bug
    Cause: the screen shows "Invalid credentials" and plan line 2.1 expects "Wrong email or password"
    Fix: tag fixme in test/mobile/sign-in/02-wrong-password.flow.yaml, product bug at src/screens/SignIn.tsx:41
    Before: Assertion is false: "Wrong email or password" is visible
    After: marked fixme
    Verdict: PASS
    Not checked: iOS
    ```

    `Class:` is `Selector`, `Timing`, `Data or setup`, or `Product bug`. `Fix:` is the file and line you changed. `Before:` is the `error` value of the first run, copied exactly. `After:` is `"success":true`, or the `error` value of the last run, or `marked fixme`. `Verdict:` is `PASS` when `After:` is `"success":true` or `marked fixme`. Otherwise it is `FAIL`, or `BLOCKED:` and the sentence from the step that stopped you. `Not checked:` always names the platform you did not run on.

## Never

- Delete a flow or a check, or weaken one: `optional: true`, or a text such as `".*"` that matches anything.
- Tag a flow `fixme` for anything but a product bug you can point to in the source.
- Use `point:` or other screen coordinates, or any wait but `extendedWaitUntil`.
- Start, create, or change a device, or install the app. Run on the other platform when yours has no device.
- Call a tool of the maestro server other than `list_devices`, `run`, and `inspect_screen`. The others upload to a cloud service, open a viewer, or fetch from the network.
