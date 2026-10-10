# Evaluation results

[`eval/`](../eval/) holds nine fixed test jobs on the example app, [`examples/next-app`](../examples/next-app/), and a scorer that needs no model. [eval/README.md](../eval/README.md) says how to run a case and what each check means. This file records the rounds that were run, and how.

The recorded scores are in [`eval/results/runs.jsonl`](../eval/results/runs.jsonl). [eval/results/README.md](../eval/results/README.md) says what each field of a line means and what is known to be wrong with the rounds. To print the scores as a table:

```bash
node eval/report.mjs eval/results/runs.jsonl
```

If you run a round yourself, keep the run folders on a disk and not in `/tmp`. On a tmpfs one sandbox uses about 16,000 inodes, and a full file system stops every write with `ENOSPC`.

## How the rounds were run

Read the numbers of rounds 1 to 3 with these five facts in mind.

- **The models are stand-ins.** Claude Haiku 4.5 stands in for a low-cost model, and Claude Sonnet 5.5 for a mid-tier model. The results file calls them the low-tier proxy and the mid-tier proxy. That holds for rounds 1 to 3. One run by hand in Cursor is under [A run in Cursor](#a-run-in-cursor-2026-10-09), and [round 4](#round-4-in-cursors-agent) ran every case in Cursor's own agent.
- **The agent ran outside Cursor.** Each model worked in a sandbox copy of the example app with file and shell tools. Its prompt was the text that `eval/prompt.mjs` prints: `AGENTS.md`, then the skill, then the user's request. That is the message Cursor builds for a skill picked from the `/` menu, as read in the code of Cursor 3.23. It was not seen in a live session.
- **The hook was not in the loop.** No deny reached a model while it worked. A note in front of the prompt said so and asked the model to follow the rules as if the hook ran. After the run, the scorer asks the hook about every file the agent wrote.
- **The browser steps were not the ones the skills have now.** In rounds 1 and 2 the plan and generate skills still named the `browser_*` tools of the Playwright MCP server, and the agents had no MCP tools. The note gave the matching `playwright-cli` shell command for each tool, and the agents ran those commands. The skills now give the `playwright-cli` commands themselves, so from round 3 on the note has no such list.
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
- **Nothing about the hook's messages, the browser steps as the skills word them now, or Cursor's own behaviour,** for the reasons above.
- **Nothing about the mobile skills.** No case uses them.

The scorer was made stricter after round 1. It now also fails a test that passed only on a retry, an error outside a test, a test that never loads the source file, and a spec that still passes against the app with the planted bug. The 27 saved runs were scored again with the new scorer, and each got the same result as before.

## Round 2

Scored on 2026-10-09, with the skills of the working tree at commit `50cdaad` plus uncommitted changes. That is the state after the fixes that followed round 1, with the skills' examples taken from another app and with the stricter scorer. It was run in the same way as round 1, with two runs for each case on the low-tier proxy and one on the mid-tier proxy.

| Case | Low-tier proxy, runs passed | Mid-tier proxy |
| --- | --- | --- |
| `unit-ui` | 2 of 2 | pass |
| `unit-plain` | 2 of 2 | pass |
| `integration-api` | 2 of 2 | pass |
| `fix-unit` | 1 of 1 | pass |
| `unit-product-bug` | 1 of 1 | pass |
| `e2e-plan` | 0 of 2 | pass |
| `e2e-generate` | 1 of 2 | pass |
| `e2e-heal-locator` | 2 of 2 | pass |
| `e2e-heal-product-bug` | 2 of 2 | pass |
| All | 13 of 16 | 9 of 9 |

No reply in the 25 runs was a false pass.

Two low-tier runs were void and are not counted: the first run of `fix-unit` and the first run of `unit-product-bug`. Each agent started before its prompt file existed, changed no file, and replied without the form. Their lines are not in `runs.jsonl`, so the low tier has 16 valid runs and not 18.

The three runs that failed, all on the low-tier proxy:

- `e2e-plan`, both runs: the plan left out the scenario with the mocked server error and named no visible text for the main flow. `/qa-plan` was changed after the round. It now puts every scenario of its list into the plan file, counts them before it replies, and names a visible text in every `Expect` list. No round has run that change yet.
- `e2e-generate`, one run: the agent saved test output to a file in the project root. In Cursor the hook denies that write.

What round 2 does not show:

- **Two runs for each case are still few,** and the mid-tier proxy had one.
- **The browser steps the skills have now.** See "How the rounds were run".
- **The hook, Cursor, and the mobile skills,** as in round 1.

## Round 3

<!-- eval:round-3 -->

Round 3 is the first round on the skills that browse with `playwright-cli` themselves, and on the changed `/qa-plan`. The mid-tier model passed 9 of 9 runs and the low-tier model 17 of 18. The table by case, the one failure, and the hook change it led to are in [`eval/results/README.md`](../eval/results/README.md#round-3).

## A run in Cursor, 2026-10-09

One person pasted seven prompts by hand into Cursor's agent, each in a new chat, with the Composer 2.5 model. The folder was a copy of the example app with the kit of commit `8eca690` installed by `scripts/install-into.mjs` and the reference tests removed. The scorer did not score this run. A maintainer read the files it left and ran them again outside Cursor.

| Prompt | What happened |
| --- | --- |
| Five actions for the hook to judge | The edit of `lib/validation.ts`, `cd lib`, and `cat package-lock.json` were denied, each with the hook's own message. `pwd` ran and printed the project root. `playwright-cli open` and `close` ran. |
| `/qa-unit src/components/SignIn.tsx` | 6 tests, `Verdict: PASS` |
| `/qa-unit Write an integration test for app/api/session/route.ts` | 6 tests, `Verdict: PASS` |
| `/qa-plan sign-in` | A plan with 6 scenarios, the mocked server error among them, `Verdict: DONE` |
| `/qa-generate test/e2e/plan/sign-in.plan.md` | Two page classes and a spec with 6 tests, `Verdict: PASS` |
| `/qa-heal test/e2e/sign-in.spec.ts`, after a heading name in a page class was changed by hand | `Class: Locator`, one line fixed in the page class, `Verdict: PASS` |
| `Write a unit test for lib/validation.ts.`, with no skill picked | The agent followed `/qa-unit`: 6 tests, `Verdict: PASS` |

Afterwards `git status` showed new files under `test/` and no other change. Outside Cursor the 18 Vitest tests and the 7 Playwright tests passed, the seed spec included, and the type check of `test/` passed.

What the run shows:

- **Cursor loads the hook, and the model sees the hook's message.** For a shell command the message follows `Rejected: Command execution was blocked by a hook:`.
- **A skill picked from the `/` menu is followed to its reply form,** and a plain request reaches the same skill through `AGENTS.md`.
- **A spec can start a browser in the agent's shell.** A first run on the same day, at an earlier commit, failed there with `Executable doesn't exist`: the agent's shell looks for Playwright's Chromium in a folder of its own under `/tmp/cursor-sandbox-cache/`. `playwright.config.ts` now starts Google Chrome when that Chromium is missing.

What the run does not show:

- **How often it works.** It is one run of each prompt, on one model. Round 4 has more runs, and a mid-tier model.
- **The cases with a planted bug and the fix of a failing unit test.** No prompt asked for them. Round 4 has them.
- **The `BLOCKED` exits.** No prompt led to one.
- **The hook's rules for MCP tools, and the mobile skills.**
- **Which Cursor version it was.** It was not written down.

## Round 4, in Cursor's agent

Scored on 2026-10-09, with the kit at commit `611d6fd`. Round 4 is the first round in which Cursor itself did the work: the Cursor CLI started Cursor's agent in each sandbox with only the user's text, and Cursor attached the skill, loaded `AGENTS.md`, and ran the hook. The low tier is Composer 2.5, and the mid tier is Claude Opus 5.

| Case | Composer 2.5, runs passed | Claude Opus 5 |
| --- | --- | --- |
| `unit-ui` | 2 of 2 | pass |
| `unit-plain` | 2 of 2 | pass |
| `integration-api` | 2 of 2 | pass |
| `fix-unit` | 2 of 2 | pass |
| `unit-product-bug` | 2 of 2 | pass |
| `e2e-plan` | 2 of 2 | pass |
| `e2e-generate` | 2 of 2 | pass |
| `e2e-heal-locator` | 2 of 2 | pass |
| `e2e-heal-product-bug` | 2 of 2 | pass |
| All | 18 of 18 | 9 of 9 |

Every run passed every check, and no reply in the 27 runs was a false pass.

What round 4 does not show:

- **How a model goes on after a deny.** The hook was live, and a prompt before the round got three denies with the hook's messages. In the 27 runs no agent tried anything the hook forbids.
- **The Cursor window with its sandbox.** The round used the CLI, and the CLI's sandbox does not start on that machine. The run by hand above is the only one in the window.
- **How often a model fails.** Two runs for each case are few, and Claude Opus 5 had one.
- **Another app, the mobile skills, and the hook's rules for MCP tools.**

[`eval/results/README.md`](../eval/results/README.md#round-4) has the detail: the model ids, the check that the hook was live, a run with no slash command, and what a job cost in tokens.

### The old skills against the new ones on the fix cases

On 2026-10-10 the three cases that repair a test ran again on Composer 2.5, with the old skills of commit `bfb88f7`, two runs each. The old skills have no "smallest fix" steps.

| Case | Old skills | New skills, in round 4 |
| --- | --- | --- |
| `fix-unit` | 2 of 2 | 2 of 2 |
| `e2e-heal-locator` | 2 of 2 | 2 of 2 |
| `e2e-heal-product-bug` | 1 of 2 | 2 of 2 |

The fix rate did not drop with the new skills. Every run, with either kit, changed only the lines that caused the failure: two or three lines in each case. So these cases do not show the "smallest fix" steps making a difference, because each case has a fix of one line. The scorer now has the check `small-change`, which fails a fix that changes more lines than the case allows. [`eval/results/README.md`](../eval/results/README.md#the-old-skills-on-the-fix-cases) has the numbers.
