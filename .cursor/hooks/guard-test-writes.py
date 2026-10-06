#!/usr/bin/env python3
"""Deny agent edits outside tests, repo metadata, skills, and agents.

Cursor runs this hook before every tool call (preToolUse) and every shell
command (beforeShellExecution); see .cursor/hooks.json. It reads one JSON
payload on stdin and prints {"permission": "allow" | "deny", ...} on stdout.

Write tools are allowed only when every target path is inside the write scope.
Shell commands are split into segments and pipeline stages, and each stage
must be a test runner, a known read-only program, an allowed git or gh
command, or a file operation whose targets are all inside the write scope.
Anything the hook cannot classify is denied.

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

# Write scope. Keep AGENTS.md and WRITE_SCOPE in step with these.
ALLOWED_FILES = {
    (REPO / "vitest.config.ts").resolve(),
    (REPO / "playwright.config.ts").resolve(),
    (REPO / ".gitignore").resolve(),
    (REPO / "AGENTS.md").resolve(),
}
ALLOWED_DIRS = (
    (REPO / "test").resolve(),
    (REPO / ".cursor" / "skills").resolve(),
    (REPO / ".cursor" / "agents").resolve(),
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
# Keys in a tool's input that name a target file.
PATH_KEYS = {
    "path",
    "file_path",
    "filepath",
    "target_file",
    "notebook_path",
    "file",
}
# Environment variables a command may set, export, or unset. Any other name is
# denied: PATH, GIT_EXTERNAL_DIFF, GIT_SSH_COMMAND, NODE_OPTIONS, and the like
# make an allowed program run a different one.
ALLOWED_ENV = {"BASE_URL", "CI", "FORCE_COLOR", "NO_COLOR", "PLAYWRIGHT_HTML_OPEN", "RTK_DISABLED"}
# Values those variables may take: no spaces, quotes, or shell syntax.
SAFE_ENV_VALUE = re.compile(r"[A-Za-z0-9._:/@%+=,-]*")
# A leading `NAME=value` or `NAME+=value` word.
ASSIGNMENT = re.compile(r"([A-Za-z_][A-Za-z0-9_]*)\+?=(.*)", re.S)
# Programs that cannot write files. sed, sort, uniq, printf, export, and unset
# can write files or change what later commands run, so they have their own
# checks in atomic_allowed().
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
    "cd",
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
# `playwright test` options whose value is a path the runner writes to or loads from.
PLAYWRIGHT_PATH_OPTIONS = {"--config", "--output", "--last-failed-file"}
# `playwright test` short options that take a value. A `c` after one of these
# is part of that value, not the short form of --config.
PLAYWRIGHT_VALUE_SHORTS = "gGj"
# playwright-cli commands the healer uses to inspect a test paused by `--debug=cli`.
PLAYWRIGHT_CLI_COMMANDS = {
    "attach", "detach", "list",
    "pause-at", "resume", "step-over",
    "snapshot", "find", "generate-locator", "console", "requests", "request",
    "click", "dblclick", "fill", "type", "press", "hover", "select", "check", "uncheck",
}
# playwright-cli options whose value is a path the command writes to.
PLAYWRIGHT_CLI_PATH_OPTIONS = {"--filename"}
# playwright-cli options that attach to a browser other than the paused test's,
# or load another configuration.
PLAYWRIGHT_CLI_DENIED_OPTIONS = {"--cdp", "--endpoint", "--extension", "--config"}
# File operations allowed only when every operand is inside the write scope.
# `install` is left out: its --strip-program option runs a program.
MUTATING = {"rm", "mv", "cp", "mkdir", "touch", "tee", "truncate", "ln"}
# File operations that take their destination from -t or --target-directory.
TARGET_DIRECTORY_PROGRAMS = {"cp", "mv", "ln"}
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
GIT_READ_CONFIG = {"--get", "--get-all", "--get-regexp", "--list", "-l", "get", "list"}
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
# Programs whose operands are files they read, checked against .cursorignore.
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
# Stands in for the working directory after a `cd` the hook cannot follow. It
# is outside the repository, so every relative path checked against it is denied.
UNKNOWN_CWD = "/nonexistent/unknown-working-directory"

# Deny messages. The agent sees them, so each says what it can do instead.
DENY_GENERIC = (
    "Shell can run test commands, reads, git, and gh. It cannot create or modify files outside "
    + WRITE_SCOPE
    + "."
)
DENY_SUBSTITUTION = (
    "Shell commands cannot use $(...), backticks, or process substitution. Run each command on its own."
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
DENY_RUNNER = "Only `vitest` (except `vitest init`) and `playwright test` may be run."
DENY_RUNNER_PATH = (
    "Test runner options that name a file or folder, such as --outputFile, --output, --config, --root, "
    "--dir, and --filename, must point inside " + WRITE_SCOPE + "."
)
DENY_PLAYWRIGHT_CLI = (
    "playwright-cli is limited to these commands, on the test paused by --debug=cli: "
    + ", ".join(sorted(PLAYWRIGHT_CLI_COMMANDS))
    + "."
)
DENY_GIT = (
    "That git command is not allowed. git may inspect, stage, commit, create a branch or tag, fetch, and "
    "push a branch to a configured remote. It may not force-push, delete or rename a branch or tag, amend, "
    "move HEAD, change remotes, switch branches, write files, or change another repository. "
    "Ask the user to run it."
)
DENY_GH = (
    "That gh command is not allowed. gh may view and list, create a pull request or issue in this "
    "repository, comment on one, and send GET requests with `gh api`. A body file must be inside the write "
    "scope. Ask the user to run it."
)


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
    """Patterns from .cursorignore, skipping blank lines, comments, and `!` negations."""
    try:
        lines = (REPO / ".cursorignore").read_text().splitlines()
    except OSError:
        return []
    patterns = []
    for line in lines:
        line = line.strip()
        if line and not line.startswith(("#", "!")):
            patterns.append(line)
    return patterns


IGNORE_PATTERNS = load_ignore_patterns()


def is_ignored(path_text, cwd):
    """True when a path matches .cursorignore. Supports names, globs, `dir/`, and `/anchored` paths."""
    path = Path(os.path.expanduser(path_text))
    if not path.is_absolute():
        path = Path(cwd) / path
    try:
        resolved = path.resolve()
        relative = resolved.relative_to(REPO)
    except (OSError, ValueError):
        return False
    parts = relative.parts
    for pattern in IGNORE_PATTERNS:
        dir_only = pattern.endswith("/")
        pattern = pattern.strip("/")
        if "/" in pattern:
            text = relative.as_posix()
            if fnmatch.fnmatch(text, pattern) or text.startswith(pattern + "/"):
                return True
            continue
        for index, part in enumerate(parts):
            if not fnmatch.fnmatch(part, pattern):
                continue
            if dir_only and index == len(parts) - 1 and not resolved.is_dir():
                continue
            return True
    return False


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
    """True for `-i`, `-i.bak`, bundled `-Ei`, `--in-place`, or a shortened `--in-place` such as `--i`."""
    for token in tokens[1:]:
        if abbreviates(token.split("=", 1)[0], "--in-place"):
            return True
        if token.startswith("-") and not token.startswith("--"):
            for letter in token[1:]:
                if letter == "i":
                    return True
                if letter in VALUE_SHORT_OPTIONS["sed"]:
                    break
    return False


def sed_allowed(tokens, cwd):
    """Deny scripts that write or run commands, `-f` scripts, and in-place edits outside the write scope."""
    scripts, script_files, operands = parse_pattern_command(tokens)
    if script_files or not all(sed_script_safe(script) for script in scripts):
        return False
    if sed_in_place(tokens):
        return bool(operands) and all(is_allowed(path, cwd) for path in operands)
    return True


def sort_allowed(tokens, cwd):
    """`sort -o FILE` writes FILE, and `--compress-program` runs a program."""
    for index, token in enumerate(tokens[1:], start=1):
        following = tokens[index + 1] if index + 1 < len(tokens) else ""
        if token.startswith("--"):
            name, has_value, value = token.partition("=")
            if abbreviates(name, "--compress-program"):
                return False
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
            return False
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
    return all(is_allowed(operand, cwd) for operand in operands[1:])


def ignored_read(segment, cwd):
    """The first .cursorignore path a read command would open, or None.

    Redirects stay in the token list here, so `cat < package-lock.json` is caught.
    """
    try:
        tokens = unwrap_rtk(strip_env(shlex.split(segment)))
    except ValueError:
        return None
    if not tokens or tokens[0] not in READ_FILE_PROGRAMS:
        return None
    for operand in read_operands(tokens):
        if is_ignored(operand, cwd):
            return operand
    return None


def is_allowed(path_text, cwd):
    """True when a path, resolved against cwd and symlinks, is inside the write scope."""
    if "\x00" in path_text:
        return False
    raw = os.path.expanduser(path_text)
    path = Path(raw)
    if not path.is_absolute():
        path = Path(cwd) / path
    try:
        resolved = path.resolve()
    except OSError:
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


def in_repository(directory):
    """True when a directory is the repository root or inside it, after resolving symlinks."""
    try:
        Path(directory).resolve().relative_to(REPO)
    except (OSError, ValueError):
        return False
    return True


def collect_paths(value, found):
    """Append every string under a PATH_KEYS key in a nested tool input to found."""
    if isinstance(value, dict):
        for key, item in value.items():
            if key.lower() in PATH_KEYS and isinstance(item, str):
                found.append(item)
            else:
                collect_paths(item, found)
    elif isinstance(value, list):
        for item in value:
            collect_paths(item, found)


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


def env_allowed(name, value):
    """True when a command may set this variable to this value."""
    return name in ALLOWED_ENV and SAFE_ENV_VALUE.fullmatch(value) is not None


def export_allowed(args):
    """`export NAME=value` and `export NAME` for the variables in ALLOWED_ENV. `export -p` prints."""
    for arg in args:
        if arg.startswith("-"):
            if arg != "-p":
                return False
            continue
        name, has_value, value = arg.partition("=")
        if not env_allowed(name, value if has_value else ""):
            return False
    return True


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


def operand_paths(tokens):
    """Arguments after the program that are not options."""
    return [token for token in tokens[1:] if not token.startswith("-")]


def mutating_paths(program, tokens):
    """Paths a file operation touches: its operands, and the directory named by -t or --target-directory.

    `cp --target-directory=src a` and `cp -tsrc a` name the destination inside
    an option, where operand_paths() does not look.
    """
    paths = operand_paths(tokens)
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


def vitest_path_values(args):
    """Values of vitest options that name a file or directory.

    vitest accepts `--outputFile=x`, `--outputFile x`, the kebab-case
    `--output-file`, the per-reporter `--outputFile.json`, and `-c x` or `-c=x`.
    In a bundle of short options, the last letter takes the value.
    """
    values = []
    for index, arg in enumerate(args):
        if not arg.startswith("-"):
            continue
        name, has_value, value = arg.partition("=")
        if not has_value:
            value = args[index + 1] if index + 1 < len(args) else ""
        if name.startswith("--"):
            key = name[2:].replace("-", "").lower()
            if key in VITEST_PATH_OPTIONS or key.startswith("outputfile."):
                values.append(value)
        elif name[-1] in VITEST_PATH_SHORTS:
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


def npm_run_allowed(args, cwd):
    """`npm run <test script>`, with runner arguments only after `--`."""
    if len(args) < 2 or args[0] != "run" or args[1] not in NPM_TEST_SCRIPTS:
        raise Denied(DENY_NPM)
    rest = args[2:]
    split = rest.index("--") if "--" in rest else len(rest)
    # An npm option such as --script-shell or --prefix changes what the script runs.
    if any(arg.startswith("-") for arg in rest[:split]):
        raise Denied(DENY_NPM)
    script_args = rest[split + 1:]
    if args[1].startswith("test:e2e"):
        return runner_paths_allowed(playwright_path_values(script_args), cwd)
    return runner_paths_allowed(vitest_path_values(script_args), cwd)


def playwright_cli_allowed(args, cwd):
    """Allow the commands the healer uses on a paused test.

    Deny commands that write files, run code, or open another browser, and a
    `--filename` outside the write scope. The command is the first argument
    that is not an option, so `-s=<session>` may come before it.
    """
    command = ""
    for index, arg in enumerate(args):
        if not arg.startswith("-"):
            command = command or arg
            continue
        name, has_value, value = arg.partition("=")
        if name in PLAYWRIGHT_CLI_DENIED_OPTIONS:
            raise Denied(DENY_PLAYWRIGHT_CLI)
        if name in PLAYWRIGHT_CLI_PATH_OPTIONS:
            if not has_value:
                value = args[index + 1] if index + 1 < len(args) else ""
            runner_paths_allowed([value], cwd)
    if command not in PLAYWRIGHT_CLI_COMMANDS:
        raise Denied(DENY_PLAYWRIGHT_CLI)
    return True


def runner_allowed(program, args, cwd):
    """True for an allowed test runner command, or None when the program is not a test runner.

    Covers `npm run <test script>`, and vitest, `playwright test`, and
    playwright-cli run directly or through npx. Raises Denied otherwise.
    """
    if program == "npm":
        return npm_run_allowed(args, cwd)
    if program == "npx":
        command = npx_command(args)
        if command is None:
            raise Denied(DENY_NPX)
        program, args = command[0], command[1:]
    if program == "vitest":
        # `vitest init` writes config and example files in the project root.
        if "init" in args:
            raise Denied(DENY_RUNNER)
        return runner_paths_allowed(vitest_path_values(args), cwd)
    if program == "playwright":
        if not args or args[0] != "test":
            raise Denied(DENY_RUNNER)
        return runner_paths_allowed(playwright_path_values(args[1:]), cwd)
    if program == "playwright-cli":
        return playwright_cli_allowed(args, cwd)
    return None


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
        return any(arg in GIT_READ_CONFIG for arg in args)
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
        paths = operand_paths(["git"] + [arg for arg in args if arg != "--"])
        return bool(paths) and all(is_allowed(path, cwd) for path in paths)
    if subcommand in {"checkout", "switch"}:
        if subcommand == "checkout" and "--" in args:
            if args.index("--") != 0:
                return False
            paths = args[1:]
            return bool(paths) and all(is_allowed(path, cwd) for path in paths)
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


def gh_post_allowed(args, cwd):
    """Check the options of `gh pr|issue create|comment`, which publish to GitHub.

    `--body-file` and `-F` send a file's content, so the file must be inside
    the write scope, or `-` for standard input. `--repo` and `-R` choose
    another repository, and `--delete-last` removes a comment; both are denied.
    """
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
            if name == "--body-file" and value != "-" and not is_allowed(value, cwd):
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
                if letter == "F" and value != "-" and not is_allowed(value, cwd):
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
        return in_repository(cwd) and gh_post_allowed(args[1:], cwd)
    if command == "auth":
        # `gh auth status --show-token` and `-t` print the token.
        return not any(
            arg.startswith("--show-token") or (arg.startswith("-") and not arg.startswith("--") and "t" in arg)
            for arg in args
        )
    return True


def atomic_allowed(segment, cwd):
    """True when one pipeline stage, including its redirects, is allowed when run in cwd.

    Raises Denied when a check can say why the stage is not allowed.
    """
    for target in redirect_targets(segment):
        # An empty target means the hook and the shell read the redirect differently.
        if not target or (target != "/dev/null" and not is_allowed(target, cwd)):
            return False
    try:
        assignments, tokens = split_env(command_words(segment))
    except ValueError:
        return False
    if not all(env_allowed(name, value) for name, value in assignments):
        raise Denied(DENY_ENV)
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
        return not any(token.split("=", 1)[0] in RG_PROGRAM_OPTIONS for token in tokens)
    if program == "sort":
        return sort_allowed(tokens, cwd)
    if program == "uniq":
        return uniq_allowed(tokens, cwd)
    if program == "export":
        if not export_allowed(tokens[1:]):
            raise Denied(DENY_ENV)
        return True
    if program == "unset":
        if not unset_allowed(tokens[1:]):
            raise Denied(DENY_ENV)
        return True
    if program == "printf":
        # `printf -v NAME` assigns to a shell variable.
        return not tokens[1:2] or not tokens[1].startswith("-v")
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
        return not any(token in FIND_WRITES for token in tokens)
    if program in MUTATING:
        paths = mutating_paths(program, tokens)
        return bool(paths) and all(is_allowed(path, cwd) for path in paths)
    return False


def changed_directories(stage, directories):
    """Where the shell could be after a `cd` stage started in one of directories.

    Returns None when the stage is not a `cd`. `cd -` gives UNKNOWN_CWD,
    because the hook does not know the directory before this one. So does
    `cd -P`: it resolves symbolic links before `..`, which normpath() does not.
    """
    try:
        tokens = strip_env(command_words(stage))
    except ValueError:
        return None
    if not tokens or tokens[0] != "cd":
        return None
    operands = positional(tokens[1:])
    target = operands[0] if operands else "~"
    physical = any(token.startswith("-") and "P" in token for token in tokens[1:] if token not in operands)
    if target == "-" or physical:
        return {UNKNOWN_CWD}
    target = os.path.expanduser(target)
    return {os.path.normpath(os.path.join(directory, target)) for directory in directories}


def check_stage(stage, cwd):
    """Emit a deny decision unless one pipeline stage is allowed when run in cwd."""
    ignored = ignored_read(stage, cwd)
    if ignored:
        emit(
            "deny",
            f"{ignored} is in .cursorignore (lockfiles, build output, test reports). "
            "Read package.json or the source instead.",
        )
    try:
        allowed = atomic_allowed(stage, cwd)
    except Denied as reason:
        emit("deny", str(reason))
    if not allowed:
        emit("deny", DENY_GENERIC)


def guard_shell(command, cwd):
    """Decide a beforeShellExecution event. Every stage of every segment must pass.

    A `cd` changes what relative paths in later segments mean, so the hook
    tracks the directories the shell could be in. After `cd dir && …` that is
    `dir`. After `cd dir; …` or `cd dir || …` the cd may have failed, so the
    rest must be allowed both in `dir` and in the directory before it.
    """
    if "\x00" in command:
        # No shell command contains a NUL character, and paths cannot hold one.
        emit("deny", "The command contains a NUL character.")
    command = join_continuations(command)
    if not command.strip():
        emit("allow")
    problem = expansion_problem(command)
    if problem:
        emit("deny", problem)
    if option_wildcard(command):
        emit("deny", DENY_WILDCARD)
    chain = {cwd}
    possible = {cwd}
    after_cd = None
    for operator, segment in split_compound(command):
        if operator != "&&":
            chain = set(possible)
        elif after_cd is not None:
            chain = after_cd
        after_cd = None
        stages = split_pipes(segment)
        for stage in stages:
            for directory in sorted(chain):
                check_stage(stage, directory)
        moved = changed_directories(stages[0], chain) if len(stages) == 1 else None
        if moved is not None:
            possible |= moved
            after_cd = moved
    emit("allow")


def guard_tool(payload, cwd):
    """Decide a preToolUse event. Non-write tools pass; write tools need every path in scope."""
    tool_name = payload.get("tool_name") or payload.get("tool") or ""
    if tool_name not in WRITE_TOOLS:
        emit("allow")
    tool_input = payload.get("tool_input")
    if tool_input is None:
        tool_input = payload.get("input") or {}
    paths = []
    collect_paths(tool_input, paths)
    if not paths:
        emit(
            "deny",
            "Edit blocked because the target path was missing. Writes are limited to " + WRITE_SCOPE + ".",
        )
    for path in paths:
        if not is_allowed(path, cwd):
            emit(
                "deny",
                f"Edit blocked for {path}. Writes are limited to {WRITE_SCOPE}.",
            )
    emit("allow")


def main():
    """Read the hook payload from stdin and route it. Malformed input is denied."""
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        emit("deny", "Edit blocked because the hook input was not valid JSON.")
    if not isinstance(payload, dict):
        emit("deny", "Edit blocked because the hook input had an unexpected shape.")
    cwd = payload.get("cwd") or os.getcwd()
    event = payload.get("hook_event_name") or ""
    if event == "beforeShellExecution" or ("command" in payload and "tool_name" not in payload):
        guard_shell(str(payload.get("command") or ""), cwd)
    guard_tool(payload, cwd)


if __name__ == "__main__":
    main()
