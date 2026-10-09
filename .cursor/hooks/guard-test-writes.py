#!/usr/bin/env python3
"""Deny agent edits outside tests, repo metadata, skills, and agents.

Cursor runs this hook before every tool call (preToolUse) and every shell
command (beforeShellExecution); see .cursor/hooks.json. It reads one JSON
payload on stdin and prints {"permission": "allow" | "deny", ...} on stdout.

Write tools are allowed only when every target path is inside the write scope,
or is one of the files Cursor writes for itself (see is_cursor_file). A tool
the hook does not know is treated as a write tool when its input carries a
path together with content.

A write under test/ must also follow the naming rules (see path_problem) and
may not add text that hides a failing test (see content_problem). Cursor sends
the whole new file with every edit, so the new text is compared with the file
on disk and only an increase is denied.

Shell commands are split into segments and pipeline stages, and each stage
must be a test runner, a known read-only program, an allowed git or gh
command, or a file operation whose targets are all inside the write scope.
Every command must start in the project root and leave the shell there.
Test runs must name a file under test/ and may not watch, open a window,
retry, or update snapshots. The shell may not write file content under test/,
because only a write tool goes through the content rules.
Anything the hook cannot classify is denied.

MCP tool calls reach the hook as preToolUse with a tool name that starts with
`MCP:`, and as beforeMCPExecution. A few tools are denied by name, and a file
an MCP tool names must be inside the write scope (see mcp_problem). Every
other MCP tool passes.

Every deny carries a message that names the cause and what to do instead.

The hook reads command lines. It cannot see what a test does once a runner
starts it, so it is a guardrail and not a sandbox.
"""

import fnmatch
import json
import os
import re
import shlex
import sys
from pathlib import Path

# Repository root: this file lives at <repo>/.cursor/hooks/.
REPO = Path(__file__).resolve().parents[2]


def real(path):
    """path with symlinks resolved, or path as it is when it runs through a symlink loop.

    Before Python 3.13 resolve() raises on a loop. The write scope below is
    built when the hook starts, so a loop there must not stop the hook.
    """
    try:
        return path.resolve()
    except (OSError, RuntimeError):
        return path


# Write scope. Keep AGENTS.md and WRITE_SCOPE in step with these.
ALLOWED_FILES = {
    real(REPO / "vitest.config.ts"),
    real(REPO / "playwright.config.ts"),
    real(REPO / ".gitignore"),
    real(REPO / "AGENTS.md"),
}
ALLOWED_DIRS = (
    real(REPO / "test"),
    real(REPO / ".cursor" / "skills"),
    real(REPO / ".cursor" / "agents"),
)
# Root README, matched case-insensitively.
ROOT_README_NAMES = {"readme", "readme.md"}
# Human-readable write scope used in deny messages.
WRITE_SCOPE = (
    "test/, vitest.config.ts, playwright.config.ts, README.md, .gitignore, "
    "AGENTS.md, .cursor/skills/, and .cursor/agents/"
)
# Agent tool names that create, change, or delete files.
WRITE_TOOLS = {
    "Write",
    "StrReplace",
    "Delete",
    "EditNotebook",
    "Edit",
    "ApplyPatch",
    "MultiEdit",
    "NotebookEdit",
}
# The tool that removes a file. It is held to the write scope and to nothing else.
DELETE_TOOL = "Delete"
# The tool that carries a patch. The files the patch names are checked too.
PATCH_TOOL = "ApplyPatch"
# A line of a patch that names the file it changes.
PATCH_TARGET = re.compile(r"^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+)$", re.M)
# Keys in a tool's input that name a target file.
PATH_KEYS = {
    "path",
    "file_path",
    "filepath",
    "target_file",
    "notebook_path",
    "target_notebook",
    "file",
}
# Keys in a tool's input that hold text to write. Cursor's Write sends `content`.
CONTENT_KEYS = {"content", "contents", "new_string", "new_str", "text"}
# Keys that hold the text an edit replaces. Cursor does not send them, because
# it sends the whole new file. A tool that sends a fragment is compared with
# the fragment it replaces, not with the file on disk.
OLD_CONTENT_KEYS = {"old_string", "old_str"}

# The folder the tests live in. The naming and content rules apply under it.
TEST_DIR = ALLOWED_DIRS[0]
# Files that hold test code. Only these are checked for forbidden text, so a
# plan in Markdown or a mobile flow in YAML may mention any of it.
TEST_CODE_SUFFIXES = (".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs")
# Files under test/ are plain TypeScript. A test builds elements with createElement.
JSX_SUFFIXES = (".tsx", ".jsx")
# Folder names from other test layouts. `__tests__` is denied anywhere under
# test/. `tests` and `specs` are denied directly under test/ and anywhere under
# test/e2e/, but not under test/unit/ or test/integration/, where folders
# mirror the source tree and a route may be named `specs`.
FOREIGN_TEST_FOLDER = "__tests__"
FOREIGN_FOLDERS = {"tests", "specs"}
# The one name a page class may have, directly in test/e2e/pages/.
PAGE_CLASS_NAME = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*-page\.ts")
# A file name elsewhere under test/e2e/ that says it is a page class:
# sign-in-page.ts, sign-in.page.ts, sign_in_page.ts, or SignInPage.ts.
PAGE_CLASS_LIKE = re.compile(r".*(?:[-._]page|Page)\.[cm]?[jt]s")
# The two folders that hold plans, as parts below test/.
PLAN_FOLDERS = (("e2e", "plan"), ("mobile", "plan"))
PLAN_SUFFIX = ".plan.md"
# A placeholder copied from documentation as it is, such as <file> or
# <unit|integration>. No dot or slash, so `sort <a.txt >b.txt` is not one.
PLACEHOLDER = re.compile(r"<[A-Za-z][A-Za-z0-9_|-]*(?: [A-Za-z0-9_|-]+)*>")
# The stand-in the skills print for the session name of a paused test.
SESSION_PLACEHOLDER = "tw-XXXXXX"
# How much of the file on disk a write is compared with.
MAX_COMPARED_BYTES = 10 * 1024 * 1024
# A test function: it, test, describe, suite, or bench, or a name built on one
# such as test.describe. A call of the same name on anything else is the
# product's own method, as in `validation.fails()` or `player.skip()`.
TEST_FUNCTION = r"(?<![\w.$])(?:it|test|describe|suite|bench)(?:\.\w+)*"


def call_pattern(method):
    """A pattern for `.method(` called on a test function: it.skip(, test.describe.skip(, and the like."""
    return re.compile(TEST_FUNCTION + re.escape("." + method + "("))


# The line that must sit directly above test.fixme( in a spec.
FIXME_MARKER = "// product bug:"
FIXME = call_pattern("fixme")
# Plain text that every match of FIXME holds. See content_problem().
FIXME_TEXT = ".fixme("
# Text a write under test/ may not add. Each entry is (name shown to the
# agent, plain text that every match holds, pattern, True when it applies
# only under test/e2e/, what to do instead). The match is on plain text: the
# same text inside a comment or a string counts too. That keeps the rule easy
# to predict, and a comment does not need to spell out `it.only(`. The last
# three are Playwright calls, and `force: true` is also a normal option of
# fs.rm in an integration test, so they are checked under test/e2e/ only.
# test.fixme( has its own rule, see content_problem().
ADVICE_ONLY = "To run one test, pass its file to the test command."
ADVICE_REPORT = "If the product is wrong, leave the test failing and report the bug."
ADVICE_SKIP = "A skipped test counts as a failure. " + ADVICE_REPORT
ADVICE_FAILS = "It makes a failing test count as passed. " + ADVICE_REPORT
ADVICE_WAIT = "Wait for what the user sees, as in `await expect(locator).toBeVisible()`."
ADVICE_FORCE = (
    "It acts on an element a user cannot reach. Fix the locator, or wait until the element is ready, as in "
    "`await expect(locator).toBeEnabled()`."
)
FORBIDDEN_TEXT = (
    (".only(", ".only(", call_pattern("only"), False, ADVICE_ONLY),
    (".skip(", ".skip(", call_pattern("skip"), False, ADVICE_SKIP),
    (".todo(", ".todo(", call_pattern("todo"), False, ADVICE_SKIP),
    ("skipIf(", "skipIf(", re.compile(re.escape("skipIf(")), False, ADVICE_SKIP),
    ("runIf(", "runIf(", re.compile(re.escape("runIf(")), False, ADVICE_SKIP),
    (".fails(", ".fails(", call_pattern("fails"), False, ADVICE_FAILS),
    ("test.fail(", "test.fail(", re.compile(re.escape("test.fail(")), False, ADVICE_FAILS),
    ("waitForTimeout(", "waitForTimeout(", re.compile(re.escape("waitForTimeout(")), True, ADVICE_WAIT),
    ("networkidle", "networkidle", re.compile("networkidle"), True, ADVICE_WAIT),
    ("force: true", "force", re.compile(r"force\s*:\s*true"), True, ADVICE_FORCE),
)

# Environment variables a command may set, export, or unset. Any other name is
# denied: PATH, GIT_EXTERNAL_DIFF, GIT_SSH_COMMAND, NODE_OPTIONS, and the like
# make an allowed program run a different one.
ALLOWED_ENV = {"BASE_URL", "CI", "FORCE_COLOR", "NO_COLOR", "PLAYWRIGHT_HTML_OPEN", "RTK_DISABLED"}
# Values those variables may take: no spaces, quotes, or shell syntax.
SAFE_ENV_VALUE = re.compile(r"[A-Za-z0-9._:/@%+=,-]*")
# BASE_URL points the end-to-end tests at an app. It may only name this
# machine: a port and a path are optional, a user name or another host is not.
LOCAL_URL = re.compile(r"https?://(?:localhost|127\.0\.0\.1)(?::[0-9]{1,5})?(?:/[A-Za-z0-9._/-]*)?")
# `sleep` takes one whole number of seconds, up to this many.
MAX_SLEEP = 30
# `playwright test --repeat-each` may be at most this.
MAX_REPEAT_EACH = 5
# A leading `NAME=value` or `NAME+=value` word.
ASSIGNMENT = re.compile(r"([A-Za-z_][A-Za-z0-9_]*)\+?=(.*)", re.S)
# Programs that cannot write files. sed, sort, uniq, printf, export, and unset
# can write files or change what later commands run, so they have their own
# checks in atomic_allowed(). So does cd, which is not listed here.
READ_ONLY = {
    "ls",
    "cat",
    "head",
    "tail",
    "pwd",
    "echo",
    "printf",
    "which",
    "whereis",
    "type",
    "file",
    "stat",
    "wc",
    "true",
    "false",
    "rg",
    "grep",
    "cut",
    "sort",
    "uniq",
    "tr",
    "basename",
    "dirname",
    "realpath",
    "readlink",
    "test",
    "[",
    ":",
}
# The test runners, by the name of their program in node_modules/.bin.
RUNNERS = {"vitest", "playwright", "playwright-cli"}
# package.json scripts the agent may run.
NPM_TEST_SCRIPTS = {
    "test:unit",
    "test:integration",
    "test:e2e",
    "test:e2e:list",
}
# npx options that only control installation and output.
NPX_FLAGS = {"--no-install", "--yes", "-y", "--no", "--quiet", "-q"}
# Packages `npx --package` may name.
RUNNER_PACKAGES = {"vitest", "playwright", "@playwright/test", "@playwright/cli"}
# vitest options whose value is a path the runner writes to or loads from,
# lower-cased with dashes removed. `--outputFile.<reporter>` matches by prefix.
VITEST_PATH_OPTIONS = {
    "root",
    "config",
    "dir",
    "outputfile",
    "attachmentsdir",
    "fsmodulecachepath",
    "coverage.reportsdirectory",
    "coverage.htmldir",
}
# vitest short options for --root and --config.
VITEST_PATH_SHORTS = "rc"
# vitest subcommands that never end.
VITEST_WATCH_COMMANDS = {"watch", "dev"}
# `playwright test` options whose value is a path the runner writes to or loads from.
PLAYWRIGHT_PATH_OPTIONS = {"--config", "--output", "--last-failed-file"}
# `playwright test` short options that take a value. A `c` after one of these
# is part of that value, not the short form of --config.
PLAYWRIGHT_VALUE_SHORTS = "gGj"
# `playwright test` long options that take the next word as their value, so
# that word is not a spec path. From `playwright test --help`, version 1.64.
PLAYWRIGHT_VALUE_OPTIONS = {
    "--add-reporter", "--browser", "--config", "--grep", "--grep-invert", "--global-timeout",
    "--workers", "--last-failed-file", "--max-failures", "--output", "--project", "--repeat-each",
    "--reporter", "--retries", "--run-agents", "--shard", "--test-list", "--test-list-invert",
    "--timeout", "--trace", "--tsconfig", "--ui-host", "--ui-port", "--update-source-method",
}
# `playwright test` options that open a window and wait for a person.
PLAYWRIGHT_WINDOW_OPTIONS = {"--ui", "--ui-host", "--ui-port", "--headed"}
# `playwright test` options that make a failing or slow test pass.
PLAYWRIGHT_MASKING_OPTIONS = {"--retries", "--timeout"}
# playwright-cli commands the healer uses to inspect a test paused by `--debug=cli`.
# `detach` is not one of them: it leaves the test paused, with no command to end it.
PLAYWRIGHT_CLI_COMMANDS = {
    "attach", "list",
    "pause-at", "resume", "step-over",
    "snapshot", "find", "generate-locator", "console", "requests", "request",
    "click", "dblclick", "fill", "type", "press", "hover", "select", "check", "uncheck",
}
# playwright-cli options whose value is a path the command writes to.
PLAYWRIGHT_CLI_PATH_OPTIONS = {"--filename"}
# playwright-cli options that attach to a browser other than the paused test's,
# or load another configuration.
PLAYWRIGHT_CLI_DENIED_OPTIONS = {"--cdp", "--endpoint", "--extension", "--config"}
# playwright-cli options that name the session of the paused test.
PLAYWRIGHT_CLI_SESSION_OPTIONS = {"-s", "--session"}
# playwright-cli options that take no value. It gives any other option the next
# word as its value, so in `--x snapshot run-code` the command is `run-code`.
PLAYWRIGHT_CLI_FLAGS = {"--all", "-g", "--help", "--json", "--raw", "--version"}
# File operations allowed only when every operand is inside the write scope.
# `install` is left out: its --strip-program option runs a program. `ln` is
# left out: the hook checks a path before the command runs, so it cannot
# follow a link that the same command makes or moves.
MUTATING = {"rm", "mv", "cp", "mkdir", "touch", "tee", "truncate"}
# File operations that take their destination from -t or --target-directory.
TARGET_DIRECTORY_PROGRAMS = {"cp", "mv"}
# Options of the file operations whose value is the next word and is not a
# path the program changes: a mode, a date, a size, or a file it only reads.
# Given as (short letters, long names). The letters take a value in GNU and
# in BSD tools alike. Without this, `mkdir -m 755 test/x` is denied for `755`.
MUTATING_VALUE_OPTIONS = {
    "mkdir": ("m", {"--mode"}),
    "touch": ("dtr", {"--date", "--reference"}),
    "truncate": ("sr", {"--size", "--reference"}),
}
# The backup suffix `sed -i` may take. GNU sed puts the name of the file in
# place of a `*`, so `-i'src/*'` writes the backup into src/.
SED_SUFFIX = re.compile(r"[A-Za-z0-9._~-]*")
# rg options that name a program for rg to run.
RG_PROGRAM_OPTIONS = {"--pre", "--hostname-bin"}
# `rtk <name>` forms that run the program of the same name with the same
# arguments. These are the ones RTK's rewriter produces for allowed programs.
# rtk runs any name it does not know as a command, so nothing else is unwrapped.
RTK_SAME_PROGRAM = {"git", "gh", "ls", "grep", "rg", "find", "wc", "stat", "npm", "npx", "vitest", "playwright"}
# `rtk read` options that take a value.
RTK_READ_VALUE_OPTIONS = {"-l", "--level", "-m", "--max-lines", "--head-lines", "--tail-lines"}
# git options that only affect paging and locking.
GIT_SAFE_GLOBAL_OPTIONS = {"--no-pager", "-P", "--no-optional-locks", "--paginate", "-p"}
# git subcommands allowed with any arguments except `--output`.
GIT_PLAIN = {
    "status", "log", "diff", "show", "blame", "ls-files", "ls-tree", "rev-parse", "rev-list",
    "describe", "shortlog", "cat-file", "merge-base", "name-rev", "for-each-ref", "show-ref",
    "check-ignore", "version", "help", "add",
}
# git subcommands allowed unless they use one of these options, given as
# (long options, short letters, short letters that take a value).
GIT_DENIED_OPTIONS = {
    "grep": (("--open-files-in-pager",), "O", "ABCefm"),
    "commit": (("--amend",), "", "mFCct"),
    "branch": (("--delete", "--move", "--force"), "dDmMfC", "u"),
    "tag": (("--delete", "--force"), "df", "mFu"),
}
# Options allowed on the git commands that talk to a remote. Every other option
# is denied, so each positional argument is known to be a remote or a refspec.
GIT_REMOTE_FLAGS = {
    "push": {
        "-u", "--set-upstream", "-n", "--dry-run", "-q", "--quiet", "-v", "--verbose",
        "--progress", "--follow-tags", "--no-verify", "--atomic", "--porcelain",
    },
    "fetch": {
        "--all", "-p", "--prune", "-t", "--tags", "-n", "--no-tags", "-q", "--quiet",
        "-v", "--verbose", "--progress", "--dry-run", "--unshallow", "--atomic",
    },
    "ls-remote": {
        "-h", "--heads", "--branches", "-t", "--tags", "--refs", "-q", "--quiet",
        "--symref", "--get-url", "--exit-code",
    },
}
# Remote options that take a value, allowed only in the `--option=value` form.
GIT_REMOTE_VALUE_FLAGS = {
    "push": {"--push-option"},
    "fetch": {"--depth", "--deepen", "--shallow-since", "--jobs"},
    "ls-remote": {"--sort"},
}
# git subcommands that change the repository they run in. `cd` and `git -C`
# can point them at another repository, so they must run inside this one.
GIT_CHANGES_REPOSITORY = {
    "add", "commit", "push", "fetch", "tag", "branch", "reset", "restore", "rm", "mv", "checkout", "switch",
}
# A configured remote such as `origin`, as opposed to a URL or a path.
REMOTE_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")
# `git config` may only read. A read is `git config get|list` as the first
# word, one of these options, or one key with no value. Every other option
# must be on the flag lists below, so no word can be the value of an option
# the hook does not know: in `--comment list core.fsmonitor x`, `list` is the
# comment and the command sets core.fsmonitor.
GIT_CONFIG_READ_COMMANDS = {"get", "list"}
GIT_CONFIG_READ_OPTIONS = {"--get", "--get-all", "--get-regexp", "--list", "-l"}
GIT_CONFIG_FLAGS = {
    "--global", "--system", "--local", "--worktree", "--show-origin", "--show-scope", "--name-only",
    "--null", "-z", "--includes", "--no-includes", "--all", "--regexp", "--fixed-value",
    "--bool", "--int", "--bool-or-int", "--path", "--expiry-date", "--no-type",
}
# git config options that take a value, allowed only in the `--option=value` form.
GIT_CONFIG_VALUE_FLAGS = {"--type", "--default", "--value", "--url"}
# A config key such as user.name. A subcommand such as `edit` has no dot.
GIT_CONFIG_KEY = re.compile(r"[A-Za-z0-9][A-Za-z0-9-]*\.(?:.*\.)?[A-Za-z][A-Za-z0-9-]*", re.S)
# git subcommands that take a message from a file, as (long options, short
# letter, short letters that take a value). The file's content is published
# with the commit or tag, so it must be inside the write scope, like a gh body file.
GIT_MESSAGE_FILE_OPTIONS = {
    "commit": (("--file", "--template"), "Ft", "mFCct"),
    "tag": (("--file",), "F", "mFu"),
}
# git subcommands that print file content. A path on the ignore list that one
# of them names is denied, like a path given to cat.
GIT_CONTENT_COMMANDS = {"show", "cat-file", "diff", "log", "blame", "grep"}
# gh commands and the actions the agent may run with each.
GH_ACTIONS = {
    "pr": {"create", "view", "list", "diff", "status", "checks", "comment"},
    "issue": {"create", "view", "list", "status", "comment"},
    "run": {"view", "list", "watch"},
    "workflow": {"view", "list"},
    "release": {"view", "list"},
    "label": {"list"},
    "repo": {"view", "list"},
    "search": {"code", "commits", "issues", "prs", "repos"},
    "auth": {"status"},
}
# gh actions that publish to GitHub, and their options that take a value.
# `--body-file` and `-F` send a file's content, and `--repo` and `-R` choose
# another repository.
GH_POST_ACTIONS = {"create", "comment"}
GH_POST_VALUE_OPTIONS = {
    "--assignee", "--base", "--body", "--body-file", "--head", "--label", "--milestone",
    "--project", "--recover", "--repo", "--reviewer", "--template", "--title",
}
GH_POST_VALUE_SHORTS = "aBbFHlmprtTR"
# `gh api` long and short options that take a value.
GH_API_VALUE_OPTIONS = {
    "--method", "--header", "--field", "--raw-field", "--input",
    "--jq", "--template", "--hostname", "--cache", "--preview",
}
GH_API_VALUE_SHORTS = "XHfFqtp"
# Used when .cursorignore is missing, so the read protection does not turn off silently.
DEFAULT_IGNORE_PATTERNS = ("package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lock", "bun.lockb")
# Programs whose operands are files they read, checked against the ignore list.
READ_FILE_PROGRAMS = {"cat", "head", "tail", "grep", "rg", "wc", "cut", "sort", "uniq", "sed"}
# Programs whose first operand is a pattern or script, not a file.
PATTERN_FIRST = {"grep", "rg", "sed"}
# Short options that take a value. `e` is a pattern or sed script, `f` is a file the program opens.
VALUE_SHORT_OPTIONS = {"grep": "ABCDdefm", "rg": "ABCEefgjMmrTt", "sed": "efl"}
PATTERN_LONG_OPTIONS = {"--regexp", "--expression"}
FILE_LONG_OPTIONS = {"--file"}
# sed commands that only print, delete, or move text in memory.
SED_SAFE_COMMANDS = set("pdnNqQ=lxhHgGDPzF{}")
# find actions that delete, write, or run commands.
FIND_WRITES = {"-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprint0", "-fprintf", "-fls"}
# Characters that make the shell replace a word with the file names it matches.
WILDCARDS = "*?["
# How many directory entries the hook looks at to learn what a wildcard
# matches or what a folder holds. Past that it stops looking and allows the
# read: the ignore list saves context, it does not keep secrets.
MAX_SCANNED_ENTRIES = 20000
# Characters that end a word when they are outside quotes.
WORD_BREAKS = " \t\n;&|()<>"
# The start of the heredoc form Cursor's agent uses for a message of several
# lines: `"$(cat <<'EOF'` and a line break. See inline_message_heredocs().
# Characters the body of that heredoc may not hold: they open or close something for a shell.
MESSAGE_UNSAFE = set("()\"'`$\\")
MESSAGE_HEREDOC = re.compile(r"""\"\$\(cat <<(['"])([A-Za-z_][A-Za-z0-9_]*)\1[ \t]*\n""")

