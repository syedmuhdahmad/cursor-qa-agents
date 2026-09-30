---
name: playwright
description: Playwright end-to-end testing index. Use when the QA role plans, generates, or heals browser tests. Read only the tool and sub-skill the prompt needs.
---

# Playwright

Use this skill for end-to-end work. Read only the tool the prompt asks for, then only the sub-skill that tool needs.

## Tools

- Plan: `.cursor/skills/playwright-planner/SKILL.md`
- Generate: `.cursor/skills/playwright-generator/SKILL.md`
- Heal: `.cursor/skills/playwright-healer/SKILL.md`

## Sub-skills

- `.cursor/skills/playwright-cli/SKILL.md` when driving the browser.
- `.cursor/skills/playwright-page-objects/SKILL.md` when writing or editing a page class or spec.

Do not open the other tools or sub-skills for the same prompt.

## UI versus API

UI means client screens, forms, and flows whose network may be mocked.

API means route handlers, server actions, services, auth, or persisted data. Drive the real backend for those flows.

Follow only the side the prompt describes.

## Paths

- Seed: `test/e2e/seed.spec.ts`
- Plans: `test/e2e/plan/<name>.plan.md`
- Specs: `test/e2e/*.spec.ts`
- Page objects: `test/e2e/pages/`
