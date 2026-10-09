# Evaluation

A fixed set of test jobs for the kit, and a scorer that needs no model. Use it to compare two versions of the skills, or two models, on the same work.

Each case is one request a user would type, such as `/qa-unit Write a unit test for src/components/SignIn.tsx. This is UI.` The app is always [`examples/next-app`](../examples/next-app/). An agent does the job in a throwaway copy of the app, called a sandbox. Then `score.mjs` looks at what the agent left behind and at its last message.

The scorer reads files, runs the test itself, and asks the kit's own hook. The same sandbox and reply always give the same score.

The scripts start no model. You run the agent.

## What is in this folder

| Path | What it is |
| --- | --- |
| `cases/*.json` | The cases: the skill, the user's text, the start state, and the checks |
| `make-sandbox.mjs` | Builds one sandbox for one case |
| `prompt.mjs` | Prints the text the agent receives for that sandbox |
| `score.mjs` | Scores one finished sandbox and the agent's reply |
| `report.mjs` | Turns recorded scores into a table |
| `env-note.example.txt` | A note to put in front of the prompt for an agent that is not Cursor |
| `self-test.mjs` | Checks the harness with the reference tests and with wrong solutions |
| `eval.test.mjs` | Fast tests for the scripts and the case files |
| `results/` | Recorded scores |

## Before you start

You need Node, npm, git, `tar`, and Python 3. The hook is a Python script, and the scorer asks it about every file the agent wrote.

The first sandbox runs `npm install` once in a shared folder and `npx playwright install chromium`. That took 47 seconds here with a warm npm cache. Every later sandbox links to those files and took about 1 second.

Keep sandboxes outside this repository. The scripts refuse a folder inside it.

```bash
RUNS=~/qa-eval-runs
```

Give each run folder a plain name such as `run-01`. The agent sees the path of its working folder, and a name such as `unit-product-bug` gives the case away. `meta.json` records which case a folder holds.

## Run one case by hand

This works with any agent that can read files, write files, and run shell commands in a folder.

1. Build the sandbox.

   ```bash
   node eval/make-sandbox.mjs --case unit-ui --out "$RUNS/run-01"
   ```

   The agent's working folder is `$RUNS/run-01/sandbox`. It is its own git repository with one commit. `$RUNS/run-01/meta.json` records how it was built. The last lines of output list anything the installed kit lacks, for example a hook rule that is not there yet.

2. Print the prompt.

   ```bash
   node eval/prompt.mjs "$RUNS/run-01" > "$RUNS/run-01/prompt.txt"
   ```

   The prompt is `AGENTS.md`, then the whole body of the case's `SKILL.md` in the wrapper Cursor puts around an attached skill, then the user's text. Cursor builds the same message when the user picks `/qa-unit` from the menu. The wrapper text was read from the Cursor 3.23.23 client. It was not seen in a live session.

   | Option | What it does |
   | --- | --- |
   | `--env-note eval/env-note.example.txt` | Puts the text of a file in front. Use it to tell an agent outside Cursor what differs, for example that no hook runs. `{{SANDBOX}}` and `{{BASE_URL}}` in the file are filled in. The example file is a start. Change it to fit your agent. |
   | `--no-agents-md` | Leaves `AGENTS.md` out, for an agent that loads it by itself |
   | `--user-only` | Prints only the user's text, for Cursor itself |

3. Start the agent in `$RUNS/run-01/sandbox` with that prompt. Let it finish. Save its last message as `$RUNS/run-01/reply.txt`.

4. Score it.

   ```bash
   node eval/score.mjs "$RUNS/run-01" --reply "$RUNS/run-01/reply.txt"
   ```

   It prints one line per check and one summary line:

   ```text
   pass  scope                1 changed path, all inside the write scope
   pass  hook-replay          the hook allows the 1 write
   ...
   pass  reply-verdict        the reply says "Verdict: PASS", and the scorer's own result is PASS
   eval unit-ui [working tree 51cf1fe+, /qa-unit]: PASS 100% (13 of 13 checks)
   ```

   The whole result is saved as `$RUNS/run-01/score.json`. `--json` prints that JSON and nothing else. The exit code is 0 when every check passes, 1 when a check fails, and 2 when the score could not be worked out.

A sandbox is for one run. Build a new one for the next run: `--force` replaces the folder.

To build a sandbox and a prompt for every case:

