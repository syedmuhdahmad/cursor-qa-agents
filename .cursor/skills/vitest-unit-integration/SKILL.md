---
name: vitest-unit-integration
description: Read only when the QA role is asked to write or fix a unit or integration test. Follow the shared steps, then only the UI or API section.
disable-model-invocation: true
metadata:
  author: Anthony Fu
  version: "2026.9.25"
  source: Generated from https://github.com/vitest-dev/vitest, scripts located at https://github.com/antfu/skills
---

<!-- local: keep on regenerate -->

## Shared steps

- If the prompt names no source file, find it. If several files match, report them and ask. Do not pick one.
- Read that source. Do not edit application source.
- Test files are `.test.ts`. Do not write JSX. Use `createElement`.
- Always mirror the source path. `app/api/session/route.ts` becomes `test/integration/api/session/route.test.ts`. The same mirror applies under `test/unit/`. If that file exists, add to it.
- Import `describe`, `it`, `expect`, `vi`, and `afterEach` from `vitest`. Globals are off.
- Import the source with a relative path from the test file. Count the `../` segments. `test/unit/components/SignIn.test.ts` reaches `src/components/SignIn` as `../../../src/components/SignIn`. `test/integration/api/session/route.test.ts` reaches `app/api/session/route` as `../../../../app/api/session/route`.
- Do not scan source for `@/` before writing. On `Cannot find package '@/…'`, read `tsconfig.json` `paths` and add the matching `resolve.alias` in `vitest.config.ts`. Leave the `.tsx` include unchanged. If `paths` has no matching entry, stop and report. Do not guess an alias.
- `vi.mock('server-only', () => ({}))`. For `next/headers` and `next/navigation`, the factory must return the functions the source calls. A factory with no body throws on import.
- Set mock return values inside each test, never in the `vi.mock` factory. `resetAllMocks` wipes factory defaults.
- For `fetch`, use `vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(...))`. A spy with no implementation calls the real socket. If the source uses an HTTP client such as `axios` or a local `api.ts`, `vi.mock` that module. A fetch spy does not see those calls.
- Mock a database with `vi.mock('<db client module>')` and set the return value inside the test.
- Do not `vi.mock` the file under test.
- `afterEach` calls `vi.resetAllMocks()` and then `vi.restoreAllMocks()`. `restoreAllMocks` only undoes `vi.spyOn`. Without `resetAllMocks`, a `mockResolvedValue` from an earlier test stays active. If the test uses `vi.stubGlobal`, also call `vi.unstubAllGlobals()`.
- Run the full path: `npx vitest run --project unit --no-passWithNoTests test/unit/<path>.test.ts`, or `--project integration` with the integration path. A basename filter also runs another file that shares that name. A missing file and a file with no tests exit 1 with this flag.
- Read the summary. Require `Tests N passed` with N at least 1 and nothing skipped. `Tests 1 skipped | 1 todo` exits 0 and is a failure.
- Fix and rerun at most 3 times, then stop and report. Do not use `.skip`, `.only`, `.todo`, `test.fails`, `describe.skip`, `skipIf`, or `runIf`. Do not pass `-u` or `--update`. Do not use a snapshot as the only assertion. Do not weaken an assertion (`expect.anything()`, `toBeTruthy()`). Do not delete the failing case. Change an expectation only when the source shows the test was wrong. Otherwise leave the failing test in place and report the bug with source `file:line`, what was expected, what happened, and that the suite is red.
- If render fails with `Invalid hook call` or a React version mismatch, report that the app React and the test React differ. Do not install packages.

## UI

Do the shared steps above first.

- The first line of the file is `// @vitest-environment jsdom`, before any import.
- Use Testing Library. Interact with `fireEvent` only. `@testing-library/user-event` is not installed.
- In `afterEach`, call `cleanup()` from Testing Library before the mock reset. Do not add `cleanup` to `test/setup.ts`. That file also loads for Node tests.
- A UI integration test renders the real child components and mocks only the network and framework modules.

## API

Do the shared steps above first.

- Do not add a jsdom directive. Stay on Node.
- Do not call `cleanup`.

## One reference

Open the reference for the API on the first line that needs help. Then open no other reference.

