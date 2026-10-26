# Mobile testing with Maestro

Three skills plan, write, and fix [Maestro](https://maestro.dev) flows for a mobile app. Treat them as a preview.

- **Android was run.** On 2026-10-26 each skill ran once on each of the three models, on one emulator, and 7 of the 9 jobs met every check. CI runs a set of reference flows on an Android emulator.
- **iOS was not run.** The skills have iOS lines, taken from Maestro's documentation and source, and none of them has run on a device. iOS is left for later: it is on the later list of the roadmap as [SCRUM-6](https://syedmuhdahmad.atlassian.net/browse/SCRUM-6). See [[Roadmap and open issues]].

[docs/mobile.md](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/mobile.md) has the detail. For Jest unit tests in a React Native app, see [[QA manual for React Native]].

## What you need

- The [Maestro CLI](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli), 2.6.0 or later, and Java 17 or later.
- Android: `adb` on your `PATH`, and a running emulator or a device with USB debugging.
- iOS: a Mac with Xcode and a booted Simulator. Physical iOS devices are not supported. This is from Maestro's documentation and was not run.
- A real build of the app installed on the device, not Expo Go. The flows launch the app under its own id.

## What you do yourself

- **Start the device and install the app.** The agent never boots a device, never installs an app, and never switches to the other platform.
- **Turn the `maestro` MCP server on** in Cursor settings for plan, heal, and the first part of generate. Keep it off when you do no mobile work, because an enabled server adds its tool list to every request.
- **Use a device whose app data you can lose.** Every flow clears the app's data, and Maestro installs two helper apps of its own on the device.

## Start a job

Name the platform in every prompt. Plan needs the app id as well. Generate and heal take it from the plan when the prompt has none.

| Job | Prompt | What the agent does |
| --- | --- | --- |
| Plan | `/qa-mobile-plan profile. This is Android. App id com.example.app` | Walks one feature on the device, reads the source of that screen, and saves `test/mobile/plan/profile.plan.md` with 3 to 8 scenarios. The plan holds no id. |
| Generate | `/qa-mobile-generate test/mobile/plan/profile.plan.md. This is Android. App id com.example.app` | Walks the plan on the device and writes one element file for each screen, and the loader. Then writes one flow for each scenario in `test/mobile/profile/` and runs that folder with `maestro test`. |
| Heal | `/qa-mobile-heal test/mobile/profile/02-taken-name.flow.yaml. This is Android. App id com.example.app` | Runs one failing flow, names the cause, and makes the smallest fix, in at most three rounds. A wrong id is corrected once, in the element file of that platform. No flow is edited. |

- Add `element files only` or `flows only` to the generate prompt to do one half. The first half needs the device and the `maestro` server, and runs no flow. The second half needs the device and the element files, not the server.
- A product bug is not hidden. Generate leaves the flow failing and replies `FAIL`. Heal gives the flow the tag `fixme` and a `# product bug:` comment that names the source line.
- Each reply ends with `Verdict:` and `Not checked:`. `Not checked:` always names the platform that the job did not run on.
- The mobile skills have no `QA-VERDICT:` line. They copy Maestro's summary line, such as `2/2 Flows Passed in 46s`.

## How the flows are laid out

The flows follow Maestro's [page object model recipe](https://docs.maestro.dev/examples/recipes/implementing-the-page-object-model-pom).

```text
test/mobile/plan/profile.plan.md                  Plans, shared by both platforms
test/mobile/profile/01-new-name.flow.yaml         Flows, one scenario per file, shared by both platforms
test/mobile/elements/android/profile.js           Names and ids of one screen, Android only
test/mobile/elements/ios/profile.js               Names and ids of one screen, iOS only
test/mobile/elements/load.yaml                    Loader: runs the element files of the current platform
test/mobile/subflows/open-profile.yaml            Start steps shared by the flows of one plan
test/mobile/config.yaml                           Settings for a run of the whole folder
```

- One flow file serves both platforms and holds no id. It names an element as `${output.profile.saveProfile}`.
- The ids are in the element files, one set for each platform. A React Native `testID` is the id on the device.
- A job that is told `This is Android.` never reads, creates, or edits the iOS files. Nothing for iOS is written from an Android screen.
- An element file is JavaScript that Maestro runs on your machine. It should hold one object and nothing else. Only the skill text says so: the hook does not check it.

This is `test/mobile/elements/android/profile.js`:

```js
// Profile screen, Android.
output.profile = {
  displayName: 'profile-name',
  saveProfile: 'profile-save',
  changePhotoText: 'Change photo',
}
```

[[Layout and files]] lists the web paths too.

## Run the flows yourself

```bash
maestro test --platform android --exclude-tags=fixme -e APP_ID=com.example.app test/mobile/profile
```

`--exclude-tags=fixme` leaves out the flows that record a product bug. It has no effect when you pass one file. The exit code is 0 when every flow passes, and 1 otherwise. Maestro writes its logs and screenshots to `~/.maestro/tests/`, outside the project.

## Known limits

- `maestro test` and the `maestro` MCP server cannot share a device. After a full generate job, or a run from your terminal, the next plan, heal, or generate stops and asks you to turn the server off and on in Cursor settings.
- `/qa-mobile-generate` keeps a flow file that exists. Delete a flow to have it written again.
- Maestro cannot mock the network, so the skills plan no scenario that needs the server to fail.
- An element with no id is found by its text. The agent does not add a `testID` to your source.
- Maestro sends usage analytics unless `MAESTRO_CLI_NO_ANALYTICS` is set in your environment.

[Known limits](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/mobile.md#known-limits) in the repository has the rest.

## What was run, and what was not

| What | Run? |
| --- | --- |
| Each skill once on Claude Opus 5, Composer 2.5, and Gemini 3.8 Flash, in Cursor's agent with the hook live, on one Android emulator | Yes, on 2026-10-26. 7 of 9 jobs met every check. |
| The reference flows of the repository's React Native example on an Android emulator in CI | Yes, when a change touches the example, the mobile skills, their rule file, the hook, or the workflow |
| `maestro test`, the three MCP tools the skills call, element files, and the loader, by a maintainer on Android | Yes |
| Five skill changes made after the runs on three models | No. They were not run again on a device. |
| Anything on iOS: element files, the loader's iOS block, the ids, and every iOS line of the skills | No |
| A physical device, a system permission dialog, and a native Android app | No |
| The prompts and examples on this page, which come from the imaginary app of the skills | No |

On the three models: no job wrote outside `test/mobile/`, and no reply claimed a pass over a failing run. One plan merged two scenarios into one, and one generate reply was wrapped in a code fence. Both led to changes in the skills. [What was run](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/mobile.md#what-was-run) has the table.

## Open points

- The three skills are long: 2,541, 4,172, and 3,373 words. Each job ran once on each model, which says little about how often a job fails.
- The texts of a system dialog are still in the flows, not in the element files.
- No rule covers an element that has an id on one platform only. This waits for the first iOS run.
- The hook does not check the JavaScript in an element file.

[Open points](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/mobile.md#open-points) has the full list. The mobile work is tracked in Jira as [SCRUM-5](https://syedmuhdahmad.atlassian.net/browse/SCRUM-5), which was GitHub issue 21, and iOS as SCRUM-6, which was GitHub issue 24. Mobile is out of scope for 1.0.
