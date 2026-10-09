# Security policy

## Report a vulnerability

Report it in private. Do not open a public issue or pull request for it.

1. Open the [private vulnerability form](https://github.com/syedmuhdahmad/cursor-qa-agents/security/advisories/new). The **Report a vulnerability** button on the repository's **Security** tab opens the same form.
2. Say what you ran and what happened. The shell command or the tool call that shows the problem is the most useful part.
3. Give the version of your copy. It is in `.cursor/qa/VERSION`.

Only you and the maintainers of this repository can read the report. The maintainer replies in the report.

## Supported versions

Fixes go into the `main` branch and the next release. Older releases get no fixes.

## What counts as a vulnerability

The hook in `.cursor/hooks/guard-test-writes.py` checks the agent's file edits and shell commands before they run. Report it here when:

- The hook allows a file edit or a shell command that writes outside the write scope. `AGENTS.md` lists the write scope.
- The hook allows a shell command that runs a program it is meant to deny.
- The hook allows a `git` or `gh` command that `docs/hook-rules.md` says is denied.
- A command or a tool call makes the hook crash, or makes it answer "allow" when it could not read the input.
- `scripts/install-into.mjs` writes outside the app folder it was given.

## What does not count

The hook is a guardrail and not a sandbox. It reads the text of a command or a tool call before it runs. It does not watch what a program does after it starts.

- A test file is code. Vitest and Playwright run it with your permissions, so a test can read and write any file that you can. The agent writes the tests, so this is a known limit and not a vulnerability.
- The other known limits are in the README and in `docs/hook-rules.md`. If you found a way around the hook that those two files already describe, it is known.
- A vulnerability in a package the README tells you to install, such as Vitest or Playwright, belongs to that package's project. Open a normal issue here if the fix needs a newer version range in this repository.

If you need a hard boundary, add one outside this kit. Two ways:

- Run the agent in a container that mounts the application source read-only.
- Add a CI check that fails when a pull request changes a file outside the write scope.