# Maestro (mobile flows). The command line is an allow list: `maestro
# --version`, `maestro check-syntax <flow>`, and `maestro test` with the
# options below and paths under test/mobile/. Everything else is denied,
# because maestro reads more arguments from a file named with `@`, clusters
# short options (`-ceK=V` holds `-c`, which never ends), and has options that
# write or delete folders (`--test-output-dir` removes old folders next to
# its output).
MAESTRO_COMMANDS = {"test", "check-syntax"}
MAESTRO_PLATFORM = re.compile("android|ios")
# Options of `maestro test` that maestro does not accept in front of the command.
MAESTRO_TEST_OPTIONS = {"-e", "--include-tags", "--exclude-tags"}
MAESTRO_DEVICE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]*")
MAESTRO_TAGS = re.compile(r"[A-Za-z0-9_][A-Za-z0-9_.,:-]*")
MAESTRO_ENV = re.compile(r"[A-Za-z_][A-Za-z0-9_]*=.*", re.S)
# maestro reads this file from a folder it is given. Its testOutputDir key
# has the effect of --test-output-dir.
MAESTRO_CONFIG_NAMES = ("config.yaml", "config.yml")
MAESTRO_OUTPUT_KEY = "testOutputDir"

# MCP tool calls. preToolUse names the tool `MCP:<tool>` and sends its
# arguments as an object. beforeMCPExecution sends the bare tool name, the
# arguments as a JSON string, and mcp_server_name.
MCP_PREFIX = "MCP:"
MCP_EVENT = "beforeMCPExecution"
# Cursor's own tool that saves an MCP resource to download_path.
MCP_RESOURCE_TOOL = "FetchMcpResource"
# Characters that can stand between a server name and a tool name.
MCP_NAME_SEPARATORS = "_:./-"
# Keys of an MCP tool's input that name a file the tool writes. Compared in
# lower case with `_` and `-` removed, so outputPath and output_path are one key.
MCP_OUTPUT_KEYS = {
    "filename", "output", "outputpath", "outputfile", "outputdir", "outputdirectory", "outfile", "outdir",
    "savepath", "saveas", "saveto", "downloadpath", "downloaddir", "destination", "destinationpath",
    "dest", "destpath", "targetpath", "targetfile",
}
# Keys that name a file or folder a tool may read or write. Many tools use
# `path` for something that is not a local file to change: a cookie path, a
# URL path, a file in a remote repository. So these are checked only for a
# tool that changes or sends local files: one of MCP_FILE_TOOLS, or a name
# with one of MCP_WRITE_WORDS in it, such as edit_file or create_directory.
MCP_FILE_KEYS = {
    "path", "paths", "file", "files", "filepath", "filepaths", "dir", "directory", "folder",
    "targetfile", "notebookpath", "targetnotebook",
}
# browser_file_upload and browser_drop send local files to the page. run is
# the Maestro tool that runs flow files.
MCP_FILE_TOOLS = {"browser_file_upload", "browser_drop", "run"}
MCP_WRITE_WORDS = {
    "write", "create", "edit", "update", "delete", "remove", "move", "rename", "copy", "save",
    "download", "export", "append", "patch", "replace", "upload", "mkdir", "touch",
}

