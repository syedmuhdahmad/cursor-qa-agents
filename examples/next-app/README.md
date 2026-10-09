# Next app example

A small Next.js app that the Cursor QA agent kit is tested against ([issue 19](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/19)). It is not part of the files you copy into your own app. The copy list is under "Add it to your app" in the [root README](../../README.md#add-it-to-your-app).

The app has a sign-in form, a session route, and a dashboard page. `test/` holds hand-written reference tests in the layout the skills produce.

## Check the kit against this app

Run this from the repository root:

```bash
node scripts/test-example.mjs
```

It copies this folder to a temporary folder and installs the kit there with `scripts/install-into.mjs`, which follows the install steps in the root README. Then it runs `npm install`, `npx playwright install chromium`, `npm run build`, and the three test commands. It stops at the first failure.

| Option | What it does |
| --- | --- |
| `--port 3100` | Runs the app on port 3100 for the end-to-end tests. The default is 3000. |
| `--keep` | Keeps the temporary folder so you can look at it. The path is printed. |

`package.json` here lists only the app's own dependencies. The test tools come from the kit, so the reference tests do not run in this folder itself.

## What is in it

| Path | What it is |
| --- | --- |
| `app/page.tsx` | Home page with a link to sign in |
| `app/sign-in/page.tsx` | Renders the sign-in form |
| `src/components/SignIn.tsx` | Client component: the form, its validation, and the request to `/api/session` |
| `app/api/session/route.ts` | Route handler: `POST` signs in, `GET` returns the session, `DELETE` signs out |
| `app/dashboard/page.tsx` | Server component: redirects to `/sign-in` without a session |
| `src/components/SignOutButton.tsx` | Client component: the "Sign out" button |
| `lib/validation.ts` | Email and password rules, shared by the form and the route |
| `lib/db.ts` | In-memory users and sessions, marked `server-only` |
| `lib/session.ts` | The session cookie name |
| `test/unit/lib/validation.test.ts` | Reference unit test for plain functions |
| `test/unit/components/SignIn.test.ts` | Reference unit test for a component: jsdom, Testing Library, mocks for `next/navigation` and `fetch` |
| `test/integration/api/session/route.test.ts` | Reference integration test for a route: mocks for `server-only`, `next/headers`, and `lib/db` |
| `test/e2e/plan/sign-in.plan.md` | Reference plan with six scenarios |
| `test/e2e/sign-in.spec.ts` | Reference spec for that plan |
| `test/e2e/pages/` | The page classes the spec uses |

There is one account: `ada@example.com` with the password `correct-horse-battery`. Sessions are kept in memory and are lost when the server restarts.

Imports use the `@/` alias from `tsconfig.json`, for example `@/lib/db`.

## Run the app alone

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. `npm run build` also passes here.

Do not commit `node_modules/` or `package-lock.json` from this folder. Both are in its `.gitignore`. Without a lockfile, every check installs the versions a new user would get.

## Settings that differ from a new Next.js app

| File | Setting | Why |
| --- | --- | --- |
| `next.config.ts` | `agentRules: false` | When `next dev` runs under a coding agent, Next.js 16.4 adds its own block to `AGENTS.md`. This setting keeps `AGENTS.md` as the kit ships it. |
| `next.config.ts` | `turbopack.root` | This folder sits inside a repository that has its own lockfile. Without the setting, Next.js warns that it had to guess the workspace root. |
| `tsconfig.json` | `test` in `exclude` | A new Next.js app type-checks every `.ts` file during `next build`, tests included. The test tools are not installed in this folder, so the build would fail on the imports in the tests. |
| `package.json` | `@types/node` is `^26.6.3` | A new Next.js app gets `^20`. `npm install` fails with that range next to Vitest 5, which accepts `^22.0.0` or `>=24.0.0`. |
