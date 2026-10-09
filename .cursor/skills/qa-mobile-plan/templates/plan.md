# FEATURE plan

**Walked on:** PLATFORM
**App id (Android):** `ANDROID_APP_ID`
**App id (iOS):** `IOS_APP_ID`
**Source:** `SOURCE_FILE`
**Data:** DATA

## Start steps

**Subflow:** `test/mobile/subflows/open-FEATURE.yaml`

1. Type `VALUE` into "LABEL" (id `ID`).
2. Tap "LABEL" (id `ID`).

## 1. GROUP

### 1.1 SCENARIO

**Flow:** `test/mobile/FEATURE/01-SLUG.flow.yaml`

**Steps:**

1. Launch the app with cleared state.
2. Do the start steps.
3. Type `VALUE` into "LABEL" (id `ID`).
4. Tap "LABEL" (id `ID`).

**Expect:**

- The text "MESSAGE" is visible.
- "LABEL" (id `ID`) is visible.
