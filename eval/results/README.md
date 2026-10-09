# Recorded results

[`runs.jsonl`](runs.jsonl) has one line for each scored run. This file says how the recorded rounds were run, what the fields of a line mean, and what is known to be wrong with the rounds.

[The README one folder up](../README.md) says how to run a case and what each check means. To print the lines as a table, run this in the root of the repository:

```bash
node eval/report.mjs eval/results/runs.jsonl
```

## How the rounds were run

No model ran inside Cursor. Two stand-in models did the work:

| `model` in `runs.jsonl` | Model | Stands in for |
| --- | --- | --- |
| `claude-haiku-4-5 (low-tier proxy)` | Claude Haiku 4.5 | A low-cost model in Cursor |
| `claude-sonnet-5-5 (mid-tier proxy)` | Claude Sonnet 5.5 | A mid-tier model in Cursor |

For each run:

1. `make-sandbox.mjs` built a sandbox for the case.
2. An orchestration script started one agent in the sandbox. The agent could read files, write files, and run shell commands.
3. The agent's prompt was the text that `eval/prompt.mjs` prints, with an environment note in front (`--env-note`). The note named the project folder, said that the hook does not run, and said that the app server was already running.
4. The agent's last message was saved as the reply.
5. `score.mjs` scored the sandbox and the reply, and `--record` added one line to `runs.jsonl`.

The hook was not in the loop. No deny reached an agent while it worked. After the run the scorer asks the hook about every file the agent wrote.

In rounds 1 and 2 the plan and generate skills named the `browser_*` tools of the Playwright MCP server. The stand-in agents had no MCP tools. So the environment note of those rounds gave the `playwright-cli` command for each tool, and the agents ran those commands. From round 3 on the skills use `playwright-cli` themselves, and the note has no such list. [`env-note.example.txt`](../env-note.example.txt) is the note without it.

| `label` | Scored on | Kit | Runs |
| --- | --- | --- | --- |
| `round-1` | 2026-10-09 | The working tree at commit `152fc47`, and `origin/main` at commit `bfb88f7` for the old skills | One run for each case: 9 on the low tier, 9 on the mid tier, and 9 on the low tier with the old skills |
| `round-2` | 2026-10-09 | The working tree at commit `50cdaad` with uncommitted changes | Two runs for each case on the low tier, one on the mid tier. Two of the low-tier runs were void, see below. |

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

## Round 3

<!-- results:round-3 -->

Not recorded yet. When it is, add its row to the table under "How the rounds were run", and say here what differs from round 2 and which runs were void.
