# Supported models and evaluation

## The three tiers

The kit is tested in Cursor's own agent on three models, one for each tier. These are the results of round 5, scored on 2026-10-25:

| Tier | Model | Round 5 |
| --- | --- | --- |
| High | Claude Opus 5 | 6 of 6 runs passed: one run of 6 cases, before the account's usage limit stopped the round |
| Mid | Composer 2.5 | 26 of 26 runs passed: two runs of each of the 13 cases |
| Low | Gemini 3.8 Flash | 6 of 6 runs passed: the same 6 cases, before the same limit |

Every run passed every check, and no reply claimed a pass over a failing run. An earlier round on the same day ran the nine web cases twice each on Gemini 3.8 Flash, before the changes of round 5, and all 18 runs passed.

The agreed rate for a tier is at least 17 of the 18 runs of the nine web cases, with two runs for each case, and no false pass. Composer 2.5 met it. Gemini 3.8 Flash and Claude Opus 5 cannot be judged on round 5 alone: 20 runs each are still to be run.

For the security audit, use a high-tier model only. See [[Security audit]].

## Why the kit suits a small model

- Each job is one skill of numbered steps, with tables for decisions and templates to copy.
- The agent copies one `QA-VERDICT:` line and does not judge the runner's output.
- The hook enforces the rules that a small model drops.

## How the evaluation works

[`eval/`](https://github.com/syedmuhdahmad/qa-agent-kit/tree/main/eval) holds 13 fixed test jobs and a scorer that needs no model. Nine jobs run on the web example app, `examples/next-app`. Four run `/qa-rn-unit` on the React Native example app, `examples/expo-app`. The scorer runs the tests itself. It marks a reply that says the work passed over a failing run as `FALSE PASS`.

The skills take their examples from an imaginary app with a profile form, and never from the two example apps, so that no skill shows the answer to a case.

| Case | What it asks |
| --- | --- |
| `unit-ui` | A unit test for a component |
| `unit-plain` | A unit test for plain functions |
| `integration-api` | An integration test for a route handler |
| `fix-unit` | Fix a failing unit test |
| `unit-product-bug` | A unit test that fails because the app is wrong |
| `e2e-plan` | Plan a feature |
| `e2e-generate` | Generate a spec from a plan |
| `e2e-heal-locator` | Heal a wrong locator |
| `e2e-heal-product-bug` | Heal when the app is wrong |
| `rn-unit-ui` | A Jest unit test for a React Native component |
| `rn-unit-plain` | A Jest unit test for plain functions in a React Native app |
| `rn-fix-unit` | Fix a Jest unit test whose expectation is wrong |
| `rn-unit-product-bug` | A Jest unit test that fails because the React Native app is wrong |

## Round 5, by case

Round 5 ran with the Cursor CLI, in Cursor's agent, with the skill attached and the hook live.

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

On Composer 2.5 a unit, integration, or fix job took 31 to 98 seconds, and a plan or generate job about 2 to 2.5 minutes. Gemini 3.8 Flash and Claude Opus 5 read about twice as many tokens in their plan and generate runs, and took 2.5 to 3.5 minutes.

## Earlier rounds

| Round | Date | What ran | Result |
| --- | --- | --- | --- |
| 1 | 2026-10-09 | Nine web cases, outside Cursor, on two stand-in models, one run each | 9 of 9 on each stand-in. The old skills passed 7 of 9. |
| 2 | 2026-10-09 | The same, with two runs on the low-tier stand-in | 13 of 16 and 9 of 9 |
| 3 | Between rounds 2 and 4 | The first round with the skills that browse with `playwright-cli` | 17 of 18 and 9 of 9 |
| 4 | 2026-10-09 | Nine web cases in Cursor's agent | Composer 2.5 18 of 18, Claude Opus 5 9 of 9 |

Rounds 1 to 3 ran outside Cursor, with Claude Haiku 4.5 and Claude Sonnet 5.5 standing in for a low-cost and a mid-tier model, and without the hook in the loop. Round 4 was written before the tiers were set on 2026-10-10, so its text calls Composer 2.5 the low tier and Claude Opus 5 the mid tier.

## The mobile skills

The mobile skills are not part of the evaluation. On 2026-10-26 each of the three ran once on each model, on one Android emulator, and 7 of the 9 jobs met every check. See [[Mobile testing with Maestro]].

## What the results do not cover

Read the numbers as a good sign and not as proof.

- Each case had one or two runs on each model, on two small example apps.
- Gemini 3.8 Flash and Claude Opus 5 did not get to the fix, heal, and product-bug cases in round 5.
- No deny happened in the 38 runs of round 5, so the round does not show how a model goes on after a deny in the middle of a job.
- The rounds used the Cursor CLI. The Cursor window was run by hand once, with seven prompts.
- Nothing was run on iOS or Windows. On macOS only the hook's tests were run.

The open testing is tracked in Jira as [SCRUM-8](https://syedmuhdahmad.atlassian.net/browse/SCRUM-8), which was GitHub issue 39, and [SCRUM-9](https://syedmuhdahmad.atlassian.net/browse/SCRUM-9), which was GitHub issue 30. Version 1.0 plans every evaluation case on every tool and stack. See [[Roadmap and open issues]].

## Run it yourself

[eval/README.md](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/eval/README.md) says how to build a sandbox, run a case with the Cursor CLI, and score it. [docs/evaluation.md](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/evaluation.md) has every round by case, and [eval/results/README.md](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/eval/results/README.md) says how each round was run.

```bash
node eval/make-sandbox.mjs --case unit-ui --out ~/qa-eval-runs/run-01
node eval/prompt.mjs ~/qa-eval-runs/run-01
node eval/score.mjs ~/qa-eval-runs/run-01 --reply ~/qa-eval-runs/run-01/reply.txt --clean
```

Keep the run folders on a disk and not in `/tmp`: on a tmpfs one sandbox uses about 16,000 inodes.
