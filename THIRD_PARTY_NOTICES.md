# Third-party notices

The files written for this project are under the MIT License in [LICENSE](LICENSE), Copyright (c) 2026 Syed Muhammad Ahmad.

Some files under `.cursor/skills/` were copied from other projects, or began as a version of another project's files. This file lists each source, its version, its license, and what this project changed.

This project is not affiliated with, or endorsed by, any project or author named here.

This file does not travel with the kit. A user copies `.cursor/` and a few other paths into an app, and this file is not among them. That is why the license texts of the copied files also sit next to those files, inside `.cursor/`.

## Copied files

### `.cursor/skills/qa-unit/references/`

Three copied files: `core-expect.md`, `core-test-api.md`, and `features-mocking.md`.

- **Source:** the `skills/vitest/references/` folder of [antfu/skills](https://github.com/antfu/skills) at commit `d02c48452d782231e4c32d7069cde731a4c7db42`. That project generated the files from the documentation of [vitest-dev/vitest](https://github.com/vitest-dev/vitest) at commit `ea1c44fb581978421f9f0901ce8c635970ea72fb`, which is Vitest 5.0.1.
- **License:** MIT License, for both projects. The two texts are in the same folder: [`LICENSE`](.cursor/skills/qa-unit/references/LICENSE) is from antfu/skills, and [`LICENSE-vitest`](.cursor/skills/qa-unit/references/LICENSE-vitest) is from Vitest.
- **Copyright:**
  - Copyright (c) 2025-PRESENT Anthony Fu <https://github.com/antfu>
  - Copyright (c) 2021-Present VoidZero Inc. and Vitest contributors
- **Changed here:** nothing. The three files and the two license files are the same, byte for byte, as upstream at the commits above. Upstream's `LICENSE.md` is named `LICENSE` here, and Vitest's `LICENSE` is named `LICENSE-vitest`.
- **Not copied:** the other sixteen reference files in that upstream folder, and upstream's `SKILL.md`. `.cursor/skills/qa-unit/SKILL.md` and its templates were written for this project.

Do not edit the three files. Markdown lint skips the folder so that they stay unmodified copies. [`GENERATION.md`](.cursor/skills/qa-unit/references/GENERATION.md) in that folder says how to check the copies and how to refresh them.

## Adapted skills

### `qa-plan`, `qa-generate`, and `qa-heal`

- **Source:** the Playwright Test Agents definitions in the npm package [`playwright`](https://www.npmjs.com/package/playwright), version 1.64.0-alpha-1790635538000, folder `lib/agents/`: `playwright-test-planner.agent.md`, `playwright-test-generator.agent.md`, and `playwright-test-healer.agent.md`. Upstream keeps them at <https://github.com/microsoft/playwright/tree/main/packages/playwright/src/agents>.
- **License:** Apache License 2.0. The full text is at the end of this file. Its copyright lines read "Portions Copyright (c) Microsoft Corporation." and "Portions Copyright 2017 Google Inc."
- **NOTICE file of the package:**

  ```text
  Playwright
  Copyright (c) Microsoft Corporation

  This software contains code derived from the Puppeteer project (https://github.com/puppeteer/puppeteer),
  available under the Apache 2.0 license (https://github.com/puppeteer/puppeteer/blob/master/LICENSE).
  ```

- **Changed here:** everything. The first version of these skills (commit `4e4a85f`, 2026-09-30) was named `playwright-planner`, `playwright-generator`, and `playwright-healer`. It used the body of each agent definition, with file paths changed and a "This repo" section added. Commit `cfed36c` (2026-10-01) rewrote all three. They were later rewritten again as `qa-plan`, `qa-generate`, and `qa-heal`. The current text was written for this project. It keeps these Playwright conventions:
  - the three jobs: plan, generate, and heal;
  - the `// spec:` and `// seed:` comment lines at the top of a spec;
  - the `**Seed:**` and `**Steps:**` labels and the `1.` and `1.1` numbering in a plan;
  - the `seed.spec.ts` file name;
  - marking a test `test.fixme()` with a comment when the app is wrong.

No license file sits next to these three skills, because their text was written for this project. The first two versions remain in the git history.

## Ideas and acknowledgements

These projects are named to give credit for ideas. The skills state the ideas in this project's own words and hold none of these projects' files.

- [ponytail](https://github.com/DietrichGebert/ponytail), MIT License, Copyright (c) 2026 DietrichGebert. Its "smallest complete change" rules are the source of four things here:
  - the ordered list of fixes in `qa-heal` and `qa-unit`, where the model takes the first one that fixes the failure;
  - the rule in both skills to add no helpers, retries, or options;
  - the step in `qa-heal` that lists every spec that uses a page class before the class is edited, and then fixes the cause once in the class;
  - the closing `Not checked:` line of the reply forms.
- [pstack](https://github.com/cursor/plugins/tree/main/pstack) in cursor/plugins, MIT License, Copyright (c) 2026 Lauren Tan. Its bug-fix playbook and principles are the source of four rules here:
  - point to the cause in the error or the source before editing (`qa-heal` and `qa-unit`);
  - put the old line back when a fix did not change the failure (`qa-heal` and `qa-unit`);
  - report one line from before the fix and one from after, copied exactly (`qa-heal` and `qa-unit`);
  - do not hide a failure behind a guard (`qa-heal`).
- The page classes that `qa-generate` writes follow the page object model pattern in the [Playwright documentation](https://playwright.dev/docs/pom).

## Copies that earlier commits held

Earlier commits of this repository held two larger copies. They are no longer in the tree. They remain in the git history, so their sources are recorded here.

- `.cursor/skills/playwright-cli/` was a copy of the `skills/playwright-cli/` folder of the npm package [`@playwright/cli`](https://www.npmjs.com/package/@playwright/cli), version 0.1.22. Apache License 2.0, Copyright (c) Microsoft Corporation. This project changed the frontmatter of `SKILL.md` and, in commit `eaa9b42`, the Markdown formatting of `SKILL.md` and of eight of the ten reference files.
- `.cursor/skills/vitest-unit-integration/` was a copy of the whole `skills/vitest/` folder of antfu/skills at the commit named above, with all nineteen reference files. MIT License, with the two copyright lines named above. This project added a section of its own to `SKILL.md` and to `GENERATION.md`, changed the frontmatter of `SKILL.md`, and, in commit `eaa9b42`, changed the Markdown formatting of `SKILL.md` and of seven reference files.

## License texts

### MIT License

antfu/skills, Vitest, ponytail, and pstack each use this text with their own copyright line.

```text
MIT License

Copyright (c) 2025-PRESENT Anthony Fu <https://github.com/antfu>
Copyright (c) 2021-Present VoidZero Inc. and Vitest contributors
Copyright (c) 2026 DietrichGebert
Copyright (c) 2026 Lauren Tan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Apache License 2.0

This is the text of the `LICENSE` file of the `playwright` package. Only the line endings were changed, from Windows to Unix. The license is also published at <https://www.apache.org/licenses/LICENSE-2.0>.

```text
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Portions Copyright (c) Microsoft Corporation.
   Portions Copyright 2017 Google Inc.

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```
