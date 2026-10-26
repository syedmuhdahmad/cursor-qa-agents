# Expo app example

A small React Native app, made with Expo, that the Cursor QA agent kit is tested against. It is the sample app for Maestro flows on Android ([issue 23](https://github.com/syedmuhdahmad/qa-agent-kit/issues/23)) and the React Native example for Jest unit tests ([issue 36](https://github.com/syedmuhdahmad/qa-agent-kit/issues/36)). It is not part of the files you copy into your own app.

The app has the same sign-in feature as [`examples/next-app`](../next-app/), with the same rules and texts. It has two screens. The sign-in screen has an "Email" field, a "Password" field, and a "Sign in" button. The dashboard shows the heading "Dashboard", the text "Signed in as ada@example.com", and a "Sign out" button that goes back to the sign-in screen. `App.tsx` switches between the two screens with React state. There is no navigation library.

There is one account: `ada@example.com` with the password `correct-horse-battery`. It lives in memory in `lib/auth.ts`. Nothing is sent over the network: `signIn()` waits 300 ms and then compares the values, so the form has a pending state. The signed-in user is kept in memory only, so a restart of the app signs out.

`test/` holds hand-written reference tests in the layout the kit uses: Jest unit tests under `test/unit/`, and a Maestro plan, element files, and flows under `test/mobile/`.

## What is in it

| Path | What it is |
| --- | --- |
| `App.tsx` | Shows the sign-in screen until a user signs in, then the dashboard |
| `index.ts` | Registers `App` with Expo |
| `src/components/SignIn.tsx` | The sign-in form, its validation, and the call to `signIn()` |
| `src/components/Dashboard.tsx` | The dashboard: heading, signed-in text, and the "Sign out" button |
| `lib/validation.ts` | Email and password rules. The same file as in `examples/next-app`, except for the comment at the top. |
| `lib/auth.ts` | The account store and the async `signIn(email, password)` |
| `app.json` | Expo config. The app id is `com.example.qasignin` on Android and iOS. |
| `test/unit/lib/validation.test.ts` | Reference unit test for plain functions, 14 tests |
| `test/unit/components/SignIn.test.ts` | Reference unit test for a component, 9 tests. It renders with React Native Testing Library and types and taps with `userEvent`. |
| `test/mobile/plan/sign-in.plan.md` | Reference Maestro plan with six scenarios |
| `test/mobile/elements/android/` | Element files of the two screens, Android only |
| `test/mobile/elements/load.yaml` | The loader, with an Android block only |
| `test/mobile/sign-in/` | One flow for each scenario of the plan |
| `test/mobile/config.yaml` | Settings for a run of all of `test/mobile` |

Every field, button, and message has a `testID`, such as `sign-in-email`, `sign-in-submit`, `sign-in-error`, `dashboard-heading`, and `dashboard-sign-out`. The fields also have an `accessibilityLabel`, the buttons have `accessibilityRole="button"`, and the message has `accessibilityRole="alert"`. The Jest tests find elements by role, label, and text. The Maestro flows find them by id.

### The sign-in code is a test fixture

Do not copy it into a real app. The password is in the source, it is compared as plain text, and nothing limits the number of attempts.

## Versions

These are the versions in `package-lock.json`, which is committed. `examples/next-app` commits no lockfile. This app does, so that the native build in CI gets the same packages every time.

| Package | Version |
| --- | --- |
| `expo` | 58.0.19 |
| `react-native` | 0.88.0 |
| `react` | 19.3.0 |
| `jest` | 30.5.2 |
| `jest-expo` | 58.0.12 |
| `@testing-library/react-native` | 14.1.0 |
| `test-renderer` | 1.3.1 |
| `typescript` | 6.0.3 |

`test-renderer` is a peer dependency of React Native Testing Library 14, and its own install notes ask for it as a dev dependency. `tsconfig.json` has `"types": ["jest"]`: TypeScript 6 no longer loads every installed `@types` package, so without it `npx tsc --noEmit` does not know `describe`, `it`, `expect`, and `jest`.

## Run the Jest tests

```bash
cd examples/expo-app
npm ci
npx jest test/unit
```

Jest takes the `jest-expo` preset from `"jest"` in `package.json`. The run prints `Tests: 23 passed, 23 total`. It took 4 to 12 seconds here. `npm ci` took 22 seconds with npm's cache already on the machine. `npx tsc --noEmit` also passes.

Jest 30.5 prints a shorter report when it finds the variable of a coding agent in the environment, such as `AI_AGENT`, `CLAUDECODE`, or `CURSOR_AGENT`. The report then has the summary but no `PASS` line for each file. `--reporters=default` brings the full report back.

With the kit's `.cursor/qa/` folder copied into this folder, the kit's command prints a verdict line last:

```bash
npx jest --config .cursor/qa/jest.config.cjs --ci test/unit
```

```text
QA-VERDICT: PASS (passed 23, failed 0, skipped 0, files 2)
```

This was run with a temporary copy of that folder, which was then deleted.

## Build the Android app

You need JDK 17, the Android SDK with `ANDROID_HOME` set, and in the SDK: the Android 17 platform (API 37), build tools 37.0.0, NDK 27.1.12297006, and CMake. React Native 0.88 sets the versions of the platform, the build tools, and the NDK. The build here used CMake 3.22.1 from the SDK, JDK 17.0.14, the Android Gradle plugin 9.2.1, and Gradle 9.4.1 from the Gradle wrapper.

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
cd examples/expo-app
npx expo prebuild --platform android --no-install
cd android
./gradlew assembleRelease -PreactNativeArchitectures=x86_64
```

- `npx expo prebuild` writes the native project to `android/` from `app.json`. `.gitignore` keeps `android/` and `ios/` out of git.
- A release build puts the JavaScript into the APK, so no Metro server is needed.
- Prebuild's Gradle file signs the release build with the debug keystore in `android/app/`. That is fine on an emulator and not for a store.
- `-PreactNativeArchitectures=x86_64` builds for the x86_64 emulator only. Without it Gradle builds for four architectures: `armeabi-v7a`, `arm64-v8a`, `x86`, and `x86_64`.

The APK is `android/app/build/outputs/apk/release/app-release.apk`. Times here, on 8 cores:

| Build | Time | APK |
| --- | --- | --- |
| The first build, x86_64 only, while the emulator was booting. The Gradle cache already held the Android Gradle plugin, but the build downloaded React Native 0.88.0. | 13 minutes 9 seconds | 22 MB |
| x86_64 only, after a change to the JavaScript | 22 seconds | 22 MB |
| All four architectures with `--no-daemon`, right after the x86_64 builds | 3 minutes 47 seconds | 68 MB |

## Install it on an emulator

Start an emulator if none is running, and wait until `adb shell getprop sys.boot_completed` prints `1`:

```bash
"$ANDROID_HOME/emulator/emulator" -avd Pixel_7 -no-window -no-audio -no-boot-anim &
adb -s emulator-5554 install -r android/app/build/outputs/apk/release/app-release.apk
```

`Pixel_7` is the name of the virtual device on the machine where this was run: a Pixel 7 image with Android 17 (API 37) and Google Play. The install took about 1 second.

On that emulator, every `testID` of the app showed in `maestro hierarchy` as the `resource-id`, letter for letter: `sign-in-email`, `sign-in-password`, `sign-in-submit`, `sign-in-error`, `dashboard-heading`, `dashboard-signed-in`, and `dashboard-sign-out`. Each button also had its label as `accessibilityText`, and each field had its `accessibilityLabel` there.

## Run the flows yourself

Run this in `examples/expo-app`, with Maestro installed, the app installed, and the emulator running:

```bash
maestro test --platform android --exclude-tags=fixme -e APP_ID=com.example.qasignin test/mobile/sign-in
```

Each flow clears the app's data first. The run prints one line for each flow and a summary line. Five runs here, with Maestro 2.10.0:

| Command | Summary line |
| --- | --- |
| The command above | `6/6 Flows Passed in 1m 54s` |
| The command above, again | `6/6 Flows Passed in 1m 51s` |
| The same without `--exclude-tags=fixme`, run from the repository root with the path `examples/expo-app/test/mobile/sign-in` | `6/6 Flows Passed in 1m 57s` |
| `maestro test --platform android -e APP_ID=com.example.qasignin test/mobile`, which reads `test/mobile/config.yaml` | `6/6 Flows Passed in 1m 56s` |
| The command above, with the APK built for all four architectures | `6/6 Flows Passed in 1m 45s` |

`maestro check-syntax` prints `OK` for each flow and for the loader. Two copies of a flow with a wrong expected text failed with `Assertion is false`, so the checks compare the text.

The files follow the layout and the templates of the mobile skills, see [docs/mobile.md](../../docs/mobile.md). They were written by hand and not by a skill. The plan has no start steps, because the app opens on the sign-in screen, so there is no subflow. The element names come from the texts of the plan, the way `/qa-mobile-generate` makes them. Four names point to the one id `sign-in-error`, one for each message, and "Signed in as ada@example.com" gives the name `signedInAsAdaexamplecom`.

## What was not run

- Anything on iOS. There is no iOS element file and no iOS block in the loader.
- A debug build, and the app in Expo Go or with Metro.
- An emulator with another Android version. Only Android 17 (API 37) was run.
- A physical device.
- The kit's mobile skills or a Jest skill on a model, on this app.
- A CI job.