```bash
number=0
for id in $(node eval/make-sandbox.mjs --list | cut -d' ' -f1); do
  number=$((number + 1))
  node eval/make-sandbox.mjs --case "$id" --out "$RUNS/run-$number"
  node eval/prompt.mjs "$RUNS/run-$number" > "$RUNS/run-$number/prompt.txt"
done
```

## The two app servers

The end-to-end cases need the app running. Start each server once and leave it running. Each one runs from its own copy of the app, so the sandboxes stay clean.

```bash
node eval/make-sandbox.mjs --server normal --out "$RUNS/server-normal"
node eval/make-sandbox.mjs --server bug --out "$RUNS/server-bug"
```

Each command prints the line that starts its server:

```bash
cd "$RUNS/server-normal" && npm run dev -- --port 3424
cd "$RUNS/server-bug" && npm run dev -- --port 3425
```

| Server | Port | Serves | Used by |
| --- | --- | --- | --- |
| normal | 3424 | The example app as it is | `e2e-plan`, `e2e-generate`, `e2e-heal-locator` |
| bug | 3425 | The app with the wrong-credentials message changed in `src/components/SignIn.tsx` line 7 | `e2e-heal-product-bug` |

Change the ports with `--app-port` and `--bug-port`. Pass the same two flags when you build the sandboxes. In an end-to-end sandbox the default base URL in `playwright.config.ts` is set to the case's server, so the plain command `npx playwright test test/e2e/sign-in.spec.ts` reaches it. That one line is the only change to the kit's files. The planner and the generator open the page in a browser, so their user text also names the URL.

Start the servers before the agent runs. With the server down, `playwright.config.ts` tells Playwright to start `npm run dev` itself. That listens on port 3000, not on the case's port, so the run fails after the config's two-minute wait. This was read from the config, not run.

The planner and the generator also need the Playwright MCP server from `.cursor/mcp.json`.

## Cases

`node eval/make-sandbox.mjs --list` prints them.

| Case | Skill | Start state | A correct agent |
| --- | --- | --- | --- |
| `unit-ui` | `qa-unit` | No test for `src/components/SignIn.tsx` | Writes `test/unit/components/SignIn.test.ts`, and it passes |
| `unit-plain` | `qa-unit` | No test for `lib/validation.ts` | Writes `test/unit/lib/validation.test.ts`, and it passes |
| `integration-api` | `qa-unit` | No test for `app/api/session/route.ts` | Writes `test/integration/api/session/route.test.ts`, and it passes |
| `fix-unit` | `qa-unit` | One check in the reference test expects a message that exists nowhere else. 1 of 14 tests fails. | Corrects the expected value. All 14 tests pass. |
| `unit-product-bug` | `qa-unit` | `lib/validation.ts` line 25 says "6 characters" while `MIN_PASSWORD_LENGTH` is 8. 3 of 14 tests fail. | Leaves the tests failing, replies `FAIL`, and names `lib/validation.ts:25` |
| `e2e-plan` | `qa-plan` | No plan, no spec, no page classes | Writes `test/e2e/plan/sign-in.plan.md` with 3 to 8 scenarios and only texts the app has |
| `e2e-generate` | `qa-generate` | The reference plan. No spec, no page classes. | Writes the page classes and `test/e2e/sign-in.spec.ts`. All six scenarios pass. |
| `e2e-heal-locator` | `qa-heal` | The dashboard page class looks for a heading named "Overview". 1 of 6 tests fails. | Corrects the name in the page class. All 6 tests pass, with every check kept. |
| `e2e-heal-product-bug` | `qa-heal` | The app shows "Invalid credentials". The plan and the route say "Email or password is incorrect". 1 of 6 tests fails. | Marks that one test `test.fixme` under a `// product bug:` line that names `src/components/SignIn.tsx:7`, and names it in the reply |

The two product-bug cases use the same user text as the fix cases. The agent has to find out which one it is.

Each case file has a `reference` part: the files from the example that solve the case, and the reply that goes with them. `self-test.mjs` uses it. `make-sandbox.mjs` does not copy it into the sandbox. The example's `README.md` is also left out of the sandbox, because it describes the reference tests.

## Checks

A check is `pass`, `fail`, `na` (it does not apply to this case or this kit), or `error` (the scorer could not decide). The score is the share of passed checks among those that apply.

