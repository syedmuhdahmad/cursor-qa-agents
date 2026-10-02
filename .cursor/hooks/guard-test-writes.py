#!/usr/bin/env python3
"""Deny agent edits outside tests, repo metadata, skills, and agents.

Cursor runs this hook before every tool call (preToolUse) and every shell
command (beforeShellExecution); see .cursor/hooks.json. It reads one JSON
payload on stdin and prints {"permission": "allow" | "deny", ...} on stdout.

Write tools are allowed only when every target path is inside the write scope.
Shell commands are split into segments and pipeline stages, and each stage
must be a test runner, a known read-only program, a safe git or gh command,
or a file operation whose targets are all inside the write scope. Anything
the hook cannot classify is denied.
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
# Programs that cannot write files. sed, sort, and uniq can, so they have
# their own checks in atomic_allowed().
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
    "export",
    "unset",
    "test",
    "[",
    ":",
}
# package.json scripts the agent may run.
NPM_TEST_SCRIPTS = {
    "test:unit",
    "test:integration",
    "test:e2e",
    "test:e2e:list",
}
# File operations allowed only when every operand is inside the write scope.
MUTATING = {"rm", "mv", "cp", "mkdir", "touch", "tee", "install", "truncate", "ln"}
# git options and subcommands that cannot rewrite working-tree files.
GIT_SAFE_GLOBAL_OPTIONS = {"--no-pager", "-P", "--no-optional-locks", "--paginate", "-p"}
GIT_READ_OR_COMMIT = {
    "status", "log", "diff", "show", "blame", "grep", "ls-files", "ls-remote", "ls-tree",
    "rev-parse", "rev-list", "describe", "shortlog", "reflog", "cat-file", "merge-base",
    "name-rev", "for-each-ref", "show-ref", "check-ignore", "version", "help",
    "add", "commit", "fetch", "push", "tag", "branch", "remote",
}
GIT_READ_CONFIG = {"--get", "--get-all", "--get-regexp", "--list", "-l", "get", "list"}
# gh commands that act on GitHub. GH_DENIED lists those that write local
# files; GH_ONLY limits a command to the listed actions.
GH_COMMANDS = {"pr", "issue", "api", "run", "workflow", "status", "search", "browse", "label", "release", "repo", "auth"}
GH_DENIED = {
    ("pr", "checkout"),
    ("run", "download"),
    ("release", "download"),
}
GH_ONLY = {
    "repo": {"view", "list"},
    "auth": {"status"},
}
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
FIND_WRITES = {"-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprintf"}


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


def parse_pattern_command(tokens):
    """Split a grep, rg, or sed command into (patterns, files named by -f, other operands).

    Handles `-e X`, `-eX`, bundled `-rne X`, `--regexp=X`, and `-f FILE` / `--file=FILE`.
    Without `-e` or `-f`, the first operand is the pattern or script.
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
            if name in PATTERN_LONG_OPTIONS or name in FILE_LONG_OPTIONS:
                explicit = True
                if not has_value:
                    value = following
                    index += 1
                (patterns if name in PATTERN_LONG_OPTIONS else files).append(value)
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
    """True for `-i`, `-i.bak`, bundled `-Ei`, or `--in-place`."""
    for token in tokens[1:]:
        if token.startswith("--in-place"):
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
    """`sort -o FILE` writes FILE."""
    for index, token in enumerate(tokens[1:], start=1):
        following = tokens[index + 1] if index + 1 < len(tokens) else ""
        if token == "--output":
            target = following
        elif token.startswith("--output="):
            target = token.split("=", 1)[1]
        elif token.startswith("-") and not token.startswith("--") and "o" in token:
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
    """`uniq INPUT OUTPUT` writes OUTPUT."""
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
    return len(operands) < 2 or is_allowed(operands[1], cwd)


def ignored_read(segment, cwd):
    """The first .cursorignore path a read command would open, or None."""
    try:
        tokens = unwrap_rtk(strip_env(shlex.split(segment)))
    except ValueError:
        return None
    if not tokens or os.path.basename(tokens[0]) not in READ_FILE_PROGRAMS:
        return None
    for operand in read_operands(tokens):
        if is_ignored(operand, cwd):
            return operand
    return None


def is_allowed(path_text, cwd):
    """True when a path, resolved against cwd and symlinks, is inside the write scope."""
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


