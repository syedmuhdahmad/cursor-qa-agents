#!/usr/bin/env python3
"""Deny agent edits outside tests, repo metadata, skills, and agents."""

import json
import os
import re
import shlex
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
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
ROOT_README_NAMES = {"readme", "readme.md"}
WRITE_SCOPE = (
    "test/, vitest.config.ts, playwright.config.ts, README.md, .gitignore, "
    "AGENTS.md, .cursor/skills/, and .cursor/agents/"
)
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
PATH_KEYS = {
    "path",
    "file_path",
    "filepath",
    "target_file",
    "notebook_path",
    "file",
}
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
NPM_TEST_SCRIPTS = {
    "test:unit",
    "test:integration",
    "test:e2e",
    "test:e2e:list",
}
MUTATING = {"rm", "mv", "cp", "mkdir", "touch", "tee", "install", "truncate", "ln"}
GIT_OPTIONS_WITH_VALUE = {"-C", "-c", "--git-dir", "--work-tree", "--namespace"}
GIT_ALWAYS_DENY = {"apply", "am", "clean"}
FIND_WRITES = {"-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprintf"}


def emit(permission, message=""):
    payload = {"permission": permission}
    if message:
        payload["user_message"] = message
        payload["agent_message"] = message
    json.dump(payload, sys.stdout)
    sys.exit(0)


def is_allowed(path_text, cwd):
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


def redirect_targets(segment):
    targets = []
    pattern = re.compile(r"(?:^|[\s;])(?:\d*)>>?\s*([^\s;&|]+)")
    for match in pattern.finditer(segment):
        target = match.group(1).strip("'\"")
        if target.startswith("&"):
            continue
        targets.append(target)
    return targets


def strip_env(tokens):
    index = 0
    while index < len(tokens) and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", tokens[index]):
        index += 1
    return tokens[index:]


def is_test_runner(tokens):
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
    """Allow git, except subcommands that rewrite working-tree files outside the write scope."""
    index = 1
    while index < len(tokens) and tokens[index].startswith("-"):
        index += 2 if tokens[index] in GIT_OPTIONS_WITH_VALUE else 1
    if index >= len(tokens):
        return True
    subcommand = tokens[index]
    args = tokens[index + 1:]
    if subcommand in GIT_ALWAYS_DENY:
        return False
    if subcommand == "stash":
        return bool(args) and args[0] in {"list", "show"}
    if subcommand == "reset":
        return not any(arg in {"--hard", "--merge", "--keep"} for arg in args)
    if subcommand in {"restore", "rm", "mv"}:
        paths = operand_paths(["git"] + [arg for arg in args if arg != "--"])
        return bool(paths) and all(is_allowed(path, cwd) for path in paths)
    if subcommand == "checkout":
        if "--" in args:
            paths = args[args.index("--") + 1:]
            return bool(paths) and all(is_allowed(path, cwd) for path in paths)
        operands = [arg for arg in args if not arg.startswith("-")]
        for operand in operands:
            path = Path(cwd) / operand
            if path.exists() and not is_allowed(operand, cwd):
                return False
        return True
    return True


def atomic_allowed(segment, cwd):
    for target in redirect_targets(segment):
        if not is_allowed(target, cwd):
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
    if program in READ_ONLY:
        return True
    if program == "git":
        return git_allowed(tokens, cwd)
    if program == "gh":
        return True
    if program == "find":
        return not any(token in FIND_WRITES for token in tokens)
    if program == "sed":
        if "-i" not in tokens and not any(token.startswith("--in-place") for token in tokens):
            return True
        paths = operand_paths(tokens)
        return bool(paths) and all(is_allowed(path, cwd) for path in paths)
    if program in MUTATING:
        paths = operand_paths(tokens)
        return bool(paths) and all(is_allowed(path, cwd) for path in paths)
    return False


def guard_shell(command, cwd):
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
            if not atomic_allowed(stage, cwd):
                emit(
                    "deny",
                    "Shell can run test commands, reads, git, and gh. It cannot create or modify files outside "
                    + WRITE_SCOPE
                    + ".",
                )
    emit("allow")


def guard_tool(payload, cwd):
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
