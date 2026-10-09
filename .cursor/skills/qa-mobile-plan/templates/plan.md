# FEATURE plan

**Walked on:** PLATFORM
**App id (Android):** `ANDROID_APP_ID`
**App id (iOS):** `IOS_APP_ID`
**Source:** `SOURCE_FILE`
**Data:** DATA

## Start steps

**Subflow:** `test/mobile/subflows/open-FEATURE.yaml`

1. On the SCREEN screen, type `VALUE` into "NAME".
2. On the SCREEN screen, tap "NAME".

## 1. GROUP

### 1.1 SCENARIO

**Flow:** `test/mobile/FEATURE/01-SLUG.flow.yaml`

**Steps:**

1. Launch the app with cleared state.
2. Do the start steps.
3. On the SCREEN screen, type `VALUE` into "NAME".
4. On the SCREEN screen, tap "NAME".

**Expect:**

- On the SCREEN screen, "TEXT" is visible.
