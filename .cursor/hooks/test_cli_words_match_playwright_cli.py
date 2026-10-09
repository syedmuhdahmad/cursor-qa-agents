"""Checks that the hook reads a playwright-cli command line the way playwright-cli does.

Run with: python3 -m unittest discover -s .cursor/hooks

The hook allows a playwright-cli command by its name, its arguments, and its
options. playwright-cli finds those with a small parser of its own, in which
an option it does not know takes the next word as its value. If the hook and
playwright-cli disagree on which word is the command, an allowed command can
hide a denied one: in `--x snapshot run-code` the command that runs is
`run-code`.

Two tests compare the hook with the installed package, playwright-core, which
@playwright/cli runs:

1. The hook's table of commands and options is compared with help.json, the
   file playwright-cli builds its help and its option checks from. A new
   version that adds an option to an allowed command fails here until the
   option is put on a list.
2. Random command lines are built from commands, arguments, options, and odd
   words. Each one the hook can place is given to playwright-cli's own parser,
   run by node. The command, the arguments, and the options must be the same.
   The seeds are fixed, so a failure can be reproduced. Nothing is started:
   only the parser runs.

Both tests skip themselves when the package is not installed, and the second
also when node is not installed.
"""

import importlib.util
import json
import random
import shutil
import subprocess
import unittest
from pathlib import Path

HOOK = Path(__file__).resolve().parent / "guard-test-writes.py"
REPO = HOOK.parents[2]
CLI_CLIENT = REPO / "node_modules" / "playwright-core" / "lib" / "tools" / "cli-client"
HELP = CLI_CLIENT / "help.json"
PARSER = CLI_CLIENT / "minimist.js"
NODE = shutil.which("node")
SEEDS = (1, 2, 3, 4)
SAMPLES_PER_SEED = 2500
# Seconds node may take to parse every sample of one seed.
NODE_TIMEOUT = 60

# Options playwright-cli's program.js adds to the flags of help.json before it
# parses, and the two renames it makes after: `-s` is --session, `-g` is --global.
PROGRAM_FLAGS = ["all", "g", "help", "json", "raw", "version"]
# Words a random command line is built from. Commands the hook allows and
# denies, arguments, every allowed option in each spelling, options on no
# list, and words the parser reads in a way of its own.
WORDS = [
    "open", "goto", "snapshot", "find", "click", "fill", "type", "press", "close", "attach", "resume", "list",
    "run-code", "eval", "screenshot", "install", "detach", "tab-new",
    "e5", "e9", "Enter", "Ada", "plan", "tw-6eef1e", "http://localhost:3000/", "https://example.com",
    "true", "false", "", " ", "-", "--", "-5", "-=", "2", "x=y",
    "--raw", "--json", "--help", "--boxes", "--submit", "--all", "--clear", "--static",
    "-s", "-s=plan", "-s=", "--session", "--session=plan", "--session=",
    "--depth", "--depth=2", "--regex", "--regex=a", "--modifiers", "--modifiers=Shift", "--filter", "--filter=x",
    "--filename", "--filename=a", "--config", "--headed", "--zzz", "--zzz=1", "--no-raw", "--no-boxes",
    "-x", "-g", "-h", "-v", "-sx", "-xs", "-s5", "-s-", "---x", "--=x", "--raw=true", "--boxes=1",
]
# Runs playwright-cli's parser on each command line, as program.js calls it.
NODE_SCRIPT = r"""
const [parserPath, helpPath, programFlags] = process.argv.slice(-3);
const { minimist } = require(parserPath);
const help = require(helpPath);
const boolean = [...help.booleanOptions, ...JSON.parse(programFlags)];
const lines = require('fs').readFileSync(0, 'utf8').split('\n').filter(Boolean);
const out = [];
for (const line of lines) {
  try {
    const args = minimist(JSON.parse(line), { boolean, string: ['_'] });
    const positional = args._;
    delete args._;
    out.push(JSON.stringify({ positional, options: args }));
  } catch (e) {
    out.push(JSON.stringify({ error: String(e.message) }));
  }
}
process.stdout.write(out.join('\n'));
"""


def load_hook():
    """Import the hook. Its file name has a hyphen, so a plain import cannot load it."""
    spec = importlib.util.spec_from_file_location("guard_test_writes", HOOK)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def cli_parse(command_lines):
    """What playwright-cli's parser makes of each list of words: {"positional", "options"} or {"error"}."""
    result = subprocess.run(
        [NODE, "-e", NODE_SCRIPT, str(PARSER), str(HELP), json.dumps(PROGRAM_FLAGS)],
        input="\n".join(json.dumps(words) for words in command_lines),
        capture_output=True,
        text=True,
        check=True,
        timeout=NODE_TIMEOUT,
    )
    return [json.loads(line) for line in result.stdout.split("\n")]


