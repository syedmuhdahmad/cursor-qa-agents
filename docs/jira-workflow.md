# Jira workflow

How work on this kit is tracked in Jira. One person runs the project, two days a week.

- Board: [QA-Agents, project key SCRUM](https://syedmuhdahmad.atlassian.net/jira/software/projects/SCRUM/boards/1)
- Plan and dates: [roadmap.md](roadmap.md)
- Design: [the multi-tool design spec](superpowers/specs/2026-10-26-multi-tool-qa-agent-design.md)

## Cadence

| Item | Rule |
| --- | --- |
| Working days | Friday and Saturday |
| Sprint length | One week, Friday 09:00 to Saturday 18:00, Pakistan time (UTC+5) |
| Capacity | 8 hours a sprint |
| Planned work | 7 story points at most. The eighth hour is a buffer for reviews, CI and surprises |
| Estimate unit | 1 story point = 1 hour |
| Largest item | 4 points. Anything bigger is split before it enters a sprint |
| Sprint name | `QA S<nn> · <dates>`, for example `QA S01 · 30–31 Oct` |
| Sprint goal | One sentence on what works at the end, then `(<points> SP of 8 h; <spare> h spare)` |

### The two days

| When | What | Time |
| --- | --- | --- |
| Friday 09:00 | Planning: start the sprint, check the goal, check each item meets the definition of ready | 15 min |
| Friday and Saturday | Work, one item at a time | about 7 h |
| Saturday 17:30 | Review: move finished items to Done, move unfinished ones back to the backlog or into the next sprint | 15 min |
| Saturday 17:45 | Retro: one line in the sprint report on what to keep and what to change. Create the sprint four weeks ahead | 15 min |

Sprints are created four weeks ahead, not for the whole roadmap. Each Saturday, create the next one from the table in [roadmap.md](roadmap.md#sprint-plan).

## Workflow

The project keeps Jira's four statuses. A blocked item keeps its status and gets a flag.

```text
To Do ──► In Progress ──► In Review ──► Done
              │                │
              └── flag: Blocked ┘  (add a comment saying what it waits for)
```

| Status | Enter when | Leave when |
| --- | --- | --- |
| To Do | The item meets the definition of ready | Work starts on a branch |
| In Progress | A branch named after the key exists. Only one item at a time | A pull request is open |
| In Review | The pull request is open and CI runs | The pull request is merged with CI green |
| Done | The definition of done is met | Never. Reopen as a new bug instead |

### Definition of ready

- The summary follows the [naming convention](#naming-convention).
- The description has acceptance criteria as a checklist.
- The estimate is 4 points or less.
- It has a parent epic and a fix version, or the `later` label.

### Definition of done

- The pull request is merged into `main`, with every CI check green.
- Every acceptance criterion is ticked.
- `CHANGELOG.md` has an entry under `[Unreleased]` when the change is user-facing.
- Docs are updated when an option, a command or a file layout changed.

### Blocked

Flag the item (**Add flag** in the item's menu) and add a comment naming what it waits for. If it waits on another project, add the `blocked-upstream` label too. Remove both when it moves again.

## Naming convention

### Work item summaries

| Type | Pattern | Example |
| --- | --- | --- |
| Epic | `[AREA] <outcome>` | `[DOTNET] .NET stack pack: xUnit v3, Testcontainers and Playwright for .NET` |
| Story | `[AREA] <imperative outcome>` | `[INSTALLER] Detect the stack and the AI tools in the target folder` |
| Task | `[AREA] <imperative action>` | `[RELEASE] Rename the repository to fit a multi-tool kit` |
| Spike | Task named `[AREA] Spike: <question>`, label `type-spike`, 2 points at most | `[DOTNET] Spike: confirm the Playwright for .NET package for xUnit v3` |
| Bug | `[AREA] <symptom> when <condition>` | `[CORE] Guard denies npm test when the path has a space` |
| Subtask | `<imperative step>` with no area tag; it inherits the parent's | `Add the Windows path cases` |

Start with a verb for stories and tasks. Name the result, not the activity: "Add doctor to check Node, browsers, hooks and MCP", not "Work on doctor".

### Areas

| Area | Covers |
| --- | --- |
| `INSTALLER` | The `create-qa-agents` CLI, the setup questions, `qa-agents.json`, `update`, `add`, `doctor` |
| `CORE` | The canonical skills, the guard hook, the ask-first step, the verdict scripts |
| `CLAUDE` | The Claude Code adapter |
| `CURSOR` | The Cursor adapter |
| `COPILOT` | The GitHub Copilot adapter |
| `CODEX` | The OpenAI Codex adapter |
| `DOTNET` | The .NET stack pack |
| `JIRA` | The Jira integration through Atlassian Remote MCP |
| `EVAL` | The evaluation cases and their results |
| `DOCS` | The README and `docs/` |
| `RELEASE` | npm publishing, versions, the changelog, repository settings |
| `MOBILE` | The Maestro skills for Android and iOS |

### Labels

| Label | Meaning |
| --- | --- |
| `area-<area>` | The area in lower case, for filtering. An item can have more than one |
| `release-vX.Y.Z` | On epics, the release they belong to. Stories carry the release as their fix version |
| `type-spike` | A time-boxed question, not a deliverable |
| `from-github` | Moved from a GitHub issue. The description links the original |
| `blocked-upstream` | Waits on another project |
| `later` | Not planned into a release yet |

### Releases

Fix versions are named `vX.Y.Z` and match the npm version and the git tag. The current plan is in [roadmap.md](roadmap.md#releases).

### Branches, commits and pull requests

| Thing | Pattern | Example |
| --- | --- | --- |
| Branch | `<kind>/SCRUM-<n>-<slug>`, where kind is `feat`, `fix`, `docs` or `chore` | `feat/SCRUM-26-detect-stack` |
| Commit | Starts with the key | `SCRUM-26 Detect a .NET project from *.csproj` |
| Pull request title | `SCRUM-<n> <summary without the area tag>` | `SCRUM-26 Detect the stack and the AI tools in the target folder` |

The key in the branch name, commits and pull request title is what links them to the item once the GitHub for Jira app is installed.

## Setup the API cannot do

The Atlassian MCP server can create items, sprints and releases, but not change the project's settings. These are one-time steps in the Jira web app:

1. **Add a Bug work type.** Project settings → Work types → Add → Bug.
2. **Set a WIP limit of 1 on In Progress.** Board → ⋯ → Configure board → Columns.
3. **Install GitHub for Jira** from the Atlassian Marketplace and connect `syedmuhdahmad/cursor-qa-agents`.
4. **Add two automation rules.** Project settings → Automation:
   - When a pull request is created → transition the item to In Review.
   - When a pull request is merged → transition the item to Done.
5. **Optional: change the project key** from `SCRUM` to `QA`. Project settings → Details. Jira keeps the old keys working as redirects.