# Deny messages. The agent sees them, so each names the cause and says what to
# do instead, in one or two short sentences. None holds a placeholder in angle
# brackets: a small model copies those as they are. A command or path to copy
# is set in backticks, so the full stop after it is not copied with it.
VITEST_COMMAND = "`RTK_DISABLED=1 npx vitest run test/unit/components/SignIn.test.ts`"
PLAYWRIGHT_COMMAND = "`RTK_DISABLED=1 npx playwright test test/e2e/sign-in.spec.ts`"
RESUME_COMMAND = "`npx --no-install playwright-cli -s=" + SESSION_PLACEHOLDER + " resume`"
# Last resort, for a stage no check gave a reason for. The tests fail when a
# command they deny gets this message, so every cause keeps its own.
DENY_UNCLASSIFIED = (
    "The hook could not classify this command, so it blocked it. The shell can run tests, read files, "
    "and run git and gh. Run one simple command at a time."
)
DENY_NUL = (
    "The command contains a NUL character, which no command or path can hold. Remove it and run the "
    "command again."
)
DENY_QUOTE = "The command has a quote that is not closed. Close it and run the command again."
DENY_PLACEHOLDER = (
    "The command still has the placeholder {placeholder}. Replace it with the real value and run the "
    "command again."
)
DENY_SESSION_PLACEHOLDER = (
    SESSION_PLACEHOLDER + " is a placeholder for the session name. Read the output of the --debug=cli run, "
    "find the line with `playwright-cli attach`, and use the name after `attach`."
)
DENY_HEREDOC = (
    "The shell cannot use a heredoc (<<). Write the file with the file edit tool. For a commit message "
    "with several paragraphs, pass -m once for each paragraph."
)
DENY_SHELL_WRITE = (
    "The shell cannot write `{target}`. Files under test/ are written with the file edit tool, not with a "
    "redirect, heredoc, tee, sed -i, or cp. {hint}"
)
# What to do instead of each kind of shell write, added to DENY_SHELL_WRITE.
HINT_PIPE = "To keep the output of a command short, end the command with `2>&1 | tail -40`."
HINT_COPY = "Read the file you want to copy, then write the new file with the file edit tool."
HINT_REWRITE = "Read the file, then write it again with the change, using the file edit tool."
DENY_REDIRECT = (
    "The shell cannot write to `{target}`. " + HINT_PIPE
    + " To create or change a file under test/, use the file edit tool."
)
DENY_REDIRECT_EMPTY = (
    "The hook cannot tell which file a redirect (>) in this command writes to. Remove the redirect. "
    + HINT_PIPE
)
DENY_OUTSIDE = "{program} may only change paths inside " + WRITE_SCOPE + ". `{path}` is outside. {hint}"
# What to do instead, added to DENY_OUTSIDE and to the message of a write tool.
HINT_REPORT = "If that file is wrong, do not change it: tell the user what is wrong."
HINT_TEST_FOLDERS = (
    "Tests go in test/unit/, test/integration/, or test/e2e/, such as `test/unit/components/SignIn.test.ts`."
)
DENY_NO_PATH = "{program} needs a path inside the write scope, such as `test/unit/components`."
DENY_UNKNOWN_PROGRAM = (
    "`{program}` is not available. The shell can only run tests, read files (ls, cat, grep, head, tail), "
    "and run git and gh."
)
# What to do instead, added to DENY_UNKNOWN_PROGRAM for the programs a model reaches for most.
HINT_NETWORK = (
    "You do not need to check the app: the browser tool or the test run reports a connection error "
    "when the app is not running."
)
HINT_PROCESS = (
    "A test run ends by itself. To end a paused debug run, use resume, as in " + RESUME_COMMAND
    + " with the session name that run printed."
)
HINT_SCRIPT = "To run code, write it in a test file under test/ and run that file with the test command."
HINT_WRAPPER = "It runs another command, which the hook cannot check. Run that command on its own."
HINT_EDIT = "To create or change a file under test/, use the file edit tool."
HINT_LINK = (
    "The hook checks a path before the command runs, so it cannot follow a link the command makes. To have "
    "the same content in two places, write the second file with the file edit tool."
)
HINT_DEVICE = (
    "The user starts the device and installs the app. If no device is connected, stop and tell the user "
    "to start one."
)
PROGRAM_HINTS = {
    program: hint
    for hint, programs in (
        (HINT_NETWORK, "curl wget nc ncat netcat telnet ping lsof ss netstat"),
        (HINT_PROCESS, "kill pkill killall ps pgrep jobs fg bg"),
        (HINT_SCRIPT, "node nodejs deno bun tsx ts-node python python3 ruby perl bash sh zsh"),
        (HINT_WRAPPER, "xargs env timeout nohup nice time exec eval source . command builtin sudo watch"),
        (HINT_EDIT, "awk gawk patch dd install rsync vi vim nano ed chmod chown"),
        (HINT_LINK, "ln link symlink"),
        (HINT_DEVICE, "adb xcrun emulator avdmanager sdkmanager simctl idb"),
    )
    for program in programs.split()
}
# Words that start a compound command, which the hook does not read.
SHELL_KEYWORDS = {
    "if", "then", "elif", "else", "fi", "for", "while", "until", "do", "done", "case", "esac",
    "select", "function", "coproc", "!", "[[", "{", "}",
}
DENY_COMPOUND = (
    "The shell runs simple commands only, joined with &&, ;, or |. It cannot use if, for, while, "
    "( ) groups, or { } groups. Run each command on its own."
)
DENY_SLEEP = "sleep takes one whole number of seconds from 1 to " + str(MAX_SLEEP) + ", such as `sleep 5`."
DENY_BASE_URL = (
    "BASE_URL must name the app on this machine, such as `BASE_URL=http://localhost:3000` or "
    "`BASE_URL=http://127.0.0.1:3000`."
)
DENY_SED = (
    "sed may only print or filter lines, such as `sed -n '10,40p' src/a.ts`. Its script may not write a file "
    "or run a command, and -f is not allowed. To change a file under test/, use the file edit tool."
)
DENY_RG = "rg may not use --pre or --hostname-bin, because they run another program. Search without them."
DENY_SORT = (
    "sort may write only inside the write scope with -o, and may not use --compress-program. "
    "Leave the option out and read the sorted lines from the output."
)
DENY_UNIQ = (
    "uniq may write its second file only inside the write scope. Pass one input file and read the "
    "result from the output."
)
DENY_PRINTF = "printf -v sets a shell variable, which is not allowed. Print the text without -v."
DENY_FIND = (
    "find may only list files. -delete, -exec, -ok, -fprint, and -fls are not allowed. "
    "To delete a file under test/, use rm with its path."
)
DENY_SUBSTITUTION = (
    "Shell commands cannot use $(...), backticks, or process substitution. Run each command on its own. "
    "For a commit message with several paragraphs, pass -m once for each paragraph."
)
DENY_VARIABLE = (
    "Shell commands cannot use $VARIABLE expansions, because the hook cannot see what they become. "
    "Write the value out. To pass a literal $, put it in single quotes."
)
DENY_BRACES = "Shell commands cannot use brace expansion such as {a,b}. Write each word out."
DENY_WILDCARD = (
    "A word that starts with a wildcard, or an option with a wildcard in its name, can expand to a file name "
    "that the program reads as an option. Start the pattern with ./ or put it in quotes."
)
DENY_ENV = (
    "A command may set only these variables, to plain values: " + ", ".join(sorted(ALLOWED_ENV)) + "."
)
DENY_PROGRAM_PATH = (
    "Run programs by name, not by path. Only node_modules/.bin/vitest, playwright, and playwright-cli "
    "may be run by path."
)
DENY_RTK = (
    "Only these rtk commands are allowed: read, " + ", ".join(sorted(RTK_SAME_PROGRAM)) + ". "
    "Any other rtk command runs whatever follows it. To run a command without rtk, start it with RTK_DISABLED=1."
)
DENY_NPM = "npm may only run these scripts: " + ", ".join(sorted(NPM_TEST_SCRIPTS)) + ". Put runner arguments after `--`."
DENY_NPX = (
    "npx may only run vitest, playwright, or playwright-cli. It cannot use -c, and --package must name one of them."
)
DENY_VITEST_RUN = (
    "A Vitest run is `vitest run` and then the test file, as in " + VITEST_COMMAND + ". "
    "Without `run` right after `vitest`, the run can wait for file changes and never end."
)
DENY_VITEST_WATCH = (
    "Watch mode never ends, so `watch`, `--watch`, and `-w` are not allowed. Run the file once, as in "
    + VITEST_COMMAND + "."
)
DENY_VITEST_UI = (
    "`--ui` opens a page and waits for a person, so it is not allowed. Run the file once, as in "
    + VITEST_COMMAND + "."
)
DENY_VITEST_UPDATE = (
    "`-u` and `--update` rewrite snapshots, so a wrong result would pass. Run without it. "
    "If a snapshot is wrong, fix the test or report the bug."
)
DENY_VITEST_PATH = (
    "Give the full path of a test file under test/, as in " + VITEST_COMMAND + ". "
    "A name alone, or no path, runs other files too."
)
DENY_PLAYWRIGHT_COMMAND = (
    "playwright may only run tests, as in " + PLAYWRIGHT_COMMAND + ". "
    "If a browser is missing, tell the user to run `npx playwright install`."
)
DENY_PLAYWRIGHT_WINDOW = (
    "`{option}` opens a window and waits for a person, so it is not allowed. Run the spec without it, as in "
    + PLAYWRIGHT_COMMAND + "."
)
DENY_PLAYWRIGHT_DEBUG = (
    "Use `--debug=cli`, written exactly like that. `{option}` opens the inspector window and waits for a person."
)
DENY_PLAYWRIGHT_MASKING = (
    "`{option}` hides a failing or slow test, so it is not allowed. Run the spec without it. "
    "Then fix the cause in the test, or report the bug."
)
DENY_PLAYWRIGHT_UPDATE = (
    "`{option}` rewrites snapshots, so a wrong page would pass. Run the spec without it. "
    "If a snapshot is wrong, fix the test or report the bug."
)
DENY_PLAYWRIGHT_REPEAT = (
    "`--repeat-each` takes a whole number from 1 to " + str(MAX_REPEAT_EACH) + ", written as `--repeat-each=3`."
)
DENY_PLAYWRIGHT_PATH = (
    "Give the path of a spec under test/, as in " + PLAYWRIGHT_COMMAND + ". "
    "To see the tests without running them, add `--list`."
)
DENY_RUNNER_PATH = (
    "Test runner options that name a file or folder, such as --outputFile, --output, --config, --root, "
    "--dir, and --filename, must point inside " + WRITE_SCOPE + "."
)
DENY_PLAYWRIGHT_CLI = (
    "playwright-cli is limited to these commands, on the test paused by --debug=cli: "
    + ", ".join(sorted(PLAYWRIGHT_CLI_COMMANDS))
    + ". To end the run, use resume."
)
DENY_PLAYWRIGHT_CLI_OPTION = (
    "Put the playwright-cli command right after the session name, and any other option after the command. "
    "`{option}` in front of the command can change which command runs."
)
DENY_DETACH = "Use resume. It ends the run. detach leaves the test paused, with no command to end it."
# Naming rules for files under test/. {path} is the path from the project root.
DENY_TEST_FOLDER = (
    "Do not create a {folder}/ folder. Unit tests go in test/unit/, integration tests in "
    "test/integration/, and specs directly in test/e2e/, such as `test/e2e/sign-in.spec.ts`."
)
DENY_JSX_FILE = (
    "`{path}` is blocked: files under test/ end in .ts, never .tsx or .jsx. Write `{fixed}`, and build "
    "elements with createElement in place of JSX."
)
DENY_PAGE_CLASS = (
    "`{path}` is blocked: a page class is one file directly in test/e2e/pages/, with a lower-case name "
    "that ends in -page.ts, such as `test/e2e/pages/sign-in-page.ts`."
)
DENY_PLAN = (
    "`{path}` is blocked: a plan is one file directly in test/e2e/plan/ or test/mobile/plan/, with a name "
    "that ends in .plan.md, such as `test/e2e/plan/sign-in.plan.md`."
)
DENY_PATH_PLACEHOLDER = (
    "`{path}` still has the placeholder {placeholder}. Replace it with a real name, such as `sign-in`."
)
# Content rules for test code under test/.
DENY_FORBIDDEN_TEXT = "`{path}` is blocked: the new text adds `{token}`. {advice}"
DENY_FIXME_MARKER = (
    "`{path}` is blocked: the new text adds test.fixme( with no product bug line above it. Put a line that "
    "starts with `" + FIXME_MARKER + "` directly above it, such as `" + FIXME_MARKER
    + ' src/components/SignIn.tsx:7 expected "Email or password is incorrect", got "Something went wrong"`. '
    "Use test.fixme( for a product bug only."
)
DENY_FIXME_PLACE = (
    "`{path}` is blocked: the new text adds test.fixme(, which is allowed only in a spec such as "
    "`test/e2e/sign-in.spec.ts`. " + ADVICE_REPORT
)
DENY_GIT = (
    "That git command is not allowed. git may inspect, stage, commit, create a branch or tag, fetch, and "
    "push a branch to a configured remote. It may not force-push, delete or rename a branch or tag, amend, "
    "move HEAD, change remotes, switch branches, write files, or change another repository. "
    "Ask the user to run it."
)
DENY_GH = (
    "That gh command is not allowed. gh may view and list, create a pull request or issue in this "
    "repository, comment on one, and send GET requests with `gh api`. A body file or a pull request template "
    "file must be inside the write scope. Ask the user to run it."
)
DENY_DIRECTORY = (
    "Run every command from the project root, and pass paths from there, such as `test/unit/x.test.ts`. "
    "The hook checks paths against the project root, so a command may not start in another directory "
    "or cd into one."
)
DENY_NO_TARGET = (
    "Edit blocked because the tool call named no file. Name the file to write, inside " + WRITE_SCOPE + "."
)
DENY_SHAPE = "Edit blocked because the hook input had an unexpected shape."
DENY_INTERNAL = (
    "The write guard hook failed on this input, so it blocked the action. Tell the user: this is a bug in "
    ".cursor/hooks/guard-test-writes.py, and the error is in the Hooks output in Cursor."
)
DENY_COMMENT = (
    "The command has a `#` outside quotes, which starts a comment, and the hook does not read comments. "
    "Remove the comment. If the `#` belongs to an argument, put the argument in quotes."
)
DENY_TILDE = (
    "The hook cannot follow `~-`, `~+`, or `~1`, which stand for another directory. Write the path from the "
    "project root, such as `test/unit/x.test.ts`."
)
DENY_HEREDOC_TEXT = (
    "The message inside `$(cat <<'EOF' ...)` may hold only plain text: no quotes, backticks, `$`, `\\`, or "
    "brackets, because shells differ in where such a message ends. Pass the message with -m, once for "
    "each paragraph."
)
DENY_SED_SUFFIX = (
    "The backup suffix after sed -i may hold only letters, digits, dots, and dashes, as in `-i.bak`. "
    "A suffix with / or * puts the backup in another folder."
)
DENY_FILE_COMPILE = (
    "file may not use -C or --compile, which writes a compiled magic file. Name the file to look at, "
    "as in `file test/e2e/a.png`."
)
DENY_GIT_CONFIG = (
    "git config may only read, as in `git config --get user.name` or `git config --list`. It may not set, "
    "unset, or edit a setting, and may not use --file, --blob, or --comment. Ask the user to change the setting."
)
DENY_GIT_MESSAGE_FILE = (
    "git {subcommand} may read its message only from a file inside the write scope, because the message is "
    "published. `{path}` is outside. Pass the message with -m."
)
# Reads of paths on the ignore list. {source} is IGNORE_SOURCE.
DENY_IGNORED = "{path} is {source}. Read package.json or the source instead."
DENY_IGNORED_WILDCARD = (
    "`{pattern}` matches {path}, which is {source}. Name the files to read, without the wildcard."
)
DENY_IGNORED_SEARCH = (
    "A search of `{directory}` also reads {path}, which is {source}. Name the folders to search, as in "
    '`grep -rn "text" src test`.'
)
# Maestro. Every deny ends with the forms that are allowed.
MAESTRO_COMMAND = (
    "`RTK_DISABLED=1 maestro test --platform android --exclude-tags=fixme -e APP_ID=com.example.app "
    "test/mobile/sign-in`"
)
MAESTRO_FORMS = (
    "The allowed forms are `maestro --version`, `maestro check-syntax "
    "test/mobile/sign-in/01-valid-account.flow.yaml`, and " + MAESTRO_COMMAND + ", where --device and "
    "--include-tags= are the only other options."
)
DENY_MAESTRO_AT = (
    "An argument that starts with @ makes maestro read more arguments from a file, which the hook cannot check. "
    + MAESTRO_FORMS
)
DENY_MAESTRO_COMMAND = "`maestro {word}` is not allowed. " + MAESTRO_FORMS
DENY_MAESTRO_DEVICE = "`maestro {word}` is not allowed. " + HINT_DEVICE + " " + MAESTRO_FORMS
DENY_MAESTRO_OPTION = "`{option}` is not allowed with maestro {command}. " + MAESTRO_FORMS
DENY_MAESTRO_ORDER = "`{option}` is an option of `maestro test`, so it goes after the word `test`. " + MAESTRO_FORMS
DENY_MAESTRO_VALUE = "`{option}` needs a value such as `{example}`. " + MAESTRO_FORMS
DENY_MAESTRO_PATH = "`{path}` is not under test/mobile/, and maestro may only read flows there. " + MAESTRO_FORMS
DENY_MAESTRO_NO_PATH = "maestro {command} needs {count} under test/mobile/. " + MAESTRO_FORMS
DENY_MAESTRO_NOTHING = "maestro needs a command. " + MAESTRO_FORMS
DENY_MAESTRO_CONFIG_WRITE = (
    "`{path}` is blocked: the new text adds " + MAESTRO_OUTPUT_KEY + ", which makes maestro write its output "
    "there and delete older folders next to it. Leave that key out."
)
DENY_MAESTRO_CONFIG = (
    "`{path}` sets " + MAESTRO_OUTPUT_KEY + ", which makes maestro write its output there and delete older "
    "folders next to it. Remove that line."
)
# MCP tools that are denied whatever their arguments are, with the reason and what to do instead.
MCP_DENIED_TOOLS = {
    "browser_run_code_unsafe": (
        "`browser_run_code_unsafe` runs code outside the page, where it can change any file, so it is not "
        "allowed. Use the other browser tools, such as browser_click, browser_type, and browser_snapshot."
    ),
    "browser_install": (
        "`browser_install` downloads and installs a browser, so it is not allowed. Stop and tell the user "
        "that the browser is not installed."
    ),
    "open_maestro_viewer": (
        "`open_maestro_viewer` opens a page for a person to watch, so it is not allowed. Read the screen "
        "with inspect_screen."
    ),
}
DENY_MCP_CLOUD = (
    "`{tool}` uses Maestro Cloud, which sends the app or its results to another machine, so it is not "
    "allowed. Run flows on the connected device with the run tool."
)
for _tool in ("run_on_cloud", "list_cloud_devices", "get_cloud_run_status", "describe_cloud_run"):
    MCP_DENIED_TOOLS[_tool] = DENY_MCP_CLOUD.format(tool=_tool)
DENY_MCP_PATH = (
    "`{tool}` may only name files inside " + WRITE_SCOPE + ". `{path}`, given as `{key}`, is outside. {hint}"
)
HINT_MCP_OUTPUT = "Leave `{key}` out to get the result as text, or name a file under test/."
HINT_MCP_FILE = "Name a file under test/."


class Denied(Exception):
    """Raised by a check that can tell the agent why a command is not allowed."""


def emit(permission, message=""):
    """Print the hook decision for Cursor and exit. Shows message to both user and agent."""
    payload = {"permission": permission}
    if message:
        payload["user_message"] = message
        payload["agent_message"] = message
    json.dump(payload, sys.stdout)
    sys.exit(0)


def load_ignore_patterns():
    """The ignore patterns, and where they come from in words for the deny message.

    Reads .cursorignore, skipping blank lines, comments, and `!` negations.
    When the file is missing or cannot be read, the built-in list is used. A
    file that exists is the user's choice, even when it lists no lockfile.
    """
    try:
        lines = (REPO / ".cursorignore").read_text(encoding="utf-8-sig", errors="replace").splitlines()
    except OSError:
        return (
            list(DEFAULT_IGNORE_PATTERNS),
            "on the hook's built-in list of lockfiles, used because .cursorignore is missing or cannot be read",
        )
    patterns = []
    for line in lines:
        line = line.strip()
        if line and not line.startswith(("#", "!")):
            patterns.append(line)
    return patterns, "in .cursorignore (lockfiles, build output, test reports)"


IGNORE_PATTERNS, IGNORE_SOURCE = load_ignore_patterns()


def resolve_path(path_text, cwd=os.curdir):
    """The absolute path a word names, with `~` expanded and symlinks resolved, or None.

    None means the path has no one place on disk: it holds a NUL character or
    text that is not Unicode, or it runs through a symlink loop. Callers treat
    None as outside every scope.
    """
    if "\x00" in path_text:
        return None
    try:
        path = Path(os.path.expanduser(path_text))
        if not path.is_absolute():
            path = Path(cwd) / path
        resolved = path.resolve()
    except (OSError, RuntimeError, ValueError):
        return None
    # Before Python 3.13 resolve() raises on a symlink loop. From 3.13 it
    # returns the path with the loop still in it, so look for a link left over.
    if any(os.path.islink(part) for part in (resolved, *resolved.parents)):
        return None
    return resolved


def matches_ignore(parts, is_directory):
    """True when a path, given as its parts below the project root, is on the ignore list.

    Supports names, globs, `dir/`, and `/anchored` paths. A pattern with a
    slash at its start or in its middle is matched against the whole path
    from the root, as .gitignore does it. Any other pattern is matched
    against every part. is_directory() says whether the path itself is a
    directory: a `dir/` pattern does not match a file of that name.
    """
    text = "/".join(parts)
    for pattern in IGNORE_PATTERNS:
        dir_only = pattern.endswith("/")
        anchored = "/" in pattern.rstrip("/")
        pattern = pattern.strip("/")
        if anchored:
            if text.startswith(pattern + "/"):
                return True
            if fnmatch.fnmatch(text, pattern) and not (dir_only and not is_directory()):
                return True
            continue
        for index, part in enumerate(parts):
            if not fnmatch.fnmatch(part, pattern):
                continue
            if dir_only and index == len(parts) - 1 and not is_directory():
                continue
            return True
    return False


def is_ignored(path_text, cwd):
    """True when a path, resolved against cwd and symlinks, is on the ignore list."""
    resolved = resolve_path(path_text, cwd)
    if resolved is None:
        return False
    try:
        relative = resolved.relative_to(REPO)
    except ValueError:
        return False
    return matches_ignore(relative.parts, resolved.is_dir)


def exists(path_text, cwd):
    """True when a path names something on disk, a dangling link included."""
    resolved = resolve_path(path_text, cwd)
    return resolved is not None and os.path.lexists(resolved)


def scan(directory):
    """The entries of a directory as (name, is a directory) pairs in name order, or [] when it cannot be read.

    A link to a directory does not count as one, so a walk never follows links.
    """
    try:
        with os.scandir(directory) as entries:
            return sorted((entry.name, entry.is_dir(follow_symlinks=False)) for entry in entries)
    except OSError:
        return []


def has_wildcard(word):
    """True when a word holds a character the shell reads as a pattern."""
    return any(char in word for char in WILDCARDS)


def wildcard_matches(pattern, cwd):
    """The paths a shell pattern such as src/*.ts matches, as text, one path part at a time as the shell does it.

    `*` and `?` do not match a leading dot. Stops, with what it has found,
    after looking at MAX_SCANNED_ENTRIES directory entries.
    """
    found = ["/" if pattern.startswith("/") else ""]
    budget = MAX_SCANNED_ENTRIES
    for part in pattern.split("/"):
        if not part:
            continue
        matched = []
        for prefix in found:
            if has_wildcard(part):
                directory = resolve_path(prefix or os.curdir, cwd)
                entries = [] if directory is None else scan(directory)
                budget -= len(entries)
                if budget < 0:
                    return []
                names = [
                    name for name, _ in entries
                    if fnmatch.fnmatchcase(name, part) and (part.startswith(".") or not name.startswith("."))
                ]
            else:
                names = [part]
            matched.extend(os.path.join(prefix, name) for name in names)
        found = matched
    return [path for path in found if exists(path, cwd)]


def ignored_inside(directory_text, cwd):
    """The first path on the ignore list inside a directory, as text from the project root, or "".

    A recursive search reads every file below the directory it is given, so
    `grep -r react .` reads package-lock.json and all of node_modules. The
    walk goes level by level, so what lies at the top is found at once, and
    stops after MAX_SCANNED_ENTRIES entries. A directory above the project
    holds the project, so the walk starts at the project root then.
    """
    resolved = resolve_path(directory_text, cwd)
    if resolved is None or not resolved.is_dir():
        return ""
    start = REPO if resolved in REPO.parents else resolved
    try:
        base = start.relative_to(REPO).parts
    except ValueError:
        return ""
    budget = MAX_SCANNED_ENTRIES
    level = [(start, base)]
    while level:
        deeper = []
        for directory, parts in level:
            for name, is_dir in scan(directory):
                budget -= 1
                if budget < 0:
                    return ""
                below = parts + (name,)
                if matches_ignore(below, lambda value=is_dir: value):
                    return "/".join(below)
                # .git holds no path on the ignore list, and it is large.
                if is_dir and name != ".git":
                    deeper.append((directory / name, below))
        level = deeper
    return ""