def is_redirect_amp(command, index):
    """`&` in `2>&1`, `>&2`, `&>file`, or `|&` is a redirect, not a background operator."""
    before = command[index - 1] if index > 0 else ""
    after = command[index + 1] if index + 1 < len(command) else ""
    return before in {">", "<", "|"} or after == ">"


def has_substitution(command):
    """True when the shell would run a nested command: `$(...)`, backticks, `<(...)`, or `>(...)`."""
    quote = None
    i = 0
    while i < len(command):
        char = command[i]
        if char == "\\" and quote != "'":
            i += 2
            continue
        if quote == "'":
            if char == "'":
                quote = None
            i += 1
            continue
        if char == "`" or command.startswith("$(", i):
            return True
        if quote is None and (command.startswith("<(", i) or command.startswith(">(", i)):
            return True
        if char == '"':
            quote = None if quote == '"' else '"'
        elif char == "'" and quote is None:
            quote = "'"
        i += 1
    return False


def split_compound(command):
    """Split a command line on `&&`, `||`, `;`, newlines, and background `&`, outside quotes."""
    parts = []
    buf = []
    quote = None
    i = 0
    while i < len(command):
        char = command[i]
        if quote:
            buf.append(char)
            if char == quote and (i == 0 or command[i - 1] != "\\"):
                quote = None
            i += 1
            continue
        if char in {"'", '"'}:
            quote = char
            buf.append(char)
            i += 1
            continue
        if command.startswith("&&", i) or command.startswith("||", i):
            parts.append("".join(buf))
            buf = []
            i += 2
            continue
        if char == "&" and not is_redirect_amp(command, i):
            parts.append("".join(buf))
            buf = []
            i += 1
            continue
        if char in {";", "\n"}:
            parts.append("".join(buf))
            buf = []
            i += 1
            continue
        buf.append(char)
        i += 1
    parts.append("".join(buf))
    return [part.strip() for part in parts if part.strip()]


def split_pipes(segment):
    """Split one command segment into pipeline stages on `|` and `|&`, outside quotes."""
    parts = []
    buf = []
    quote = None
    i = 0
    while i < len(segment):
        char = segment[i]
        if quote:
            buf.append(char)
            if char == quote and (i == 0 or segment[i - 1] != "\\"):
                quote = None
            i += 1
            continue
        if char in {"'", '"'}:
            quote = char
            buf.append(char)
            i += 1
            continue
        if char == "|":
            parts.append("".join(buf))
            buf = []
            i += 2 if segment.startswith("|&", i) else 1
            continue
        buf.append(char)
        i += 1
    parts.append("".join(buf))
    return [part.strip() for part in parts if part.strip()]


def read_word(text, index):
    """Read one shell word starting at index, honoring quotes. Returns (word, next_index)."""
    word = []
    quote = None
    while index < len(text):
        char = text[index]
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


def strip_env(tokens):
    """Drop leading `NAME=value` assignments so tokens[0] is the program."""
    index = 0
    while index < len(tokens) and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", tokens[index]):
        index += 1
    return tokens[index:]


def is_test_runner(tokens):
    """True for an allowed npm test script, or vitest, playwright-cli, or `playwright test`, directly or via npx."""
    if not tokens:
        return False
    program = os.path.basename(tokens[0])
    if program == "npm":
        return (
            len(tokens) >= 3
            and tokens[1] == "run"
            and tokens[2] in NPM_TEST_SCRIPTS
        )
    rest = tokens
    if program == "npx":
        index = 1
        while index < len(tokens) and tokens[index].startswith("-"):
            if tokens[index] in {"--package", "-p", "-c"} and index + 1 < len(tokens):
                index += 2
                continue
            index += 1
        if index >= len(tokens):
            return False
        program = os.path.basename(tokens[index])
        rest = tokens[index:]
    if program in {"vitest", "playwright-cli"}:
        return True
    if program == "playwright":
        return len(rest) >= 2 and rest[1] == "test"
    return False


def operand_paths(tokens):
    """Arguments after the program that are not options."""
    return [token for token in tokens[1:] if not token.startswith("-")]


def unwrap_rtk(tokens):
    """Cursor rewrites git and gh to `rtk git` and `rtk gh` before this hook runs."""
    if not tokens or os.path.basename(tokens[0]) != "rtk":
        return tokens
    index = 1
    while index < len(tokens) and tokens[index].startswith("-"):
        index += 1
    return tokens[index:]


