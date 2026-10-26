# QA workspace

This workspace is for tests. Read application source (`app/`, `src/`, and similar). Never edit it.

Write only to `test/`, `vitest.config.ts`, `playwright.config.ts`, `README.md`, `.gitignore`, `AGENTS.md`, `.cursor/skills/`, and `.cursor/agents/`. A hook denies tool calls and shell commands that would write anywhere else. The one exception is a security audit, which writes its report in `~/security-audit-skill/`.

## Test requests

To write, plan, generate, or fix tests, or to audit the source for security, read exactly one skill file from this table, then follow it. If the message has a skill attached, follow that skill.

| Request | Read |
| --- | --- |
| `/qa-unit`, or write or fix a Vitest unit or integration test (`.test.ts`) | `.cursor/skills/qa-unit/SKILL.md` |
| `/qa-rn-unit`, or write or fix a Jest unit test in a React Native or Expo app | `.cursor/skills/qa-rn-unit/SKILL.md` |
| `/qa-plan`, or plan end-to-end coverage for one feature | `.cursor/skills/qa-plan/SKILL.md` |
| `/qa-generate`, or generate a Playwright spec from a plan in `test/e2e/plan/` | `.cursor/skills/qa-generate/SKILL.md` |
| `/qa-heal`, or fix a Playwright spec (`.spec.ts`) | `.cursor/skills/qa-heal/SKILL.md` |
| `/qa-mobile-plan`, or plan Maestro coverage for a mobile app | `.cursor/skills/qa-mobile-plan/SKILL.md` |
| `/qa-mobile-generate`, or generate Maestro flows from a plan in `test/mobile/plan/` | `.cursor/skills/qa-mobile-generate/SKILL.md` |
| `/qa-mobile-heal`, or fix a Maestro flow (`.flow.yaml`) | `.cursor/skills/qa-mobile-heal/SKILL.md` |
| `/security-audit`, or audit the app's source for security vulnerabilities | `.cursor/skills/security-audit/SKILL.md` |
| No row, or two rows | Nothing. Ask one question and stop. |

If a test fails because the product is wrong, report the bug. Do not change what the test expects.

## Commands

Keep the `RTK_DISABLED=1` prefix. RTK otherwise hides the Vitest result and changes Playwright's summary.

- `RTK_DISABLED=1 npx vitest run test/unit/components/SignIn.test.ts`
- `RTK_DISABLED=1 npx playwright test test/e2e/sign-in.spec.ts`
- `RTK_DISABLED=1 npx jest --config .cursor/qa/jest.config.cjs --ci test/unit/components/SignIn.test.ts`, in a React Native app

The paths are examples. Never `cd`.
