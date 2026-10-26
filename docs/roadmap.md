# Roadmap

The plan from the 0.2 Cursor kit to 1.0: one QA agent installed with `npx create-qa-agents` into Claude Code, Cursor, GitHub Copilot and OpenAI Codex. It covers web (Vitest and Playwright), React Native, and .NET (xUnit v3, Testcontainers, Playwright for .NET), and connects to Jira through Atlassian Remote MCP.

- Design: [the multi-tool design spec](superpowers/specs/2026-10-26-multi-tool-qa-agent-design.md)
- How the work is tracked: [jira-workflow.md](jira-workflow.md)
- Live board: [QA-Agents in Jira](https://syedmuhdahmad.atlassian.net/jira/software/projects/SCRUM/boards/1)

Jira is the source of truth. This file is the plan as of 2026-10-26 and is updated at the end of each release.

## Assumptions

- One person, Friday and Saturday, 8 hours a week.
- 7 story points planned per sprint (1 point = 1 hour), plus 1 hour of buffer.
- 133 points in total over 20 sprints, with a 21st sprint kept free as buffer before 1.0.
- Friday 25 December 2026 (Quaid-e-Azam Day) and Friday 1 January 2027 are planned as working days. If either is taken off, every later date moves by a week.

## Releases

| Release | What ships | Points | Planned finish | Jira release date |
| --- | --- | --- | --- | --- |
| v0.3.0 | `npx create-qa-agents` installs the kit into Claude Code and Cursor. Node guard hook, shared skills, ask-first step, `qa-agents.json` and `update`, upgrade from 0.2 | 60 | Sat 2 Jan 2027 | 2027-01-02 |
| v0.4.0 | .NET stack pack: xUnit v3, NSubstitute, Shouldly, WebApplicationFactory with Testcontainers, Playwright for .NET, and a `QA-VERDICT:` line read from TRX | 28 | Sat 6 Feb 2027 | 2027-02-06 |
| v0.5.0 | Jira through Atlassian Remote MCP: plan tests from a ticket, `/qa-jira-sync` to update every touched ticket at once, a confirmation before each write | 13 | Sat 13 Feb 2027 | 2027-02-13 |
| v0.6.0 | GitHub Copilot and OpenAI Codex targets | 18 | Sat 27 Feb 2027 | 2027-03-06 |
| v1.0.0 | Every evaluation case on every tool and stack, `doctor`, the docs rewrite, the repository rename, the 1.0 release | 14 | Sat 13 Mar 2027 | 2027-03-20 |

The Jira dates for v0.6.0 and v1.0.0 are a week later than the planned finish. That week is the buffer.

```text
            Nov        Dec        Jan        Feb        Mar
v0.3.0   ████████████████████████▌
v0.4.0                          ██████████▌
v0.5.0                                    ██▌
v0.6.0                                     ████▌
v1.0.0                                          ████▌ (+1 buffer)
```

## Epics

| Epic | Area | Release | Due |
| --- | --- | --- | --- |
| [SCRUM-11](https://syedmuhdahmad.atlassian.net/browse/SCRUM-11) npx installer and setup wizard | INSTALLER | v0.3.0 | 2027-01-02 |
| [SCRUM-13](https://syedmuhdahmad.atlassian.net/browse/SCRUM-13) Shared skills, Node guard hook and ask-first step | CORE | v0.3.0 | 2026-12-12 |
| [SCRUM-14](https://syedmuhdahmad.atlassian.net/browse/SCRUM-14) Claude Code target | CLAUDE | v0.3.0 | 2026-12-12 |
| [SCRUM-15](https://syedmuhdahmad.atlassian.net/browse/SCRUM-15) Cursor target on the new installer | CURSOR | v0.3.0 | 2026-12-19 |
| [SCRUM-16](https://syedmuhdahmad.atlassian.net/browse/SCRUM-16) .NET stack pack | DOTNET | v0.4.0 | 2027-02-06 |
| [SCRUM-17](https://syedmuhdahmad.atlassian.net/browse/SCRUM-17) Jira integration through Atlassian Remote MCP | JIRA | v0.5.0 | 2027-02-13 |
| [SCRUM-18](https://syedmuhdahmad.atlassian.net/browse/SCRUM-18) GitHub Copilot target | COPILOT | v0.6.0 | 2027-02-27 |
| [SCRUM-19](https://syedmuhdahmad.atlassian.net/browse/SCRUM-19) OpenAI Codex target | CODEX | v0.6.0 | 2027-03-06 |
| [SCRUM-20](https://syedmuhdahmad.atlassian.net/browse/SCRUM-20) 1.0.0 hardening and launch | RELEASE | v1.0.0 | 2027-03-20 |

## Sprint plan

S01 to S04 exist in Jira. Create the rest four weeks ahead, from this table. Some sprints pull in a small item from the next release so that no sprint is left with only one 4-point item.

| Sprint | Dates | Items | Points |
| --- | --- | --- | --- |
| S01 | 30–31 Oct | SCRUM-12 scaffold the CLI (3), SCRUM-21 guard path and write rules in Node (4) | 7 |
| S02 | 6–7 Nov | SCRUM-22 guard shell rules in Node (4), SCRUM-23 one guard for both hook payloads (2), SCRUM-36 `.mcp.json` (1) | 7 |
| S03 | 13–14 Nov | SCRUM-24 canonical skills rendered per tool (4), SCRUM-26 detect stack and tools (3) | 7 |
| S04 | 20–21 Nov | SCRUM-27 setup questions (4), SCRUM-28 CI flags (2) | 6 |
| S05 | 27–28 Nov | SCRUM-34 install under `.claude/` (3), SCRUM-38 Cursor adapter (3) | 6 |
| S06 | 4–5 Dec | SCRUM-35 Claude Code PreToolUse hook (2), SCRUM-29 `qa-agents.json` and `update` (4) | 6 |
| S07 | 11–12 Dec | SCRUM-25 ask-first step (3), SCRUM-37 evaluation in Claude Code (4) | 7 |
| S08 | 18–19 Dec | SCRUM-39 Cursor regression evaluation (3), SCRUM-30 upgrade a 0.2 kit (3) | 6 |
| S09 | 25–26 Dec | SCRUM-31 installer tests on three OSes (3), SCRUM-32 npm publish from CI (3) | 6 |
| S10 | 1–2 Jan | SCRUM-33 README for npx (2), SCRUM-40 spike: Playwright for .NET with xUnit v3 (2), SCRUM-41 TRX verdict (3). **v0.3.0 ships** | 7 |
| S11 | 8–9 Jan | SCRUM-42 .NET example app (4), SCRUM-48 Remote MCP config (2) | 6 |
| S12 | 15–16 Jan | SCRUM-43 guard rules for `dotnet` (4), SCRUM-53 spike: Copilot and Codex formats (2), SCRUM-52 Jira setup docs (1) | 7 |
| S13 | 22–23 Jan | SCRUM-44 `/qa-dotnet-unit` (4), SCRUM-49 plan from a Jira ticket (3) | 7 |
| S14 | 29–30 Jan | SCRUM-45 `/qa-dotnet-integration` (4), SCRUM-54 Copilot skills and agent (3) | 7 |
| S15 | 5–6 Feb | SCRUM-46 Playwright for .NET in generate and heal (4), SCRUM-47 .NET evaluation (3). **v0.4.0 ships** | 7 |
| S16 | 12–13 Feb | SCRUM-50 `/qa-jira-sync` (4), SCRUM-51 confirm before Jira writes (3). **v0.5.0 ships** | 7 |
| S17 | 19–20 Feb | SCRUM-55 Copilot hook (2), SCRUM-56 `.vscode/mcp.json` (2), SCRUM-57 Codex skills and `AGENTS.md` (3) | 7 |
| S18 | 26–27 Feb | SCRUM-58 `.codex/config.toml` and guard (3), SCRUM-59 evaluation in Codex (3). **v0.6.0 ships** | 6 |
| S19 | 5–6 Mar | SCRUM-60 full evaluation table (4), SCRUM-61 `doctor` (3) | 7 |
| S20 | 12–13 Mar | SCRUM-62 docs rewrite (4), SCRUM-63 repository rename (1), SCRUM-64 release 1.0.0 (2). **v1.0.0 ships** | 7 |
| S21 | 19–20 Mar | Buffer. Anything that slipped | 0 |

## Later

Moved from GitHub and not planned into a release yet. They carry the `later` label.

| Item | Summary |
| --- | --- |
| [SCRUM-5](https://syedmuhdahmad.atlassian.net/browse/SCRUM-5) | [MOBILE] Maestro end-to-end testing on Android and iOS (epic) |
| [SCRUM-6](https://syedmuhdahmad.atlassian.net/browse/SCRUM-6) | [MOBILE] Maestro on iOS: skills, simulator setup and CI |
| [SCRUM-7](https://syedmuhdahmad.atlassian.net/browse/SCRUM-7) | [CORE] Make the skills and the qa role reliable on low-tier models |
| [SCRUM-8](https://syedmuhdahmad.atlassian.net/browse/SCRUM-8) | [EVAL] Test the kit on Claude Opus 5, Composer 2.5 and Gemini 3.8 Flash |
| [SCRUM-9](https://syedmuhdahmad.atlassian.net/browse/SCRUM-9) | [EVAL] Cover the testing still open after the first Cursor runs |
| [SCRUM-10](https://syedmuhdahmad.atlassian.net/browse/SCRUM-10) | [CORE] Remove the RTK_DISABLED=1 prefix once RTK ships its fixes (blocked upstream) |

## Risks

| Risk | Effect | What to do |
| --- | --- | --- |
| A sprint is lost to illness or travel | Every later date moves a week | Use the S21 buffer, then move v1.0.0 |
| Copilot or Codex hook formats change, or have no blocking hook | The guard cannot enforce the write scope there | The S12 spike decides. Fall back to rules-only mode and say so in the docs |
| Playwright for .NET has no xUnit v3 package | Generate and heal need a different base class | The S10 spike decides before any .NET skill is written |
| Atlassian Remote MCP changes its tool names | `/qa-jira-sync` breaks | Keep the tool allowlist in one file, checked by a test |
| The `create-qa-agents` name is taken before the first publish | The `npx` command changes | Publish a 0.0.1 placeholder as part of SCRUM-12 in S01 |
