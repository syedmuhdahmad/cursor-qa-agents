# Security audit

`/security-audit` is Cloudflare's [security audit skill](https://github.com/cloudflare/security-audit-skill), in `.cursor/skills/security-audit/`. It looks for vulnerabilities in your app's source that cross a real trust boundary, has each finding checked by an agent that did not find it, and writes a report of the verified ones.

It is not a test job. It writes no test and prints no `QA-VERDICT:` line. It edits none of your source: it describes the smallest fix for each finding.

The folder is a copy of the skill at one commit, under the MIT License, with Cloudflare's `LICENSE` file next to it. Only the frontmatter of its `SKILL.md` was written for this kit. [docs/security-audit.md](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/docs/security-audit.md) has the detail.

## Use a high-tier model only

Use a high-tier model, such as Claude Opus 5. The skill is about 25,000 words in fifteen files, reads several of them in each phase, sends work to subagents, and checks their results against JSON schemas. The kit's other skills are written for small models, and this one is not. It was not run on Composer 2.5 or Gemini 3.8 Flash.

## Example prompts

A full run starts many subagents, and the skill counts them as its budget. Ask for a small run first, and give it a budget:

```text
/security-audit Run a quick audit of this codebase (quick profile), with a budget of 20 agent invocations.
/security-audit Audit src/api/ only, standard profile, budget 20.
/security-audit Is the password reset token in src/lib/reset-token.ts safe?
```

The last one is a question. The skill answers it in its guidance mode, with no run folder.

## How long it takes

Expect more than an hour for a quick run of a small app, and give it a budget of at least 20.

The one recorded run was a quick run with a budget of 12, on Claude Opus 5 in the Cursor CLI, on 2026-10-25. It took about 86 minutes, over two sessions: the first stopped at a time limit of one hour. It started 12 subagents, ran out of budget with 5 of its 8 candidates not validated, and confirmed nothing, because it could run none of the app's code. 2 candidates stayed as leads to check by hand, and 1 was rejected.

## Where the report goes

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

A second run reads the earlier runs of the same app and goes on from them. That was not run with the kit.

## What the hook allows it

The hook gives the audit two exceptions. Everything else stays as it is for the test jobs.

| Allowed | Detail |
| --- | --- |
| Its run folder | A write tool may write any file inside `~/security-audit-skill/`. The shell may not write there. A folder of that name inside your project gets no exception. |
| Its two validators | `node` may run `validate-findings.cjs` or `validate-coverage-ledger.cjs` from `.cursor/skills/security-audit/`, with one file inside the run folder and no option. They read the file and print what is wrong with it. |

What the hook still denies, and what that means for the audit:

- **It runs none of your code.** The skill confirms a finding with a small test only inside an OS sandbox with no network, and the hook denies a build, a test run outside `test/`, and `node` on any other file. A finding that needs a run stays in `NEEDS-VALIDATION.md`, with the check to run. Run it yourself, in a sandbox of your own.
- **It reads no lockfile.** `.cursorignore` holds `package-lock.json` back, so the checks of the supply chain see `package.json` only.
- **It edits nothing.** A write to your source is denied, as for every job.

## What was not run

The skill on a model other than Claude Opus 5, a `standard` or `deep` run, a second run that goes on from a first, a run with an OS sandbox, and the Cursor window.
