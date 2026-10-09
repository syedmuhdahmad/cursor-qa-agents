---
name: qa-plan
description: "Plan end-to-end coverage for one feature and save it as one plan file. Usage: /qa-plan profile"
disable-model-invocation: true
---

# Plan end-to-end coverage for one feature

You explore one feature in the browser and write one plan file. You write no spec and no page class, and you run no test.

Read application source (`app/`, `src/`, and similar). Never edit it.

- Plan: `test/e2e/plan/profile.plan.md`. `profile` is the feature name. Change only that part.
- Template: `.cursor/skills/qa-plan/templates/plan.md`.

The examples are from another app. Take your routes and texts from the prompt, the browser, and the source.

Do the steps in order. In every table, use the first row that matches. When a step says BLOCKED, stop work, go to step 9, and put the sentence after `Verdict: BLOCKED:`.

## Steps

1. **Name.** Take the feature from the prompt, in lower case with hyphens: `profile`. No feature in the prompt: reply `Which feature?` and stop.

2. **Settings.** Take each value from the prompt. If the prompt does not give it, use the default.

   | Value | Default |
   | --- | --- |
   | Side | `UI`. It is `API` only when the prompt says API. |
   | Base URL | `http://localhost:3000` |
   | Route | `/` plus the name: `/profile` |

   The hook lets the browser open only `http://localhost` and `http://127.0.0.1`, with any port. A base URL on another host: BLOCKED: `the tests run only against an app on this machine.`

3. **Open the page.** Run this command. It opens the page in a new browser, waits two seconds, and prints the page. Change only the URL. It is always the full URL, base URL plus route. Put a URL that has `?` or `&` in single quotes.

   ```bash
   npx --no-install playwright-cli open http://localhost:3000/profile && sleep 2 && npx --no-install playwright-cli snapshot
   ```

   | The output | Do |
   | --- | --- |
   | Contains `ERR_CONNECTION_REFUSED` | Do not start the app. BLOCKED: `start the app with npm run dev, then ask again.` |
   | Contains `Chromium distribution`, as in `Chromium distribution 'chrome' is not found`, or `install-browser` | The browser is missing. Do not run the install command the output suggests. BLOCKED: `playwright-cli found no browser. Install Google Chrome, then ask again.` |
   | Contains `npm error` | BLOCKED: `playwright-cli is not installed. Add the dev dependency @playwright/cli, then ask again.` |
   | Contains `HTTP status: 404` | BLOCKED: `no page at http://localhost:3000/profile. Ask again with the route.` |
   | Its `Page URL` line shows another URL than the one you asked for | The app redirected you, most often to its sign-in page. No account in the prompt: BLOCKED: `this page needs a signed-in user. Ask again with a test account.` With an account: sign in with it, using the commands of step 8. Go to step 4. Start every scenario with a `Go to` line for the sign-in page and those sign-in steps. |
   | Its `Page URL` line shows the URL you asked for | The page is open. Go to step 4. |
   | No row matches | BLOCKED: `the browser did not open.` Put the first line of the output under `Not checked:`. |

4. **Read the page.** It is the last part of the latest output, under `### Snapshot`. Each line is one element, for example `- button "Save profile" [ref=e9]`. The words in quotes are what the user sees. `e9` is the `ref`. The commands in step 8 take it. A message stands after the `ref`: `- alert [ref=e12]: That name is taken`. Double quotes around such a message are not part of it.

   - Ignore `button "Open Next.js Dev Tools"` and an `alert` line that is empty or only repeats the page heading. Next.js adds both to every page. Ignore the `Console:` and `### Events` lines.
   - Only `snapshot` prints the page. Every other command prints at most a link such as `[Snapshot](.playwright-cli/page-2026-10-09T11-59-11-659Z.yml)`. Do not open that file. The hook denies it.

5. **Read the source for this page only.** Search the source for one text from the snapshot, for example `Save profile`. Read the page files the search finds, the app files they import, and the route handler the page calls. At most 6 files. Note each validation message, each error message, the request (`PUT /api/profile`), and any test account the source creates.

6. **List 3 to 8 scenarios**, one line each. This table is a list: go through every row, top to bottom.

   | Scenario | Group | Count |
   | --- | --- | --- |
   | The main flow that ends in success | `Main flow` | 1 |
   | A validation message from the source | `Validation` | 1 for each message |
   | An error message the page shows when the server refuses, such as a name that is taken | `Errors` | 1 for each message |
   | The server fails with status 500. Side `UI` only. Its first step is a `Mock` step. | `Errors` | 1 |
   | More than 8 lines | | Keep the first 8. Name the others under `Not checked:`. |
   | Fewer than 3 lines | | Keep them. Say so under `Not checked:`. |

   A scenario that needs an account or a record uses one from the prompt or from the source you read. None found: drop the scenario and name it under `Not checked:`. Do not invent data.

