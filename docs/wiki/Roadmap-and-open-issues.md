# Roadmap and open issues

This page is the plan from the 0.2 Cursor kit to 1.0, as of 2026-10-26. [docs/roadmap.md](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/roadmap.md) is the plan in the repository, and it is updated at the end of each release.

## Where the work is tracked

The work is tracked in Jira, on the [QA-Agents board](https://syedmuhdahmad.atlassian.net/jira/software/projects/SCRUM/boards/1), project key `SCRUM`. Jira is the source of truth for what is planned and what is done.

The open GitHub issues were moved to Jira. Each moved item has the label `from-github` and links the original issue in its description. For a security problem, follow the [security policy](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/SECURITY.md).

[docs/jira-workflow.md](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/jira-workflow.md) says how the work runs: one-week sprints on Friday and Saturday, 7 story points of planned work in each, and the names of items, branches, and commits.

## The plan to 1.0

Version 1.0 is one QA agent that you install with one command into the AI coding tools you use:

```bash
npx qa-agent-kit
```

The installer asks a few questions: which tools, which stack, whether to connect Jira, and where the agent may write tests. It writes the skills, the agent, the guard hook, and the MCP configuration for each tool, and records the answers in `qa-agent-kit.json`, so that `npx qa-agent-kit update` can apply a newer kit later without asking again.

- **Four tools:** Claude Code, Cursor, GitHub Copilot in VS Code, and OpenAI Codex CLI. Claude Code and Cursor come first, because both have a hook that can block a tool call.
- **Three stacks:** web (Vitest and Playwright), React Native, and .NET.
- **One source of skills,** rendered for each tool, and one guard hook rewritten in Node. Node is already required, and Python on Windows was the reason the 0.2 hook cannot run there.
- **An ask-first step.** Every job skill starts by asking what it cannot infer, and skips the questions when the prompt already answers them.
- **Jira** through Atlassian Remote MCP.

[The multi-tool design spec](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/superpowers/specs/2026-10-26-multi-tool-qa-agent-design.md) has the decisions and the reasons.

### The .NET pack

| Layer | Packages |
| --- | --- |
| Unit | `xunit.v3`, `NSubstitute`, `Shouldly` |
| Integration | `Microsoft.AspNetCore.Mvc.Testing` with `WebApplicationFactory`, and Testcontainers for .NET |
| End to end | `Microsoft.Playwright`, Playwright for .NET, with the xUnit v3 base class |
| Coverage | `coverlet.collector` |

The planned jobs are `/qa-dotnet-unit` and `/qa-dotnet-integration`, and `/qa-plan`, `/qa-generate`, and `/qa-heal` writing C# in a .NET project. A script reads the TRX file of `dotnet test` and prints the same `QA-VERDICT:` line as the web stack. A run with no tests is a failure. See [[QA manual for .NET]].

### Jira through Atlassian Remote MCP

| Job | Does |
| --- | --- |
| `/qa-plan SCRUM-123` | Reads the ticket's acceptance criteria and writes a test plan with one case for each criterion |
| `/qa-jira-sync` | Collects every ticket touched in the session, shows the planned comments and transitions in one list, asks once, then writes them all |

You sign in once with OAuth in the tool. Nothing secret is written to the repository. Every Jira write is shown before it happens.

## Releases

| Release | What ships | Points | Planned finish | Jira release date |
| --- | --- | --- | --- | --- |
| v0.3.0 | `npx qa-agent-kit` installs the kit into Claude Code and Cursor. Node guard hook, shared skills, ask-first step, `qa-agent-kit.json` and `update`, upgrade from 0.2 | 60 | Sat 2 Jan 2027 | 2027-01-02 |
| v0.4.0 | .NET stack pack: xUnit v3, NSubstitute, Shouldly, `WebApplicationFactory` with Testcontainers, Playwright for .NET, and a `QA-VERDICT:` line read from TRX | 28 | Sat 6 Feb 2027 | 2027-02-06 |
| v0.5.0 | Jira through Atlassian Remote MCP: plan tests from a ticket, `/qa-jira-sync`, a confirmation before each write | 13 | Sat 13 Feb 2027 | 2027-02-13 |
| v0.6.0 | GitHub Copilot and OpenAI Codex targets | 18 | Sat 27 Feb 2027 | 2027-03-06 |
| v1.0.0 | Every evaluation case on every tool and stack, `doctor`, the docs rewrite, the 1.0 release | 14 | Sat 13 Mar 2027 | 2027-03-20 |

The Jira dates for v0.6.0 and v1.0.0 are a week later than the planned finish. That week is the buffer. The plan assumes one person, 8 hours a week, and 133 points over 20 sprints, with a 21st sprint kept free. A lost sprint moves every later date by a week.

The epics are [SCRUM-11](https://syedmuhdahmad.atlassian.net/browse/SCRUM-11) to [SCRUM-20](https://syedmuhdahmad.atlassian.net/browse/SCRUM-20). The sprint plan is in [docs/roadmap.md](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/roadmap.md#sprint-plan).

## Later

These were moved from GitHub and are not planned into a release yet. They carry the label `later`.

| Item | Was GitHub issue | Summary |
| --- | --- | --- |
| [SCRUM-5](https://syedmuhdahmad.atlassian.net/browse/SCRUM-5) | 21 | Maestro end-to-end testing on Android and iOS (epic) |
| [SCRUM-6](https://syedmuhdahmad.atlassian.net/browse/SCRUM-6) | 24 | Maestro on iOS: skills, simulator setup, and CI |
| [SCRUM-7](https://syedmuhdahmad.atlassian.net/browse/SCRUM-7) | 27 | Make the skills and the qa role reliable on low-tier models |
| [SCRUM-8](https://syedmuhdahmad.atlassian.net/browse/SCRUM-8) | 39 | Test the kit on Claude Opus 5, Composer 2.5, and Gemini 3.8 Flash |
| [SCRUM-9](https://syedmuhdahmad.atlassian.net/browse/SCRUM-9) | 30 | Cover the testing still open after the first Cursor runs |
| [SCRUM-10](https://syedmuhdahmad.atlassian.net/browse/SCRUM-10) | 20 | Remove the `RTK_DISABLED=1` prefix once RTK ships its fixes. Blocked upstream. |

iOS is on this list. Mobile testing with Maestro is out of scope for 1.0. See [[Mobile testing with Maestro]].

## Out of scope for 1.0

- Mobile end-to-end testing with Maestro, SCRUM-5 and SCRUM-6.
- AI tools other than the four above.
- Hosting or running tests in the cloud.

## Not supported today

These hold for the 0.2 kit:

- Windows. It cannot start the hook by its `.py` path.
- A package manager other than npm for the agent's own commands.
- An app under test on a host other than `localhost` or `127.0.0.1`.
- An AI tool other than Cursor.

## Risks

| Risk | What is planned |
| --- | --- |
| A sprint is lost to illness or travel | Use the buffer sprint, then move v1.0.0 |
| Copilot or Codex has no blocking hook, or its format changes | A spike in sprint 12 decides. The fallback is rules in the skill text only, and the docs say so. |
| Playwright for .NET has no xUnit v3 package | A spike in sprint 10 decides before any .NET skill is written |
| Atlassian Remote MCP changes its tool names | The tool allowlist is kept in one file, checked by a test |
| The `qa-agent-kit` name is taken on npm before the first publish | A 0.0.1 placeholder is published in the first sprint |
