# Layout and files

This page lists where each kind of test goes, every path the kit puts in your app, and which files you may overwrite or must merge. The examples come from the imaginary app the skills use: a "Save profile" form at `/profile`.

## The test layout

| Kind | Path | Example |
| --- | --- | --- |
| Unit test, Vitest, or Jest in a React Native app | `test/unit/**/<Name>.test.ts` | `test/unit/components/ProfileForm.test.ts` |
| Integration test | `test/integration/**/<name>.test.ts` | `test/integration/api/profile/route.test.ts` |
| End-to-end spec | `test/e2e/<name>.spec.ts` | `test/e2e/profile.spec.ts` |
| Page class | `test/e2e/pages/<screen>-page.ts` | `test/e2e/pages/profile-page.ts` |
| End-to-end plan | `test/e2e/plan/<name>.plan.md` | `test/e2e/plan/profile.plan.md` |
| Seed spec | `test/e2e/seed.spec.ts` | `test/e2e/seed.spec.ts` |
| Jest setup file, optional, React Native only | `test/jest.setup.ts` | `test/jest.setup.ts` |
| Mobile plan | `test/mobile/plan/<feature>.plan.md` | `test/mobile/plan/profile.plan.md` |
| Mobile flow | `test/mobile/<feature>/<nn>-<scenario>.flow.yaml` | `test/mobile/profile/01-new-name.flow.yaml` |
| Mobile element file, one for each screen and platform | `test/mobile/elements/<platform>/<screen>.js` | `test/mobile/elements/android/profile.js` |
| Mobile element loader | `test/mobile/elements/load.yaml` | `test/mobile/elements/load.yaml` |
| Mobile subflow | `test/mobile/subflows/<name>.yaml` | `test/mobile/subflows/open-profile.yaml` |
| Mobile suite file, optional | `test/mobile/config.yaml` | `test/mobile/config.yaml` |

A unit or integration test mirrors the source path, with a leading `src/` or `app/` dropped:

| Source file | Test file |
| --- | --- |
| `src/components/ProfileForm.tsx` | `test/unit/components/ProfileForm.test.ts` |
| `app/api/profile/route.ts` | `test/integration/api/profile/route.test.ts` |
| `lib/format.ts` | `test/unit/lib/format.test.ts` |

A file named `route.ts`, or a file under an `api/` folder, goes to `test/integration/`. Everything else goes to `test/unit/`.

The hook holds these names for a new file. A test ends in `.ts`, never `.tsx` or `.jsx`, even for a component. There is no `__tests__/` folder, and no `tests/` or `specs/` folder at the top of `test/` or under `test/e2e/`. A page class holds one field for each element and one `goto` method. A file that already exists can be edited whatever its name. See [[The hook]].

## Every path the kit puts in your app

### Tests and config

| Path | What it is for | Whose |
| --- | --- | --- |
| `test/unit/`, `test/integration/` | Unit and integration tests. Empty at install. | Yours |
| `test/e2e/plan/`, `test/e2e/pages/` | End-to-end plans and page classes. Empty at install. | Yours |
| `test/e2e/seed.spec.ts` | A spec that checks the app responds at `/` | The kit's, web only |
| `test/setup.ts` | Runs before every Vitest test file | The kit's, web only. Merge your changes. |
| `test/tsconfig.json` | Makes import aliases work in test files. The installer adds it when your app has a `tsconfig.json`. | Yours once added |
| `test/mobile/plan/`, `test/mobile/elements/android/`, `test/mobile/elements/ios/`, `test/mobile/subflows/` | Maestro plans, element files, and subflows. Empty at install. | Yours |
| `vitest.config.ts` | The `unit` and `integration` projects, import aliases from `tsconfig.json`, and the verdict reporter | The kit's, web only. Merge your settings into it. |
| `playwright.config.ts` | The end-to-end settings, `testDir: './test/e2e'`, and the verdict reporter | The kit's, web only. Merge your settings into it. |
| `AGENTS.md` | The write scope, the table from request to skill, and the test commands. It is always in the model's context. | Shared. Keep yours and put the kit's text at the top. |
| `.cursorignore` | Paths the agent does not read: lockfiles, build output, test reports, `.playwright-cli/`. The hook reads it too. | Shared. Merge. |
| `.gitignore` lines | Test output and tool state, such as `/coverage/`, `/test-results/`, and `.playwright-cli/` | Shared. The installer adds the lines you lack. |