def ignored_operand(operand, cwd):
    """Why reading this operand reads a path on the ignore list, as a deny message, or "".

    The shell replaces a word with a wildcard by the names it matches, so
    `cat package-lock.jso?` reads package-lock.json. The hook looks up what
    the pattern matches on disk.
    """
    if is_ignored(operand, cwd):
        return DENY_IGNORED.format(path=operand, source=IGNORE_SOURCE)
    if has_wildcard(operand):
        for match in wildcard_matches(operand, cwd):
            if is_ignored(match, cwd):
                return DENY_IGNORED_WILDCARD.format(pattern=operand, path=match, source=IGNORE_SOURCE)
    return ""


def abbreviates(name, option):
    """True when name is option, or a prefix of it such as `--out` for `--output`.

    GNU tools and git accept any unambiguous prefix of a long option, so a
    check for the full spelling alone is not enough.
    """
    return len(name) > 2 and option.startswith(name)


def parse_pattern_command(tokens):
    """Split a grep, rg, or sed command into (patterns, files named by -f, other operands).

    Handles `-e X`, `-eX`, bundled `-rne X`, `--regexp=X`, and `-f FILE` / `--file=FILE`,
    and shortened long options such as `--exp=X`. Without `-e` or `-f`, the first
    operand is the pattern or script.
    """
    program = os.path.basename(tokens[0])
    value_short = VALUE_SHORT_OPTIONS[program]
    patterns = []
    files = []
    operands = []
    explicit = False
    index = 1
    while index < len(tokens):
        token = tokens[index]
        following = tokens[index + 1] if index + 1 < len(tokens) else ""
        if token == "--":
            operands.extend(tokens[index + 1:])
            break
        if token.startswith("--"):
            name, has_value, value = token.partition("=")
            is_pattern = any(abbreviates(name, option) for option in PATTERN_LONG_OPTIONS)
            if is_pattern or any(abbreviates(name, option) for option in FILE_LONG_OPTIONS):
                explicit = True
                if not has_value:
                    value = following
                    index += 1
                (patterns if is_pattern else files).append(value)
            index += 1
            continue
        if token.startswith("-") and len(token) > 1:
            consumed_next = False
            for position in range(1, len(token)):
                letter = token[position]
                if letter not in value_short:
                    continue
                value = token[position + 1:]
                if not value:
                    value = following
                    consumed_next = True
                if letter == "e":
                    explicit = True
                    patterns.append(value)
                elif letter == "f":
                    explicit = True
                    files.append(value)
                break
            index += 2 if consumed_next else 1
            continue
        operands.append(token)
        index += 1
    if not explicit and operands:
        patterns.append(operands.pop(0))
    return patterns, files, operands


def read_operands(tokens):
    """Files a read command opens, skipping the search pattern or sed script."""
    if os.path.basename(tokens[0]) in PATTERN_FIRST:
        _, option_files, operands = parse_pattern_command(tokens)
        return option_files + operands
    return operand_paths(tokens)


def skip_delimited(script, index, delimiter, count):
    """Skip `count` delimiter-terminated parts starting at index. Returns the next index, or -1."""
    while count:
        while index < len(script) and script[index] != delimiter:
            index += 2 if script[index] == "\\" else 1
        if index >= len(script):
            return -1
        index += 1
        count -= 1
    return index


def sed_script_safe(script):
    """False when a sed script can write a file or run a command (`w`, `W`, `e`, or `s///w|e`).
    Unknown commands are unsafe."""
    index = 0
    while index < len(script):
        char = script[index]
        if char in " \t\n;!" or char.isdigit() or char in "$,~+":
            index += 1
            continue
        if char in "/\\":
            if char == "\\":
                index += 1
                if index >= len(script):
                    return False
            index = skip_delimited(script, index + 1, script[index], 1)
            if index < 0:
                return False
            while index < len(script) and script[index] in "IM":
                index += 1
            continue
        if char in "wWe":
            return False
        if char in "sy":
            if index + 1 >= len(script):
                return False
            index = skip_delimited(script, index + 2, script[index + 1], 2)
            if index < 0:
                return False
            flags_end = index
            while flags_end < len(script) and script[flags_end] not in ";\n}":
                flags_end += 1
            if char == "s" and any(flag in "we" for flag in script[index:flags_end]):
                return False
            index = flags_end
            continue
        if char in "aicrR":
            while index < len(script) and script[index] != "\n":
                index += 1
            continue
        if char in "btT:":
            while index < len(script) and script[index] not in ";\n":
                index += 1
            continue
        if char in SED_SAFE_COMMANDS:
            index += 1
            continue
        return False
    return True


def sed_in_place(tokens):
    """The backup suffix of every in-place option: `-i`, `-i.bak`, bundled `-Ei`, `--in-place=.bak`, or `--i`.

    An empty list means sed does not edit in place. The suffix is the rest of
    the word after `i`, or what follows `=`, and is "" when there is none.
    """
    suffixes = []
    for token in tokens[1:]:
        name, _, value = token.partition("=")
        if abbreviates(name, "--in-place"):
            suffixes.append(value)
        elif token.startswith("-") and not token.startswith("--"):
            for position, letter in enumerate(token[1:], start=1):
                if letter == "i":
                    suffixes.append(token[position + 1:])
                    break
                if letter in VALUE_SHORT_OPTIONS["sed"]:
                    break
    return suffixes


def sed_allowed(tokens, cwd):
    """Deny scripts that write or run commands, `-f` scripts, and in-place edits.

    An in-place edit under test/ is a shell write of test content. Anywhere
    else it must stay inside the write scope, and so must its backup: GNU sed
    reads `*` in the suffix as the file name, so `-i'src/*'` saves the backup
    in src/.
    """
    scripts, script_files, operands = parse_pattern_command(tokens)
    if script_files or not all(sed_script_safe(script) for script in scripts):
        raise Denied(DENY_SED)
    suffixes = sed_in_place(tokens)
    if suffixes:
        if not operands:
            raise Denied(DENY_SED)
        if not all(SED_SUFFIX.fullmatch(suffix) for suffix in suffixes):
            raise Denied(DENY_SED_SUFFIX)
        deny_shell_write(operands, cwd, HINT_REWRITE)
        deny_outside("sed -i", operands, cwd)
    return True


def sort_allowed(tokens, cwd):
    """`sort -o FILE` writes FILE, and `--compress-program` runs a program."""
    for index, token in enumerate(tokens[1:], start=1):
        following = tokens[index + 1] if index + 1 < len(tokens) else ""
        if token.startswith("--"):
            name, has_value, value = token.partition("=")
            if abbreviates(name, "--compress-program"):
                raise Denied(DENY_SORT)
            if not abbreviates(name, "--output"):
                continue
            target = value if has_value else following
        elif token.startswith("-") and "o" in token:
            position = token.index("o")
            if any(letter in "ktST" for letter in token[1:position]):
                continue
            target = token[position + 1:] or following
        else:
            continue
        if not is_allowed(target, cwd):
            raise Denied(DENY_SORT)
    return True


def uniq_allowed(tokens, cwd):
    """`uniq INPUT OUTPUT` writes OUTPUT.

    A long option may take its value as a separate word, which then looks like
    an operand, so every operand after the first must be inside the write scope.
    """
    operands = []
    index = 1
    while index < len(tokens):
        token = tokens[index]
        if token in {"-f", "-s", "-w"}:
            index += 2
            continue
        if not token.startswith("-"):
            operands.append(token)
        index += 1
    if not all(is_allowed(operand, cwd) for operand in operands[1:]):
        raise Denied(DENY_UNIQ)
    return True


def input_targets(segment):
    """Files the shell would open for reading: `< file`, `<file`, and `<> file`.

    `<<` and `<<<` feed text, not a file, and `<&3` copies a descriptor.
    """
    targets = []
    quote = None
    i = 0
    while i < len(segment):
        char = segment[i]
        if char == "\\" and quote != "'":
            i += 2
            continue
        if quote:
            if char == quote:
                quote = None
            i += 1
            continue
        if char in {"'", '"'}:
            quote = char
            i += 1
            continue
        if char != "<":
            i += 1
            continue
        run = 1
        while segment.startswith("<", i + run):
            run += 1
        i += run
        if run > 1 or segment.startswith(("&", "("), i):
            continue
        if segment.startswith(">", i):
            i += 1
        while i < len(segment) and segment[i] in " \t":
            i += 1
        target, i = read_word(segment, i)
        if target:
            targets.append(target)
    return targets


def grep_recursive(args):
    """True when grep is asked to search folders: -r, -R, --recursive, or `-d recurse`."""
    if has_option(args, ("--recursive", "--dereference-recursive"), "rR", VALUE_SHORT_OPTIONS["grep"]):
        return True
    for index, arg in enumerate(args):
        following = args[index + 1] if index + 1 < len(args) else ""
        name, has_value, value = arg.partition("=")
        if arg.startswith("--"):
            if abbreviates(name, "--directories") and (value if has_value else following) == "recurse":
                return True
        elif arg.startswith("-"):
            for position, letter in enumerate(arg[1:], start=1):
                if letter == "d" and (arg[position + 1:] or following) == "recurse":
                    return True
                if letter in VALUE_SHORT_OPTIONS["grep"]:
                    break
    return False


def ignored_search(directories, cwd):
    """Why a search of these directories reads a path on the ignore list, as a deny message, or ""."""
    for directory in directories:
        places = wildcard_matches(directory, cwd) if has_wildcard(directory) else [directory]
        for place in places:
            found = ignored_inside(place, cwd)
            if found:
                return DENY_IGNORED_SEARCH.format(directory=directory, path=found, source=IGNORE_SOURCE)
    return ""


def ignored_git_read(tokens, cwd):
    """Why a git command that prints file content would print a path on the ignore list, or "".

    Covers a path given as an argument, the path in `<revision>:<path>`, and
    `git grep`, which searches every tracked file below the paths it is given
    and the whole project when it is given none.
    """
    index = 1
    while index < len(tokens) and tokens[index].startswith("-"):
        if tokens[index] == "-C" and index + 1 < len(tokens):
            cwd = os.path.join(cwd, os.path.expanduser(tokens[index + 1]))
            index += 1
        index += 1
    if index >= len(tokens) or tokens[index] not in GIT_CONTENT_COMMANDS:
        return ""
    args = tokens[index + 1:]
    operands = positional(args)
    for operand in operands:
        problem = ignored_operand(operand, cwd)
        # `HEAD:package-lock.json`, `:package-lock.json`, and `:0:package-lock.json` name a path from the root.
        tree_path = re.sub(r"^[0-3]:", "", operand.partition(":")[2])
        if not problem and tree_path:
            problem = ignored_operand(tree_path, cwd)
        if problem:
            return problem
    if tokens[index] != "grep":
        return ""
    if "--" in args:
        places = args[args.index("--") + 1:]
    else:
        # The first operand is the pattern. A later one that exists on disk is a path to search.
        places = [operand for operand in operands[1:] if exists(operand, cwd)]
    return ignored_search(places or [os.curdir], cwd)


def ignored_read(stage, cwd, piped=False):
    """Why a stage would read a path on the ignore list, as a deny message, or "".

    Cursor does not apply .cursorignore to shell commands, so the hook does.
    It covers a file a read program is given, a file fed to any program with
    `<`, a wildcard that matches such a file, a recursive grep or rg over a
    folder that holds one, and a git command that prints one. piped is True
    when the stage reads the output of the stage before it.
    """
    targets = input_targets(stage)
    for target in targets:
        problem = ignored_operand(target, cwd)
        if problem:
            return problem
    try:
        tokens = unwrap_rtk(strip_env(command_words(stage)))
    except ValueError:
        return ""
    if not tokens:
        return ""
    program = tokens[0]
    if program == "git":
        return ignored_git_read(tokens, cwd)
    if program not in READ_FILE_PROGRAMS:
        return ""
    for operand in read_operands(tokens):
        problem = ignored_operand(operand, cwd)
        if problem:
            return problem
    # `rg --files` lists names and reads no file.
    lists_names = program == "rg" and "--files" in tokens
    if (program == "rg" and not lists_names) or (program == "grep" and grep_recursive(tokens[1:])):
        _, _, operands = parse_pattern_command(tokens)
        # With no path, grep -r searches the working directory. rg does too, unless it is given input.
        if not operands and not (program == "rg" and (piped or targets)):
            operands = [os.curdir]
        return ignored_search(operands, cwd)
    return ""


def is_allowed(path_text, cwd):
    """True when a path, resolved against cwd and symlinks, is inside the write scope."""
    resolved = resolve_path(path_text, cwd)
    if resolved is None:
        return False
    if resolved in ALLOWED_FILES:
        return True
    if resolved.parent == REPO and resolved.name.lower() in ROOT_README_NAMES:
        return True
    for directory in ALLOWED_DIRS:
        try:
            resolved.relative_to(directory)
        except ValueError:
            continue
        return True
    return False


def is_cursor_file(path_text, cwd):
    """True for a file Cursor writes for itself with a write tool.

    Cursor saves a tool result that is too long to return as
    ~/.cursor/projects/<project>/agent-tools/<file>, and Plan mode saves
    ~/.cursor/plans/<name>.plan.md. Nothing else under the home directory is
    allowed, and shell commands may not write to these two places either.
    Symlinks are resolved first, so a link kept there cannot point a write
    somewhere else.
    """
    home = os.path.expanduser("~")
    if not os.path.isabs(home):
        return False
    cursor_home = resolve_path(os.path.join(home, ".cursor"))
    resolved = resolve_path(path_text, cwd)
    if cursor_home is None or resolved is None:
        return False
    try:
        parts = resolved.relative_to(cursor_home).parts
    except ValueError:
        return False
    if len(parts) == 2 and parts[0] == "plans":
        return parts[1].endswith(".plan.md")
    return len(parts) == 4 and parts[0] == "projects" and parts[2] == "agent-tools"


def parts_under_test(path_text, cwd):
    """The parts of a path below test/, after resolving symlinks, or None when it is not under test/.

    test/ itself gives an empty tuple, so compare the result with None.
    """
    resolved = resolve_path(path_text, cwd)
    if resolved is None:
        return None
    try:
        return resolved.relative_to(TEST_DIR).parts
    except ValueError:
        return None


def under_test(path_text, cwd):
    """True when a path is test/ or inside it."""
    return parts_under_test(path_text, cwd) is not None


def deny_shell_write(paths, cwd, hint):
    """Raise Denied for the first path under test/ that a shell command would write content to.

    Only a write tool goes through content_problem(), so the shell may not
    put text into a file there. hint says what to do instead.
    """
    for path in paths:
        if under_test(path, cwd):
            raise Denied(DENY_SHELL_WRITE.format(target=path, hint=hint))


def deny_outside(program, paths, cwd, hint=HINT_REPORT):
    """Raise Denied for the first path outside the write scope, naming the program and the path."""
    for path in paths:
        if not is_allowed(path, cwd):
            raise Denied(DENY_OUTSIDE.format(program=program, path=path, hint=hint))


def find_placeholder(words):
    """The first placeholder such as <file> in a list of words, or ""."""
    for word in words:
        match = PLACEHOLDER.search(word)
        if match:
            return match.group()
    return ""


def kebab(name):
    """A name in lower case with its words joined by `-`: `SignInPage` and `sign_in page` give `sign-in-page`."""
    name = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "-", name)
    return re.sub(r"[^A-Za-z0-9]+", "-", name).strip("-").lower()


def page_class_path(name):
    """The path a page class should have, worked out from the file name it was given, or ""."""
    if ".spec." in name or ".test." in name:
        return ""
    words = kebab(name.split(".")[0])
    if words.endswith("-page"):
        words = words[: -len("-page")]
    if not words or words == "page":
        return ""
    return f"test/e2e/pages/{words}-page.ts"


def plan_path(parts):
    """The path a plan should have, worked out from where it was put, or ""."""
    name = parts[-1]
    stem = name[: -len(PLAN_SUFFIX)] if name.endswith(PLAN_SUFFIX) else name[: -len(".md")]
    if not stem:
        return ""
    kind = "mobile" if parts[0] == "mobile" else "e2e"
    return f"test/{kind}/plan/{stem}{PLAN_SUFFIX}"


