"""Checks that the hook splits a command line the way bash does.

Run with: python3 -m unittest discover -s .cursor/hooks

The other tests give the hook a command and check its decision. This one
checks the step before any decision: finding where each command starts and
ends. If the hook and the shell disagree there, a command can hide inside what
the hook takes for a string, and no later check sees it.

Random command lines are built from a harmless alphabet: the words m, a, b,
and x, two digits, quotes, backslashes, separators, redirects, and newlines.
It has no `$`, no slash, no glob, and no program name. bash runs each line
with an empty PATH in a temporary directory, so nothing executes except
bash's command_not_found_handle, which records the words of each command.
A redirect can only create a file named from the alphabet in that directory.

Every command bash ran must be a stage the hook saw, with the same words.
The seeds are fixed, so a failure can be reproduced.

Two more tests use the same harness. One adds `#` to the alphabet: the hook
denies a line with a comment, and every other line must still split the way
bash splits it. The other checks the one heredoc the hook reads, the message
form `"$(cat <<'EOF' ... EOF ... )"`: the text the hook puts in its place
must be the word bash passes to the command.
"""

import importlib.util
import os
import random
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

HOOK = Path(__file__).resolve().parent / "guard-test-writes.py"
BASH = shutil.which("bash")
SAMPLES_PER_SEED = 400

WORDS = ["m", "a", "b", "m a", " ", " ", "'", '"', "\\", "\\'", '\\"', "\\\\", "\\;", "\\ "]
SEPARATORS = [";", "|", "&", "&&", "||", "\n", "\\\n"]
REDIRECTS = ["\t", "|&", ">", ">>", "2>", "&>", ">&", ">|", "<", "2>&1", "1", "2", "x", "\\>", "\\&", "\\|"]
COMMENTS = ["#", " #", "#a", "\\#", "a#", "'#'"]
# Pieces of a message body. None is a quote, a backtick, `$`, a backslash, or
# a round bracket: the hook denies a body that holds one of those.
BODY = ["m", "a b", " ", " ", "\n", "\n", "#", ";", "&", "&&", "|", ">", "<", "*", "~", "-", "EOF", "EOF\n", "{a,b}", "!", "="]
# What may follow the message in the same command line.
TAILS = ["", " a", " && m b", "; m b", "\nm b", " | m b", " 'b c'"]

# Records each command bash runs. bash flushes its output at a newline, so a
# newline inside a word is written as \035. Each record is then one write, and
# records from commands that run at the same time cannot interleave.
# `cat` stands in for the real program, which the empty PATH hides: it copies
# its input, so the message heredoc gives the text of its body.
HANDLER = r"""
command_not_found_handle() {
    local record="" word
    for word in "$@"; do record+="${word//$'\n'/$'\035'}"$'\037'; done
    printf '%s\036' "$record" >> "$SPLIT_LOG"
    return 0
}
cat() {
    local line
    while IFS= read -r line || [ -n "$line" ]; do printf '%s\n' "$line"; done
}
"""


def load_hook():
    """Import the hook. Its file name has a hyphen, so a plain import cannot load it."""
    spec = importlib.util.spec_from_file_location("guard_test_writes", HOOK)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def bash_major_version():
    """bash's major version, or 0 when bash is not installed."""
    if not BASH:
        return 0
    result = subprocess.run([BASH, "-c", "echo ${BASH_VERSINFO[0]}"], capture_output=True, text=True)
    return int(result.stdout.strip() or 0)


def hook_stages(hook, command):
    """Stages as the hook sees them, or None when it cannot parse the line and so denies it.

    The hook denies a line that holds a comment before it splits anything.
    """
    stages = []
    try:
        if hook.word_start_problem(hook.join_continuations(command)):
            return None
        for _, segment in hook.split_compound(hook.join_continuations(command)):
            for stage in hook.split_pipes(segment):
                stages.append(tuple(hook.command_words(stage)))
    except ValueError:
        return None
    return stages


