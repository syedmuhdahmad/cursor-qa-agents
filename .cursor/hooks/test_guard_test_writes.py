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
        ]:
            with self.subTest(command=command):
                self.assertEqual(shell(command), "deny")


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
