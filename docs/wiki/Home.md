# QA agent kit

The QA agent kit makes the AI agent in your editor write and fix your app's tests. You copy its files into a React, Next.js, or React Native app. Then the Cursor agent writes Vitest unit and integration tests, Playwright end-to-end tests, Jest unit tests in a React Native or Expo app, and Maestro flows for a mobile app, as a preview.

The agent reads your application source and does not edit it. When a test fails because the product is wrong, it reports the bug and does not weaken the test. A hook enforces these rules, and every test run ends with one verdict line that the agent copies.

The agent today is Cursor's. Version 1.0 is planned to install with one command, `npx qa-agent-kit`, into Claude Code, Cursor, GitHub Copilot, and OpenAI Codex. See [[Roadmap and open issues]].

## Start here

- [[Getting started]]: install the kit, write a first unit test, plan and generate a spec, and read the reply.
- [[Skills and example prompts]]: every skill, the prompts it takes, and what it writes.

## QA manuals by tech stack

| Your app | Tests the agent writes | Status | Manual |
| --- | --- | --- | --- |
| React or Next.js | Vitest unit and integration tests, Playwright end-to-end tests | Supported | [[QA manual for web apps]] |
| React Native or Expo | Jest unit tests, and Maestro flows | Supported. Maestro is a preview, run on Android only | [[QA manual for React Native]] |
| .NET | xUnit v3, Testcontainers, Playwright for .NET | Planned for v0.4.0 | [[QA manual for .NET]] |

## All pages

| Page | What it has |
| --- | --- |
| [[Getting started]] | Your first hour: install, the first unit test, a plan, a generated spec, and how to read the reply |
| [[Skills and example prompts]] | Every skill, the prompts it takes, the files it writes, and its `BLOCKED` replies |
| [[QA manual for web apps]] | Day-to-day QA work in a React or Next.js app |
| [[QA manual for React Native]] | Day-to-day QA work in a React Native or Expo app, with Jest and Maestro |
| [[QA manual for .NET]] | What is planned for .NET, and what to do until then |
| [[Installation]] | Requirements, the installer, copying by hand, files your app already has, and a React Native app |
| [[Jobs and commands]] | The jobs, the reply form, every case of the verdict line, and the app under test |
| [[The hook]] | What the hook allows and denies, and its limits |
| [[Layout and files]] | Where each test goes, and every file the kit puts in your app |
| [[Mobile testing with Maestro]] | The three mobile jobs, element files, and what was run |
| [[Security audit]] | Cloudflare's audit skill: which model, the prompts, and where the report goes |
| [[Using RTK]] | Why every test command starts with `RTK_DISABLED=1`. Only for people who use RTK. |
| [[Upgrading]] | Moving your app to a newer version of the kit |
| [[Troubleshooting]] | Symptoms, causes, and fixes, from install to a denied command |
| [[Supported models and evaluation]] | The three model tiers, and what was run on each |
| [[Roadmap and open issues]] | The plan to 1.0, and where the work is tracked |
| [[Contributing]] | Checks, style, and how a release is made |

## Version

The latest release is [v0.2.0](https://github.com/syedmuhdahmad/qa-agent-kit/releases/tag/v0.2.0), of 2026-10-26. The first tagged version was v0.1.0, of 2026-10-09.

`.cursor/qa/VERSION` in your app says which version you copied. A copy without that file is older than 0.1.0. The [changelog](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/CHANGELOG.md) starts each version with the things you must do. See [[Upgrading]].

The repository was called `cursor-qa-agents` until 2026-10-26. GitHub sends the old links and `git` remotes to the new name.

## Where the detail is

- **This wiki is the manual.** It says how to use the kit, by topic.
- **[`docs/`](https://github.com/syedmuhdahmad/qa-agent-kit/tree/main/docs) in the repository is the reference detail:** every hook rule, every install case, and every evaluation round.
- **The repository wins when the two differ.** The [README](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/README.md) is the overview and links to the pages here.