def git_allowed(tokens, cwd):
    """Allow reading, committing, and pushing. Deny anything that can rewrite working-tree files
    outside the write scope: branch switches, merges, aliases, config overrides, and unknown commands."""
    index = 1
    while index < len(tokens) and tokens[index].startswith("-"):
        option = tokens[index]
        if option == "-C" and index + 1 < len(tokens):
            index += 2
            continue
        if option not in GIT_SAFE_GLOBAL_OPTIONS:
            return False
        index += 1
    if index >= len(tokens):
        return True
    subcommand = tokens[index]
    args = tokens[index + 1:]
    if subcommand in GIT_READ_OR_COMMIT:
        return True
    if subcommand == "config":
        return any(arg in GIT_READ_CONFIG for arg in args)
    if subcommand == "stash":
        return bool(args) and args[0] in {"list", "show"}
    if subcommand == "worktree":
        return bool(args) and args[0] == "list"
    if subcommand == "reset":
        return not any(arg in {"--hard", "--merge", "--keep"} for arg in args)
    if subcommand in {"restore", "rm", "mv"}:
        paths = operand_paths(["git"] + [arg for arg in args if arg != "--"])
        return bool(paths) and all(is_allowed(path, cwd) for path in paths)
    if subcommand in {"checkout", "switch"}:
        if subcommand == "checkout" and "--" in args:
            if args.index("--") != 0:
                return False
            paths = args[1:]
            return bool(paths) and all(is_allowed(path, cwd) for path in paths)
        create = {"-b", "-B"} if subcommand == "checkout" else {"-c", "-C"}
        # A new branch from HEAD leaves the working tree as it is. Any start point may not.
        return len(args) == 2 and args[0] in create and not args[1].startswith("-")
    return False


def gh_allowed(tokens):
    """Allow gh commands that act on GitHub. Deny those that write local files, and aliases."""
    if len(tokens) < 2 or tokens[1] not in GH_COMMANDS:
        return False
    command = tokens[1]
    action = tokens[2] if len(tokens) > 2 else ""
    if (command, action) in GH_DENIED:
        return False
    if command in GH_ONLY:
        return action in GH_ONLY[command]
    return True


def atomic_allowed(segment, cwd):
    """True when one pipeline stage, including its redirects, stays inside the write scope."""
    for target in redirect_targets(segment):
        if target != "/dev/null" and not is_allowed(target, cwd):
            return False
    try:
        tokens = unwrap_rtk(strip_env(shlex.split(segment)))
    except ValueError:
        return False
    if not tokens:
        return True
    program = os.path.basename(tokens[0])
    if is_test_runner(tokens):
        return True
    if program == "sed":
        return sed_allowed(tokens, cwd)
    if program == "rg":
        return not any(token == "--pre" or token.startswith("--pre=") for token in tokens)
    if program == "sort":
        return sort_allowed(tokens, cwd)
    if program == "uniq":
        return uniq_allowed(tokens, cwd)
    if program in READ_ONLY:
        return True
    if program == "git":
        return git_allowed(tokens, cwd)
    if program == "gh":
        return gh_allowed(tokens)
    if program == "find":
        return not any(token in FIND_WRITES for token in tokens)
    if program in MUTATING:
        paths = operand_paths(tokens)
        return bool(paths) and all(is_allowed(path, cwd) for path in paths)
    return False


def guard_shell(command, cwd):
    """Decide a beforeShellExecution event. Every stage of every segment must pass."""
    if not command.strip():
        emit("allow")
    if has_substitution(command):
        emit(
            "deny",
            "Shell commands cannot use $(...), backticks, or process substitution. Run each command on its own.",
        )
    segments = split_compound(command)
    if not segments:
        emit("allow")
    for segment in segments:
        for stage in split_pipes(segment):
            ignored = ignored_read(stage, cwd)
            if ignored:
                emit(
                    "deny",
                    f"{ignored} is in .cursorignore (lockfiles, build output, test reports). "
                    "Read package.json or the source instead.",
                )
            if not atomic_allowed(stage, cwd):
                emit(
                    "deny",
                    "Shell can run test commands, reads, git, and gh. It cannot create or modify files outside "
                    + WRITE_SCOPE
                    + ".",
                )
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
