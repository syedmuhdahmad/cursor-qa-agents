# Using RTK

This file holds the detail behind [Using RTK](../README.md#using-rtk) in the README: why every test command in the skills starts with `RTK_DISABLED=1`.

[RTK](https://github.com/rtk-ai/rtk) is a token-saving tool. Its Cursor hook rewrites shell commands so their output is shorter. For most commands that helps. For the test runners it hides or changes the lines the `qa` agent depends on, so every test command in the skills starts with `RTK_DISABLED=1`. RTK skips any command that starts with it. Without RTK the variable does nothing.

Only test commands carry the prefix. `git`, `gh`, `grep`, `cat`, `ls`, and the rest still go through RTK.

## Vitest: the whole result is lost

RTK rewrites `npx vitest run …` to `rtk vitest …`. On Vitest 5 the agent then sees only this, whether the tests pass or fail:

```text
[RTK:PASSTHROUGH] vitest parser: All parsing tiers failed
JSON report written to <project>/.vitest/json/output.json
```

The cause: `rtk vitest` adds `--reporter=json` and parses stdout. Since Vitest 5 the JSON reporter writes its report to `.vitest/json/output.json` by default and prints only that path, so every RTK parser tier fails. The agent cannot see the `Tests N passed` line it uses to tell a real pass from a run where every test was skipped. It cannot read the JSON file either, because `.vitest/` is in `.cursorignore`.

This is reported upstream as [rtk-ai/rtk#4224](https://github.com/rtk-ai/rtk/issues/4224) (open). We reproduced it on rtk 0.50.0 with Vitest 5.0.3. A fix, [rtk-ai/rtk#4264](https://github.com/rtk-ai/rtk/pull/4264), is waiting for review. Once a release includes it, the prefix can come off the Vitest commands.

## Playwright: wrong list, no debug session, missing error context

RTK rewrites `npx playwright test …` to `rtk playwright test …`. That filter runs every `playwright test` with `--reporter=json` added and prints a short summary. It keeps error messages and code frames, but:

- `--list` is reported as skipped tests (`PASS (0) FAIL (0) skipped (3)`) instead of the test names. Nothing runs in list mode, so the JSON report counts every test as skipped.
- The summary becomes `PASS (n) FAIL (n)` instead of Playwright's `n passed` / `n failed`.
- The `Error Context: test-results/…/error-context.md` line is dropped. The JSON report has the path, but RTK does not print it. The healer reads that file first.
- With `--debug=cli` the `playwright-cli attach tw-…` line never appears, so the healer cannot attach. The injected JSON reporter stops Playwright from printing it, and RTK shows nothing until the command exits, which a paused test never does.

These are reported upstream as [rtk-ai/rtk#4380](https://github.com/rtk-ai/rtk/issues/4380) (open), reproduced on rtk 0.50.0 with Playwright 1.63.0. Keep the Playwright prefix until a release fixes them.

## The cost

Test runs are not compressed. The skills run one file at a time, so a passing Vitest file is about 6 lines. On a failure RTK was keeping the error and code frame anyway, so little is lost. `rtk discover` and `rtk gain` may list these commands as using `RTK_DISABLED=1` unnecessarily. That only affects their statistics.

RTK's own numbers for Playwright overstate its savings: it measures against the JSON report it injects, not what Playwright would print. In our test a passing run of 3 tests was recorded as 1.5K tokens saved, while Playwright's normal output was about 65 tokens (also in [rtk-ai/rtk#4380](https://github.com/rtk-ai/rtk/issues/4380)).

## Alternative: exclude the commands in your RTK config

If you prefer, add the test runners to `exclude_commands` in `~/.config/rtk/config.toml`:

```toml
[hooks]
exclude_commands = ["^npx vitest\\b", "^npx playwright test\\b"]
```

This applies to every project on your machine and is not part of this repo, so keep the prefix in the skills for anyone else who uses them.
