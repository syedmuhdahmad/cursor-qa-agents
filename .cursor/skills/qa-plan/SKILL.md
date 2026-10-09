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

3. **Open the page.** Call `browser_navigate` with the full URL, base URL plus route: `http://localhost:3000/profile`. A bare `/profile` fails.

   | Result | Do |
   | --- | --- |
   | You have no `browser_navigate` tool | BLOCKED: `turn on the playwright MCP server in Cursor settings, then ask again.` |
   | The reply contains `ERR_CONNECTION_REFUSED` | Do not start the app. BLOCKED: `start the app with npm run dev, then ask again.` |
   | The reply contains `is not installed` or `is not found` | Do not run the install command it suggests. BLOCKED: `the Playwright MCP server needs Google Chrome installed.` |
   | The reply contains `HTTP status: 404` | BLOCKED: `no page at http://localhost:3000/profile. Ask again with the route.` |
   | `Page URL` in the reply is not the URL you asked for | The app redirected you, most often to its sign-in page. No account in the prompt: BLOCKED: `this page needs a signed-in user. Ask again with a test account.` With an account: sign in with it in the browser, go to step 4, and start every scenario with those sign-in steps. |
   | No row matches | The page is open. Go to step 4. |

4. **Read the page.** Call `browser_snapshot`. Do not take a screenshot. Each line is one element, for example `- button "Save profile" [ref=e9]`. The words in quotes are what the user sees. `e9` is the `ref`. `browser_type` and `browser_click` take it as `target`. Ignore `button "Open Next.js Dev Tools"` and an `alert` line that is empty or only repeats the page heading. Next.js adds both to every page.

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
   | Its first step is a `Mock` step | Do not use the browser for it: these browser tools do not mock. Still add it to the plan file, in the same form as the others. Copy its message from the source, and name that text in your reply. |
   | Any other scenario | Walk it in the browser with sub-steps 1 to 5. |

   1. `browser_navigate` to the full URL, then `browser_snapshot`.
   2. Do the steps. `browser_type` fills a field. `browser_click` clicks. Give each call the `ref` of the element from the latest snapshot.
   3. `browser_snapshot` again. Copy every label, button name, heading, and message from the snapshots, letter for letter. Do not write a text from memory.
   4. Add the scenario to the plan file, in the template's form, with the sentence forms below. Its `Expect` list names at least one text the user sees in the last snapshot: a heading, a message, or other text. A URL line alone is not enough.
   5. `browser_close`. It also signs the browser out, so the next scenario starts clean.

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

9. **Check the plan file, then reply.** Count the `###` headings in the plan file. The count must equal your list from step 6. A scenario is missing: add it now. Then reply with this form and nothing else. The values shown are examples. A line you have nothing for gets `none`.

   ```text
   Plan file: test/e2e/plan/profile.plan.md
   Side: UI
   Scenarios: 5
   Texts from source, not seen in the browser: "We could not save your profile" (src/components/ProfileForm.tsx:10)
   Verdict: DONE
   Not checked: none
   ```

   `Verdict:` is `DONE`, or `BLOCKED:` and the sentence from the step that stopped you.