- `vi.*` → [features-mocking](references/features-mocking.md)
- `expect` → [core-expect](references/core-expect.md)
- Test options, async, or timeouts → [core-test-api](references/core-test-api.md)

The Core, Features, and Advanced tables below are an index. Do not open other rows.

## Examples

These show shape only. Do not create these files.

```ts file=test/unit/components/SignIn.test.ts
// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SignIn } from '../../../src/components/SignIn'

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

it('shows the sign-in button', () => {
  render(createElement(SignIn))
  expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
})
```

```ts file=test/integration/api/session/route.test.ts
import { afterEach, expect, it, vi } from 'vitest'
import { GET } from '../../../../app/api/session/route'

vi.mock('server-only', () => ({}))
vi.mock('../../../../lib/db', () => ({
  findSession: vi.fn(),
}))

import { findSession } from '../../../../lib/db'

afterEach(() => {
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

it('returns 200 for a known session', async () => {
  vi.mocked(findSession).mockResolvedValue({ id: '1' })
  const res = await GET(new Request('http://test/api/x'))
  expect(res.status).toBe(200)
})
```

<!-- /local: keep on regenerate -->

Vitest is a next-generation testing framework powered by Vite. It provides a Jest-compatible API with native ESM, TypeScript, and JSX support out of the box. Vitest shares the same config, transformers, resolvers, and plugins with your Vite app.

**Key Features:**
- Vite-native: Uses Vite's transformation pipeline for fast HMR-like test updates
- Jest-compatible: Drop-in replacement for most Jest test suites
- Smart watch mode: Only reruns affected tests based on module graph
- Native ESM, TypeScript, JSX support without configuration
- Multi-threaded workers for parallel test execution
- Built-in coverage via V8 or Istanbul
- Snapshot testing, mocking, and spy utilities

> The skill is based on Vitest 5.0.1, generated at 2026-09-25.

## Core

| Topic | Description | Reference |
|-------|-------------|-----------|
| Configuration | Vitest and Vite config integration, defineConfig usage | [core-config](references/core-config.md) |
| CLI | Command line interface, commands and options | [core-cli](references/core-cli.md) |
| Test API | test/it function, modifiers like skip, only, concurrent | [core-test-api](references/core-test-api.md) |
| Describe API | describe/suite for grouping tests and nested suites | [core-describe](references/core-describe.md) |
| Expect API | Assertions with toBe, toEqual, matchers and asymmetric matchers | [core-expect](references/core-expect.md) |
| Hooks | beforeEach, afterEach, beforeAll, afterAll, aroundEach | [core-hooks](references/core-hooks.md) |

## Features

| Topic | Description | Reference |
|-------|-------------|-----------|
| Mocking | Mock functions, modules, timers, dates with vi utilities | [features-mocking](references/features-mocking.md) |
| Snapshots | Snapshot testing with toMatchSnapshot and inline snapshots | [features-snapshots](references/features-snapshots.md) |
| Coverage | Code coverage with V8 or Istanbul providers | [features-coverage](references/features-coverage.md) |
| Test Context | Test fixtures, context.expect, test.extend for custom fixtures | [features-context](references/features-context.md) |
| Concurrency | Concurrent tests, parallel execution, sharding | [features-concurrency](references/features-concurrency.md) |
| Filtering | Filter tests by name, file patterns, tags | [features-filtering](references/features-filtering.md) |
| Test Tags | Label tests with tags to filter runs and apply shared options | [features-test-tags](references/features-test-tags.md) |
| Reporters | Built-in reporters, default selection, CI/output config | [features-reporters](references/features-reporters.md) |
| Benchmarking | Write benchmarks with the bench fixture (Tinybench) | [features-benchmarking](references/features-benchmarking.md) |

## Advanced

| Topic | Description | Reference |
|-------|-------------|-----------|
| Vi Utilities | vi helper: mock, spyOn, fake timers, hoisted, waitFor | [advanced-vi](references/advanced-vi.md) |
| Environments | Test environments: node, jsdom, happy-dom, custom | [advanced-environments](references/advanced-environments.md) |
| Type Testing | Type-level testing with expectTypeOf and assertType | [advanced-type-testing](references/advanced-type-testing.md) |
| Projects | Multi-project workspaces, different configs per project | [advanced-projects](references/advanced-projects.md) |
