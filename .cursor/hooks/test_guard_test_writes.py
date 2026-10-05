"""Run with: python3 -m unittest discover -s .cursor/hooks"""

import json
import subprocess
import sys
import unittest
from pathlib import Path

HOOK = Path(__file__).resolve().parent / "guard-test-writes.py"
REPO = HOOK.parents[2]


def decide(payload):
    payload.setdefault("cwd", str(REPO))
    result = subprocess.run(
        [sys.executable, str(HOOK)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)["permission"]


def shell(command):
    return decide({"hook_event_name": "beforeShellExecution", "command": command})


def tool(name, path):
    return decide({"hook_event_name": "preToolUse", "tool_name": name, "tool_input": {"path": path}})


class CommandCase(unittest.TestCase):
    """Checks a list of shell commands against one expected decision."""

    def assert_all(self, commands, expected):
        for command in commands:
            with self.subTest(command=command):
                self.assertEqual(shell(command), expected)


class ShellAllowed(CommandCase):
    def test_allowed(self):
        self.assert_all([
            "npx vitest run --project unit --no-passWithNoTests test/unit/a.test.ts",
            "npx playwright test test/e2e/sign-in.spec.ts",
            "RTK_DISABLED=1 npx vitest run --project unit --no-passWithNoTests test/unit/a.test.ts",
            "RTK_DISABLED=1 npx playwright test test/e2e/a.spec.ts:12 --debug=cli",
            "PLAYWRIGHT_HTML_OPEN=never npx playwright test test/e2e/a.spec.ts:12 --debug=cli &",
            "npx --no-install playwright-cli attach tw-abc123",
            "npm run test:unit 2>&1 | tail -20",
            "cat src/a.ts | grep foo",
            "echo '$(not run)' > test/unit/note.txt",
            "mkdir -p test/unit/components",
            "git status && git add test && git commit -m 'Add tests'",
            "rtk git push -u origin HEAD",
            "git checkout -b add-tests",
            "git restore --staged test/unit/a.test.ts",
            "gh pr create --fill",
            "npx vitest run > test/unit/out.txt 2>&1",
            "echo hi &> test/unit/log.txt",
            "echo 'a > b' | grep a",
            "git diff --stat",
            "git log --oneline -5",
            "git -C . status",
            "git switch -c add-tests",
            "git branch -a",
            "git fetch origin",
            "git push origin HEAD",
            "git config --get user.name",
            "git stash list",
            "gh pr view 2 --comments",
            "gh api repos/o/r/pulls/2/comments",
            "gh pr checks 2",
            "ls test 2>/dev/null",
            "npx playwright test 2>&1 >/dev/null",
            "sed -n '10,40p' src/a.ts",
            "sed -n '/describe/,/^})/p' test/unit/a.test.ts",
            "cat src/a.ts | sed 's/foo/bar/g; s|x;y|z|'",
            "sed -E 's/^/  /' test/a",
            "sed '$d' test/a",
            "sort -u -o test/unit/out.txt test/a",
            "sort -k2 -t, test/a",
            "uniq -c test/a",
            "uniq test/a test/unit/out.txt",
            "rg -n useState src",
            "sed -i 's/a/b/' test/unit/a.test.ts",
            # Redirects are not arguments.
            "mkdir -p test/unit/components 2>/dev/null",
            "git push 2>&1 | tail -5",
            "git status 2>&1",
            # A literal `$`, and text the shell leaves as it is.
            'echo "exit=$?"',
            "grep -n 'foo$' src/a.ts",
            'grep -n "foo$" src/a.ts',
            "sed -n '$p' test/a",
            "cat 'src/routes/posts.$postId.tsx'",
            "git show HEAD@{1}",
            "echo '{a,b}'",
            'echo "{a,b}"',
        ], "allow")


class ShellDenied(CommandCase):
    def test_denied(self):
        self.assert_all([
            "ls & rm -rf src",
            "cat $(rm -rf src)",
            'echo "$(touch src/x)"',
            "echo `touch src/x`",
            "diff <(cat a) test/a",
            "echo hi > src/a.ts",
            "rm -rf src",
            "sed -i s/a/b/ src/a.ts",
            "node -e 'require(\"fs\").writeFileSync(\"src/a\", \"\")'",
            "npm install left-pad",
            "git checkout -- src",
            "git checkout package.json",
            "git restore src/a.ts",
            "git apply fix.patch",
            "git stash",
            "git reset --hard",
            "git clean -fd",
            "echo hi &> src/a.ts",
            "echo hi &>> src/a.ts",
            "echo hi>src/a.ts",
            "echo hi 2>src/a.ts",
            "echo hi >| src/a.ts",
            "cat <> src/a.ts",
            "git switch main",
            "git checkout main",
            "git checkout -b fix origin/main",
            "git pull",
            "git merge main",
            "git rebase main",
            "git cherry-pick abc123",
            "git -c alias.pwn='!touch src/pwn' pwn",
            "git --work-tree=src checkout HEAD -- .",
            "git config core.hooksPath test/hooks",
            "git pwn",
            "gh pr checkout 3",
            "gh alias set x --shell 'touch src/a'",
            "gh repo clone owner/repo",
            "gh run download 123",
            "echo hi >& src/a.ts",
            "git --git-dir=.git status",
            "rg --pre ./test/x.sh foo src",
            "rg --pre=bash foo test/x.sh",
            "sort -o src/a.ts test/a",
            "sort -uo src/a.ts test/a",
            "sort --output=src/a.ts test/a",
            "uniq test/a src/a.ts",
            "sed -n 'w src/a.ts' test/a",
            "sed 's/a/b/w src/a.ts' test/a",
            "sed -e p -e 'e touch src/x' test/a",
            "sed '1e touch src/x' test/a",
            "sed -f test/script.sed test/a",
            "sed -i.bak s/a/b/ src/a.ts",
            "sed -Ei s/a/b/ src/a.ts",
            "sed -i 's/a/b/w test/x' test/a",
            "rm -rf src 2>/dev/null",
        ], "deny")


class ShellQuoting(CommandCase):
    """A backslash changes where a quote ends. If the hook and the shell disagree
    about that, a second command can hide inside what the hook thinks is a string."""

    def test_denied(self):
        self.assert_all([
            'echo \\" ; rm -rf src ; echo \\"',
            "echo 'a\\' ; rm -rf src ; echo 'b'",
            'echo \\" | xargs rm -rf src ; echo \\"',
            'echo "a\\\\" ; rm -rf src ; echo "b"',
            "echo x > test/a\\ /../../src/x",
            # After an escaped `|`, `&` still starts a new command.
            "echo \\|& rm -rf src",
            # `>|` is one redirect operator, not a redirect and a pipe.
            "cd test && git push >|echo --force origin main",
            "cd test && rm >|echo -rf ../src",
            "cd test && echo x >",
            # A backslash at the end of a line joins it to the next one.
            "git commit -m x \\\n--amend",
            "rm -rf \\\nsrc",
        ], "deny")

    def test_allowed(self):
        self.assert_all([
            'git commit -m "Say \\"hi\\" to the tests"',
            "echo 'it'\\''s fine'",
            'grep -n "a\\\\b" src/a.ts',
            "npx vitest run \\\n  --project unit \\\n  test/unit/a.test.ts",
            "echo x > test/unit/a\\ b.txt",
            "echo hi >| test/unit/out.txt",
            "npx vitest run 2>&1 |& tail -5",
        ], "allow")


class ShellExpansions(CommandCase):
    """The shell rewrites `$…` and `{a,b}` before it runs a command, so the hook
    would be checking text that is not what runs."""

    def test_denied(self):
        self.assert_all([
            "echo -delete; find src $_",
            "echo --force; git push $_ origin main",
            "rm -rf test/x${IFS}src",
            'rm -rf "$HOME/x"',
            "cat $FILE",
            "echo ${PATH}",
            "ls $1",
            "find src $'-delete'",
            'find src $"-delete"',
            "rm -rf test/{../src,x}",
            'rm -rf test/{"../src",x}',
            "git push origin {+HEAD:main,x}",
            "touch test/a{1..3}.ts",
        ], "deny")


class OutOfScopeWrites(CommandCase):
    """Issue #8: commands that write outside the write scope, or run a program of the agent's choice."""

    def test_denied(self):
        self.assert_all([
            # find actions that write a file
            "find . -name x -fls src/app.ts",
            "find . -name x -fprint0 src/app.ts",
            # git options that write a file or run a program
            "git diff --output=src/app.ts",
            "git log --output src/app.ts",
            "git show --output=src/app.ts HEAD",
            "git grep --open-files-in-pager=./test/x.sh foo",
            "git grep -O./test/x.sh foo",
            "git grep -nO foo",
            "git grep --op=./test/x.sh foo",
            # npx running a shell string or another package
            "npx -c 'touch src/x' vitest",
            "npx --call='touch src/x' vitest",
            "npx --package=evil-pkg vitest",
            "npx -p evil-pkg vitest",
            "npx --script-shell=./test/x.sh vitest run",
            # variables that make an allowed program run another one
            "GIT_EXTERNAL_DIFF='touch src/x' git diff",
            "GIT_EDITOR='touch src/x' git commit",
            "GIT_SSH_COMMAND='touch src/x' git fetch",
            "PATH=./test/bin:/usr/bin ls",
            "NODE_OPTIONS='--require ./test/x.js' npx vitest run",
            "CI='1 2' npx vitest run",
            "export GIT_EXTERNAL_DIFF='touch src/x'",
            "export PATH=./test/bin",
            "PATH=./test/bin",
            "unset PATH",
            "printf -v PATH %s ./test/bin",
            # runner options that write outside the write scope
            "npx vitest run --reporter=json --outputFile=src/app.ts",
            "npx vitest run --reporter=json --outputFile src/app.ts",
            "npx vitest run --output-file=src/app.ts",
            "npx vitest run --outputFile.json=src/app.ts",
            "npx vitest run --coverage --coverage.reportsDirectory=src",
            "npx vitest run --root src",
            "npx vitest run -r src",
            "npx vitest run --config src/vitest.config.ts",
            "npx vitest run -c=src/vitest.config.ts",
            "npx vitest run --dir src",
            "npx vitest run --attachmentsDir=src",
            "npx vitest init browser",
            "npm run test:unit -- --outputFile=src/app.ts",
            "npx playwright test --output=src",
            "npx playwright test --output src",
            "npx playwright test -c src/playwright.config.ts",
            "npx playwright test -csrc/playwright.config.ts",
            "npx playwright test -xc src/playwright.config.ts",
            "npx playwright test --config=src/playwright.config.ts",
            "npx playwright test --last-failed-file=src/x.json",
            "npm run test:e2e -- --output=src",
            "npm run test:unit --script-shell=./test/x.sh",
            "npx playwright install chromium",
            # playwright-cli: only the healer's commands, and no files outside the write scope
            "npx playwright-cli screenshot --filename=src/app.png",
            "npx playwright-cli -s=tw-abc123 snapshot --filename=src/app.md",
            "npx playwright-cli -s=tw-abc123 find Save --filename src/x.txt",
            "npx playwright-cli run-code 'page.screenshot()'",
            "npx playwright-cli state-save src/state.json",
            "npx playwright-cli pdf",
            "npx playwright-cli install",
            "npx playwright-cli open https://example.com",
            "npx playwright-cli attach --extension=chrome",
            "npx playwright-cli attach --cdp=http://localhost:9222",
            # programs named by path, which may be files the agent wrote
            "./test/bin/ls",
            "test/tools/cat src/a.ts",
            "npx ./test/bin/vitest run",
            "test/bin/vitest run",
            # rtk subcommands that run another command
            "rtk test rm -rf src",
            "rtk err rm -rf src",
            "rtk proxy rm -rf src",
            "rtk run -c 'rm -rf src'",
            "rtk summary rm -rf src",
            "rtk rm -rf src",
            "rtk sed -i s/a/b/ src/a.ts",
            # relative paths after cd, and git -C
            "cd src && rm -rf test",
            "cd src && echo x > test/a.ts",
            "cd src && sed -i s/a/b/ test/a.ts",
            "cd src && git rm -r test",
            "CI=1 cd src && rm -rf test",
            "cd src; touch test/a.ts",
            "cd test/missing; rm -rf ../x",
            "cd - && rm -rf test",
            "git -C src rm -r test",
            # GNU tools accept shortened long options, and some options carry a path or a program
            "sed --i s/a/b/ src/a.ts",
            "sed --in s/a/b/ src/a.ts",
            "sed --exp='w src/a.ts' test/a",
            "sort --o=src/a.ts test/a",
            "sort --out src/a.ts test/a",
            "sort -S 1 --compress-program=./test/x.sh test/a",
            "sort --compress-prog ./test/x.sh test/a",
            "cp --target-directory=src test/a.ts",
            "cp --t=src test/a.ts",
            "cp -tsrc test/a.ts",
            "mv --target-directory=src test/a.ts",
            "ln -s --target-directory=src test/a.ts",
            "install -s --strip-program=./test/x.sh test/a test/b",
            "uniq --skip-fields 0 test/a src/a.ts",
            "rg --hostname-bin=./test/x.sh --hyperlink-format=default foo",
            "npx playwright-cli attach tw-1 --config=test/cli.json",
        ], "deny")

    def test_allowed(self):
        self.assert_all([
            "RTK_DISABLED=1 CI=1 BASE_URL=http://localhost:5173 npx playwright test test/e2e/a.spec.ts",
            "NO_COLOR=1 FORCE_COLOR=0 npx vitest run",
            "export CI=1",
            "export CI",
            "unset CI",
            "printf '%s\\n' -v",
            "npx vitest run --reporter=json --outputFile=test/unit/report.json",
            "npx vitest run --outputFile.json test/unit/report.json",
            "npx vitest run --config vitest.config.ts --dir test/unit",
            "npx vitest run -c vitest.config.ts",
            "npx vitest run --coverage --coverage.reportsDirectory=test/coverage",
            "npx vitest run -t 'signs in'",
            "npx vitest list",
            "npx vitest related test/unit/a.test.ts",
            "npx playwright test -c playwright.config.ts --output=test/e2e/out",
            "npx playwright test --reporter=line -g 'sign in' -x",
            "npx playwright test -g checkout",
            "npx --yes --no-install vitest run",
            "npx --package=vitest vitest run",
            "npx -p @playwright/test playwright test --list",
            "./node_modules/.bin/vitest run test/unit/a.test.ts",
            "node_modules/.bin/playwright test --list",
            "npm run test:unit -- test/unit/a.test.ts",
            "npm run test:e2e -- test/e2e/sign-in.spec.ts --reporter=line",
            "npx --no-install playwright-cli -s=tw-abc123 snapshot --filename=test/e2e/snap.md",
            "npx --no-install playwright-cli list",
            "find test -name '*.ts' -print",
            "sort --output=test/unit/out.txt test/a",
            "sort --reverse --check test/a",
            "sed --in-place 's/a/b/' test/unit/a.test.ts",
            "sed --expression='s/a/b/' test/a",
            "cp --target-directory=test/unit test/a.ts",
            "cp -t test/unit test/a.ts",
            "rg --hyperlink-format=default foo src",
            # cd, when what follows stays inside the write scope
            "cd test && mkdir -p unit/components",
            "cd test && rm -rf unit/old",
            "cd test/e2e && npx playwright test seed.spec.ts",
            f"cd {REPO} && npx vitest run",
            "cd test && ls",
            # what Cursor's RTK hook turns plain commands into
            "rtk read src/a.ts",
            "rtk read src/a.ts --head-lines 20",
            "rtk ls -la test",
            "rtk grep -rn foo src",
            "rtk find test -name '*.ts'",
            "rtk stat test/setup.ts",
            "rtk wc -l README.md",
            "rtk read README.md --tail-lines 5",
            "RTK_DISABLED=1 sort test/a",
            "rtk git status",
            "rtk vitest run --project unit",
            "rtk playwright test test/e2e/a.spec.ts",
            "rtk npm run test:unit",
        ], "allow")


class GitAndGh(CommandCase):
    """Issue #9: git and gh commands that lose work or change the GitHub repository."""

    def test_git_denied(self):
        self.assert_all([
            "git push --force origin main",
            "git push -f origin main",
            "git push -uf origin HEAD",
            "git push --force-with-lease origin main",
            "git push --force-w origin main",
            "git push origin --delete some-branch",
            "git push --de origin some-branch",
            "git push -d origin some-branch",
            "git push origin :main",
            "git push origin +HEAD:main",
            "git push --mirror",
            "git push --all origin",
            "git push --tags",
            "git push --prune origin",
            "git push https://example.com/x.git HEAD",
            "git push ../other-repo HEAD",
            "git push example.com:x.git HEAD",
            "git push --repo=https://example.com/x.git",
            "git push --receive-pack=./test/x.sh origin HEAD",
            "git push --exec=./test/x.sh origin HEAD",
            "git push --push-option x example.com:x.git HEAD",
            "git fetch --upload-pack=./test/x.sh .",
            "git fetch https://example.com/x.git",
            "git fetch --depth 1 https://example.com/x.git",
            "git fetch origin +main:main",
            "git fetch -f origin main:main",
            "git ls-remote --upload-pack=./test/x.sh .",
            "git ls-remote https://example.com/x.git",
            "git branch -D some-branch",
            "git branch -d some-branch",
            "git branch --delete some-branch",
            "git branch --del some-branch",
            "git branch -vd some-branch",
            "git branch -m old new",
            "git branch -M main",
            "git branch -f main HEAD~3",
            "git branch -C main other",
            "git tag -d v1",
            "git tag --delete v1",
            "git tag -f v1",
            "git tag -af v1 -m x",
            "git reset --soft HEAD~3",
            "git reset --mixed HEAD~1",
            "git reset HEAD~1",
            "git reset main",
            "git commit --amend -m x",
            "git commit --am -m x",
            "git remote set-url origin https://example.com/x.git",
            "git remote add evil https://example.com/x.git",
            "git remote remove origin",
            "git reflog expire --expire=now --all",
            "git reflog delete HEAD@{1}",
            "git checkout -B main",
            "git switch -C main",
        ], "deny")

    def test_git_allowed(self):
        self.assert_all([
            "git status && git add test && git commit -m 'Add tests'",
            "git add -A",
            "git commit -am 'Add tests'",
            "git commit --allow-empty -m x",
            "git commit -m 'Explain why --amend is blocked'",
            "git commit -m --amend",
            "git push",
            "git push origin HEAD",
            "git push -u origin add-tests",
            "git push --set-upstream origin add-tests",
            "git push origin HEAD:refs/heads/add-tests",
            "git push --follow-tags origin HEAD",
            "git push --dry-run origin HEAD",
            "git push --push-option=ci.skip origin HEAD",
            "git push origin v0.1.0",
            "git fetch",
            "git fetch origin",
            "git fetch --prune origin",
            "git fetch origin main",
            "git fetch --all",
            "git fetch --tags",
            "git fetch --depth=1 origin",
            "git ls-remote origin",
            "git ls-remote --heads origin",
            "git branch",
            "git branch -a",
            "git branch -vv",
            "git branch --show-current",
            "git branch add-tests",
            "git branch -u origin/add-tests",
            "git branch --contains HEAD",
            "git branch --merged main",
            "git tag",
            "git tag -l 'v*'",
            "git tag v0.1.0",
            "git tag -a v0.1.0 -m 'First release'",
            "git remote",
            "git remote -v",
            "git remote show origin",
            "git remote get-url origin",
            "git reflog",
            "git reflog show HEAD",
            "git reflog -5",
            "git reset",
            "git reset -q",
            "git reset HEAD",
            "git reset HEAD -- test/unit/a.test.ts",
            "git reset HEAD test/unit/a.test.ts",
            "git reset -- test/unit/a.test.ts",
            "git checkout -b add-tests",
            "git switch -c add-tests",
            "git --no-pager log -3",
            "git diff --output-indicator-new=+ HEAD",
            "git show HEAD:README.md",
            "git grep -n TODO",
            "git grep -e TODO -- test",
            "git grep -E 'a|b' -- test",
        ], "allow")

    def test_gh_denied(self):
        self.assert_all([
            "gh pr merge 1 --squash",
            "gh pr close 1",
            "gh pr edit 1 --title x",
            "gh pr review 1 --approve",
            "gh pr ready 1",
            "gh pr -R o/r merge 1",
            "gh issue delete 1 --yes",
            "gh issue close 1",
            "gh issue edit 1 --title x",
            "gh label delete bug --yes",
            "gh label create x",
            "gh release delete v1 --yes",
            "gh release create v1",
            "gh workflow run ci.yml",
            "gh run cancel 1",
            "gh run rerun 1",
            "gh repo delete o/r --yes",
            "gh repo edit --visibility private",
            "gh api -X DELETE repos/o/r",
            "gh api -XDELETE repos/o/r",
            "gh api repos/o/r -X delete",
            "gh api --method=DELETE repos/o/r",
            "gh api --method PATCH repos/o/r -f private=false",
            "gh api -X PATCH repos/o/r -f private=false",
            "gh api -iX DELETE repos/o/r",
            "gh api repos/o/r/issues -f title=x",
            "gh api repos/o/r/issues -ftitle=x",
            "gh api repos/o/r/issues -F title=x",
            "gh api repos/o/r/issues --field title=x",
            "gh api repos/o/r/issues --raw-field title=x",
            "gh api repos/o/r/issues --input test/body.json",
            "gh api graphql -f query='mutation { x }'",
            "gh api",
            "gh auth status --show-token",
            "gh auth status -t",
            "gh auth token",
            "gh auth login",
            "gh browse",
            "gh secret list",
            "gh gist create test/a.ts",
            "gh pr comment 2 --delete-last --yes",
            "gh issue comment 5 --delete-last",
        ], "deny")

    def test_gh_allowed(self):
        self.assert_all([
            "gh pr create --fill",
            "gh pr create --title 'Add tests' --body 'x'",
            "gh pr view 2 --comments",
            "gh pr list --state open",
            "gh pr diff 2",
            "gh pr status",
            "gh pr checks 2",
            "gh pr comment 2 --body 'done'",
            "gh issue create --title x --body y",
            "gh issue view 5",
            "gh issue list",
            "gh issue comment 5 --body 'done'",
            "gh pr comment 2 --edit-last --body 'done'",
            "gh run list",
            "gh run view 123 --log-failed",
            "gh run watch 123",
            "gh workflow list",
            "gh release list",
            "gh label list",
            "gh search issues 'is:open hook'",
            "gh status",
            "gh repo view",
            "gh auth status",
            "gh api repos/o/r/pulls/2/comments",
            "gh api repos/{owner}/{repo}/pulls",
            "gh api repos/o/r/pulls --paginate --jq '.[].number'",
            "gh api -i repos/o/r",
            "gh api -X GET repos/o/r/issues -f state=open",
            "gh api --method GET search/issues -f q=hook",
            "gh api -H 'Accept: application/vnd.github+json' repos/o/r",
        ], "allow")


class DocumentedCommands(CommandCase):
    """Every command AGENTS.md, the README, and the skills tell the agent to run."""

    def test_allowed(self):
        self.assert_all([
            "RTK_DISABLED=1 npx vitest run --project unit --no-passWithNoTests test/unit/components/SignIn.test.ts",
            "RTK_DISABLED=1 npx vitest run --project integration --no-passWithNoTests test/integration/api/session/route.test.ts",
            "RTK_DISABLED=1 npx playwright test test/e2e/sign-in.spec.ts",
            "RTK_DISABLED=1 npx playwright test test/e2e/sign-in.spec.ts:12 --debug=cli",
            "npx --no-install playwright-cli attach tw-abc123",
            "npx --no-install playwright-cli -s=tw-abc123 pause-at test/e2e/sign-in.spec.ts:14",
            "npx --no-install playwright-cli -s=tw-abc123 snapshot",
            'npx --no-install playwright-cli -s=tw-abc123 find "Sign in"',
            "npx --no-install playwright-cli -s=tw-abc123 generate-locator e3",
            "npx --no-install playwright-cli -s=tw-abc123 click e3",
            "npx --no-install playwright-cli -s=tw-abc123 fill e5 ada@example.com",
            "npx --no-install playwright-cli -s=tw-abc123 step-over",
            "npx --no-install playwright-cli -s=tw-abc123 resume",
            "npx --no-install playwright-cli -s=tw-abc123 detach",
            "npm run test:unit",
            "npm run test:integration",
            "npm run test:e2e",
            "npm run test:e2e:list",
            "BASE_URL=http://localhost:5173 npm run test:e2e",
            # The README promises commit, push to a new branch, and a pull request.
            "git switch -c add-tests",
            "git add test",
            "git commit -m 'Add sign-in tests'",
            "git push -u origin add-tests",
            "gh pr create --fill",
        ], "allow")


class IgnoredReads(CommandCase):
    """Shell reads of .cursorignore paths are denied, because Cursor cannot block them itself."""

    def test_denied(self):
        self.assert_all([
            "cat package-lock.json",
            "head -50 package-lock.json",
            "grep react package-lock.json",
            "rtk grep -n version ./package-lock.json",
            "sed -n 1,20p package-lock.json",
            "cat node_modules/vitest/package.json",
            "tail coverage/lcov.info",
            "wc -l src/a.ts dist/main.js",
            "cat apps/web/.next/server/app.js",
            "grep -f package-lock.json src",
            "grep --file=package-lock.json src",
            "grep --regexp=react package-lock.json",
            "grep -ereact package-lock.json",
            "grep -rne react package-lock.json",
            "rg -e react -- package-lock.json",
            "rg --file package-lock.json src",
            "cat < package-lock.json",
            "rtk read package-lock.json",
            "rtk read src/a.ts package-lock.json",
            "rtk read package-lock.json --head-lines 5",
            "sed -n --exp=p package-lock.json",
            "cd node_modules && cat vitest/package.json",
        ], "deny")

    def test_allowed(self):
        self.assert_all([
            "cat package.json",
            "grep -rn dist src",
            "grep -e package-lock.json README.md",
            "sed -n 1,20p test/e2e/seed.spec.ts",
            "cat test-results/sign-in/error-context.md",
            "ls node_modules/.bin",
            "npx vitest run",
            "grep --regexp=package-lock.json README.md",
            "grep -rn -e dist -e build src",
            "rg -g '!*.test.ts' useState src",
            "rg -tts --pretty useState src",
            "rtk read package.json",
        ], "allow")


class EditTools(unittest.TestCase):
    def test_write_scope(self):
        self.assertEqual(tool("Write", "test/unit/a.test.ts"), "allow")
        self.assertEqual(tool("Write", "README.md"), "allow")
        self.assertEqual(tool("Write", ".cursor/skills/x/SKILL.md"), "allow")
        self.assertEqual(tool("Write", "src/a.ts"), "deny")
        self.assertEqual(tool("Write", "test/../src/a.ts"), "deny")
        self.assertEqual(tool("Write", ".cursor/hooks/guard-test-writes.py"), "deny")
        self.assertEqual(tool("Write", "package.json"), "deny")

    def test_write_scope_ignores_shell_syntax(self):
        # Tool paths are not run through a shell, so `$` and braces are literal.
        self.assertEqual(tool("Write", "test/unit/routes/posts.$postId.test.ts"), "allow")

    def test_read_tool_passes(self):
        self.assertEqual(tool("Read", "src/a.ts"), "allow")


if __name__ == "__main__":
    unittest.main()