def path_problem(path_text, cwd):
    """Why a file or folder under test/ has the wrong name or place, or "" when it is fine.

    Used when a file is created or edited and when a folder is created.
    Deleting is never checked, so the agent can remove a file with a wrong name.
    Paths outside test/ are not checked here: the write scope covers them.
    """
    parts = parts_under_test(path_text, cwd)
    if not parts:
        return ""
    name = parts[-1]
    path = "/".join(("test",) + parts)
    placeholder = find_placeholder(parts)
    if placeholder:
        return DENY_PATH_PLACEHOLDER.format(path=path, placeholder=placeholder)
    for index, part in enumerate(parts):
        if part == FOREIGN_TEST_FOLDER or (part in FOREIGN_FOLDERS and (index == 0 or parts[0] == "e2e")):
            return DENY_TEST_FOLDER.format(folder=part)
    if name.endswith(JSX_SUFFIXES):
        return DENY_JSX_FILE.format(path=path, fixed=path[: -len(".tsx")] + ".ts")
    if name.endswith(TEST_CODE_SUFFIXES) and parts[0] == "e2e":
        in_pages = parts[:2] == ("e2e", "pages")
        well_named = len(parts) == 3 and PAGE_CLASS_NAME.fullmatch(name)
        if (in_pages and not well_named) or (not in_pages and PAGE_CLASS_LIKE.fullmatch(name)):
            return with_suggestion(DENY_PAGE_CLASS.format(path=path), page_class_path(name), path)
    if name.endswith(".md"):
        in_plans = parts[:2] in PLAN_FOLDERS
        well_named = len(parts) == 3 and name.endswith(PLAN_SUFFIX) and name != PLAN_SUFFIX
        if (in_plans and not well_named) or (not in_plans and name.endswith(PLAN_SUFFIX)):
            return with_suggestion(DENY_PLAN.format(path=path), plan_path(parts), path)
    return ""


def with_suggestion(message, suggestion, path):
    """message, followed by the path to write instead when one could be worked out."""
    if suggestion and suggestion != path:
        return f"{message} Write `{suggestion}` instead."
    return message


def read_file(path_text, cwd):
    """The text of a file on disk, or "" when it is not a regular file or cannot be read.

    Only the first MAX_COMPARED_BYTES are read, so a huge file cannot hold the
    hook up. Text past that point counts as new, which errs toward a deny.
    """
    resolved = resolve_path(path_text, cwd)
    if resolved is None or not resolved.is_file():
        return ""
    try:
        with open(resolved, "rb") as handle:
            return handle.read(MAX_COMPARED_BYTES).decode("utf-8", errors="replace")
    except OSError:
        return ""


def new_and_old_text(tool_input, targets, cwd):
    """The text a write tool call puts in, and the text it replaces.

    Cursor sends the whole new file, so the text it replaces is the file on
    disk. A tool that sends the replaced fragment (old_string) is compared
    with that fragment.
    """
    texts = []
    collect_strings(tool_input, CONTENT_KEYS, texts)
    replaced = []
    collect_strings(tool_input, OLD_CONTENT_KEYS, replaced)
    if not replaced:
        replaced = [read_file(target, cwd) for target in targets]
    return "\n".join(texts), "\n".join(replaced)


def mobile_config_problem(paths, tool_input, cwd):
    """Why a write to a Maestro config file under test/mobile/ is not allowed, or "".

    The write may not add testOutputDir. See maestro_output_config().
    """
    configs = []
    for target in paths:
        parts = parts_under_test(target, cwd)
        if parts and parts[0] == "mobile" and parts[-1] in MAESTRO_CONFIG_NAMES:
            configs.append((target, parts))
    if not configs:
        return ""
    new, old = new_and_old_text(tool_input, [target for target, _ in configs], cwd)
    if new.count(MAESTRO_OUTPUT_KEY) > old.count(MAESTRO_OUTPUT_KEY):
        return DENY_MAESTRO_CONFIG_WRITE.format(path="/".join(("test",) + configs[0][1]))
    return ""


def unmarked_fixmes(text):
    """How many test.fixme( calls in text have no product bug line directly above them."""
    lines = text.splitlines()
    count = 0
    for index, line in enumerate(lines):
        if not (index and lines[index - 1].lstrip().startswith(FIXME_MARKER)):
            count += len(FIXME.findall(line))
    return count


def content_problem(paths, tool_input, cwd):
    """Why the text of a write to test code under test/ is not allowed, or "".

    Cursor sends the whole new file with every edit. A rule that denied a
    file for holding `.skip(` would also deny every later edit of a file that
    already holds it, so the new text is compared with the file on disk and
    only an increase is denied. A tool that sends the replaced fragment
    (old_string) is compared with that fragment, which gives the same answer.

    test.fixme( marks a known product bug. It is allowed in a spec directly
    in test/e2e/, on a line that follows a `// product bug:` line. Anywhere
    else it counts like the other forbidden text. test.describe.fixme( is
    held to the same rule.
    """
    # (path as given, parts below test/) for each target that is test code.
    code = []
    for target in paths:
        parts = parts_under_test(target, cwd)
        if parts and parts[-1].endswith(TEST_CODE_SUFFIXES):
            code.append((target, parts))
    if not code:
        return ""
    path = "/".join(("test",) + code[0][1])
    new, old = new_and_old_text(tool_input, [target for target, _ in code], cwd)
    # A call that names several files is rare. It is held to the stricter rule of any of them.
    in_e2e = any(parts[0] == "e2e" for _, parts in code)
    for token, plain, pattern, e2e_only, advice in FORBIDDEN_TEXT:
        # The plain search comes first. Most files hold none of the text, and it is much faster than the pattern.
        if plain not in new or (e2e_only and not in_e2e):
            continue
        if len(pattern.findall(new)) > len(pattern.findall(old)):
            return DENY_FORBIDDEN_TEXT.format(path=path, token=token, advice=advice)
    if FIXME_TEXT not in new:
        return ""
    if all(len(parts) == 2 and parts[0] == "e2e" and parts[1].endswith(".spec.ts") for _, parts in code):
        if unmarked_fixmes(new) > unmarked_fixmes(old):
            return DENY_FIXME_MARKER.format(path=path)
    elif len(FIXME.findall(new)) > len(FIXME.findall(old)):
        return DENY_FIXME_PLACE.format(path=path)
    return ""


def outside_scope_message(path_text):
    """The deny message for a write tool whose target is outside the write scope."""
    message = f"Edit blocked for {path_text}. Writes are limited to {WRITE_SCOPE}."
    name = os.path.basename(path_text)
    test_name = ".test." in name or ".spec." in name
    test_folder = FOREIGN_TEST_FOLDER in path_text or "tests/" in path_text
    return f"{message} {HINT_TEST_FOLDERS if test_name or test_folder else HINT_REPORT}"


def in_repository(directory):
    """True when a directory is the repository root or inside it, after resolving symlinks."""
    resolved = resolve_path(directory)
    if resolved is None:
        return False
    try:
        resolved.relative_to(REPO)
    except ValueError:
        return False
    return True


def is_project_root(directory):
    """True when a directory is the repository root, after resolving symlinks."""
    return resolve_path(directory) == REPO


def collect_strings(value, keys, found):
    """Append every string stored under one of keys in a nested tool input to found."""
    if isinstance(value, dict):
        for key, item in value.items():
            if key.lower() in keys and isinstance(item, str):
                found.append(item)
            else:
                collect_strings(item, keys, found)
    elif isinstance(value, list):
        for item in value:
            collect_strings(item, keys, found)


def has_key(value, keys):
    """True when a nested tool input has one of keys at any depth, whatever it holds."""
    if isinstance(value, dict):
        return any(key.lower() in keys or has_key(item, keys) for key, item in value.items())
    if isinstance(value, list):
        return any(has_key(item, keys) for item in value)
    return False


def is_redirect_amp(previous, following):
    """`&` in `2>&1`, `>&2`, `&>file`, or `|&` is a redirect, not a background operator.

    previous is the character before the `&`, or "" when that character was
    quoted or escaped: in `echo \\|& rm x` the `&` does start a new command.
    """
    return previous in {">", "<", "|"} or following == ">"


def join_continuations(command):
    """Remove each backslash-newline pair, as the shell does before it reads a command.

    Inside single quotes the pair is literal and stays.
    """
    out = []
    quote = None
    index = 0
    while index < len(command):
        char = command[index]
        if char == "\\" and quote != "'":
            if command.startswith("\n", index + 1):
                index += 2
                continue
            out.append(command[index:index + 2])
            index += 2
            continue
        if quote:
            if char == quote:
                quote = None
        elif char in {"'", '"'}:
            quote = char
        out.append(char)
        index += 1
    return "".join(out)


def is_brace_expansion(command, start):
    """True when the unquoted `{` at start opens a brace expansion such as {a,b} or {1..3}.

    `HEAD@{1}`, `{}`, and `{owner}` have no `,` or `..` and are left alone by the shell.
    """
    depth = 0
    quote = None
    separator = False
    index = start
    while index < len(command):
        char = command[index]
        if char == "\\" and quote != "'":
            index += 1
        elif quote:
            if char == quote:
                quote = None
        elif char in {"'", '"'}:
            quote = char
        elif char in " \t\n;&|<>":
            return False
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return separator
        elif depth == 1 and (char == "," or command.startswith("..", index)):
            separator = True
        index += 1
    return False


def expansion_problem(command):
    """Why the shell would rewrite this command before running it, or "" when it would not.

    The hook checks the words it is given. `$(...)`, `$VAR`, `$'...'`, and
    `{a,b}` turn into other words first, so a command that uses them is denied.
    `$?`, `$$`, `$#`, `$!`, and a `$` that starts no expansion are left alone.
    """
    quote = None
    index = 0
    while index < len(command):
        char = command[index]
        following = command[index + 1] if index + 1 < len(command) else ""
        if char == "\\" and quote != "'":
            index += 2
            continue
        if quote == "'":
            if char == "'":
                quote = None
            index += 1
            continue
        if char == "`" or (char == "$" and following == "("):
            return DENY_SUBSTITUTION
        if char == "$" and (following.isalnum() or (following and following in "_{@*-")):
            return DENY_VARIABLE
        if quote is None:
            if char == "$" and following and following in "'\"":
                return DENY_VARIABLE
            if char in "<>" and following == "(":
                return DENY_SUBSTITUTION
            if char == "{" and is_brace_expansion(command, index):
                return DENY_BRACES
        if char == '"':
            quote = None if quote == '"' else '"'
        elif char == "'" and quote is None:
            quote = "'"
        index += 1
    return ""


def is_wildcard(word, position):
    """True when the unquoted character at position starts a pattern: `*`, `?`, or `[` with a closing `]`."""
    char, literal = word[position]
    if literal:
        return False
    if char in "*?":
        return True
    return char == "[" and any(later == "]" and not quoted for later, quoted in word[position + 1:])


def wildcard_can_be_option(word):
    """True when a word's wildcards could expand to a different option.

    word is a list of (character, literal) pairs. `*` can expand to a file
    named `-delete`, and `-*` to any option. `test/*.ts` and `--include=*.ts`
    cannot: the start of the word, or the option name before `=`, is fixed.
    """
    if not word:
        return False
    if word[0][0] == "-":
        name_end = next((index for index, (char, _) in enumerate(word) if char == "="), len(word))
        return any(is_wildcard(word, position) for position in range(1, name_end))
    return is_wildcard(word, 0)


def option_wildcard(command):
    """True when the shell could expand an unquoted wildcard in command into an option the hook never saw."""
    word = []
    quote = None
    index = 0
    while index < len(command):
        char = command[index]
        if char == "\\" and quote != "'":
            word.append((command[index + 1:index + 2], True))
            index += 2
            continue
        if quote:
            if char == quote:
                quote = None
            else:
                word.append((char, True))
        elif char in {"'", '"'}:
            quote = char
        elif char in " \t\n;&|<>()":
            if wildcard_can_be_option(word):
                return True
            word = []
        else:
            word.append((char, False))
        index += 1
    return wildcard_can_be_option(word)


def split_compound(command):
    """Split a command line on `&&`, `||`, `;`, newlines, and background `&`, outside quotes.

    Returns (operator, segment) pairs. The operator is what joined the segment
    to the one before it, and is "" for the first segment.
    """
    parts = []
    buf = []
    operator = ""
    quote = None
    # The last character read, or "" when it was quoted, escaped, or an operator.
    previous = ""
    i = 0
    while i < len(command):
        char = command[i]
        # A backslash escapes the next character, except inside single quotes.
        if char == "\\" and quote != "'":
            buf.append(command[i:i + 2])
            previous = ""
            i += 2
            continue
        if quote or char in {"'", '"'}:
            buf.append(char)
            if not quote:
                quote = char
            elif char == quote:
                quote = None
            previous = ""
            i += 1
            continue
        if command.startswith("&&", i) or command.startswith("||", i):
            parts.append((operator, "".join(buf)))
            operator = command[i:i + 2]
            buf = []
            previous = ""
            i += 2
            continue
        if char == "&" and not is_redirect_amp(previous, command[i + 1:i + 2]):
            parts.append((operator, "".join(buf)))
            operator = "&"
            buf = []
            previous = ""
            i += 1
            continue
        if char in {";", "\n"}:
            parts.append((operator, "".join(buf)))
            operator = ";"
            buf = []
            previous = ""
            i += 1
            continue
        buf.append(char)
        previous = char
        i += 1
    parts.append((operator, "".join(buf)))
    return [(operator, part.strip()) for operator, part in parts if part.strip()]


def split_pipes(segment):
    """Split one command segment into pipeline stages on `|` and `|&`, outside quotes.

    The `|` in `>|` belongs to that redirect operator and does not start a new stage.
    """
    parts = []
    buf = []
    quote = None
    # The last character read, or "" when it was quoted or escaped.
    previous = ""
    i = 0
    while i < len(segment):
        char = segment[i]
        if char == "\\" and quote != "'":
            buf.append(segment[i:i + 2])
            previous = ""
            i += 2
            continue
        if quote or char in {"'", '"'}:
            buf.append(char)
            if not quote:
                quote = char
            elif char == quote:
                quote = None
            previous = ""
            i += 1
            continue
        if char == "|" and previous != ">":
            parts.append("".join(buf))
            buf = []
            previous = ""
            i += 2 if segment.startswith("|&", i) else 1
            continue
        buf.append(char)
        previous = char
        i += 1
    parts.append("".join(buf))
    return [part.strip() for part in parts if part.strip()]


def read_word(text, index):
    """Read one shell word starting at index, honoring quotes. Returns (word, next_index)."""
    word = []
    quote = None
    while index < len(text):
        char = text[index]
        if char == "\\" and quote != "'":
            word.append(text[index + 1:index + 2])
            index += 2
            continue
        if quote:
            if char == quote:
                quote = None
            else:
                word.append(char)
            index += 1
            continue
        if char in {"'", '"'}:
            quote = char
            index += 1
            continue
        if char in " \t;&|<>()":
            break
        word.append(char)
        index += 1
    return "".join(word), index


def redirect_targets(segment):
    """Files the shell would open for writing: `>`, `>>`, `>|`, `&>`, `&>>`, `<>`, `N>`, and `>&file`."""
    targets = []
    quote = None
    i = 0
    while i < len(segment):
        char = segment[i]
        if char == "\\" and quote != "'":
            i += 2
            continue
        if quote:
            if char == quote:
                quote = None
            i += 1
            continue
        if char in {"'", '"'}:
            quote = char
            i += 1
            continue
        if char != ">":
            i += 1
            continue
        i += 1
        if i < len(segment) and segment[i] in {">", "|"}:
            i += 1
        while i < len(segment) and segment[i] in {" ", "\t"}:
            i += 1
        duplicate = i < len(segment) and segment[i] == "&"
        if duplicate:
            i += 1
        target, i = read_word(segment, i)
        if duplicate and (target.isdigit() or target == "-"):
            continue
        targets.append(target)
    return targets


def without_redirects(segment):
    """The segment with its redirections removed, leaving the command and its arguments.

    `mkdir -p test/x 2>/dev/null` becomes `mkdir -p test/x`, so `2>/dev/null`
    is not mistaken for an operand. Write targets are checked by redirect_targets().
    """
    out = []
    quote = None
    i = 0
    while i < len(segment):
        char = segment[i]
        if char == "\\" and quote != "'":
            out.append(segment[i:i + 2])
            i += 2
            continue
        if quote:
            out.append(char)
            if char == quote:
                quote = None
            i += 1
            continue
        if char in {"'", '"'}:
            quote = char
            out.append(char)
            i += 1
            continue
        if char not in "<>":
            out.append(char)
            i += 1
            continue
        # Drop what is written directly before the operator: `&` in `&>`, or a
        # file descriptor number that is a word of its own, as in `2>`.
        if out and out[-1] == "&":
            out.pop()
        else:
            digits = 0
            while digits < len(out) and out[-1 - digits].isdigit():
                digits += 1
            if digits and (digits == len(out) or out[-1 - digits] in " \t"):
                del out[len(out) - digits:]
        while i < len(segment) and segment[i] in "<>|&":
            i += 1
        while i < len(segment) and segment[i] in " \t":
            i += 1
        _, i = read_word(segment, i)
        out.append(" ")
    return "".join(out)


def command_words(stage):
    """The words of one pipeline stage, with quotes removed and redirections left out.

    Raises ValueError when a quote is not closed.
    """
    return shlex.split(without_redirects(stage))


def split_env(tokens):
    """Split leading `NAME=value` assignments from the command. Returns ([(name, value)], rest)."""
    assignments = []
    index = 0
    while index < len(tokens):
        match = ASSIGNMENT.fullmatch(tokens[index])
        if not match:
            break
        assignments.append(match.groups())
        index += 1
    return assignments, tokens[index:]


def strip_env(tokens):
    """Drop leading `NAME=value` assignments so tokens[0] is the program."""
    return split_env(tokens)[1]


