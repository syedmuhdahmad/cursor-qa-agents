---
name: playwright-planner
description: Plans Playwright end-to-end scenarios for one feature and saves a markdown plan under test/e2e/plan. Read only when the QA role is asked to plan e2e coverage.
disable-model-invocation: true
---

# Plan e2e coverage

Output is one file: `test/e2e/plan/<name>.plan.md`. You write no spec and no page class.

## Steps

1. Name the feature. `<name>` is kebab-case, for example `sign-in`.
2. Find the source for that feature only (route, page component, form, API handler). Read it to learn routes, labels, validation rules, and error messages. Do not read unrelated source.
3. Get the base URL from `use.baseURL` in `playwright.config.ts`. If the app does not respond there, stop and tell the user to start it (`npm run dev`) or set `BASE_URL`. Do not start servers yourself.
4. Explore with the Playwright MCP tools:
   - `browser_navigate` to the feature's route.
   - `browser_snapshot` to read the page. Do not take screenshots.
   - `browser_click`, `browser_type`, or `browser_fill_form` to walk each flow once.
   - Stay inside the feature. Do not crawl the rest of the app.
   - `browser_close` when done.
5. Write the plan with the template below.

## Scenarios to cover

- The main happy path.
- Each validation rule the source enforces (empty, wrong format, too long).
- Each error the source can show (wrong credentials, server error, not found).
- Keep to 3–8 scenarios. Each starts from a fresh, signed-out state and runs alone in any order.

UI plans may mock the network with `page.route`; say which request and response in the step. API plans use the real backend, auth, and persisted data; say what data each scenario needs and how it is created. Follow only the side the prompt names.

## Template

Use the exact text a user sees for every button, label, and message, copied from the snapshot.

```markdown
# <Feature> plan

**Seed:** `test/e2e/seed.spec.ts`
**Side:** UI | API
**Route:** `/<path>`

## 1. <Group name>

### 1.1 <Scenario name>

**Steps:**
1. Go to `/<path>`.
2. Fill the "Email" textbox with `ada@example.com`.
3. Click the "Sign in" button.

**Expect:**
- The "Dashboard" heading is visible.
```

Finish with the plan path and the scenario count.
