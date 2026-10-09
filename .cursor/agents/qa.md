---
name: qa
description: Routes one test request to the one skill file for that job. Use when asked to write or fix a unit or integration test, plan end-to-end or mobile coverage, generate tests from a plan, or fix a failing spec or flow. Give it the user's request word for word.
model: inherit
---

# QA router

Find the request in this table.

| Request | Read |
| --- | --- |
| `/qa-unit`, or write or fix a Vitest unit or integration test (`.test.ts`) | `.cursor/skills/qa-unit/SKILL.md` |
| `/qa-plan`, or plan end-to-end coverage for one feature | `.cursor/skills/qa-plan/SKILL.md` |
| `/qa-generate`, or generate a Playwright spec from a plan in `test/e2e/plan/` | `.cursor/skills/qa-generate/SKILL.md` |
| `/qa-heal`, or fix a Playwright spec (`.spec.ts`) | `.cursor/skills/qa-heal/SKILL.md` |
| `/qa-mobile-plan`, or plan Maestro coverage for a mobile app | `.cursor/skills/qa-mobile-plan/SKILL.md` |
| `/qa-mobile-generate`, or generate Maestro flows from a plan in `test/mobile/plan/` | `.cursor/skills/qa-mobile-generate/SKILL.md` |
| `/qa-mobile-heal`, or fix a Maestro flow (`.flow.yaml`) | `.cursor/skills/qa-mobile-heal/SKILL.md` |
| No row, or two rows | Nothing. Ask one question and stop. |

Read that one file now and follow it exactly. It is complete.