def check_env(name, value):
    """Raise Denied unless a command may set this variable to this value.

    BASE_URL may be empty or name this machine, so the tests cannot be pointed
    at another site from the command line.
    """
    if name not in ALLOWED_ENV or SAFE_ENV_VALUE.fullmatch(value) is None:
        raise Denied(DENY_ENV)
    if name == "BASE_URL" and value and LOCAL_URL.fullmatch(value) is None:
        raise Denied(DENY_BASE_URL)


def check_export(args):
    """`export NAME=value` and `export NAME` for the variables in ALLOWED_ENV. `export -p` prints."""
    for arg in args:
        if arg.startswith("-"):
            if arg != "-p":
                raise Denied(DENY_ENV)
            continue
        name, has_value, value = arg.partition("=")
        check_env(name, value if has_value else "")


def unset_allowed(args):
    """`unset NAME` for the variables in ALLOWED_ENV."""
    return all(arg in ALLOWED_ENV or arg == "-v" for arg in args)


def program_name(token):
    """The program a command runs, or "" when it is named by path.

    A path such as ./test/bin/ls can be a file the agent wrote, so only bare
    names found on PATH are accepted. The test runners in node_modules/.bin
    are the exception.
    """
    if "/" not in token:
        return token
    path = token[2:] if token.startswith("./") else token
    directory, _, name = path.rpartition("/")
    if directory == "node_modules/.bin" and name in RUNNERS:
        return name
    return ""


def operand_paths(tokens, value_shorts="", value_longs=()):
    """Arguments after the program that are not options.

    After `--` every word is an operand, even one that starts with a dash:
    `touch test/a -- -x` creates a file named -x. value_shorts and value_longs
    name options whose value is the next word, which is then not an operand:
    in `mkdir -m 755 test/x` the mode is not a path. A short option takes the
    next word only when it is the last letter of its word.
    """
    operands = []
    skip = False
    for index, token in enumerate(tokens[1:], start=1):
        if skip:
            skip = False
        elif token == "--":
            operands.extend(tokens[index + 1:])
            break
        elif token.startswith("--"):
            skip = token in value_longs
        elif token.startswith("-"):
            for position, letter in enumerate(token[1:], start=1):
                if letter in value_shorts:
                    skip = position == len(token) - 1
                    break
        else:
            operands.append(token)
    return operands


def mutating_paths(program, tokens):
    """Paths a file operation touches: its operands, and the directory named by -t or --target-directory.

    `cp --target-directory=src a` and `cp -tsrc a` name the destination inside
    an option, where operand_paths() does not look.
    """
    paths = operand_paths(tokens, *MUTATING_VALUE_OPTIONS.get(program, ()))
    if program in TARGET_DIRECTORY_PROGRAMS:
        for token in tokens[1:]:
            if token.startswith("--"):
                name, has_value, value = token.partition("=")
                if has_value and abbreviates(name, "--target-directory"):
                    paths.append(value)
            elif token.startswith("-") and "t" in token:
                attached = token[token.index("t") + 1:]
                if attached:
                    paths.append(attached)
    return paths


def positional(args):
    """Arguments that are not options. A lone `-` counts as an argument."""
    return [arg for arg in args if arg == "-" or not arg.startswith("-")]


def has_option(args, long_names=(), short_letters="", value_shorts=""):
    """True when args use one of the long options or short letters.

    git accepts any unambiguous prefix of a long option, such as `--del` for
    `--delete`, so a long argument matches when it is a prefix of a listed
    option. Short options may be bundled, as in `-vd`. A letter in
    value_shorts takes a value: the rest of its word, or the next word, is
    skipped. Scanning stops at `--`.
    """
    skip = False
    for arg in args:
        if skip:
            skip = False
            continue
        if arg == "--":
            break
        if arg.startswith("--"):
            name = arg.split("=", 1)[0]
            if any(abbreviates(name, option) for option in long_names):
                return True
        elif arg.startswith("-"):
            for position, letter in enumerate(arg[1:], start=1):
                if letter in short_letters:
                    return True
                if letter in value_shorts:
                    skip = position == len(arg) - 1
                    break
    return False


def unwrap_rtk(tokens):
    """Translate an `rtk …` command to the command it runs.

    Cursor's RTK hook rewrites commands before this hook sees them: `git status`
    becomes `rtk git status`, and `cat file` becomes `rtk read file`. Any other
    rtk command is returned as it is and then denied. `rtk test`, `rtk err`,
    `rtk run`, and `rtk proxy` run whatever command follows them, and rtk also
    runs any name it does not know, so `rtk rm -rf src` deletes src.
    """
    if not tokens or tokens[0] != "rtk":
        return tokens
    index = 1
    while index < len(tokens) and tokens[index].startswith("-"):
        index += 1
    rest = tokens[index:]
    if rest and rest[0] in RTK_SAME_PROGRAM:
        return rest
    if rest and rest[0] == "read":
        return ["cat"] + rtk_read_files(rest[1:])
    return tokens


def rtk_read_files(args):
    """File operands of `rtk read`, which RTK runs in place of cat, head, and tail."""
    files = []
    skip = False
    for arg in args:
        if skip:
            skip = False
        elif arg in RTK_READ_VALUE_OPTIONS:
            skip = True
        elif not arg.startswith("-"):
            files.append(arg)
    return files


def npx_command(args):
    """The runner command npx would start, or None when npx is asked for anything else.

    `-c` runs a shell string and `--package` fetches a package to run, so `-c`
    is denied and `--package` must name one of the test runners.
    """
    index = 0
    while index < len(args) and args[index].startswith("-"):
        arg = args[index]
        index += 1
        if arg == "--":
            break
        name, has_value, value = arg.partition("=")
        if name in {"--package", "-p"}:
            if not has_value:
                value = args[index] if index < len(args) else ""
                index += 1
            if value not in RUNNER_PACKAGES:
                return None
        elif arg not in NPX_FLAGS:
            return None
    command = args[index:]
    if not command or command[0] not in RUNNERS:
        return None
    return command


def vitest_option_name(arg):
    """The name of a vitest option word as (long name, short letters). One of the two is empty.

    vitest's parser counts the dashes. Exactly two start a long name. Any
    other number starts a group of one-letter options, so `-wu` and `---wu`
    are both `-w -u`. A long name of one letter, as in `--w`, is the same
    option as `-w`. Long names are returned in lower case without dashes,
    because vitest reads `--output-file` and `--outputFile` as one option.
    """
    name = arg.partition("=")[0]
    word = name.lstrip("-")
    if len(name) - len(word) == 2 and len(word) > 1:
        return word.replace("-", "").lower(), ""
    return "", word


def vitest_takes_path(long_name, letters):
    """True when a vitest option's value is a path the runner writes to or loads from.

    Covers `--outputFile`, the per-reporter `--outputFile.json`, and `-c` and
    `-r`. In a group of short options, the last letter takes the value.
    """
    if long_name in VITEST_PATH_OPTIONS or long_name.startswith("outputfile."):
        return True
    return letters[-1:] in tuple(VITEST_PATH_SHORTS)


def vitest_path_values(args):
    """Values of vitest options that name a file or directory, given as `--outputFile=x` or `--outputFile x`."""
    values = []
    for index, arg in enumerate(args):
        if not arg.startswith("-"):
            continue
        _, has_value, value = arg.partition("=")
        if not has_value:
            value = args[index + 1] if index + 1 < len(args) else ""
        if vitest_takes_path(*vitest_option_name(arg)):
            values.append(value)
    return values


def playwright_path_values(args):
    """Values of `playwright test` options that name a file or directory: `--output`, `--config`, and `-c`."""
    values = []
    for index, arg in enumerate(args):
        following = args[index + 1] if index + 1 < len(args) else ""
        if arg.startswith("--"):
            name, has_value, value = arg.partition("=")
            if name in PLAYWRIGHT_PATH_OPTIONS:
                values.append(value if has_value else following)
        elif arg.startswith("-"):
            for position, letter in enumerate(arg[1:], start=1):
                if letter == "c":
                    values.append(arg[position + 1:].lstrip("=") or following)
                    break
                if letter in PLAYWRIGHT_VALUE_SHORTS:
                    break
    return values


def runner_paths_allowed(values, cwd):
    """True when every path a runner option names is inside the write scope."""
    if not all(is_allowed(value, cwd) for value in values):
        raise Denied(DENY_RUNNER_PATH)
    return True


def vitest_words(args):
    """Split vitest arguments into (option words, file filters).

    The word after `-t`, `--testNamePattern`, or a path option is that
    option's value, so it is neither. vitest takes a value only from a word
    that does not start with `-`: in `-t -u`, `-u` is still an option.
    """
    options = []
    filters = []
    skip = False
    for arg in args:
        if not arg.startswith("-"):
            if not skip:
                filters.append(arg)
            skip = False
            continue
        options.append(arg)
        long_name, letters = vitest_option_name(arg)
        takes_value = vitest_takes_path(long_name, letters) or long_name == "testnamepattern" or letters[-1:] == "t"
        skip = takes_value and "=" not in arg
    return options, filters


def check_vitest_options(options):
    """Raise Denied for a vitest option that never ends, waits for a person, or rewrites snapshots.

    vitest reads each letter of a word such as `-wu` as an option of its own.
    See vitest_option_name().
    """
    for option in options:
        long_name, letters = vitest_option_name(option)
        if long_name == "watch" or "w" in letters:
            raise Denied(DENY_VITEST_WATCH)
        if long_name == "ui":
            raise Denied(DENY_VITEST_UI)
        if long_name == "update" or "u" in letters:
            raise Denied(DENY_VITEST_UPDATE)


def vitest_allowed(args, cwd):
    """`vitest run <test file>`: one run, of files the command names under test/.

    Without `run`, vitest watches for changes when it thinks a person is at
    the terminal. `vitest init` writes config files, and `list` and `related`
    are not needed. A filter that is not a path, such as `SignIn`, also runs
    every other file with that text in its name.
    """
    if args[:1] != ["run"]:
        raise Denied(DENY_VITEST_WATCH if args[:1] and args[0] in VITEST_WATCH_COMMANDS else DENY_VITEST_RUN)
    options, filters = vitest_words(args[1:])
    check_vitest_options(options)
    runner_paths_allowed(vitest_path_values(args), cwd)
    if not any(under_test(word, cwd) for word in filters):
        raise Denied(DENY_VITEST_PATH)
    return True


def playwright_words(args):
    """Split `playwright test` arguments into (option words, test filters).

    The word after an option that takes a value is that value, even when it
    starts with `-`: `--grep --headed` searches for the text "--headed".
    `-g`, `-G`, `-j`, and `-c` take theirs from the rest of the word or from
    the next word.
    """
    options = []
    filters = []
    skip = False
    for arg in args:
        if skip:
            skip = False
            continue
        if not arg.startswith("-"):
            filters.append(arg)
            continue
        options.append(arg)
        if arg.startswith("--"):
            skip = arg in PLAYWRIGHT_VALUE_OPTIONS
        else:
            for position, letter in enumerate(arg[1:], start=1):
                if letter in PLAYWRIGHT_VALUE_SHORTS + "c":
                    skip = position == len(arg) - 1
                    break
    return options, filters


def check_playwright_options(options, args):
    """Raise Denied for a `playwright test` option that waits for a person or hides a failure.

    args is the whole argument list, which holds the value of `--repeat-each 3`.
    """
    for option in options:
        name, has_value, value = option.partition("=")
        if not name.startswith("--"):
            for letter in name[1:]:
                if letter == "u":
                    raise Denied(DENY_PLAYWRIGHT_UPDATE.format(option="-u"))
                if letter in PLAYWRIGHT_VALUE_SHORTS + "c":
                    break
            continue
        if name in PLAYWRIGHT_WINDOW_OPTIONS:
            raise Denied(DENY_PLAYWRIGHT_WINDOW.format(option=name))
        if name == "--debug" and option != "--debug=cli":
            raise Denied(DENY_PLAYWRIGHT_DEBUG.format(option=option))
        if name in PLAYWRIGHT_MASKING_OPTIONS:
            raise Denied(DENY_PLAYWRIGHT_MASKING.format(option=name))
        if name == "--update-snapshots":
            raise Denied(DENY_PLAYWRIGHT_UPDATE.format(option=name))
        if name == "--repeat-each":
            if not has_value:
                position = args.index(option)
                value = args[position + 1] if position + 1 < len(args) else ""
            if not (value.isascii() and value.isdigit()) or not 1 <= int(value) <= MAX_REPEAT_EACH:
                raise Denied(DENY_PLAYWRIGHT_REPEAT)


def playwright_allowed(args, cwd):
    """`playwright test <spec>`: a run of specs the command names under test/, or `--list`.

    Every other playwright command installs, records, or opens something.
    A spec may end in `:line`. Such a word still names a path under test/.
    """
    if args[:1] != ["test"]:
        raise Denied(DENY_PLAYWRIGHT_COMMAND)
    args = args[1:]
    options, filters = playwright_words(args)
    check_playwright_options(options, args)
    runner_paths_allowed(playwright_path_values(args), cwd)
    if "--list" not in options and not any(under_test(word, cwd) for word in filters):
        raise Denied(DENY_PLAYWRIGHT_PATH)
    return True


def npm_run_allowed(args, cwd):
    """`npm run <test script>`, with runner arguments only after `--`.

    The script already holds `vitest run` or `playwright test`, and it may run
    the whole suite, so no path is needed. The options a direct run may not
    use are denied here too.
    """
    if len(args) < 2 or args[0] != "run" or args[1] not in NPM_TEST_SCRIPTS:
        raise Denied(DENY_NPM)
    rest = args[2:]
    split = rest.index("--") if "--" in rest else len(rest)
    # An npm option such as --script-shell or --prefix changes what the script runs.
    if any(arg.startswith("-") for arg in rest[:split]):
        raise Denied(DENY_NPM)
    script_args = rest[split + 1:]
    if args[1].startswith("test:e2e"):
        check_playwright_options(playwright_words(script_args)[0], script_args)
        return runner_paths_allowed(playwright_path_values(script_args), cwd)
    check_vitest_options(vitest_words(script_args)[0])
    return runner_paths_allowed(vitest_path_values(script_args), cwd)


def playwright_cli_allowed(args, cwd):
    """Allow the commands the healer uses on a paused test.

    Deny commands that write files, run code, or open another browser, and a
    `--filename` outside the write scope. `detach` is denied because it leaves
    the test paused.

    The command is the first word that is not an option or an option's value.
    playwright-cli gives an option the next word as its value unless the
    option is a known flag, so the hook reads `-s tw-1 snapshot` the same way.
    An option it cannot place, in front of the command, is denied: in
    `--x snapshot run-code` the command that runs is `run-code`.
    """
    if any(SESSION_PLACEHOLDER in arg for arg in args):
        raise Denied(DENY_SESSION_PLACEHOLDER)
    command = ""
    index = 0
    while index < len(args):
        arg = args[index]
        following = args[index + 1] if index + 1 < len(args) else ""
        index += 1
        if not arg.startswith("-"):
            command = command or arg
            continue
        name, has_value, value = arg.partition("=")
        if name in PLAYWRIGHT_CLI_DENIED_OPTIONS:
            raise Denied(DENY_PLAYWRIGHT_CLI)
        takes_next = not has_value and bool(following) and not following.startswith("-")
        if name in PLAYWRIGHT_CLI_PATH_OPTIONS:
            if takes_next:
                value = following
                index += 1
            runner_paths_allowed([value], cwd)
        elif name in PLAYWRIGHT_CLI_SESSION_OPTIONS:
            if takes_next:
                index += 1
        elif not command and not has_value and name not in PLAYWRIGHT_CLI_FLAGS:
            raise Denied(DENY_PLAYWRIGHT_CLI_OPTION.format(option=name))
    if command == "detach":
        raise Denied(DENY_DETACH)
    if command not in PLAYWRIGHT_CLI_COMMANDS:
        raise Denied(DENY_PLAYWRIGHT_CLI)
    return True


def under_mobile(path_text, cwd):
    """True when a path is test/mobile/ or inside it, after resolving symlinks."""
    parts = parts_under_test(path_text, cwd)
    return bool(parts) and parts[0] == "mobile"


def maestro_value(option, value, pattern, example):
    """Raise Denied unless an option's value matches pattern. A value never starts with a dash."""
    if pattern.fullmatch(value) is None:
        raise Denied(DENY_MAESTRO_VALUE.format(option=option, example=example))


def maestro_output_config(directory, cwd):
    """The config file in a flow folder that sets testOutputDir, as text from the project root, or "".

    maestro reads config.yaml or config.yml from a folder it is given. With
    testOutputDir it writes its output to that folder and, after each run,
    deletes every folder next to the output that is older than 14 days. The
    agent can write this file, so the run is denied while the key is in it.
    The check is on plain text, so a comment that names the key counts.
    """
    resolved = resolve_path(directory, cwd)
    if resolved is None or not resolved.is_dir():
        return ""
    for name in MAESTRO_CONFIG_NAMES:
        if MAESTRO_OUTPUT_KEY in read_file(str(resolved / name), cwd):
            return (resolved / name).relative_to(REPO).as_posix()
    return ""


