// Checks that the web job skills, the hook, and playwright-cli agree. Run with:
//
//   node --test scripts/skills-and-hook.test.mjs
//
// /qa-plan and /qa-generate look at the running app with playwright-cli, and
// /qa-heal attaches to a paused test with it. The skill text gives the agent
// each command word for word. In Cursor a command that the hook denies never
// runs, so a command in a skill that the hook does not know stops the job. No
// other test sees that: the hook's own tests have their own list of commands,
// and the evaluation runs without the hook.
//
// So this file reads every `npx --no-install playwright-cli ...` command out of
// the three skills and puts it to the hook of this repository, the way Cursor
// does. It needs Python 3 for that, as the hook does. It needs nothing
// installed. When node_modules is there, it also looks up each command in the
// installed playwright-cli.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { HOOKS_FILE, KIT_ROOT } from './install-into.mjs'

const SKILLS = ['qa-plan', 'qa-generate', 'qa-heal']
const START = 'npx --no-install playwright-cli '

// /qa-heal writes the session name of a paused test as tw-XXXXXX and tells the
// agent to put the real name in. The hook denies the placeholder itself.
const PLACEHOLDER = /tw-XXXXXX/g
const SAMPLE_NAME = 'tw-a1b2c3'

// A line that names a command to forbid it. The hook may deny such a command.
const FORBIDS = /\b(never|do not|must not|denies|denied)\b/i

const WINDOWS = process.platform === 'win32'
const hasPython = !WINDOWS && spawnSync('python3', ['--version']).status === 0
const skip = hasPython ? false : 'the hook is started as a Python 3 script, as on Linux and macOS'

const skillPath = (skill) => join(KIT_ROOT, '.cursor', 'skills', skill, 'SKILL.md')

