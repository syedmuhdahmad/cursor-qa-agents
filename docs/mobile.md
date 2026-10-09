# Mobile testing with Maestro

Three skills plan, write, and fix [Maestro](https://maestro.dev) flows for an Android or iOS app: `/qa-mobile-plan`, `/qa-mobile-generate`, and `/qa-mobile-heal`. Treat them as a preview. [What was run](#what-was-run) says what stands behind them.

## What you need

- The [Maestro CLI](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli), 2.6.0 or later, and Java 17 or later.
- Android: `adb` on your `PATH`, and a running emulator or a device with USB debugging.
- iOS: a Mac with Xcode and a booted Simulator. Physical iOS devices are not supported. This line is from Maestro's documentation and was not run.

You start the device and install the app. The agent never boots a device, never installs an app, and never switches to the other platform. Install a real build of the app, not Expo Go: the flows launch the app under its own id.

For plan and heal, turn on the `maestro` MCP server in Cursor settings, and keep it off when you do no mobile work.

Every flow starts by clearing the app's data on the device, and Maestro installs two helper apps of its own there. Do not point the skills at a device whose app data you need.

A React Native `testID` is the id the flows use. On Android it shows on the device exactly as it is written in the source.

## Start a job

Name the platform and the app id in the prompt:

| Job | Prompt | What the agent does |
| --- | --- | --- |
| Plan | `/qa-mobile-plan sign-in. This is Android. App id com.example.app` | Walks one feature on the device and saves `test/mobile/plan/sign-in.plan.md` with the texts and ids it saw. |
| Generate | `/qa-mobile-generate test/mobile/plan/sign-in.plan.md. This is Android.` | Writes one flow file for each scenario in `test/mobile/sign-in/`, then runs that folder. |
| Heal | `/qa-mobile-heal test/mobile/sign-in/02-wrong-password.flow.yaml. This is Android.` | Runs one failing flow, reads the screen where it stops, and makes the smallest fix. |

One flow file serves both platforms. A product bug is not hidden: the flow gets the tag `fixme` and a `# product bug:` comment that names the source line.

## Layout

```text
test/mobile/plan/<feature>.plan.md                Plans
test/mobile/<feature>/<nn>-<scenario>.flow.yaml   Flows, one scenario per file
test/mobile/subflows/<name>.yaml                  Start steps shared by the flows of one plan
test/mobile/config.yaml                           Settings for a run of the whole folder
```

## Run the flows yourself

To run the flows of one feature:

```bash
maestro test --platform android --exclude-tags=fixme -e APP_ID=com.example.app test/mobile/sign-in
```

`--exclude-tags=fixme` leaves out the flows that record a product bug. It has no effect when you pass a single file: a marked flow run alone still runs and fails.

A run prints one line for each flow and then a summary line:

```text
[Failed] A missing element fails (23s) (Element not found: Id matching regex: nav-wishlist)
[Passed] One item shows in the cart (10s)

1/2 Flow Failed
```

When every flow passes, the summary line is `2/2 Flows Passed in 46s` and the exit code is 0. Otherwise the exit code is 1. A flow takes 15 to 60 seconds on an emulator, and a step that fails waits 17 seconds first. Maestro writes its logs, and a screenshot of each failed step, to `~/.maestro/tests/`, outside the project.

## Known limits

- With no device, each skill stops and tells you what to start. On Linux or Windows the skills stop when the prompt says iOS.
- `maestro test` and the `maestro` MCP server cannot share a device. `maestro test` removes Maestro's helper apps from the device when it ends, and a server that was running then answers `Device server died`. This happens after `/qa-mobile-generate` and after a run from your terminal. Plan and heal stop and ask you to turn the server off and on in Cursor settings. Checked on Android.
- A check of an element that has an id compares the id and the text. A text that changes from run to run, such as an order number, is checked by id only.
- An element with no id is found by its text. The agent does not add a `testID` to your source.
- On a fresh Google Play emulator, a Google sign-in screen can cover the app a few minutes after boot. A flow that runs at that moment fails with `Element not found`. Run it again.
- Maestro cannot mock the network, so the skills plan no scenario that needs the server to fail.
- Maestro sends usage analytics unless `MAESTRO_CLI_NO_ANALYTICS` is set in your environment.

## What was run

All of it was run by hand on one machine: a Linux host, Maestro 2.10.0, Java 17, and one Android emulator (a Pixel 7 image with Android 17 and Google Play). The app was a React Native sample app with a product list, a cart, and a checkout form that shows three validation messages.

Run on that emulator:

- `maestro test` with one file and with a folder, passing and failing, with the output lines and exit codes shown above.
- The folder run with `--exclude-tags=fixme`, and a run of all of `test/mobile` with the `config.yaml` template.
- The three MCP tools the skills call, `list_devices`, `inspect_screen`, and `run`, with the replies the skills describe.
- That a `maestro test` run ends a running MCP session.
- That a React Native `testID` is the id on the device. This was seen for 39 ids.
- One small job for each skill, done by a maintainer who followed the skill text line by line: a plan for the checkout form, three flows generated from it (`3/3 Flows Passed`), a heal of a wrong id, and a heal that ended in the `fixme` mark.

Not run:

- Anything on iOS. Every iOS line in the skills is from Maestro's documentation.
- A sample app with a sign-in screen. The sample has none, so the sign-in prompts in the table above were not walked.
- A system permission dialog, a physical device, and a native Android app, where an id has the form `com.example.app:id/name`.
- CI. No emulator job exists.
- The skills on a model, in Cursor or outside it. The evaluation has no mobile case.
- Cursor itself: the folder it starts the `maestro` server in, and its time limit for one MCP call. One `run` call took up to 45 seconds.
- The skills as they are now. After the device run the three skills were made 6 to 11 percent shorter, and their examples changed to another app. A script checked that the 70 rules the device run stands behind are still in the text, and every `yaml` block in the skills passes `maestro check-syntax`. The new text was not followed on a device.
- Three rows of `/qa-mobile-heal` as whole jobs: a text that changes from run to run, a check that fails with `is not visible`, and another app on top of the app.

A sample app with a sign-in screen and a CI job are tracked in [issue 23](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/23), and iOS in [issue 24](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/24).
