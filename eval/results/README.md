# Recorded results

[`runs.jsonl`](runs.jsonl) has one line for each scored run. This file says how the recorded rounds were run, what the fields of a line mean, and what is known to be wrong with the rounds.

[The README one folder up](../README.md) says how to run a case and what each check means. To print the lines as a table, run this in the root of the repository:

```bash
node eval/report.mjs eval/results/runs.jsonl
```

## How the rounds were run

Rounds 1 to 3 ran outside Cursor, with two stand-in models. Round 4 ran in Cursor's own agent and has [its own section](#round-4). In rounds 1 to 3 these models did the work:

| `model` in `runs.jsonl` | Model | Stands in for |
| --- | --- | --- |
| `claude-haiku-4-5 (low-tier proxy)` | Claude Haiku 4.5 | A low-cost model in Cursor |
| `claude-sonnet-5-5 (mid-tier proxy)` | Claude Sonnet 5.5 | A mid-tier model in Cursor |

The models of rounds 4 and 5 are the ones Cursor offers under these ids. The tier column uses the tiers set on 2026-10-10 in [issue 39](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/39). Round 4 was written before that, and called Composer 2.5 the low tier and Claude Opus 5 the mid tier.

| `model` in `runs.jsonl` | Model, as the agent's stream names it | Tier |
| --- | --- | --- |
| `composer-2.5` | Composer 2.5 | Mid |
| `claude-opus-5-high` | Claude Opus 5 300K High No Thinking | High |
| `gemini-3.8-flash-low` | Gemini 3.8 Flash Low | Low |

For each run of rounds 1 to 3:

1. `make-sandbox.mjs` built a sandbox for the case.
2. An orchestration script started one agent in the sandbox. The agent could read files, write files, and run shell commands.
3. The agent's prompt was the text that `eval/prompt.mjs` prints, with an environment note in front (`--env-note`). The note named the project folder, said that the hook does not run, and said that the app server was already running.
4. The agent's last message was saved as the reply.
5. `score.mjs` scored the sandbox and the reply, and `--record` added one line to `runs.jsonl`.

In rounds 1 to 3 the hook was not in the loop. No deny reached an agent while it worked. After the run the scorer asks the hook about every file the agent wrote.

In rounds 1 and 2 the plan and generate skills named the `browser_*` tools of the Playwright MCP server. The stand-in agents had no MCP tools. So the environment note of those rounds gave the `playwright-cli` command for each tool, and the agents ran those commands. From round 3 on the skills use `playwright-cli` themselves, and the note has no such list. [`env-note.example.txt`](../env-note.example.txt) is the note without it.

| `label` | Scored on | Kit | Runs |
| --- | --- | --- | --- |
| `round-1` | 2026-10-09 | The working tree at commit `152fc47`, and `origin/main` at commit `bfb88f7` for the old skills | One run for each case: 9 on the low tier, 9 on the mid tier, and 9 on the low tier with the old skills |
| `round-2` | 2026-10-09 | The working tree at commit `50cdaad` with uncommitted changes | Two runs for each case on the low tier, one on the mid tier. Two of the low-tier runs were void, see below. |
| `round-3` | 2026-10-09 | The working tree at commit `9cdb04a`. The only uncommitted changes were in the mobile skills, which no case uses. | Two runs for each case on the low tier, one on the mid tier. No run was void. |
| `round-4` | 2026-10-09 | The working tree at commit `611d6fd`, with no uncommitted change | In Cursor's agent: two runs for each case on Composer 2.5, one on Claude Opus 5. No run was void. |
| `round-4-old-kit` | 2026-10-10 | The old skills, at commit `bfb88f7` | In Cursor's agent: two runs on Composer 2.5 for each of `fix-unit`, `e2e-heal-locator`, and `e2e-heal-product-bug`. No run was void. |
| `round-5` | 2026-10-25 | Commit `090c6d1`, from a worktree with no uncommitted change | In Cursor's agent, the 13 cases: two runs for each case on Composer 2.5, and one run of 6 cases each on Gemini 3.8 Flash and Claude Opus 5, which then stopped at the account's usage limit. One run was void, see below. |

## What the fields mean

