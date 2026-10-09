# Evaluation results

[`eval/`](../eval/) holds nine fixed test jobs on the example app, [`examples/next-app`](../examples/next-app/), and a scorer that needs no model. [eval/README.md](../eval/README.md) says how to run a case and what each check means. This file records the rounds that were run, and how.

The recorded scores are in [`eval/results/runs.jsonl`](../eval/results/runs.jsonl). To print them as a table:

```bash
node eval/report.mjs eval/results/runs.jsonl
```

If you run a round yourself, keep the run folders on a disk and not in `/tmp`. On a tmpfs one sandbox uses about 16,000 inodes, and a full file system stops every write with `ENOSPC`.

## How the rounds were run

Read the numbers below with these five facts in mind.

- **The models are stand-ins.** Claude Haiku 4.5 stands in for a low-cost model, and Claude Sonnet 5.5 for a mid-tier model. The results file calls them the low-tier proxy and the mid-tier proxy. No model was run inside Cursor.
- **The agent ran outside Cursor.** Each model worked in a sandbox copy of the example app with file and shell tools. Its prompt was the text that `eval/prompt.mjs` prints: `AGENTS.md`, then the skill, then the user's request. That is the message Cursor builds for a skill picked from the `/` menu, as read in the code of Cursor 3.23. It was not seen in a live session.
- **The hook was not in the loop.** No deny reached a model while it worked. A note in front of the prompt said so and asked the model to follow the rules as if the hook ran. After the run, the scorer asks the hook about every file the agent wrote.
- **No MCP browser tools.** For the plan and generate cases the note gave the matching `playwright-cli` shell command for each `browser_*` tool.
- **A case passes when every check passes.** The scorer runs the tests itself. A reply that says the work passed over a failing run is a `FALSE PASS`.

## Round 1, 2026-10-09

One run for each case.

- New skills: the working tree at commit `152fc47`, started with the skill of the case.
- Old skills: `origin/main` at commit `bfb88f7`, where every request went through `/qa`.

| Case | New skills, low-tier proxy | New skills, mid-tier proxy | Old skills, low-tier proxy |
| --- | --- | --- | --- |
| `unit-ui` | pass | pass | pass |
| `unit-plain` | pass | pass | pass |
| `integration-api` | pass | pass | pass |
| `fix-unit` | pass | pass | pass |
| `unit-product-bug` | pass | pass | pass |
| `e2e-plan` | pass | pass | fail |
| `e2e-generate` | pass | pass | pass |
| `e2e-heal-locator` | pass | pass | pass |
| `e2e-heal-product-bug` | pass | pass | fail |
| All | 9 of 9 | 9 of 9 | 7 of 9 |

No reply in the 27 runs was a false pass.

The two cases the old skills failed:

- `e2e-plan`: the model wrote the plan into its reply and saved no file at `test/e2e/plan/sign-in.plan.md`.
- `e2e-heal-product-bug`: the model marked the test `test.fixme`, but neither the comment above it nor the reply named the source line that holds the wrong text.

What round 1 does not show:

- **One run for each case says little.** A model can pass and fail the same case on two tries.
- **Two passes of the new skills were helped by the skill text.** In round 1 the example in `/qa-heal` was the edit and the reply that `e2e-heal-product-bug` expects, and `/qa-plan` printed three of the six texts that `e2e-plan` requires. The two replies to `e2e-heal-product-bug` follow that example. Since then the skills take every example from an imaginary app with a profile form, and a test of the evaluation fails when a skill prints the answer of a product-bug case. Round 2 is the first fair run of these two cases.
- **The old skills were run on the low-tier proxy only.**
- **Nothing about the hook's messages, the MCP browser tools, or Cursor's own behaviour,** for the reasons above.
- **Nothing about the mobile skills.** No case uses them.

The scorer was made stricter after round 1. It now also fails a test that passed only on a retry, an error outside a test, a test that never loads the source file, and a spec that still passes against the app with the planted bug. The 27 saved runs were scored again with the new scorer, and each got the same result as before.

## Round 2

<!-- eval:round-2 -->

Not recorded yet. Round 2 runs the same nine cases on the skills as they are after the fixes that followed round 1: the examples from another app, the new rows in `/qa-heal` and `/qa-unit`, and the stricter scorer. Its table goes here.