def maestro_allowed(args, cwd):
    """`maestro --version`, `maestro check-syntax <flow>`, and `maestro test` with a short list of options.

    The command line is checked word by word against an allow list:

    - no word may start with `@`, which makes maestro read arguments from a file;
    - the only short option is `-e`, as a word of its own, so a cluster such
      as `-ceK=V` is denied;
    - no option that names an output file or folder, a config file, a cloud
      service, or continuous mode is on the list;
    - every path must be under test/mobile/.

    --platform and --device may stand before the command, where maestro also
    accepts them. check-syntax takes one path and no option.
    """
    if any(arg.startswith("@") for arg in args):
        raise Denied(DENY_MAESTRO_AT)
    if args == ["--version"]:
        return True
    command = ""
    options = False
    paths = []
    index = 0
    while index < len(args):
        arg = args[index]
        index += 1
        if not arg.startswith("-"):
            if command:
                paths.append(arg)
            elif arg in MAESTRO_COMMANDS:
                command = arg
            else:
                message = DENY_MAESTRO_DEVICE if "device" in arg else DENY_MAESTRO_COMMAND
                raise Denied(message.format(word=arg))
            continue
        options = True
        name, has_value, value = arg.partition("=")
        if name in MAESTRO_TEST_OPTIONS and command != "test":
            raise Denied(DENY_MAESTRO_ORDER.format(option=name))
        if arg == "-e":
            pattern, example = MAESTRO_ENV, "-e APP_ID=com.example.app"
        elif name == "--platform":
            pattern, example = MAESTRO_PLATFORM, "--platform android"
        elif name == "--device":
            pattern, example = MAESTRO_DEVICE, "--device emulator-5554"
        elif name in {"--include-tags", "--exclude-tags"}:
            pattern, example = MAESTRO_TAGS, name + "=fixme"
        else:
            # A short word is shown whole: `-ceK=V` is a cluster, not the option `-ceK`.
            shown = name if arg.startswith("--") else arg
            raise Denied(DENY_MAESTRO_OPTION.format(option=shown, command=command or "test"))
        if not has_value:
            value = args[index] if index < len(args) else ""
            index += 1
        maestro_value(name, value, pattern, example)
    if not command:
        raise Denied(DENY_MAESTRO_NOTHING)
    if command == "check-syntax" and (options or len(paths) != 1):
        if options:
            raise Denied(DENY_MAESTRO_OPTION.format(option="an option", command=command))
        raise Denied(DENY_MAESTRO_NO_PATH.format(command=command, count="one flow file"))
    if not paths:
        raise Denied(DENY_MAESTRO_NO_PATH.format(command=command, count="a flow file or folder"))
    for path in paths:
        if not under_mobile(path, cwd):
            raise Denied(DENY_MAESTRO_PATH.format(path=path))
        config = maestro_output_config(path, cwd) if command == "test" else ""
        if config:
            raise Denied(DENY_MAESTRO_CONFIG.format(path=config))
    return True


def runner_allowed(program, args, cwd):
    """True for an allowed test runner command, or None when the program is not a test runner.

    Covers `npm run <test script>`, and `vitest run`, `playwright test`, and
    playwright-cli run directly or through npx, and maestro. Raises Denied otherwise.
    """
    if program == "maestro":
        placeholder = find_placeholder(args)
        if placeholder:
            raise Denied(DENY_PLACEHOLDER.format(placeholder=placeholder))
        return maestro_allowed(args, cwd)
    if program not in RUNNERS and program not in {"npm", "npx"}:
        return None
    # Inside quotes too: `-g "<title>"` matches no test and `find "<text>"` finds nothing.
    placeholder = find_placeholder(args)
    if placeholder:
        raise Denied(DENY_PLACEHOLDER.format(placeholder=placeholder))
    if program == "npm":
        return npm_run_allowed(args, cwd)
    if program == "npx":
        command = npx_command(args)
        if command is None:
            raise Denied(DENY_NPX)
        program, args = command[0], command[1:]
    if program == "vitest":
        return vitest_allowed(args, cwd)
    if program == "playwright":
        return playwright_allowed(args, cwd)
    return playwright_cli_allowed(args, cwd)


def git_remote_allowed(subcommand, args):
    """push, fetch, and ls-remote: known options, a configured remote, and no forced or deleting refspec."""
    for arg in args:
        if not arg.startswith("-") or arg == "-":
            continue
        name, has_value, _ = arg.partition("=")
        if has_value:
            if name not in GIT_REMOTE_VALUE_FLAGS[subcommand]:
                return False
        elif arg not in GIT_REMOTE_FLAGS[subcommand]:
            return False
    operands = positional(args)
    if operands and not REMOTE_NAME.fullmatch(operands[0]):
        return False
    # `+ref` forces the update and `:ref` deletes the ref on the other side.
    return not any(refspec.startswith(("+", ":")) for refspec in operands[1:])


def git_config_allowed(args):
    """True when `git config` only reads.

    A read is `git config get ...` or `git config list` with the subcommand
    as the first word, a command with --get, --get-all, --get-regexp, --list,
    or -l, or one key and nothing else, as in `git config user.name`. Every
    option must be a known flag. An option that takes a value must carry it
    after `=`, so no word can be mistaken for the read option: in
    `git config --comment list core.fsmonitor x`, `list` is the comment.
    """
    reads = args[:1] != [] and args[0] in GIT_CONFIG_READ_COMMANDS
    rest = args[1:] if reads else args
    for arg in rest:
        if not arg.startswith("-"):
            continue
        name, has_value, _ = arg.partition("=")
        if arg in GIT_CONFIG_READ_OPTIONS:
            reads = True
        elif arg not in GIT_CONFIG_FLAGS and not (has_value and name in GIT_CONFIG_VALUE_FLAGS):
            return False
    operands = positional(rest)
    return reads or (len(operands) == 1 and GIT_CONFIG_KEY.fullmatch(operands[0]) is not None)


def option_values(args, long_names, letters, value_shorts):
    """The values of the options named by long_names and letters, in any form git accepts.

    Covers `--file=x`, `--file x`, a shortened `--fil=x`, `-Fx`, `-F x`, and a
    bundle such as `-aF x`. value_shorts are all the short options of the
    command that take a value, so the value of another option is skipped.
    Scanning stops at `--`.
    """
    values = []
    skip = False
    for index, arg in enumerate(args):
        following = args[index + 1] if index + 1 < len(args) else ""
        if skip:
            skip = False
        elif arg == "--":
            break
        elif arg.startswith("--"):
            name, has_value, value = arg.partition("=")
            if any(abbreviates(name, option) for option in long_names):
                values.append(value if has_value else following)
                skip = not has_value
        elif arg.startswith("-"):
            for position, letter in enumerate(arg[1:], start=1):
                if letter in value_shorts:
                    skip = position == len(arg) - 1
                    if letter in letters:
                        values.append(arg[position + 1:] or following)
                    break
    return values


def git_allowed(tokens, cwd):
    """Allow inspecting, staging, committing, and pushing a branch to a configured remote.

    Deny anything that rewrites working-tree files outside the write scope,
    loses commits, or changes a remote: branch switches, merges, force
    pushes, deletions, amends, aliases, config overrides, and unknown commands.
    """
    index = 1
    while index < len(tokens) and tokens[index].startswith("-"):
        option = tokens[index]
        if option == "-C" and index + 1 < len(tokens):
            # Paths in the rest of the command are relative to this directory.
            cwd = os.path.join(cwd, os.path.expanduser(tokens[index + 1]))
            index += 2
            continue
        if option not in GIT_SAFE_GLOBAL_OPTIONS:
            return False
        index += 1
    if index >= len(tokens):
        return True
    subcommand = tokens[index]
    args = tokens[index + 1:]
    # `--output=<file>` makes diff, log, and show write to the file.
    if has_option(args, ("--output",)):
        return False
    if subcommand in GIT_CHANGES_REPOSITORY and not in_repository(cwd):
        return False
    if subcommand in GIT_MESSAGE_FILE_OPTIONS:
        # The file's content becomes the message, which a push publishes. `-` is standard input.
        for path in option_values(args, *GIT_MESSAGE_FILE_OPTIONS[subcommand]):
            if path != "-" and not is_allowed(path, cwd):
                raise Denied(DENY_GIT_MESSAGE_FILE.format(subcommand=subcommand, path=path))
    if subcommand in GIT_PLAIN:
        return True
    if subcommand in GIT_DENIED_OPTIONS:
        return not has_option(args, *GIT_DENIED_OPTIONS[subcommand])
    if subcommand in GIT_REMOTE_FLAGS:
        return git_remote_allowed(subcommand, args)
    if subcommand == "remote":
        operands = positional(args)
        return not operands or operands[0] in {"show", "get-url"}
    if subcommand == "reflog":
        operands = positional(args)
        return not operands or operands[0] not in {"expire", "delete", "drop", "write"}
    if subcommand == "config":
        if not git_config_allowed(args):
            raise Denied(DENY_GIT_CONFIG)
        return True
    if subcommand == "stash":
        return bool(args) and args[0] in {"list", "show"}
    if subcommand == "worktree":
        return bool(args) and args[0] == "list"
    if subcommand == "reset":
        # Unstaging is allowed. A reset to another commit moves HEAD.
        if has_option(args, ("--hard", "--merge", "--keep", "--soft")):
            return False
        operands = positional(args[:args.index("--")] if "--" in args else args)
        return not operands or operands[0] == "HEAD"
    if subcommand in {"restore", "rm", "mv"}:
        # `git restore -s main test/a.ts` names a commit, which is not a path.
        source = ("s", {"--source"}) if subcommand == "restore" else ()
        paths = operand_paths(["git"] + [arg for arg in args if arg != "--"], *source)
        deny_outside("git " + subcommand, paths, cwd)
        return bool(paths)
    if subcommand in {"checkout", "switch"}:
        if subcommand == "checkout" and "--" in args:
            if args.index("--") != 0:
                return False
            paths = args[1:]
            deny_outside("git checkout", paths, cwd)
            return bool(paths)
        create = "-b" if subcommand == "checkout" else "-c"
        # A new branch from HEAD leaves the working tree and other branches as
        # they are. A start point, or -B and -C on an existing branch, may not.
        return len(args) == 2 and args[0] == create and not args[1].startswith("-")
    return False


def gh_api_allowed(args):
    """Allow `gh api` only for a GET request to a REST endpoint.

    Any other method changes something on GitHub. Without `-X`, a field or
    `--input` turns the request into a POST, and the `graphql` endpoint is
    always a POST that can carry a mutation.
    """
    method = "GET"
    explicit = False
    fields = False
    endpoint = None
    index = 0
    while index < len(args):
        arg = args[index]
        following = args[index + 1] if index + 1 < len(args) else ""
        index += 1
        if arg.startswith("--"):
            name, has_value, value = arg.partition("=")
            if name in GH_API_VALUE_OPTIONS and not has_value:
                value = following
                index += 1
            if name == "--method":
                method, explicit = value, True
            elif name == "--input":
                return False
            elif name in {"--field", "--raw-field"}:
                fields = True
        elif arg.startswith("-") and len(arg) > 1:
            # Short options may be bundled: `-iX DELETE` is `-i -X DELETE`.
            for position, letter in enumerate(arg[1:], start=1):
                if letter not in GH_API_VALUE_SHORTS:
                    continue
                value = arg[position + 1:]
                if not value:
                    value = following
                    index += 1
                if letter == "X":
                    method, explicit = value, True
                elif letter in "fF":
                    fields = True
                break
        elif endpoint is None:
            endpoint = arg
    if endpoint is None or endpoint == "graphql" or method.upper() != "GET":
        return False
    # With an explicit GET, fields are sent as query parameters.
    return explicit or not fields


def gh_post_allowed(command, args, cwd):
    """Check the options of `gh pr|issue create|comment`, which publish to GitHub.

    `--body-file` and `-F` send a file's content, so the file must be inside
    the write scope, or `-` for standard input. So must the file that
    `gh pr create --template` or `-T` names. For an issue, `--template` is the
    name of a template, not a file. `--repo` and `-R` choose another
    repository, and `--delete-last` removes a comment; both are denied.
    """
    file_options = {"--body-file", "--template"} if command == "pr" else {"--body-file"}
    file_letters = "FT" if command == "pr" else "F"
    index = 0
    while index < len(args):
        arg = args[index]
        following = args[index + 1] if index + 1 < len(args) else ""
        index += 1
        if arg.startswith("--"):
            name, has_value, value = arg.partition("=")
            if name in {"--repo", "--delete-last"}:
                return False
            if name in GH_POST_VALUE_OPTIONS and not has_value:
                # Skip the value, so a body such as "- item" is not read as an option.
                value = following
                index += 1
            if name in file_options and value != "-" and not is_allowed(value, cwd):
                return False
        elif arg.startswith("-") and len(arg) > 1:
            for position, letter in enumerate(arg[1:], start=1):
                if letter not in GH_POST_VALUE_SHORTS:
                    continue
                value = arg[position + 1:]
                if not value:
                    value = following
                    index += 1
                if letter == "R":
                    return False
                if letter in file_letters and value != "-" and not is_allowed(value, cwd):
                    return False
                break
    return True


def gh_allowed(tokens, cwd):
    """Allow gh commands that read from GitHub, open or comment on a pull request or issue, or send a GET request.

    Deny every other action, so merges, closes, deletions, workflow runs,
    aliases, and commands that write local files are all refused.
    """
    if len(tokens) < 2:
        return False
    command, args = tokens[1], tokens[2:]
    if command == "status":
        return True
    if command == "api":
        return gh_api_allowed(args)
    if not args or args[0] not in GH_ACTIONS.get(command, ()):
        return False
    if args[0] in GH_POST_ACTIONS:
        # From another directory, gh would act on whatever repository is there.
        return in_repository(cwd) and gh_post_allowed(command, args[1:], cwd)
    if command == "auth":
        # `gh auth status --show-token` and `-t` print the token.
        return not any(
            arg.startswith("--show-token") or (arg.startswith("-") and not arg.startswith("--") and "t" in arg)
            for arg in args
        )
    return True


def destination_paths(tokens):
    """Where cp puts its copies: the directory named by -t or --target-directory, or the last operand."""
    targets = []
    for index, token in enumerate(tokens[1:], start=1):
        following = tokens[index + 1] if index + 1 < len(tokens) else ""
        if token.startswith("--"):
            name, has_value, value = token.partition("=")
            if abbreviates(name, "--target-directory"):
                targets.append(value if has_value else following)
        elif token.startswith("-") and "t" in token:
            targets.append(token[token.index("t") + 1:] or following)
    return targets or operand_paths(tokens)[-1:]


def file_operation_allowed(program, tokens, cwd):
    """rm, mv, cp, mkdir, touch, tee, truncate, and ln: every path must be inside the write scope.

    tee and cp put file content under test/ without going through the content
    rules, so they are denied there. mkdir and touch create names, which must
    follow the naming rules. rm is not held to the naming rules, so the agent
    can remove what has a wrong name.
    """
    paths = mutating_paths(program, tokens)
    if not paths:
        raise Denied(DENY_NO_PATH.format(program=program))
    creates = program in {"mkdir", "touch"}
    if program == "tee":
        deny_shell_write(paths, cwd, HINT_PIPE)
    if program == "cp":
        deny_shell_write(destination_paths(tokens), cwd, HINT_COPY)
    deny_outside(program, paths, cwd, HINT_TEST_FOLDERS if creates else HINT_REPORT)
    if creates:
        for path in paths:
            problem = path_problem(path, cwd)
            if problem:
                raise Denied(problem)
    return True


def check_redirects(segment, cwd):
    """Raise Denied unless every file the stage's redirects write is /dev/null or in the write scope, outside test/."""
    for target in redirect_targets(segment):
        # An empty target means the hook and the shell read the redirect differently.
        if not target:
            raise Denied(DENY_REDIRECT_EMPTY)
        if target == "/dev/null":
            continue
        deny_shell_write([target], cwd, HINT_PIPE)
        if not is_allowed(target, cwd):
            raise Denied(DENY_REDIRECT.format(target=target))


def unknown_program(program):
    """The deny message for a program that is not on any list, with what to do instead when the hook knows."""
    if program in SHELL_KEYWORDS or program.startswith(("(", "{")):
        return DENY_COMPOUND
    message = DENY_UNKNOWN_PROGRAM.format(program=program)
    hint = PROGRAM_HINTS.get(program)
    return f"{message} {hint}" if hint else message


def sleep_allowed(args):
    """`sleep N` for a whole number of seconds from 1 to MAX_SLEEP. The healer waits for a debug run with it."""
    if len(args) != 1 or not (args[0].isascii() and args[0].isdigit()) or not 1 <= int(args[0]) <= MAX_SLEEP:
        raise Denied(DENY_SLEEP)
    return True