| Field | Meaning |
| --- | --- |
| `scoredAt` | When `score.mjs` ran, in UTC. It is not when the agent ran. |
| `case` | The case, a file name in [`../cases/`](../cases/) without `.json` |
| `kit` | `working-tree`, or the git ref that `make-sandbox.mjs --kit-ref` installed, such as `origin/main` |
| `commit` | The first seven characters of the kit's commit. A `+` at the end means the working tree had uncommitted changes. |
| `route` | `skill` when the prompt held the skill of the case. `qa-agent` for the old kit, where every request went through `/qa`. |
| `model` | The text given with `--model`. See the first table. |
| `label` | The text given with `--label`. Here it names the round. |
| `result` | `pass` when every check passed, `fail` when one did not, `error` when the scorer could not decide |
| `percent`, `passed`, `counted` | The share and the number of passed checks, among the checks that apply to the case |
| `falsePass` | `true` when the reply said the work passed and the scorer's own run says it did not |
| `answerInSkill` | `true` when the skill in the sandbox printed the answer of a product-bug case. The lines of round 1 do not have this field. |
| `notPassed` | The checks that failed or could not be decided |
| `run` | The scorer's own result: `PASS`, `FAIL`, `PASS-WITH-FIXME`, `DONE` for a plan that is there, `MISSING` for a plan that is not, `NO-TEST` for a test file that is not there, `ERROR` when the scorer could not run the test |
| `replyVerdict` | What the reply's verdict reads as: `PASS`, `FAIL`, `BLOCKED`, `DONE`, or nothing |
| `notes` | Notes of the scorer that are not part of the score. `browser-open` means the agent left a browser open. The lines of rounds 1 and 2 do not have this field. |

## Known problems with these rounds

- **Round 1: two cases could be passed by copying.** The examples in the skills came from the example app, which is also the app of the evaluation. So `e2e-plan` and `e2e-heal-product-bug` could be passed by copying from the skill. The examples were replaced before round 2.
- **Round 2: two low-tier runs were void.** They are the first run of `fix-unit` and the first run of `unit-product-bug`. Each agent started before its prompt file existed. Their two lines are not in `runs.jsonl`. So the low tier has one run of these two cases in round 2, and two runs of every other case.
- **Round 2: the two `e2e-plan` failures were real.** Both plans left out the scenario with the mocked server error, and neither named a visible text for the main flow. That led to a fix in the plan skill.
- **Round 2: the `e2e-generate` failure was a file in the project root.** The agent saved test output to a file there. In Cursor the hook denies that write.

- **Round 5: Gemini 3.8 Flash and Claude Opus 5 did not finish.** Each model ran 6 cases once, and then every run stopped with the CLI's `ActionRequiredError: You've hit your usage limit`. The limit is for the whole Cursor account: on the same day a long security audit and the mobile runs used Claude Opus 5 too. The 20 missing runs of each model are listed in the round's queue, outside this repository.
- **Round 5: one Gemini run was void.** The first run of `integration-api` ended after 8 seconds with that usage error and no agent work. Its line is not in `runs.jsonl`.

## Round 3

<!-- results:round-3 -->

Round 3 is the first round in which the plan and generate skills drive the browser with `playwright-cli` themselves. The environment note had no list of commands. It also has the changed plan skill, which keeps the mocked server-error scenario and names a visible text in every expectation.

| Case | Low tier | Mid tier |
| --- | --- | --- |
| `unit-ui` | 2 of 2 | 1 of 1 |
| `unit-plain` | 2 of 2 | 1 of 1 |
| `integration-api` | 2 of 2 | 1 of 1 |
| `fix-unit` | 2 of 2 | 1 of 1 |
| `unit-product-bug` | 2 of 2 | 1 of 1 |
| `e2e-plan` | 2 of 2 | 1 of 1 |
| `e2e-generate` | 2 of 2 | 1 of 1 |
| `e2e-heal-locator` | 2 of 2 | 1 of 1 |
| `e2e-heal-product-bug` | 1 of 2 | 1 of 1 |
| All | 17 of 18 | 9 of 9 |

No reply claimed a pass over a failing run.

- **The one failure was a wrong product-bug claim.** In the second low-tier run of `e2e-heal-product-bug` the agent parked two tests with `test.fixme`. One was the real product bug. The other was a test that had failed in the agent's run for another reason, and its marker line named no source file and line. The same test passes in the other runs against the same server. Why it failed in that run was not looked into.
- **What changed because of it.** The hook now counts a `// product bug:` line only when it names an application source file and a line number. The spec of that run, sent through the changed hook, is denied.
- **Limits that still hold.** The agents were stand-ins outside Cursor, the hook was not in the loop, and two runs for each case say little about how often a model fails.

## Round 4

Round 4 is the first round in Cursor's own agent. It was started from the shell with the Cursor CLI, version `2026.10.01-e373342`, as [the README one folder up](../README.md#run-it-with-the-cursor-cli) describes: the agent got only the user's text, and Cursor attached the skill, loaded `AGENTS.md`, and ran the hook.