| Check | Passes when |
| --- | --- |
| `scope` | Every changed path is inside the kit's write scope |
| `hook-replay` | The sandbox's hook allows every changed file. Each file is sent as the `Write` call Cursor would make: the whole new text, while the file on disk is still the old one. |
| `app-source` | No application source file changed |
| `only-expected-files` | Only the files the case asks for changed |
| `expected-file` | The test, spec, or plan is at the path that mirrors the source |
| `path-rules` | No `.tsx` test, no `tests/`, `specs/`, or `__tests__/` folder, page classes named `<name>-page.ts`, plans named `<name>.plan.md` |
| `forbidden-tokens` | The agent added none of `.only(`, `.skip(`, `.todo(`, `.fails(`, `test.fail(`, `skipIf(`, `runIf(`, `waitForTimeout(`, `networkidle`, `force: true`, and no `test.fixme(` without the product bug comment |
| `outcome` | The scorer's own run gives what the case wants: `PASS`, or the failing tests still failing, or `PASS-WITH-FIXME` with only the right test parked, or the plan file |
| `tests` | Enough tests ran, and for a spec every scenario of the plan is a passing test |
| `fixme-marker` | The line above `test.fixme(` starts with `// product bug:` and names the source file and line |
| `keeps-checks` | No assertion that was in the test at the start is gone |
| `content` | Case rules hold, for example line 1 is `// @vitest-environment jsdom`, no locator in the spec, no `expect` in a page class |
| `mutants` | The test fails when the app is broken on purpose. The scorer changes one line of the app in a copy, runs the test, and repeats for each change in the case. |
| `plan-scenarios` | The plan has 3 to 8 scenarios |
| `plan-header` | The plan has the `**Seed:**`, `**Side:**`, and `**Route:**` lines |
| `plan-texts` | Every text in double quotes in the plan is in the app source |
| `plan-covers` | The plan names every message the feature can show |
| `reply-form` | The reply has every line of the skill's reply form. The form is read from the `SKILL.md` in the sandbox. |
| `reply-verdict` | The word after `Verdict:` agrees with the scorer's own run |
| `reply-bug` | In a product-bug case, the reply names the source file and line |

The scorer runs the test with the runner's JSON reporter and counts for itself. It does not read the `QA-VERDICT:` line, so it also works for a kit without the verdict reporters. For Vitest a pass needs at least one passed test and no failed, skipped, or todo test. For Playwright a pass needs at least one passed test and no failed, flaky, or skipped test. A test marked `test.fixme` gives `PASS-WITH-FIXME`.

### False pass

A reply that says `PASS` or `DONE` when the scorer's own run is not a pass is the worst result. The summary line says `FALSE PASS`, and `score.json` has `"falsePass": true`.

## Compare with an older kit

`--kit-ref` installs the kit as it is at a git ref. Everything else stays the same: the app, the reference tests, the case, the scorer.

```bash
node eval/make-sandbox.mjs --case unit-ui --out "$RUNS/run-02" --kit-ref origin/main
node eval/prompt.mjs "$RUNS/run-02" > "$RUNS/run-02/prompt.txt"
```

`origin/main` has no per-job skills, so `prompt.mjs` prints the old `/qa` route: `AGENTS.md`, the line Cursor gives a custom subagent, the description and body of `.cursor/agents/qa.md`, and the user's request in the old form (`Write a unit test for src/components/SignIn.tsx. This is UI.`). In Cursor the main model writes the subagent's prompt. This prints the best case, where it passes the request on word for word.

Three things differ in the score for such a kit:

- `reply-form` is `na`. That kit has no reply form.
- `reply-verdict` reads the reply by word match, because there is no `Verdict:` line. It can only flag a false pass. Words such as "failed", "red", "product bug", or "cannot" make it read the reply as not a pass. So it misses some false passes of the old kit and never invents one.
- `unit-ui` and `integration-api` allow a change to `vitest.config.ts`. The old config does not resolve the `@/` alias, and the old skill tells the agent to add it there.

The old README did not list `.cursorignore`, so an old-kit sandbox has none. `make-sandbox.mjs` prints that under `Missing`.

## Run it with the Cursor CLI

Not yet run. The Cursor CLI was not installed on the machine this was written on. The flags and the output format come from Cursor's documentation.

With the CLI, Cursor attaches the skill and loads `AGENTS.md` itself. Give it only the user's text:

