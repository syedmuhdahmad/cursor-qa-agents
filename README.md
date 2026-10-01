# Cursor QA agent

A Cursor setup for writing tests. The `qa` agent reads your application source and writes tests. It does not change the product to make a test pass.

Application code lives in places such as `app/` or `src/`. Tests live under `test/`.

## Add it to your app

Copy these into the root of your React or Next.js app, next to `app/` or `src/`:

```text
.cursor/  test/  AGENTS.md  vitest.config.ts  playwright.config.ts
```

Do not copy `package.json` over yours. Merge it instead:

- Add the `devDependencies` from this repo's `package.json` to yours. React and React DOM come from your app.
- Add the four `test:*` scripts.
- Add the `.gitignore` lines you don't already have.

Then install dependencies and the Chromium browser Playwright uses:

```bash
npm install
npx playwright install chromium
```

Open the app folder in Cursor with **File → Open Folder**, and use **Agent** mode in chat. Ask mode can explain code but cannot write files.

## Tools

The Playwright MCP server is listed in [`.cursor/mcp.json`](.cursor/mcp.json). Turn it on in Cursor settings, and restart it if Cursor does not show it. Every enabled MCP server adds its tool list to each request, so turn it off while you only write unit or integration tests.

| Tool | Used for |
| --- | --- |
| `playwright` MCP | Exploring a live page while planning or generating a spec |
| `playwright-cli` | Debugging a failing spec (`npx playwright test --debug=cli`, then `attach`) |
| `npx vitest` | Running unit and integration tests from the shell |

## The app under test

End-to-end tests open the app at `http://localhost:3000`. Playwright starts it with `npm run dev` when nothing is listening there.

If your app runs somewhere else, start it yourself and set `BASE_URL`:

```bash
BASE_URL=http://localhost:5173 npm run test:e2e
```

## Start the qa agent

The role is defined in [`.cursor/agents/qa.md`](.cursor/agents/qa.md). In the agent chat, type `/qa`. Ask for one job per prompt, name the source file or screen, and say **UI** or **API**:

- **UI** means client screens, forms, and flows. The network may be mocked.
- **API** means route handlers, server actions, services, auth, or saved data. These tests use the real backend.

### Unit and integration

```text
/qa Write a unit test for src/components/SignIn.tsx. This is UI.
```

```text
/qa Write an integration test for app/api/session/route.ts. This is API.
```

Files are `.test.ts` and contain no JSX. They mirror the source path, so `src/components/SignIn.tsx` gets `test/unit/components/SignIn.test.ts`.

### End-to-end

End-to-end work has three steps. Ask for one at a time.

**Plan.** The agent explores one feature in the browser and saves `test/e2e/plan/<name>.plan.md`.

```text
/qa Plan end-to-end coverage for sign-in. This is UI.
```

**Generate.** The agent turns one plan into `test/e2e/<name>.spec.ts` and page classes in `test/e2e/pages/`, then runs the spec.

```text
/qa Generate the Playwright spec from test/e2e/plan/sign-in.plan.md. This is UI.
```

**Heal.** The agent reruns one failing spec, debugs it with `playwright-cli`, and fixes the test. A real product bug is marked `test.fixme()` and reported.

```text
/qa Fix the failing spec test/e2e/sign-in.spec.ts.
```

## What qa reads

`qa` reads only the files for the job you asked for. This keeps it fast and stops it from mixing instructions.

| Job | Files |
| --- | --- |
| Unit or integration | [`vitest-unit-integration`](.cursor/skills/vitest-unit-integration/SKILL.md), plus at most one reference |
| Plan | [`playwright-planner`](.cursor/skills/playwright-planner/SKILL.md) |
| Generate | [`playwright-generator`](.cursor/skills/playwright-generator/SKILL.md) and [`playwright-page-objects`](.cursor/skills/playwright-page-objects/SKILL.md) |
| Heal | [`playwright-healer`](.cursor/skills/playwright-healer/SKILL.md) and [`playwright-page-objects`](.cursor/skills/playwright-page-objects/SKILL.md) |

## Layout

```text
test/unit/                 Vitest unit tests
test/integration/          Vitest integration tests
test/e2e/<name>.spec.ts    Playwright specs
test/e2e/plan/             End-to-end plans
test/e2e/pages/            Page classes
test/e2e/seed.spec.ts      Checks that the app responds at /
```

## Run the tests yourself

```bash
npm run test:unit
npm run test:integration
npm run test:e2e
```

`npm run test:e2e:list` prints the Playwright tests without running them.

## What qa will not change

`qa` reads `app/`, `src/`, and similar source to learn the behavior. It does not edit that source. If a test fails because the product is wrong, it reports the bug instead of weakening the test.

A project hook, [`.cursor/hooks/guard-test-writes.py`](.cursor/hooks/guard-test-writes.py), enforces this. Writes are allowed only in:

- `test/**`
- `vitest.config.ts`
- `playwright.config.ts`
- root `README.md`
- `.gitignore`
- `AGENTS.md`
- `.cursor/skills/**`
- `.cursor/agents/**`

In the shell, the agent can run tests, read files, and use `git` and `gh` to inspect, commit, push, create a branch from the current commit (`git switch -c`), and open pull requests. The hook blocks anything that could change files outside those paths:

- Redirects into other files (`>`, `>>`, `&>`, `>|`, `<>`). `/dev/null` is allowed.
- Nested commands: `$(...)`, backticks, `<(...)`.
- Read commands that can write or run programs: `sed` with `w`/`e` or `-f`, in-place `sed` on source, `sort -o`, a `uniq` output file, and `rg --pre`.
- Git commands that rewrite the working tree: switching to an existing branch, `pull`, `merge`, `rebase`, `cherry-pick`, `stash`, `reset --hard`, `restore` or `checkout --` on source, `apply`, `clean`.
- Git aliases, `-c` overrides, `--git-dir`/`--work-tree`, and `git config` writes.
- `gh pr checkout`, `gh repo clone`, `gh run download`, and `gh alias`.

Run those yourself when you need them.

## What qa does not read

[`.cursorignore`](.cursorignore) keeps lockfiles, build output, and test reports out of the agent's context. Cursor does not apply it to terminal commands, so the hook also denies `cat`, `grep`, `sed`, and similar reads of those paths. Add your app's large fixtures or generated code there.

Test the hook after changing it:

```bash
python3 -m unittest discover -s .cursor/hooks
```