| Case | Composer 2.5 | Claude Opus 5 |
| --- | --- | --- |
| `unit-ui` | 2 of 2 | 1 of 1 |
| `unit-plain` | 2 of 2 | 1 of 1 |
| `integration-api` | 2 of 2 | 1 of 1 |
| `fix-unit` | 2 of 2 | 1 of 1 |
| `unit-product-bug` | 2 of 2 | 1 of 1 |
| `e2e-plan` | 2 of 2 | 1 of 1 |
| `e2e-generate` | 2 of 2 | 1 of 1 |
| `e2e-heal-locator` | 2 of 2 | 1 of 1 |
| `e2e-heal-product-bug` | 2 of 2 | 1 of 1 |
| All | 18 of 18 | 9 of 9 |

Every one of the 27 runs passed every check. No reply claimed a pass over a failing run, and no run left a browser open.

- **The hook was live.** Before the round, one prompt asked the agent for an edit of application source, a `cd`, and a read of the lockfile. The hook denied all three, and the agent quoted the hook's messages. The messages were the same ones a session in the Cursor window showed on the same day.
- **No deny happened in the 27 runs.** No agent tried a write or a command that the hook forbids. So the round shows that the skills keep both models inside the rules. It does not show how a model goes on after a deny.
- **The skill was attached by Cursor.** With `/qa-unit` in front of the text, no agent opened `SKILL.md`: it went straight to the skill's templates. One more run, which is not in `runs.jsonl`, sent `unit-plain` to Composer 2.5 with no slash command. The agent's first step was to read `.cursor/skills/qa-unit/SKILL.md`, as `AGENTS.md` tells it, and the run passed 13 of 13 checks.
- **What a job cost on Composer 2.5,** summed over all turns of a run, as the agent's stream reports it. A unit, integration, or fix job read 59,000 to 133,000 tokens and wrote 800 to 2,600. A heal job read 108,000 to 132,000 and wrote 900 to 1,100. A plan or generate job read 287,000 to 447,000 and wrote 3,300 to 4,200. Most of what was read came from the cache. A run took 19 to 61 seconds for a unit or heal job, and about 2 to 3 minutes for a plan or generate job.
- **Limits.** It was the CLI and not the Cursor window. The CLI's sandbox does not start on the machine of the round, so the agents ran without it: `--sandbox enabled` stops with `Sandbox mode is enabled but not available on this system`. One or two runs for each case still say little about how often a model fails. Every case is on the one example app. No case uses the mobile skills or an MCP tool.

### The old skills on the fix cases

The label `round-4-old-kit` holds six runs of 2026-10-10. They ran the same way as round 4, on Composer 2.5, with the kit at commit `bfb88f7`. That kit has the old `/qa` route and the old healer skill, from before the skills had the "smallest fix" steps. The question was whether those steps changed how often a fix works and how much of a file a fix changes.

| Case | Old skills, runs passed | Lines changed | New skills in round 4, runs passed | Lines changed |
| --- | --- | --- | --- | --- |
| `fix-unit` | 2 of 2 | 2 and 2 | 2 of 2 | 2 and 2 |
| `e2e-heal-locator` | 2 of 2 | 2 and 2 | 2 of 2 | 2 and 2 |
| `e2e-heal-product-bug` | 1 of 2 | 3 and 3 | 2 of 2 | 3 and 3 |
| `unit-product-bug` | not run | | 2 of 2 | 0 and 0 |

"Lines changed" is the lines added plus the lines removed, the number the check `small-change` uses. 2 is one line replaced. 3 is the `test(` line replaced by `test.fixme(` with the comment above it.

- **The fix rate did not drop.** The new skills passed 6 of 6 runs of the three cases, and the old skills 5 of 6.
- **No run rewrote anything, with either kit.** Every run changed the smallest number of lines that fixes the case. So on these cases the old skills were as sparing as the new ones, and the runs do not show the "smallest fix" steps doing any work. The three cases each have a fix of one line, which leaves a model little room to do more.
- **The one failure of the old skills** was in `e2e-heal-product-bug`. The comment above `test.fixme(` named `src/components/SignIn.tsx:38`, the line that uses the wrong text, and not line 7, which sets it. The old skill does not give the comment a form.
- **The agent followed the old route.** It read `.cursor/agents/qa.md`, then the old healer skill and the page-object skill, and did the work itself. It did not start a subagent.
- **Round 4's lines were scored before `small-change` existed,** so its records in `runs.jsonl` do not have that check. The numbers above for round 4 were counted afterwards in the kept sandboxes, with the function the check uses, for the two Composer 2.5 runs. The Claude Opus 5 run of each case gave the same number.