7. **Start the plan file.** Read the template. Write the plan file with only the lines above `## 1. GROUP`, the words in CAPITALS replaced. `DATA` is the account or records the scenarios use, or `none`.

8. **Take the scenarios from step 6 one at a time.** Every one of them goes into the plan file. Stay on the feature's pages.

   | The scenario | Do |
   | --- | --- |
   | Its first step is a `Mock` step | Do not use the browser for it: the commands in this skill do not mock. Still add it to the plan file, in the same form as the others. Copy its message from the source, and name that text in your reply. |
   | Any other scenario | Walk it in the browser with sub-steps 1 to 4. |

   1. Run the command of step 3 again, with the URL of the scenario's first page. `open` starts a new browser with no cookies, so every scenario starts signed out.
   2. Do the steps, one command for each. Change only the URL, the `ref`, and the text. Take the `ref` from the latest snapshot, exactly as printed.

      | Step | Command |
      | --- | --- |
      | Fill a field | `npx --no-install playwright-cli fill e5 'Grace Hopper'` |
      | Click | `npx --no-install playwright-cli click e9 && sleep 2 && npx --no-install playwright-cli snapshot` |
      | Go to another page in the same scenario | `npx --no-install playwright-cli goto http://localhost:3000/account && sleep 2 && npx --no-install playwright-cli snapshot`. `goto` keeps the cookies. Its snapshot has new refs, such as `f1e9`. |
      | No row matches | `select e7 'Germany'`, `check e4`, `uncheck e4`, `press Enter`, or `hover e3` in place of `click e9` |

      - Put the text in single quotes: the shell then leaves spaces, `$`, and double quotes as they are. The text has a single quote in it, as in `it's`: write `'\''` for that quote, `fill e5 'it'\''s'`.
      - The output says `Ref e9 not found`, or the latest snapshot does not show the element: run `npx --no-install playwright-cli snapshot`, then run the command with the `ref` it prints.
      - The snapshot shows a loading text, or nothing new after a click: the page is slow. Run `npx --no-install playwright-cli snapshot` once more.

      Why: `open` and `click` return before a slow page has finished changing.

   3. Copy every label, button name, heading, and message from the snapshots, letter for letter. Do not write a text from memory.
   4. Add the scenario to the plan file, in the template's form, with the sentence forms below. Its `Expect` list names at least one text the user sees in the last snapshot: a heading, a message, or other text. A URL line alone is not enough.

   Sentence forms. Change only the quoted text, the values, and the role word (`textbox`, `button`, `link`, `checkbox`, `heading`), which comes from the snapshot line. A `Mock` step is always step 1.

   ```markdown
   1. Mock `PUT **/api/profile` to answer with status 500 and the JSON body `{ "error": "Internal Server Error" }`.
   2. Go to `/profile`.
   3. Fill the "Display name" textbox with `Grace Hopper`.
   4. Click the "Save profile" button.

   - The alert shows "That name is taken".
   - The "Account" heading is visible.
   - The text "Saved as Grace Hopper" is visible.
   - The "Save profile" button is enabled.
   - The URL is `/account`.
   ```

   No form fits: write one short sentence in the same style and name it under `Not checked:`.

9. **Close the browser, check the plan file, then reply.** Run `npx --no-install playwright-cli close`. Run it on every path, also after BLOCKED. `Browser 'default' is not open.` is a fine answer. Not BLOCKED: count the `###` headings in the plan file. The count must equal your list from step 6. A scenario is missing: add it now. Then reply with this form and nothing else. The values shown are examples. A line you have nothing for gets `none`.

   ```text
   Plan file: test/e2e/plan/profile.plan.md
   Side: UI
   Scenarios: 5
   Texts from source, not seen in the browser: "We could not save your profile" (src/components/ProfileForm.tsx:10)
   Verdict: DONE
   Not checked: none
   ```

   `Verdict:` is `DONE`, or `BLOCKED:` and the sentence from the step that stopped you.

This skill names every `playwright-cli` command the job needs. `.cursor/skills/playwright-cli/SKILL.md` describes the others. The hook denies most of them, so do not read it for this job.
