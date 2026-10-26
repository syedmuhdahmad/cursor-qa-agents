# Multi-tool QA agent: design

Date: 2026-10-26. Status: agreed. Plan: [roadmap.md](../../roadmap.md). Tracking: [jira-workflow.md](../../jira-workflow.md).

## Goal

Turn the 0.2 Cursor kit into one QA agent that a user installs with one command into the AI coding tools they use, for the stack their app is written in:

```bash
npx qa-agent-kit
```

The installer asks a few questions, writes the skills, the agent, the guard hook and the MCP configuration for each chosen tool, and records the answers so `update` can re-apply them later.

## Decisions

| Question | Decision | Why |
| --- | --- | --- |
| Which tools | Claude Code, Cursor, GitHub Copilot in VS Code, OpenAI Codex CLI | The four agents with skills, a custom agent file and MCP. Claude Code and Cursor first, because both have a blocking pre-tool hook |
| Name | `qa-agent-kit` for the repository and the npm package | Names no single AI tool. Free on npm on 2026-10-26. The repository was `cursor-qa-agents` |
| One source of skills | Canonical `SKILL.md` files, rendered per tool by an adapter | All four tools read the Agent Skills format. Only paths, frontmatter keys and the question tool differ |
| Guard hook | Rewritten in Node, with one payload adapter per tool | Node is already required. Python on Windows was the reason the 0.2 hook could not run there |
| .NET unit tests | xUnit v3, NSubstitute, Shouldly | Open source. FluentAssertions 8 needs a paid licence for commercial use |
| .NET integration tests | `WebApplicationFactory` and Testcontainers for .NET | Real database and HTTP pipeline, no mocks at the edges |
| .NET end to end | Playwright for .NET | Same tool as the web stack, so the plan, generate and heal jobs carry over |
| Jira | Atlassian Remote MCP | Official, OAuth sign-in, no token stored in the repository |
| Moved GitHub issues | Comment with the Jira link, then close | One place to track work |

## What the user sees

### Install

```text
$ npx qa-agent-kit
? Which AI tools do you use here?   [x] Claude Code  [x] Cursor  [ ] GitHub Copilot  [ ] Codex
? Which stack is this app?           (•) .NET   ( ) Web (Vitest + Playwright)   ( ) React Native
? Connect Jira through Atlassian MCP? (Y/n)
? Where may the agent write tests?   test/   (detected)
Writing .claude/ .cursor/ .mcp.json qa-agent-kit.json ... done
Next: open Claude Code and run /qa
```

Answers are pre-filled from detection: `*.csproj` or `*.sln` means .NET, `vitest` or `@playwright/test` in `package.json` means web, `expo` or `react-native` means React Native. Existing `.claude/`, `.cursor/`, `.github/` and `.codex/` folders pre-tick the tools.

For CI and scripts, every question has a flag:

```bash
npx qa-agent-kit --yes --tools claude,cursor --stack dotnet --jira
```

### Later

| Command | Does |
| --- | --- |
| `npx qa-agent-kit update` | Re-renders everything from `qa-agent-kit.json` with the newer kit, keeping the user's answers |
| `npx qa-agent-kit add copilot` | Adds a tool or a stack to an existing install |
| `npx qa-agent-kit doctor` | Checks Node, the browsers, the hook registration and the MCP servers, and says what to fix |

### Ask first

Every job skill starts by asking what it cannot infer: which feature, which acceptance criteria, which files are in scope. It uses each tool's own question tool:

| Tool | How it asks |
| --- | --- |
| Claude Code | `AskUserQuestion` |
| Cursor | Cursor's question tool |
| Copilot, Codex | A plain question in chat, then it stops and waits |

The skill skips the questions when the prompt already answers them, so a precise prompt still runs in one turn.

## Architecture

```text
qa-agent-kit
├── bin/cli.mjs              entry: install, update, add, doctor
├── src/detect.mjs           stack and tool detection
├── src/questions.mjs        prompts, defaults, flags
├── src/render.mjs           canonical skill → per-tool files
├── src/adapters/
│   ├── claude.mjs
│   ├── cursor.mjs
│   ├── copilot.mjs
│   └── codex.mjs
├── kit/
│   ├── skills/<job>/SKILL.md     one canonical copy per job
│   ├── stacks/{web,dotnet,rn}/   templates, verdict scripts, guard rules
│   └── guard/guard.mjs           the Node guard hook
└── test/
```

