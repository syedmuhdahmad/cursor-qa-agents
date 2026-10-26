# Upgrading

This page moves an app to a newer version of the kit. The latest release is v0.2.0, of 2026-10-26.

## Which version you have

`.cursor/qa/VERSION` holds the version of the kit you copied. From the root of your app:

```bash
cat .cursor/qa/VERSION
```

| It prints | You have |
| --- | --- |
| `0.2.0` | The latest release |
| `0.1.0` | The first tagged version, of 2026-10-09 |
| No such file | A copy older than 0.1.0 |

A copy made from `main` between two tags says the version of the tag before it.

## Read the changelog first

[CHANGELOG.md](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/CHANGELOG.md) starts each version with a section "Action needed if you copied an earlier version". Read that section for every version between yours and the new one, oldest first. While the version is below 1.0, a minor version may need action from you.

### From 0.1.0 to 0.2.0

1. A write to a test file may no longer add a snapshot matcher: `toMatchSnapshot(`, `toMatchInlineSnapshot(`, `toThrowErrorMatchingSnapshot(`, or `toThrowErrorMatchingInlineSnapshot(`. This holds for your Vitest tests too. A snapshot that a file already has can stay.
2. In a React Native or Expo app, copy the kit again with the installer, which now leaves out the web files there. If you copied by hand into such an app, delete `vitest.config.ts`, `playwright.config.ts`, `test/setup.ts`, and `test/e2e/`, unless the app also builds for the web.

### From a copy older than 0.1.0

Version 0.1.0 has 15 steps. The main ones:

- Delete the old skill folders from `.cursor/skills/`: `vitest-unit-integration`, `playwright-planner`, `playwright-generator`, `playwright-healer`, and `playwright-page-objects`. Start jobs with `/qa-unit`, `/qa-plan`, `/qa-generate`, and `/qa-heal`.
- Copy `.cursor/qa/` and `.cursorignore`. Without `.cursor/qa/` the two config files do not start.
- Remove the Playwright MCP server: the `playwright` entry in `.cursor/mcp.json`, and `npm uninstall @playwright/mcp` unless you use it yourself. The plan and generate jobs now use `playwright-cli` and Google Chrome.
- Check your own skills and habits against the commands the hook now denies, such as `cd` into a folder and a test run that names no path.

The [0.1.0 section](https://github.com/syedmuhdahmad/qa-agent-kit/blob/main/CHANGELOG.md#010---2026-10-09) has every step.

## Upgrade with the installer

1. In your clone of the kit, take the new version:

   ```bash
   git pull
   ```

   That gives you `main`. To install a release instead, check out its tag, such as `git checkout v0.2.0`.

   If your clone still points at the old name, `cursor-qa-agents`, GitHub sends it to the new one. To change the remote anyway:

   ```bash
   git remote set-url origin https://github.com/syedmuhdahmad/qa-agent-kit.git
   ```

2. Run a dry run. It writes nothing, and lists every file of yours that differs from the new version as skipped:

   ```bash
   node scripts/install-into.mjs ../my-app --dry-run
   ```

3. Run the installer. It merges `.cursor/hooks.json` and `.cursor/mcp.json`, adds what is missing, and skips every other file that differs:

   ```bash
   node scripts/install-into.mjs ../my-app
   ```

4. Handle each skipped file by the table below. Read the `WARNING:` and `NOTE:` lines at the end of the output. See [[Installation]].
5. Delete the skill folders that the new version no longer has. The installer never deletes.
6. In your app, run `npm install`, then run your tests: `npm run test:unit`, `npm run test:integration`, and `npm run test:e2e`, or `npm run test:rn-unit` in a React Native app.

`--force` replaces every file that differs, the ones to merge by hand included. Use it only when you have no changes of your own in them.

## Overwrite, merge, or delete

| Group | Paths |
| --- | --- |
| Safe to overwrite, unless you changed them yourself | `.cursor/skills/qa-*/`, `.cursor/skills/playwright-cli/`, `.cursor/agents/qa.md`, `.cursor/hooks/`, `.cursor/qa/`, and the kit's two files in `.cursor/rules/` |
| Merge by hand | `AGENTS.md`, `vitest.config.ts`, `playwright.config.ts`, `.cursorignore`, `.gitignore`, `test/setup.ts`, and the scripts and dev dependencies in `package.json` |
| Merged by the installer | `.cursor/hooks.json` and `.cursor/mcp.json`. If you copy by hand, merge these two as well. |
| Delete by hand | A skill folder that the new version no longer has |

Your tests and plans under `test/` stay as they are. [[Layout and files]] says what each file is for.

## Upgrade by hand

Copy the files of the new version as in [[Installation]], then sort them by the table above. Compare each file to merge with yours before you replace it.

## The next version

Version 0.3.0 is planned to install with `npx qa-agent-kit` into Claude Code and Cursor, and to upgrade a 0.2 kit. That step is not built yet. See [[Roadmap and open issues]].
