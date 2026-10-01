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


class ShellAllowed(unittest.TestCase):
    def test_allowed(self):
        for command in [
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
            "git reset HEAD~1",
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
        ]:
            with self.subTest(command=command):
                self.assertEqual(shell(command), "allow")


class ShellDenied(unittest.TestCase):
    def test_denied(self):
        for command in [
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
        ]:
            with self.subTest(command=command):
                self.assertEqual(shell(command), "deny")


class IgnoredReads(unittest.TestCase):
    """Shell reads of .cursorignore paths are denied, because Cursor cannot block them itself."""

    def test_denied(self):
        for command in [
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
        ]:
            with self.subTest(command=command):
                self.assertEqual(shell(command), "deny")

    def test_allowed(self):
        for command in [
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
        ]:
            with self.subTest(command=command):
                self.assertEqual(shell(command), "allow")


class EditTools(unittest.TestCase):
    def test_write_scope(self):
        self.assertEqual(tool("Write", "test/unit/a.test.ts"), "allow")
        self.assertEqual(tool("Write", "README.md"), "allow")
        self.assertEqual(tool("Write", ".cursor/skills/x/SKILL.md"), "allow")
        self.assertEqual(tool("Write", "src/a.ts"), "deny")
        self.assertEqual(tool("Write", "test/../src/a.ts"), "deny")
        self.assertEqual(tool("Write", ".cursor/hooks/guard-test-writes.py"), "deny")
        self.assertEqual(tool("Write", "package.json"), "deny")

    def test_read_tool_passes(self):
        self.assertEqual(tool("Read", "src/a.ts"), "allow")


if __name__ == "__main__":
    unittest.main()