## Round 5

<!-- results:round-5 -->

Round 5 is the first round with the three tiers that [issue 39](https://github.com/syedmuhdahmad/cursor-qa-agents/issues/39) set, and the first with the four React Native cases on `examples/expo-app`. It ran from a git worktree of commit `090c6d1`, with the Cursor CLI version `2026.10.22-27dcf5f`, in the way round 4 did, with one change: `ECC_HOOKS_ENABLED=false` in front of every `agent` command. On the machine of the round, the CLI also ran the hooks of a Claude Code plugin from `~/.claude/plugins`, and one of them denied the first write of every run. The variable turns that plugin off for one process and changes no file. The kit's hook ran as before.

| Case | Composer 2.5 | Gemini 3.8 Flash | Claude Opus 5 |
| --- | --- | --- | --- |
| `unit-ui` | 2 of 2 | 1 of 1 | 1 of 1 |
| `unit-plain` | 2 of 2 | 1 of 1 | 1 of 1 |
| `integration-api` | 2 of 2 | not run | not run |
| `fix-unit` | 2 of 2 | not run | not run |
| `unit-product-bug` | 2 of 2 | not run | not run |
| `e2e-plan` | 2 of 2 | 1 of 1 | 1 of 1 |
| `e2e-generate` | 2 of 2 | 1 of 1 | 1 of 1 |
| `e2e-heal-locator` | 2 of 2 | not run | not run |
| `e2e-heal-product-bug` | 2 of 2 | not run | not run |
| `rn-unit-ui` | 2 of 2 | 1 of 1 | 1 of 1 |
| `rn-unit-plain` | 2 of 2 | 1 of 1 | 1 of 1 |
| `rn-fix-unit` | 2 of 2 | not run | not run |
| `rn-unit-product-bug` | 2 of 2 | not run | not run |
| All | 26 of 26 | 6 of 6 | 6 of 6 |

Every one of the 38 runs passed every check. No reply claimed a pass over a failing run, no run left a browser open, and no run used a forbidden shortcut.

After commit `090c6d1` three things changed in the kit, and no case of this round uses them: two hook rules for Maestro flows and the MCP `run` tool, five sentences in the mobile skills, and the CI workflow for Android. The skills, the deny messages, and `AGENTS.md` that the 13 cases read are those of `090c6d1`.

- **The agreed rate.** For each tier, at least 17 of the 18 runs of the nine web cases must pass, with two runs for each case, and no false pass. Composer 2.5 met it with 18 of 18, and passed 8 of 8 runs of the React Native cases. Gemini 3.8 Flash and Claude Opus 5 cannot be judged on this round alone.
- **An earlier round on Gemini 3.8 Flash.** On the same day, before the changes of commit `090c6d1`, the nine web cases ran twice each on Gemini 3.8 Flash with the kit at commit `3ff2a0b`, in the same way. All 18 runs passed every check. That round was a first look, so its lines are not in `runs.jsonl`. It led to the changes in the reply form and in step 2 of `/qa-unit`.
- **The hook was live for every model.** The canary of [the README one folder up](../README.md#run-it-with-the-cursor-cli) did not reach a write for Gemini 3.8 Flash and Claude Opus 5: both refused to edit application source because of `AGENTS.md`. A second prompt, which asked for one write call and left the decision to the hook, got a deny from the kit's hook for all three models. The CLI adds its own line to every deny: `Agent note: Do not suggest workarounds to the blocked tool.`
- **No deny happened in the 38 runs.** So this round, like round 4, does not show how a model goes on after a deny in the middle of a job.
- **Two runs fixed their own test in one round,** and passed: a Composer 2.5 test that checked `fetch` with no spy on it, and a Gemini 3.8 Flash import with one `../` too few.
- **What a job cost,** summed over all turns of a run as the agent's stream reports it. On Composer 2.5 a unit, integration, or fix job read 71,000 to 285,000 tokens and wrote 900 to 3,800, in 31 to 98 seconds. A plan or generate job read 348,000 to 424,000 and wrote about 3,100 to 3,800, in about 2 to 2.5 minutes. Gemini 3.8 Flash and Claude Opus 5 read about twice as much as Composer 2.5 in their plan and generate runs, 760,000 to 891,000 tokens, and took 2.5 to 3.5 minutes.
