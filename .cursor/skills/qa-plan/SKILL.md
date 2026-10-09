---
name: qa-plan
description: "Plan end-to-end coverage for one feature and save it as one plan file. Usage: /qa-plan sign-in"
disable-model-invocation: true
---

# Plan end-to-end coverage for one feature

You explore one feature in the browser and write one plan file. You write no spec and no page class, and you run no test.

Read application source (`app/`, `src/`, and similar). Never edit it.

- Plan: `test/e2e/plan/sign-in.plan.md`. `sign-in` is the feature name. Change only that part.
- Template: `.cursor/skills/qa-plan/templates/plan.md`.

Do the steps in order. In every table, use the first row that matches. When a step says BLOCKED, stop work, go to step 9, and put the sentence after `Verdict: BLOCKED:`.

## Steps

1. **Name.** Take the feature from the prompt, in lower case with hyphens: `sign-in`. No feature in the prompt: reply `Which feature?` and stop.

2. **Settings.** Take each value from the prompt. If the prompt does not give it, use the default.

   | Value | Default |
   | --- | --- |
   | Side | `UI`. It is `API` only when the prompt says API. |
   | Base URL | `http://localhost:3000` |
   | Route | `/` plus the name: `/sign-in` |

3. **Open the page.** Call `browser_navigate` with the full URL, base URL plus route: `http://localhost:3000/sign-in`. A bare `/sign-in` fails.

   | Result | Do |
   | --- | --- |
   | You have no `browser_navigate` tool | BLOCKED: `turn on the playwright MCP server in Cursor settings, then ask again.` |
   | The reply contains `ERR_CONNECTION_REFUSED` | Do not start the app. BLOCKED: `start the app with npm run dev, then ask again.` |
   | The reply contains `is not installed` or `is not found` | Do not run the install command it suggests. BLOCKED: `the Playwright MCP server needs Google Chrome installed.` |
   | The reply contains `HTTP status: 404` | BLOCKED: `no page at http://localhost:3000/sign-in. Ask again with the route.` |
   | `Page URL` in the reply is not the URL you asked for | The app redirected you, most often to its sign-in page. No account in the prompt: BLOCKED: `this page needs a signed-in user. Ask again with a test account.` With an account: sign in with it in the browser, go to step 4, and start every scenario with those sign-in steps. |
   | No row matches | The page is open. Go to step 4. |

4. **Read the page.** Call `browser_snapshot`. Do not take a screenshot. Each line is one element, for example `- button "Sign in" [ref=e9]`. The words in quotes are what the user sees. `e9` is the `ref`. `browser_type` and `browser_click` take it as `target`. Ignore `button "Open Next.js Dev Tools"` and an `alert` line that is empty or only repeats the page heading. Next.js adds both to every page.

5. **Read the source for this page only.** Search the source for one text from the snapshot, for example `Sign in`. Read the page files the search finds, the app files they import, and the route handler the page calls. At most 6 files. Note each validation message, each error message, the request (`POST /api/session`), and any test account the source creates.

6. **List 3 to 8 scenarios**, one line each. This table is a list: go through every row, top to bottom.

   | Scenario | Group | Count |
   | --- | --- | --- |
   | The main flow that ends in success | `Main flow` | 1 |
   | A validation message from the source | `Validation` | 1 for each message |
   | An error message the page shows when the server refuses, such as a wrong password | `Errors` | 1 for each message |
   | The server fails with status 500. Side `UI` only. Its first step is a `Mock` step. | `Errors` | 1 |
   | More than 8 lines | | Keep the first 8. Name the others under `Not checked:`. |
   | Fewer than 3 lines | | Keep them. Say so under `Not checked:`. |

   A scenario that needs an account or a record uses one from the prompt or from the source you read. None found: drop the scenario and name it under `Not checked:`. Do not invent data.

7. **Start the plan file.** Read the template. Write the plan file with only the lines above `## 1. GROUP`, the words in CAPITALS replaced. `DATA` is the account or records the scenarios use, or `none`.

8. **Walk one scenario, add it to the plan file, then take the next.** Stay on the feature's pages.

   1. `browser_navigate` to the full URL, then `browser_snapshot`.
   2. Do the steps. `browser_type` fills a field. `browser_click` clicks. Give each call the `ref` of the element from the latest snapshot.
   3. `browser_snapshot` again. Copy every label, button name, heading, and message from the snapshots, letter for letter. Do not write a text from memory.
   4. Add the scenario to the plan file, in the template's form, with the sentence forms below.
   5. `browser_close`. It also signs the browser out, so the next scenario starts clean.

   Do not walk a scenario with a `Mock` step: these browser tools do not mock. Take its message from the source and name that text in your reply.

   Sentence forms. Change only the quoted text, the values, and the role word (`textbox`, `button`, `link`, `checkbox`, `heading`), which comes from the snapshot line. A `Mock` step is always step 1.

   ```markdown
   1. Mock `POST **/api/session` to answer with status 500 and the JSON body `{ "error": "Internal Server Error" }`.
   2. Go to `/sign-in`.
   3. Fill the "Email" textbox with `ada@example.com`.
   4. Click the "Sign in" button.

   - The alert shows "Email or password is incorrect".
   - The "Dashboard" heading is visible.
   - The text "Signed in as ada@example.com" is visible.
   - The "Sign in" button is enabled.
   - The URL is `/dashboard`.
   ```

   No form fits: write one short sentence in the same style and name it under `Not checked:`.

9. **Reply** with this form and nothing else. The values shown are examples. A line you have nothing for gets `none`.

   ```text
   Plan file: test/e2e/plan/sign-in.plan.md
   Side: UI
   Scenarios: 6
   Texts from source, not seen in the browser: "Something went wrong. Try again." (src/components/SignIn.tsx:8)
   Verdict: DONE
   Not checked: none
   ```

   `Verdict:` is `DONE`, or `BLOCKED:` and the sentence from the step that stopped you.