@unittest.skipUnless(HELP.exists(), "playwright-core is not installed in node_modules")
class CommandTable(unittest.TestCase):
    """The hook's table of playwright-cli commands, against the installed package's help.json."""

    @classmethod
    def setUpClass(cls):
        """Load the hook and the package's list of commands."""
        cls.hook = load_hook()
        cls.help = json.loads(HELP.read_text(encoding="utf-8"))

    def test_every_allowed_command_exists_with_that_many_arguments(self):
        """An allowed command is one playwright-cli has, and takes no more arguments than its help lists."""
        for name, (fewest, most, _, _, _) in self.hook.PLAYWRIGHT_CLI_COMMANDS.items():
            with self.subTest(command=name):
                self.assertIn(name, self.help["commands"])
                command = self.help["commands"][name]
                self.assertFalse(command.get("variadicArg"), "the hook has no rule for a command with a list of arguments")
                self.assertEqual(most, len(command["args"]))
                self.assertLessEqual(fewest, most)

    def test_every_option_of_an_allowed_command_is_on_a_list(self):
        """Each option is allowed with the kind playwright-cli gives it, or is denied with a reason.

        The session option is the exception: `attach` lists --session, and
        the hook accepts it with every command, as playwright-cli does.
        """
        hook = self.hook
        for name, (_, _, allowed, _, _) in hook.PLAYWRIGHT_CLI_COMMANDS.items():
            flags = self.help["commands"][name]["flags"]
            with self.subTest(command=name):
                for option in allowed:
                    self.assertIn(option[2:], flags, f"{name} has no option {option}")
                for flag, kind in flags.items():
                    option = "--" + flag
                    if option in hook.PLAYWRIGHT_CLI_SESSION_OPTIONS:
                        continue
                    if option not in allowed:
                        self.assertIn(option, hook.PLAYWRIGHT_CLI_DENIED_OPTIONS, f"{name} {option} is on no list")
                    elif kind == "boolean":
                        self.assertIn(option, hook.PLAYWRIGHT_CLI_FLAGS)
                    else:
                        self.assertIn(option, hook.PLAYWRIGHT_CLI_VALUE_OPTIONS)

    def test_flags_are_flags_for_the_parser(self):
        """What the hook reads as a flag, the parser reads as one, and what takes a value there takes one here."""
        hook = self.hook
        parser_flags = {"--" + name for name in self.help["booleanOptions"] + PROGRAM_FLAGS}
        self.assertLessEqual(hook.PLAYWRIGHT_CLI_FLAGS, parser_flags)
        self.assertFalse(parser_flags & set(hook.PLAYWRIGHT_CLI_VALUE_OPTIONS))
        self.assertFalse(parser_flags & hook.PLAYWRIGHT_CLI_SESSION_OPTIONS)

    def test_no_allowed_option_is_also_denied(self):
        """A reason for a deny is never given for an option that is allowed somewhere."""
        hook = self.hook
        allowed = hook.PLAYWRIGHT_CLI_FLAGS | set(hook.PLAYWRIGHT_CLI_VALUE_OPTIONS) | hook.PLAYWRIGHT_CLI_SESSION_OPTIONS
        self.assertFalse(allowed & set(hook.PLAYWRIGHT_CLI_DENIED_OPTIONS))

    def test_denied_commands_exist(self):
        """A hint for a command that playwright-cli does not have would never be shown."""
        for name in self.hook.PLAYWRIGHT_CLI_HINTS:
            with self.subTest(command=name):
                self.assertIn(name, self.help["commands"])
                self.assertNotIn(name, self.hook.PLAYWRIGHT_CLI_COMMANDS)


@unittest.skipUnless(NODE and PARSER.exists() and HELP.exists(), "needs node and playwright-core in node_modules")
class WordsMatchParser(unittest.TestCase):
    """Random command lines, read by the hook and by playwright-cli's own parser."""

    @classmethod
    def setUpClass(cls):
        """Load the hook once."""
        cls.hook = load_hook()

    def hook_words(self, words):
        """The hook's reading of a command line as (words, options), or None when it denies the line."""
        try:
            return self.hook.playwright_cli_words(words)
        except self.hook.Denied:
            return None

    def expected_options(self, options):
        """The hook's options in the shape the parser gives them: no dashes, a flag is true, `-s` is `s`."""
        return {name.lstrip("-"): True if value is None else value for name, value in options.items()}

    def test_same_command_arguments_and_options(self):
        """Whenever the hook can place every word, playwright-cli's parser places them the same way."""
        compared = 0
        for seed in SEEDS:
            generator = random.Random(seed)
            samples = [
                [generator.choice(WORDS) for _ in range(generator.randint(1, 6))]
                for _ in range(SAMPLES_PER_SEED)
            ]
            placed = [(words, self.hook_words(words)) for words in samples]
            placed = [(words, read) for words, read in placed if read is not None]
            parsed = cli_parse([words for words, _ in placed])
            self.assertEqual(len(parsed), len(placed))
            for (words, (positional, options)), theirs in zip(placed, parsed):
                with self.subTest(seed=seed, words=words):
                    self.assertNotIn("error", theirs)
                    self.assertEqual(positional, theirs["positional"])
                    self.assertEqual(self.expected_options(options), theirs["options"])
                    compared += 1
        # Most random lines hold a word the hook denies. Enough must be left to compare.
        self.assertGreater(compared, 1500)

    def test_lines_the_skills_use(self):
        """The forms the skills print, word for word."""
        lines = [
            ["open", "http://localhost:3000/profile"],
            ["-s=plan", "open", "http://localhost:3000/profile"],
            ["-s", "plan", "snapshot"],
            ["--session=plan", "find", "Save profile"],
            ["--session", "plan", "fill", "e5", "Ada Lovelace"],
            ["--raw", "-s", "tw-6eef1e", "snapshot", "--depth=2"],
            ["fill", "e5", "--", "--submit"],
            ["type", "Ada", "--submit"],
            ["click", "e9", "--modifiers", "Shift"],
            ["attach", "tw-6eef1e"],
            ["-s=tw-6eef1e", "pause-at", "test/e2e/sign-in.spec.ts:70"],
            ["-s=tw-6eef1e", "resume"],
        ]
        parsed = cli_parse(lines)
        for words, theirs in zip(lines, parsed):
            with self.subTest(words=words):
                read = self.hook_words(words)
                self.assertIsNotNone(read, "the hook denies a form the skills use")
                positional, options = read
                self.assertEqual(positional, theirs["positional"])
                self.assertEqual(self.expected_options(options), theirs["options"])


if __name__ == "__main__":
    unittest.main()