// The playwright-cli commands in a skill text, each with the line it is on.
// A command is a line of a fenced block, or a code span, that starts with
// `npx --no-install playwright-cli `. It can chain several with `&&`.
function commandsIn(text) {
  const found = []
  let fence = null
  text.split(/\r?\n/).forEach((line, index) => {
    const mark = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
    if (mark && fence === null) {
      fence = mark
    } else if (mark && line.trim().startsWith(fence)) {
      fence = null
    } else if (fence !== null) {
      if (line.trim().startsWith(START)) found.push({ command: line.trim(), line: index + 1, text: line })
    } else {
      for (const span of line.matchAll(/`([^`]+)`/g)) {
        if (span[1].startsWith(START)) found.push({ command: span[1], line: index + 1, text: line })
      }
    }
  })
  return found
}

// The playwright-cli command words in one shell command: `open` and `snapshot`
// in `npx ... open http://localhost:3000/profile && npx ... snapshot`.
function wordsOf(command) {
  const pattern = /npx --no-install playwright-cli((?:\s+(?:-s=\S+|-s\s+\S+|--session=\S+|--session\s+\S+|--raw|--json))*)\s+([a-z][a-z-]*)/g
  return [...command.matchAll(pattern)].map((match) => match[2])
}

// Asks the hook of this repository about one shell command: the command from
// .cursor/hooks.json, run in the repository root, JSON on standard input.
function askHook(command) {
  const hook = JSON.parse(readFileSync(join(KIT_ROOT, HOOKS_FILE), 'utf8')).hooks.beforeShellExecution[0].command
  const result = spawnSync(hook, {
    cwd: KIT_ROOT,
    shell: true,
    encoding: 'utf8',
    timeout: 60_000,
    input: JSON.stringify({ hook_event_name: 'beforeShellExecution', command, cwd: KIT_ROOT, workspace_roots: [KIT_ROOT] }),
  })
  try {
    const answer = JSON.parse(result.stdout)
    return { permission: answer.permission, message: answer.user_message ?? answer.agent_message ?? '' }
  } catch {
    throw new Error(`The hook did not answer with JSON for \`${command}\` (exit ${result.status}): ${result.stderr || result.stdout || result.error?.message}`)
  }
}

describe('reading the commands out of a skill', () => {
  it('finds a command in a fenced block and in a code span, and keeps a chain whole', () => {
    const text = [
      '3. **Open the page.** Run:',
      '',
      '   ```bash',
      '   npx --no-install playwright-cli open http://localhost:3000/profile && npx --no-install playwright-cli snapshot',
      '   ```',
      '',
      "   | Fill a field | `npx --no-install playwright-cli fill e5 'Grace Hopper'` |",
      '9. Run `npx --no-install playwright-cli close`. The folder `.playwright-cli/` stays. `RTK_DISABLED=1 npx playwright test test/e2e/profile.spec.ts` is another tool.',
    ].join('\n')
    assert.deepEqual(commandsIn(text).map((entry) => [entry.line, entry.command]), [
      [4, 'npx --no-install playwright-cli open http://localhost:3000/profile && npx --no-install playwright-cli snapshot'],
      [7, "npx --no-install playwright-cli fill e5 'Grace Hopper'"],
      [8, 'npx --no-install playwright-cli close'],
    ])
  })

  it('names the command words, past a session option', () => {
    assert.deepEqual(wordsOf('npx --no-install playwright-cli open http://localhost:3000/profile && npx --no-install playwright-cli snapshot'), ['open', 'snapshot'])
    assert.deepEqual(wordsOf('npx --no-install playwright-cli -s=tw-a1b2c3 pause-at pages/profile-page.ts:18'), ['pause-at'])
    assert.deepEqual(wordsOf('npx --no-install playwright-cli -s tw-a1b2c3 generate-locator e9'), ['generate-locator'])
    assert.deepEqual(wordsOf('npx --no-install playwright-cli --session=plan close'), ['close'])
  })
})

describe('the web job skills and the hook', () => {
  const taught = SKILLS.map((skill) => ({ skill, commands: commandsIn(readFileSync(skillPath(skill), 'utf8')) }))

  it('are both in this repository', () => {
    for (const skill of SKILLS) assert.ok(existsSync(skillPath(skill)), `.cursor/skills/${skill}/SKILL.md exists`)
    assert.ok(existsSync(join(KIT_ROOT, HOOKS_FILE)))
  })

  for (const skill of ['qa-plan', 'qa-generate']) {
    it(`${skill} gives the commands to open a page, to read it, to act on it, and to close the browser`, () => {
      const words = new Set(taught.find((entry) => entry.skill === skill).commands.flatMap((entry) => wordsOf(entry.command)))
      for (const word of ['open', 'snapshot', 'fill', 'click', 'close']) {
        assert.ok(words.has(word), `${skill} has a command with \`playwright-cli ${word}\`. Found: ${[...words].join(', ') || 'none'}`)
      }
    })

    it(`${skill} names no MCP browser tool`, () => {
      const text = readFileSync(skillPath(skill), 'utf8')
      assert.ok(!/browser_[a-z]+/.test(text), 'no browser_* tool')
      assert.ok(!/\bMCP\b/.test(text), 'no word about an MCP server')
    })
  }

  it('qa-heal gives the commands to attach to a paused test and to end it', () => {
    const words = new Set(taught.find((entry) => entry.skill === 'qa-heal').commands.flatMap((entry) => wordsOf(entry.command)))
    for (const word of ['attach', 'pause-at', 'snapshot', 'resume']) assert.ok(words.has(word), `qa-heal has a command with \`playwright-cli ${word}\``)
  })

  it('the hook allows every playwright-cli command that a skill tells the agent to run', { skip }, () => {
    const denied = []
    let asked = 0
    for (const { skill, commands } of taught) {
      for (const { command, line, text } of commands) {
        const answer = askHook(command.replace(PLACEHOLDER, SAMPLE_NAME))
        asked += 1
        if (answer.permission !== 'allow' && !FORBIDS.test(text)) {
          denied.push(`.cursor/skills/${skill}/SKILL.md:${line} \`${command}\`\n    the hook says: ${answer.message.split('\n')[0]}`)
        }
      }
    }
    assert.ok(asked >= 10, `the skills hold at least 10 playwright-cli commands. Found ${asked}`)
    assert.deepEqual(denied, [], `The hook denies a command that a skill gives the agent. Change the skill or the hook:\n${denied.join('\n')}`)
  })

  it('the hook denies the same commands when they leave the machine or run code', { skip }, () => {
    // An allow first, so that a hook that denies everything does not pass.
    assert.equal(askHook(`${START}open http://localhost:3000/profile`).permission, 'allow')
    for (const command of [
      `${START}open https://example.com`,
      `${START}goto https://example.com/profile`,
      `${START}run-code "await page.title()"`,
      `${START}eval "document.title"`,
      `${START}screenshot`,
      `${START}install-browser chrome`,
      `${START}kill-all`,
    ]) {
      assert.equal(askHook(command).permission, 'deny', command)
    }
  })

  it('the hook denies the placeholder name of a paused test, which the skill tells the agent to replace', { skip }, () => {
    assert.equal(askHook(`${START}attach tw-XXXXXX`).permission, 'deny')
    assert.equal(askHook(`${START}attach ${SAMPLE_NAME}`).permission, 'allow')
  })

  it('every command word is a command of the installed playwright-cli', (context) => {
    const helpPath = join(KIT_ROOT, 'node_modules', 'playwright-core', 'lib', 'tools', 'cli-client', 'help.json')
    if (!existsSync(helpPath)) {
      context.skip('node_modules is not installed. scripts/test-example.mjs checks this in an installed app.')
      return
    }
    const known = Object.keys(JSON.parse(readFileSync(helpPath, 'utf8')).commands)
    for (const { skill, commands } of taught) {
      for (const { command, line } of commands) {
        for (const word of wordsOf(command)) {
          assert.ok(known.includes(word), `.cursor/skills/${skill}/SKILL.md:${line} uses \`playwright-cli ${word}\`, and the installed playwright-cli has no such command`)
        }
      }
    }
  })
})