### Under `.cursor/`

| Path | What it is for |
| --- | --- |
| `.cursor/skills/qa-unit/`, `qa-rn-unit/`, `qa-plan/`, `qa-generate/`, `qa-heal/` | The web and React Native job skills, each with its templates |
| `.cursor/skills/qa-mobile-plan/`, `qa-mobile-generate/`, `qa-mobile-heal/` | The Maestro job skills, each with its templates |
| `.cursor/skills/playwright-cli/` | The manual of `playwright-cli`, copied from its package with its `LICENSE`. Not a job. |
| `.cursor/skills/security-audit/` | Cloudflare's security audit skill, copied with its `LICENSE`. See [[Security audit]]. |
| `.cursor/skills/qa-unit/references/` | Three Vitest reference files, unchanged MIT-licensed copies. Keep their license files. |
| `.cursor/agents/qa.md` | The `/qa` router: the same table as `AGENTS.md` |
| `.cursor/rules/test-file-conventions.mdc` | Where each kind of test file goes |
| `.cursor/rules/mobile-test-conventions.mdc` | The same for Maestro files |
| `.cursor/hooks/guard-test-writes.py` | The hook. It must keep its executable bit. |
| `.cursor/hooks/test_*.py` | The hook's tests |
| `.cursor/hooks.json` | Registers the hook for three events, each with `failClosed: true` |
| `.cursor/mcp.json` | The `maestro` MCP server, for the mobile jobs only |
| `.cursor/qa/vitest-verdict.mjs`, `playwright-verdict.mjs`, `jest-verdict.mjs` | The reporters that print the `QA-VERDICT:` line, with their tests |
| `.cursor/qa/jest.config.cjs` | The kit's Jest config. It loads your own Jest config and adds the test folders and the reporter. |
| `.cursor/qa/VERSION` | The version of the kit you copied |

### In `package.json`

| Entry | Web app | React Native app |
| --- | --- | --- |
| Dev dependencies | `@playwright/cli`, `@playwright/test`, `@testing-library/jest-dom`, `@testing-library/react`, `@types/node`, `@vitest/coverage-v8`, `jsdom`, `vitest` | `@testing-library/react-native`, `@types/jest`, `jest`, `test-renderer` |
| Scripts | `test:unit`, `test:integration`, `test:e2e`, `test:e2e:list` | `test:rn-unit` |

The installer leaves a range or a script of yours alone and lists it as skipped.

## A React Native app

The installer leaves out `vitest.config.ts`, `playwright.config.ts`, `test/setup.ts`, and `test/e2e/`. Everything else is copied, `.cursor/` whole. Jest unit tests go in `test/unit/`, as in a web app. See [[Installation]].

## What the runners write

These folders are outside the agent's write scope, and the runners still write them: `coverage/`, `test-results/`, `playwright-report/`, `.vitest/`, and `.playwright-cli/`. `.gitignore` names them. Maestro writes its logs to `~/.maestro/tests/`, outside the project. A security audit writes to `~/security-audit-skill/`.

## Overwrite, merge, or delete

When you copy the kit again, for an upgrade or a repair:

| Group | Paths |
| --- | --- |
| Safe to overwrite, unless you changed them yourself | `.cursor/skills/qa-*/`, `.cursor/skills/playwright-cli/`, `.cursor/agents/qa.md`, `.cursor/hooks/`, `.cursor/qa/`, and the kit's two files in `.cursor/rules/` |
| Merge by hand | `AGENTS.md`, `vitest.config.ts`, `playwright.config.ts`, `.cursorignore`, `.gitignore`, `test/setup.ts`, and the scripts and dev dependencies in `package.json` |
| Merged by the installer | `.cursor/hooks.json` and `.cursor/mcp.json`. Merge them by hand if you copy by hand. |
| Delete by hand | A skill folder that the new version no longer has. A copy over the old `.cursor/` leaves it behind, and the installer never deletes. |
| Never touched | Your test files and plans under `test/` |

[[Upgrading]] has the steps.