def bash_commands(command, workdir):
    """The commands bash ran for this line, each as a tuple of words."""
    log = os.path.join(workdir, "log")
    open(log, "w").close()
    env = {
        "PATH": "/nonexistent",
        "BASH_ENV": os.path.join(workdir, "handler.sh"),
        "SPLIT_LOG": log,
        "SPLIT_COMMAND": command,
    }
    subprocess.run(
        [BASH, "--norc", "--noprofile", "-c", 'eval "$SPLIT_COMMAND"; wait'],
        env=env,
        cwd=workdir,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        timeout=30,
    )
    with open(log, encoding="utf-8", errors="replace") as handle:
        records = handle.read().split("\x1e")[:-1]
    return [tuple(word.replace("\x1d", "\n") for word in record.split("\x1f")[:-1]) for record in records]


# command_not_found_handle needs bash 4. macOS ships bash 3.2 as /bin/bash.
@unittest.skipUnless(bash_major_version() >= 4, "needs bash 4 or later")
class SplitMatchesBash(unittest.TestCase):
    """Compares the hook's view of random command lines with the commands bash runs."""

    def check(self, pieces, seed, build=None):
        """Build SAMPLES_PER_SEED random lines from pieces and compare the two views of each.

        build(rng) makes one line when the default, a run of 1 to 14 pieces, is not wanted.
        Returns how many lines the hook read, as opposed to denied.
        """
        hook = load_hook()
        rng = random.Random(seed)
        ran_something = 0
        read = 0
        with tempfile.TemporaryDirectory() as workdir:
            with open(os.path.join(workdir, "handler.sh"), "w") as handle:
                handle.write(HANDLER)
            for _ in range(SAMPLES_PER_SEED):
                if build:
                    command = build(rng)
                else:
                    command = "".join(rng.choice(pieces) for _ in range(rng.randint(1, 14)))
                executed = bash_commands(command, workdir)
                if not executed:
                    continue
                ran_something += 1
                try:
                    command = hook.inline_message_heredocs(command)
                except hook.Denied:
                    continue
                # A heredoc the hook did not replace, such as a body with an early `EOF` line, is still
                # inside `$(...)`, which the hook denies.
                if build and hook.expansion_problem(command):
                    continue
                seen = hook_stages(hook, command)
                if seen is None:
                    continue
                read += 1
                for words in executed:
                    self.assertIn(
                        words,
                        seen,
                        f"bash ran {words!r} for {command!r}, but the hook saw {seen!r}",
                    )
                    seen.remove(words)
        # Guards against a broken harness that compares nothing.
        self.assertGreater(ran_something, SAMPLES_PER_SEED // 10)
        return read

    def test_quotes_and_separators(self):
        """Quotes, backslashes, and the operators that separate commands."""
        for seed in (1, 2):
            self.check(WORDS + SEPARATORS, seed)

    def test_redirects(self):
        """The same pieces, with redirects added."""
        for seed in (11, 12):
            self.check(WORDS + SEPARATORS + REDIRECTS, seed)

    def test_comments(self):
        """The same pieces, with `#` added. A line the hook does not deny has no comment for bash either."""
        for seed in (21, 22):
            read = self.check(WORDS + SEPARATORS + COMMENTS, seed)
            # Most lines have a `#` somewhere. Some must be left, or nothing was compared.
            self.assertGreater(read, SAMPLES_PER_SEED // 20)

    def test_message_heredoc(self):
        """The text the hook puts in place of `"$(cat <<'EOF' ... EOF ... )"` is the word bash passes on."""

        def build(rng):
            body = "".join(rng.choice(BODY) for _ in range(rng.randint(0, 10)))
            return "m \"$(cat <<'EOF'\n" + body + "\nEOF\n)\"" + rng.choice(TAILS)

        for seed in (31, 32):
            read = self.check(None, seed, build)
            self.assertGreater(read, SAMPLES_PER_SEED // 4)


if __name__ == "__main__":
    unittest.main()
