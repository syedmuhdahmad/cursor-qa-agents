# Cursor QA agent

This folder is a Cursor workspace for writing tests. The `qa` agent reads your application source and writes tests. It does not change the product to make a test pass.

Application code lives in places such as `app/` or `src/`. Tests live under `test/`.

## Setup

1. Install [Cursor](https://cursor.com) and [Node.js](https://nodejs.org).
2. Open this folder in Cursor with **File → Open Folder**.
3. Open the agent chat and switch to **Agent** mode. Ask mode can explain the code. Agent mode is what writes test files.
4. Install dependencies and the Chromium browser Playwright uses:

```bash
npm install
npx playwright install chromium
```

5. Turn on the MCP servers in Cursor settings. This repo already lists them in [`.cursor/mcp.json`](.cursor/mcp.json):

| Server | Used for |
| --- | --- |
| `playwright` | Driving the browser while planning or inspecting a page |
| `playwright-test` | Running and debugging Playwright specs |
| `vitest` | Running Vitest from the agent |

Restart the MCP servers if Cursor does not show them after you open the folder.

## Start the qa agent

The role is defined in [`.cursor/agents/qa.md`](.cursor/agents/qa.md).

In the agent chat, type `/qa` and choose **qa**, or ask in plain language to use the `qa` role. Example:

```text
/qa Write a unit test for the sign-in form. This is UI.
```

`qa` reads one skill for the prompt, plus what that skill allows. Say which job you want so it opens the matching skill.

## What to ask

Name the source file or screen, and say whether the work is **UI** or **API**.

- **UI** means client screens, forms, and flows. The network may be mocked.
- **API** means route handlers, server actions, services, auth, or saved data. These tests use the real API. Do not ask for both in one prompt.

### Unit and integration

Files are `.test.ts` and must not contain JSX. The steps live in [`.cursor/skills/vitest-unit-integration/SKILL.md`](.cursor/skills/vitest-unit-integration/SKILL.md).

```text
/qa Write a unit test for src/components/SignIn.tsx. This is UI.
```

```text
/qa Write an integration test for app/api/session/route.ts. This is API.
```

### End-to-end

End-to-end work has three steps. Ask for one step at a time.

**Plan.** The agent explores the app and saves a markdown plan. It does not write the spec yet.

```text
/qa Plan end-to-end coverage for sign-in. This is UI.
```

The plan is saved as `test/e2e/plan/<name>.plan.md`. The seed file named in the plan is `test/e2e/seed.spec.ts`.

**Generate.** The agent turns one plan into a Playwright spec and page classes.

```text
/qa Generate the Playwright spec from test/e2e/plan/sign-in.plan.md. This is UI.
```

Specs are `test/e2e/*.spec.ts`. Page classes are `test/e2e/pages/`. Locators live on the page class. Assertions live in the spec.

**Heal.** The agent reruns a failing spec and edits the test. It does not edit application source.

```text
/qa Fix the failing sign-in spec in test/e2e/sign-in.spec.ts.
```

## Skills

`qa` opens one skill, plus what that skill allows.

| You ask for | Skill it reads |
| --- | --- |
| Unit or integration | [`.cursor/skills/vitest-unit-integration`](.cursor/skills/vitest-unit-integration), then at most one reference (`features-mocking`, `core-expect`, or `core-test-api`) |
| Any end-to-end work | [`.cursor/skills/playwright`](.cursor/skills/playwright), then one tool below |
| A plan | [`.cursor/skills/playwright-planner`](.cursor/skills/playwright-planner) |
| A spec from a plan | [`.cursor/skills/playwright-generator`](.cursor/skills/playwright-generator) |
| A failing spec | [`.cursor/skills/playwright-healer`](.cursor/skills/playwright-healer) |
| Driving the browser | [`.cursor/skills/playwright-cli`](.cursor/skills/playwright-cli), and only then |
| A page class or spec | [`.cursor/skills/playwright-page-objects`](.cursor/skills/playwright-page-objects), and only then |

## Layout

```text
test/unit/                 Vitest unit tests
test/integration/          Vitest integration tests
test/e2e/*.spec.ts         Playwright specs
test/e2e/plan/*.plan.md    End-to-end plans
test/e2e/pages/            Page classes
test/e2e/seed.spec.ts      Playwright seed
```

There are no separate frontend or backend test folders. UI and API are instructions inside the skills.

## Run the tests yourself

```bash
npm run test:unit
npm run test:integration
npm run test:e2e
```

`npm run test:e2e:list` prints the Playwright tests without running them.

## What qa will not change

`qa` may read `app/`, `src/`, and similar source so it can learn the behavior. It does not edit that source.

If a test fails because the product is wrong, the agent reports the bug. It changes a test expectation only when the test itself was wrong.

A project hook enforces the same limit. Writes are allowed in:

- `test/**`
- `vitest.config.ts`
- `playwright.config.ts`
- root `README.md`
- `.gitignore`
- `AGENTS.md`
- `.cursor/skills/**`
- `.cursor/agents/**`

Git and GitHub CLI (`gh`) commands are allowed, including commit, push, and pull requests. Edits under `app/` or `src/` are blocked.