def atomic_allowed(segment, cwd):
    """True when one pipeline stage, including its redirects, is allowed when run in cwd.

    Raises Denied, with the message for the agent, when it is not.
    """
    check_redirects(segment, cwd)
    try:
        assignments, tokens = split_env(command_words(segment))
    except ValueError:
        raise Denied(DENY_QUOTE) from None
    for name, value in assignments:
        check_env(name, value)
    tokens = unwrap_rtk(tokens)
    if not tokens:
        return True
    program = program_name(tokens[0])
    if not program:
        raise Denied(DENY_PROGRAM_PATH)
    if program == "rtk":
        raise Denied(DENY_RTK)
    runner = runner_allowed(program, tokens[1:], cwd)
    if runner is not None:
        return runner
    if program == "sed":
        return sed_allowed(tokens, cwd)
    if program == "rg":
        if any(token.split("=", 1)[0] in RG_PROGRAM_OPTIONS for token in tokens):
            raise Denied(DENY_RG)
        return True
    if program == "sort":
        return sort_allowed(tokens, cwd)
    if program == "uniq":
        return uniq_allowed(tokens, cwd)
    if program == "export":
        check_export(tokens[1:])
        return True
    if program == "unset":
        if not unset_allowed(tokens[1:]):
            raise Denied(DENY_ENV)
        return True
    if program == "printf":
        # `printf -v NAME` assigns to a shell variable.
        if tokens[1:2] and tokens[1].startswith("-v"):
            raise Denied(DENY_PRINTF)
        return True
    if program == "cd":
        if not cd_allowed(tokens[1:], cwd):
            raise Denied(DENY_DIRECTORY)
        return True
    if program == "sleep":
        return sleep_allowed(tokens[1:])
    if program == "file" and has_option(tokens[1:], ("--compile",), "C", "mFefP"):
        # `file -C -m test/magic` writes test/magic.mgc.
        raise Denied(DENY_FILE_COMPILE)
    if program in READ_ONLY:
        return True
    if program == "git":
        if not git_allowed(tokens, cwd):
            raise Denied(DENY_GIT)
        return True
    if program == "gh":
        if not gh_allowed(tokens, cwd):
            raise Denied(DENY_GH)
        return True
    if program == "find":
        if any(token in FIND_WRITES for token in tokens):
            raise Denied(DENY_FIND)
        return True
    if program in MUTATING:
        return file_operation_allowed(program, tokens, cwd)
    raise Denied(unknown_program(program))


def cd_allowed(args, cwd):
    """True when `cd` leaves the shell in the project root.

    Cursor does not tell the hook which directory its shell is in, and the
    shell may keep its directory from one command to the next. The hook checks
    relative paths against the project root, so the shell has to stay there.
    That rules out `cd -`, a bare `cd`, and any directory but the root.

    A shell reads `..` in one of two ways: from the text of the path, or, with
    `cd -P`, after it has resolved symlinks. The target must be the root both ways.
    """
    operands = positional(args)
    if len(operands) != 1 or operands[0] == "-":
        return False
    target = os.path.join(cwd, os.path.expanduser(operands[0]))
    return is_project_root(os.path.normpath(target)) and is_project_root(target)


def check_stage(stage, cwd, piped=False):
    """Emit a deny decision unless one pipeline stage is allowed when run in cwd.

    piped is True when the stage reads the output of the stage before it.
    """
    ignored = ignored_read(stage, cwd, piped)
    if ignored:
        emit("deny", ignored)
    try:
        allowed = atomic_allowed(stage, cwd)
    except Denied as reason:
        emit("deny", str(reason))
    if not allowed:
        emit("deny", DENY_UNCLASSIFIED)


def unquoted(command):
    """Yield the index of each character of command that is outside quotes and not escaped."""
    quote = None
    index = 0
    while index < len(command):
        char = command[index]
        if char == "\\" and quote != "'":
            index += 2
            continue
        if quote:
            if char == quote:
                quote = None
        elif char in {"'", '"'}:
            quote = char
        else:
            yield index
        index += 1


def word_start_problem(command):
    """Why a word of command starts with something the hook cannot follow, as a deny message, or "".

    `#` at the start of a word begins a comment, and the shell skips the rest
    of the line. The hook does not, so a quote inside a comment would hide the
    next line from every later check: in `echo a #'` the hook would read a
    string that runs on into the lines below. `~-`, `~+`, and `~2` at the
    start of a word stand for the directory the shell was in before, the one
    it is in, and one on its directory stack, none of which the hook knows.
    Inside a word, as in `a#b` or `HEAD~2`, neither means anything.
    """
    # The index of the last character outside quotes, to tell `a #b` from `"a"#b` and `a\ #b`.
    previous = -2
    for index in unquoted(command):
        char = command[index]
        starts_word = index == 0 or (previous == index - 1 and command[previous] in WORD_BREAKS)
        previous = index
        if not starts_word:
            continue
        if char == "#":
            return DENY_COMMENT
        following = command[index + 1:index + 2]
        if char == "~" and following and (following in "+-" or following.isdigit()):
            return DENY_TILDE
    return ""


def message_heredoc_end(command, start, delimiter):
    """Where the body of a message heredoc ends: (body, index after `)"`), or None when it is not that form.

    start is the index of the first body line. The body ends at the first
    line that is the delimiter and nothing else, and `)"` must follow on the
    next line.
    """
    lines = []
    index = start
    while True:
        end = command.find("\n", index)
        if end < 0:
            return None
        line = command[index:end]
        index = end + 1
        if line == delimiter:
            break
        lines.append(line)
    while command.startswith((" ", "\t"), index):
        index += 1
    if not command.startswith(')"', index):
        return None
    return "\n".join(lines), index + 2


def inline_message_heredocs(command):
    """Replace each `"$(cat <<'EOF' ... EOF ... )"` in command with the text it stands for, in single quotes.

    This is the form Cursor's agent uses for a commit message or a pull
    request body of several lines:

        git commit -m "$(cat <<'EOF'
        Add sign-in tests

        Cover the wrong password case.
        EOF
        )"

    The delimiter is quoted, so the shell takes the body as it is, and the
    whole construct is one word. The hook can therefore check the command as
    if the text were written in single quotes. Every other heredoc and every
    other `$(...)` stays denied.

    The body may not hold a quote, a backtick, `$`, a backslash, or a round
    bracket. bash 3.2, which macOS still ships as /bin/bash, finds the end of
    `$(...)` by counting brackets and quotes without knowing the heredoc. A
    `)` in the body ends the substitution there, and the rest of the body
    runs as commands. An odd quote moves the end past the closing `)"`, into
    text the hook read as a string. Without those characters every shell
    finds the same end. Run on bash 3.2, 4.0, and 5.3 and on dash. Raises
    Denied for such a body.
    """
    out = []
    quote = None
    index = 0
    while index < len(command):
        char = command[index]
        if char == "\\" and quote != "'":
            out.append(command[index:index + 2])
            index += 2
            continue
        if quote:
            if char == quote:
                quote = None
        elif char == '"':
            match = MESSAGE_HEREDOC.match(command, index)
            found = message_heredoc_end(command, match.end(), match.group(2)) if match else None
            if found:
                body, index = found
                if MESSAGE_UNSAFE.intersection(body):
                    raise Denied(DENY_HEREDOC_TEXT)
                out.append(shlex.quote(body.rstrip("\n")))
                continue
            quote = char
        elif char == "'":
            quote = char
        out.append(char)
        index += 1
    return "".join(out)


def has_heredoc(command):
    """True when command has a heredoc: `<<` or `<<-` outside quotes. `<<<` feeds a string and is not one."""
    skip_until = 0
    for index in unquoted(command):
        if index < skip_until or not command.startswith("<<", index):
            continue
        if not command.startswith("<<<", index):
            return True
        skip_until = index + 3
    return False


def placeholder_in_command(command):
    """The first placeholder such as <file> outside quotes in command, or "".

    Outside quotes the shell reads `<file>` as two redirects, so the text
    cannot be meant as it stands. Inside quotes it can be: `grep "<form>" src`.
    """
    for index in unquoted(command):
        if command[index] == "<":
            match = PLACEHOLDER.match(command, index)
            if match:
                return match.group()
    return ""


def guard_shell(command, cwd):
    """Decide a beforeShellExecution event. Every stage of every segment must pass.

    The command must start in the project root, and cd_allowed() keeps the
    shell there, so every stage is checked as if it runs in cwd.

    The one heredoc the hook reads, a message in `"$(cat <<'EOF' ... )"`, is
    replaced by its text first. Any other heredoc is denied next. Its body is
    file content, so the checks after it would report a `$` or a `<div>` in
    that content, not the heredoc. A comment is denied before anything is
    split, because a quote inside it would move every boundary after it.
    """
    if "\x00" in command:
        # No shell command contains a NUL character, and paths cannot hold one.
        emit("deny", DENY_NUL)
    try:
        command = inline_message_heredocs(command)
    except Denied as reason:
        emit("deny", str(reason))
    command = join_continuations(command)
    if not command.strip():
        emit("allow")
    if not is_project_root(cwd):
        emit("deny", DENY_DIRECTORY)
    if has_heredoc(command):
        emit("deny", DENY_HEREDOC)
    problem = word_start_problem(command)
    if problem:
        emit("deny", problem)
    placeholder = placeholder_in_command(command)
    if placeholder:
        emit("deny", DENY_PLACEHOLDER.format(placeholder=placeholder))
    problem = expansion_problem(command)
    if problem:
        emit("deny", problem)
    if option_wildcard(command):
        emit("deny", DENY_WILDCARD)
    for _, segment in split_compound(command):
        for position, stage in enumerate(split_pipes(segment)):
            check_stage(stage, cwd, piped=position > 0)
    emit("allow")


def all_strings(value, found):
    """Append every string in a nested tool input to found, whatever key it is stored under."""
    if isinstance(value, str):
        found.append(value)
    elif isinstance(value, dict):
        for item in value.values():
            all_strings(item, found)
    elif isinstance(value, list):
        for item in value:
            all_strings(item, found)


def patch_targets(tool_input):
    """The files a patch in the `*** Update File: <path>` format changes, read from the patch text itself.

    A patch tool can carry a `path` key that names one file and a patch that
    changes another, so the paths inside the patch are checked as well.
    """
    texts = []
    all_strings(tool_input, texts)
    targets = []
    for text in texts:
        for match in PATCH_TARGET.finditer(text):
            targets.append(match.group(1).strip())
    return targets


def plain_key(key):
    """A key in lower case without `_` and `-`, so outputPath, output_path, and output-path are one key."""
    return key.lower().replace("_", "").replace("-", "")


def collect_named(value, keys, found):
    """Append (key, text) to found for every string stored under one of keys, at any depth.

    keys are compared through plain_key(). The value of a key may be one
    string or a list of them, as in `paths: ["a", "b"]`.
    """
    if isinstance(value, dict):
        for key, item in value.items():
            if isinstance(key, str) and plain_key(key) in keys and isinstance(item, (str, list)):
                texts = []
                all_strings(item, texts)
                found.extend((key, text) for text in texts)
            else:
                collect_named(item, keys, found)
    elif isinstance(value, list):
        for item in value:
            collect_named(item, keys, found)


def mcp_tool_name(tool_name):
    """The name of an MCP tool without the `MCP:` that preToolUse puts in front."""
    return tool_name[len(MCP_PREFIX):] if tool_name.startswith(MCP_PREFIX) else tool_name


def names_tool(name, tool):
    """True when name is tool, or tool with a server name in front, as in playwright_browser_install."""
    return name == tool or any(name.endswith(separator + tool) for separator in MCP_NAME_SEPARATORS)


def mcp_arguments(tool_input):
    """The arguments of an MCP tool call as a dictionary.

    preToolUse sends an object, and beforeMCPExecution sends the same object
    as a JSON string. Anything else, such as text that is not JSON, gives an
    empty dictionary. The hook then has no argument to check and decides by
    the tool's name alone, so an unexpected shape cannot make it deny every call.
    """
    if isinstance(tool_input, str):
        try:
            tool_input = json.loads(tool_input)
        except (ValueError, RecursionError):
            return {}
    return tool_input if isinstance(tool_input, dict) else {}


def mcp_problem(tool_name, arguments):
    """Why an MCP tool call is not allowed, as a deny message, or "".

    A few tools are denied by name: they run code outside the browser page,
    install software, send data to a cloud service, or open a page for a
    person. For every other tool the hook checks the files it names:

    - a file the tool writes (filename, output, download_path, and the other
      MCP_OUTPUT_KEYS) must be inside the write scope, whatever the tool is;
    - a file or folder a tool is given (path, paths, files, dir, and the
      other MCP_FILE_KEYS) must be inside the write scope when the tool
      changes or sends local files: its name is in MCP_FILE_TOOLS or holds
      one of MCP_WRITE_WORDS.

    Relative paths are resolved against the project root, which is where the
    Playwright MCP server resolves them. The hook cannot see what an MCP
    tool does, so a tool that writes a file named by a key the hook does not
    know passes.
    """
    name = mcp_tool_name(tool_name)
    for tool, message in MCP_DENIED_TOOLS.items():
        if names_tool(name, tool):
            return message
    keys = set(MCP_OUTPUT_KEYS)
    words = re.findall(r"[a-z]+", re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", name).lower())
    if MCP_WRITE_WORDS.intersection(words) or any(names_tool(name, tool) for tool in MCP_FILE_TOOLS):
        keys |= MCP_FILE_KEYS
    named = []
    collect_named(arguments, keys, named)
    root = str(REPO)
    for key, path in named:
        if path and not is_allowed(path, root) and not is_cursor_file(path, root):
            hint = HINT_MCP_OUTPUT if plain_key(key) in MCP_OUTPUT_KEYS else HINT_MCP_FILE
            return DENY_MCP_PATH.format(tool=name, path=path, key=key, hint=hint.format(key=key))
    return ""


def is_mcp_call(payload, tool_name):
    """True for an MCP tool call in either of its two events, and for Cursor's tool that saves an MCP resource."""
    return (
        payload.get("hook_event_name") == MCP_EVENT
        or "mcp_server_name" in payload
        or tool_name.startswith(MCP_PREFIX)
        or tool_name == MCP_RESOURCE_TOOL
    )


def guard_tool(payload, cwd):
    """Decide a preToolUse or beforeMCPExecution event.

    An MCP tool call is checked first: see mcp_problem(). Its arguments are
    then read like those of any other tool.

    A write tool needs every target path inside the write scope, or among
    Cursor's own files. A tool the hook does not know by name counts as a
    write tool when its input has a path key and a content key, so a renamed
    or new writing tool is still checked. Every other tool passes.

    A write under test/ must also pass the naming rules and the content
    rules. `Delete` is held to the write scope only, so the agent can remove
    a file that has a wrong name or forbidden text.
    """
    tool_name = payload.get("tool_name") or payload.get("tool") or ""
    if not isinstance(tool_name, str):
        emit("deny", DENY_SHAPE)
    tool_input = payload.get("tool_input")
    if tool_input is None:
        tool_input = payload.get("input") or {}
    if is_mcp_call(payload, tool_name):
        tool_input = mcp_arguments(tool_input)
        problem = mcp_problem(tool_name, tool_input)
        if problem:
            emit("deny", problem)
    writes = has_key(tool_input, PATH_KEYS) and has_key(tool_input, CONTENT_KEYS)
    if tool_name not in WRITE_TOOLS and not writes:
        emit("allow")
    paths = []
    collect_strings(tool_input, PATH_KEYS, paths)
    if tool_name == PATCH_TOOL:
        paths.extend(patch_targets(tool_input))
    if not paths:
        emit("deny", DENY_NO_TARGET)
    for path in paths:
        if not is_allowed(path, cwd) and not is_cursor_file(path, cwd):
            emit("deny", outside_scope_message(path))
    if tool_name != DELETE_TOOL:
        for path in paths:
            problem = path_problem(path, cwd)
            if problem:
                emit("deny", problem)
        problem = content_problem(paths, tool_input, cwd) or mobile_config_problem(paths, tool_input, cwd)
        if problem:
            emit("deny", problem)
    emit("allow")


def decide(raw):
    """Route one hook payload, given as the bytes Cursor wrote to stdin. Malformed input is denied."""
    try:
        # utf-8-sig drops the byte order mark that Cursor on Windows puts first.
        text = raw.decode("utf-8-sig")
        payload = json.loads(text) if text.strip() else {}
    except ValueError:
        emit("deny", "Edit blocked because the hook input was not valid JSON.")
    if not isinstance(payload, dict):
        emit("deny", DENY_SHAPE)
    # Cursor sends an empty cwd for shell commands and none for file tools.
    # Its shell and its tools start in the project root.
    cwd = payload.get("cwd") or str(REPO)
    event = payload.get("hook_event_name") or ""
    # In a beforeMCPExecution payload `command` is the line that started the
    # MCP server, such as `npx --no-install @playwright/mcp`. It is not a
    # shell command to check, so an MCP call never goes to guard_shell().
    # A shell command is always checked as one, whatever else its payload holds.
    mcp = event == MCP_EVENT or ("mcp_server_name" in payload and event != "beforeShellExecution")
    if not isinstance(cwd, str):
        if not mcp:
            emit("deny", DENY_SHAPE)
        cwd = str(REPO)
    if not mcp and (event == "beforeShellExecution" or ("command" in payload and "tool_name" not in payload)):
        guard_shell(str(payload.get("command") or ""), cwd)
    guard_tool(payload, cwd)


def main():
    """Answer one hook call. An error inside the hook becomes a deny with a message, not a crash."""
    try:
        decide(sys.stdin.buffer.read())
    except Exception:
        # Every error is caught on purpose: Cursor must get an answer with a
        # reason. The traceback goes to stderr, which Cursor shows in its Hooks output.
        import traceback

        traceback.print_exc()
        emit("deny", DENY_INTERNAL)


if __name__ == "__main__":
    main()
