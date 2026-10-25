# Security audit

`/security-audit` is Cloudflare's [security audit skill](https://github.com/cloudflare/security-audit-skill), in `.cursor/skills/security-audit/`. It looks for vulnerabilities in your app's source that cross a real trust boundary, has each finding checked by an agent that did not find it, and writes a report of the verified ones. It is not a test job: it writes no test and prints no `QA-VERDICT:` line.

The folder is a copy of the skill at commit `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`, under the MIT License, with Cloudflare's `LICENSE` file next to it. Only the frontmatter of `SKILL.md` was written for this kit: the `/` menu text, `disable-model-invocation: true`, and a `metadata` block. The rest is byte for byte as published. [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) has the detail.

## Which model

Use a high-tier model, such as Claude Opus 5. The skill is about 25,000 words in fifteen files, it reads several of them in each phase, and it sends work to subagents and checks their results against JSON schemas. The kit's own skills are written for small models, and this one is not. It was not run on Composer 2.5 or Gemini 3.8 Flash.

A full run starts many subagents. The skill counts them as its budget. Ask for a small run first, and give it a budget:

```text
/security-audit Run a quick audit of this codebase (quick profile), with a budget of 20 agent invocations.
/security-audit Audit src/api/ only, standard profile, budget 20.
/security-audit Is the session cookie in src/lib/session.ts safe?
```

The last one is a question, which the skill answers in its guidance mode, with no run folder.

## What it writes and where

A full run writes its files outside your project, in `~/security-audit-skill/<repo-name>/run-<N>/`:

| File | What it holds |
| --- | --- |
| `REPORT.md` | The report: the verified findings, their severity, and what was covered |
| `FINDINGS-DETAIL.md` | Each finding with its source trace and the smallest fix |
| `NEEDS-VALIDATION.md` | Leads the agent could not settle from the source alone, each with the one fact it needs |
| `findings.json` | Every record, checked against `report-schema.json` |
| `coverage-ledger.json` | What was checked, unit by unit, so that a later run can go on from it |
| `architecture.md`, `run-metadata.json` | The map of the app and the facts of the run |
| `agents/` | One folder for each subagent |

A second run reads the earlier runs of the same app and goes on from them. The skill's own README says that in its test runs one run found about half of what repeated runs found.

## What the hook allows it

The hook was written for test jobs, and gives the audit two exceptions. Everything else stays as it is for the other jobs. See [the hook rules](hook-rules.md#the-run-folders-of-the-security-audit).

- **Its run folder.** A write tool may write any file inside `~/security-audit-skill/`. That is outside the project, so it cannot touch your source. The shell may not write there. A folder of that name inside your project gets no exception.
- **Its two validators.** `node` may run `validate-findings.cjs` or `validate-coverage-ledger.cjs` from `.cursor/skills/security-audit/` on one file inside that folder. They read the file and print what is wrong with it.

What the hook still denies matters to the audit:

- **It runs none of your code.** The skill confirms a finding by a small test only inside an OS sandbox with no network, and the hook denies the agent a build, a test run outside `test/`, and `node` on any other file. So a finding that needs a run to be confirmed stays in `NEEDS-VALIDATION.md`, with the check to run. Run it yourself, in a sandbox of your own.
- **It reads no lockfile.** `.cursorignore` holds `package-lock.json` back, and the hook denies a shell read of it, so the checks of the supply chain see `package.json` only.
- **It edits nothing.** The audit describes the smallest fix for each finding. It does not change your source, and the hook would deny it.

## What was run

One quick run, on 2026-10-25, on a copy of `examples/next-app` with the kit installed and the hook live. The model was Claude Opus 5 (`claude-opus-5-high`) in the Cursor CLI, version `2026.10.01-e373342`. The prompt was `/security-audit Run a quick audit of this codebase (quick profile), with a budget of 12 agent invocations. Use the default output folder.`

- **It took about 86 minutes.** The first session stopped at a time limit of one hour while its last subagent ran. The same session, resumed with `agent --resume`, finished in 26 minutes. The second session alone wrote 78,830 tokens and read 6.6 million from the cache.
- **It worked inside the hook.** It wrote all seven files of a run to `~/security-audit-skill/sandbox/run-1/`, ran both validators several times, and fixed its ledger once after the validator rejected it. The copy of the app had no change afterwards. The hook denied two commands: `find` with `-exec`, which it then ran without, and `unshare`, the skill's check for an OS sandbox.
- **It started 12 subagents**: four for reconnaissance, four hunters, three verifiers, and the final coverage critic.
- **It ended as `incomplete`**, with the reason `validation_budget_exhausted`. The hunters raised 8 candidates and the budget left 3 verifier calls. The skill validates in a fixed order, so the 5 candidates it did not validate, the strongest among them, are listed at the top of `REPORT.md` and not in `findings.json`. Halfway through it asked how to spend the budget. The CLI skipped the question, and the skill's own rule decided.
- **It confirmed nothing.** With no OS sandbox it ran none of the app's code, and a finding needs a run to be confirmed. Of the 3 candidates it validated, 2 stay as leads in `NEEDS-VALIDATION.md`, and 1 was rejected with the reason.

So give a quick run of a small app a budget of at least 20, and expect more than an hour.

Not run: the skill on a model other than Claude Opus 5, a `standard` or `deep` run, a second run that goes on from a first, a run with an OS sandbox, and the Cursor window.

## Update the copy

Maintainers take a newer version of the skill with one script. [CONTRIBUTING.md](../CONTRIBUTING.md#the-copied-security-audit-skill) has the steps.
