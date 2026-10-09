# Where these files come from

Three files in this folder are copies from another project: `core-expect.md`, `core-test-api.md`, and `features-mocking.md`. They are not changed. `LICENSE` and `LICENSE-vitest` are the license files of the two projects they come from. This file is the only one written here.

The rest of the skill (`../SKILL.md` and `../templates/`) is written for this project and is under this project's license.

## Source

| | |
| --- | --- |
| Copied from | The folder `skills/vitest/references/` of [antfu/skills](https://github.com/antfu/skills) |
| At commit | `d02c48452d782231e4c32d7069cde731a4c7db42` (2026-09-28), skill version 2026.9.25 |
| Made there from | The documentation of [vitest-dev/vitest](https://github.com/vitest-dev/vitest) at commit `ea1c44fb581978421f9f0901ce8c635970ea72fb` (Vitest 5.0.1), generated on 2026-09-25 |
| License | MIT License, for both projects |
| `LICENSE` | `LICENSE.md` of antfu/skills at the commit above. Copyright (c) 2025-PRESENT Anthony Fu |
| `LICENSE-vitest` | `LICENSE` of vitest-dev/vitest at the commit above. Copyright (c) 2021-Present VoidZero Inc. and Vitest contributors |
| Changes | None. Each file is byte for byte the upstream file. |

The upstream folder holds 19 reference files. Only the three that section B of `../SKILL.md` names are kept.

## Check that the copies are unchanged

`git hash-object` on a file here must print the blob id that upstream has for it.

| File | Git blob id |
| --- | --- |
| `core-expect.md` | `6b8d9992e11182e5e3cbc08b5fb0d35fe217b1f0` |
| `core-test-api.md` | `347632df4ff315bcff02fd5b4afecd3cfab15909` |
| `features-mocking.md` | `81192fd924bd9ac9ad4ba88daf43fdea0a7ab769` |
| `LICENSE` | `29f64e0a93476a23cb4e5864696f673bf05caa43` |
| `LICENSE-vitest` | `0e5771dddf4e96ebc77c349f53fc763b910e63c0` |

Upstream's id for one file:

```sh
gh api "repos/antfu/skills/contents/skills/vitest/references/core-expect.md?ref=d02c48452d782231e4c32d7069cde731a4c7db42" --jq .sha
```

The Markdown linter skips this folder (see `.markdownlint-cli2.jsonc`). Keep it that way. A lint fix would turn an unchanged copy into a changed one.

## Refresh

Upstream writes these files with an agent, so do not generate them again here. Copy what upstream published.

1. Choose a commit of antfu/skills and clone the repository at that commit into a scratch folder.
2. Copy `skills/vitest/references/core-expect.md`, `core-test-api.md`, and `features-mocking.md` over the three files here.
3. Copy upstream `LICENSE.md` to `LICENSE`.
4. Read the Git SHA in upstream `skills/vitest/GENERATION.md`. Copy the `LICENSE` file of vitest-dev/vitest at that SHA to `LICENSE-vitest`.
5. Update the two tables in this file: the commit, the skill version, the Vitest SHA and version, the date, and the five blob ids.
6. Update the entry for this folder in `THIRD_PARTY_NOTICES.md`.
7. Read `../SKILL.md` and `../templates/` against the new files. The skill must not teach a call that the new Vitest version removed.