`qa-agent-kit.json` in the user's repository records the kit version, the tools, the stack, the write scope and whether Jira is on. `update` reads it, so a re-install never asks again.

### Where each tool gets its files

| Tool | Skills | Agent | Guard hook | MCP config |
| --- | --- | --- | --- | --- |
| Claude Code | `.claude/skills/` | `.claude/agents/qa.md` | `PreToolUse` in `.claude/settings.json` | `.mcp.json` |
| Cursor | `.cursor/skills/` | `.cursor/agents/qa.md` | `preToolUse` in `.cursor/hooks.json` | `.cursor/mcp.json` |
| GitHub Copilot | `.github/skills/` | `.github/agents/qa.agent.md` | `.github/hooks/` where supported | `.vscode/mcp.json` |
| OpenAI Codex | `.agents/skills/` | Job table in `AGENTS.md` | Where Codex supports hooks; otherwise rules only | `.codex/config.toml` |

The Copilot and Codex rows are checked by a spike (SCRUM-53) before any adapter code is written. Where a tool has no blocking hook, the installer says so, and the skills carry the rules in text.

### Guard hook

One Node script, `guard.mjs`, with a small adapter per tool that turns the tool's hook payload into `{ tool, path, command }` and turns the decision back into the tool's reply format. The rules are the 0.2 rules, ported with their tests:

- Writes are allowed only inside the write scope from `qa-agent-kit.json`.
- Shell commands are allowed only from the list for the chosen stack: `npm run`, `npx vitest`, `npx playwright` for web; `dotnet test`, `dotnet build`, `pwsh bin/.../playwright.ps1` for .NET.
- Forbidden content (`.skip`, `.only`, `waitForTimeout`, `[Fact(Skip = ...)]`) is denied, with a message naming the allowed alternative.
- A hook that crashes denies the action.

## .NET stack pack

| Layer | Packages |
| --- | --- |
| Unit | `xunit.v3`, `NSubstitute`, `Shouldly` |
| Integration | `Microsoft.AspNetCore.Mvc.Testing`, `Testcontainers` (PostgreSQL, SQL Server, Redis modules as needed) |
| End to end | `Microsoft.Playwright` with the xUnit v3 base class (confirmed by SCRUM-40) |
| Coverage | `coverlet.collector` |

Jobs: `/qa-dotnet-unit`, `/qa-dotnet-integration`, and the existing `/qa-plan`, `/qa-generate`, `/qa-heal` writing C# in a .NET project.

`dotnet test --logger trx` writes a TRX file. A Node script reads it and prints one line, `QA-VERDICT: PASS` or `QA-VERDICT: FAIL (<n> failed, <n> skipped)`, the same contract as the web verdict scripts. Zero tests run is a failure.

## Jira

The installer adds Atlassian Remote MCP to each chosen tool's MCP config. The user signs in once with OAuth in the tool; nothing secret is written to the repository.

| Job | Does |
| --- | --- |
| `/qa-plan SCRUM-123` | Reads the ticket's acceptance criteria and writes a test plan with one case per criterion |
| `/qa-jira-sync` | Collects every ticket touched in the session, shows the planned comments and transitions in one list, asks once, then writes them all |

Every Jira write is shown before it happens. The skills may call only the Jira tools on their allowlist.

## Testing the kit

- Unit tests for detection, rendering and each adapter, run on Linux, macOS and Windows in CI.
- The guard's tests, ported from the Python suite, plus payload fixtures for each tool.
- The evaluation cases run headless in each tool: `claude -p`, the Cursor CLI, `codex exec`. Copilot is run by hand. Results go in `eval/results/`.

## Out of scope for 1.0

- Mobile end-to-end testing with Maestro (SCRUM-5, SCRUM-6). It stays on the `later` list.
- Tools other than the four above.
- Hosting or running tests in the cloud.