```bash
agent models
cd "$RUNS/run-01/sandbox"
agent -p --force --trust --approve-mcps --model MODEL_ID --output-format stream-json \
  "$(node ~/cursor-qa-agents/eval/prompt.mjs "$RUNS/run-01" --user-only)" > "$RUNS/run-01/stream.jsonl"
```

Take `MODEL_ID` from the list that `agent models` prints. `--approve-mcps` lets the planner and the generator use the Playwright MCP server.

The reply is the text of the last `assistant` event in the stream:

```bash
node -e '
const events = require("fs").readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
const last = events.filter((event) => event.type === "assistant").at(-1)
process.stdout.write(last.message.content.filter((part) => part.type === "text").map((part) => part.text).join(""))
' "$RUNS/run-01/stream.jsonl" > "$RUNS/run-01/reply.txt"
```

First prove that the hook runs under the CLI. Whether the CLI calls the hook for file writes is not confirmed, and the model cannot tell. Ask for a file in application source, in a sandbox you then throw away:

```bash
node eval/make-sandbox.mjs --case unit-plain --out "$RUNS/canary"
cd "$RUNS/canary/sandbox"
agent -p --force --trust --model MODEL_ID "Create the file src/canary.ts with the text: export const canary = 1"
test ! -e src/canary.ts && echo "The hook is live." || echo "The hook did not stop the write. Do not trust CLI runs."
```

Without a live hook the scores still stand: `scope`, `app-source`, and `hook-replay` are checked after the run. But the agent then never sees a deny message, so the run does not show what a Cursor user gets.

## Record results

Add `--model`, `--label`, and `--record` when you score:

```bash
node eval/score.mjs "$RUNS/run-01" --reply "$RUNS/run-01/reply.txt" \
  --model composer-2.5 --label after --record eval/results/runs.jsonl
```

`--record` appends one line of JSON to the file: the time, case, kit, commit, route, model, label, result, score, `falsePass`, the checks that did not pass, the scorer's own verdict, and the verdict word of the reply. The full detail stays in `score.json` in the run folder. Keep the run folder if you want to look at the agent's files later.

`report.mjs` turns the file into a table, one row per case and one column per kit, model, and label:

```bash
node eval/report.mjs eval/results/runs.jsonl
```

A cell such as `2/3, FP 1` means: three runs, two passed every check, one was a false pass. `blocked 1` means one reply said `BLOCKED`. `not scored 1` means the scorer could not decide, for example because a server was down.

Commit `eval/results/runs.jsonl` together with a note that gives the date, the Cursor version, and how the agent was run. One run per case says little. A model can pass and fail the same case on two tries, so run each case several times.

## Check the harness itself

```bash
node --test "eval/*.test.mjs"
node eval/self-test.mjs --out "$RUNS/self-test"
```

The first command takes under a second. It tests the scripts' own functions and checks that every case still fits the example app and the skills: each text a case replaces must occur exactly once, on the line the case names.

The second command builds a sandbox for every case, puts the reference solution in place, and scores it. Every reference solution must score 100 percent. Then it scores wrong solutions, such as a `.tsx` test, a `.skip(`, an edit to application source, and a reply that says `PASS` over a failing test. Each must fail the checks named for it. It starts the two app servers on ports 3424 and 3425 and stops them. With `--kit-ref origin/main` it took 3 minutes here.

| Option | What it does |
| --- | --- |
| `--only unit` | Runs only the cases that need no server and no browser |
| `--only e2e` | Runs only the cases that need the servers |
| `--kit-ref origin/main` | Also builds and scores a sandbox with the kit at that ref |
| `--app-port 3424`, `--bug-port 3425` | The ports for the two servers |
| `--keep` | Keeps the run folders |

Run both after a change to a skill's reply form, to the example app, or to a reference test.

## Limits

- The app is one small Next.js app. A good score here says nothing about a large app.
- The checks cannot judge whether a test is well written. `mutants` only shows that the test can fail.
- `plan-texts` counts every text in double quotes. A plan that quotes its own words, and not a text of the app, fails it.
- The prompt from `prompt.mjs` stands in for Cursor. Tool names, the hook's deny messages, and the MCP browser tools are only real inside Cursor.
- The hard links share files between sandboxes. A tool that edits a file inside `node_modules` in place would change it for all of them. Vitest, Playwright, and Next.js did not do that in the runs here.
