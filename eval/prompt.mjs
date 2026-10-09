#!/usr/bin/env node
// Prints the text an agent receives for one eval case, built from the files
// in the sandbox.
//
//   node eval/prompt.mjs <run-folder> [--env-note <file>] [--no-agents-md] [--user-only]
//
// <run-folder> is the --out folder of make-sandbox.mjs.
//
// The kit with one skill per job: Cursor puts the whole SKILL.md body in the
// user message when the user picks `/qa-unit` and types a request. The block
// below copies the wrapper that the Cursor 3.23.23 client builds (read from
// its code, not seen in a live session), then the user's text.
//
// The kit before that (make-sandbox.mjs --kit-ref): `/qa` asks the main model
// to hand the request to the `qa` subagent. The subagent gets one line from
// Cursor, the description and body of .cursor/agents/qa.md, and a prompt that
// the main model writes. This prints the best case: the user's request passed
// on word for word.
//
// In both, AGENTS.md comes first, because Cursor loads the root AGENTS.md
// into every conversation. The heading above it is this script's own.
// --no-agents-md leaves it out, for an agent that loads AGENTS.md by itself.
//
// --env-note <file> puts the text of a file in front, for an environment that
// differs from Cursor. {{SANDBOX}} and {{BASE_URL}} in it are filled in.
// {{BASE_URL}} becomes `none` for a case that needs no app server.
//
// --user-only prints just the line the user types, such as `/qa-unit ...`.
// Use it with Cursor or the Cursor CLI, which attach the skill themselves.
//
// Node built-ins only.

import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { EvalError, fill, loadCase, readRun, routeOf, splitFrontmatter } from './lib.mjs'

const USAGE = `Usage: node eval/prompt.mjs <run-folder> [--env-note <file>] [--no-agents-md] [--user-only]

  <run-folder>       The --out folder of make-sandbox.mjs.
  --env-note <file>  Text to put in front, for an environment that differs from Cursor.
  --no-agents-md     Leave AGENTS.md out.
  --user-only        Print only what the user types, for Cursor itself.`

// Cursor cuts an attached skill at this many characters.
const SKILL_LIMIT = 100_000

export function buildPrompt(runDir, { envNote = null, agentsMd = true, userOnly = false } = {}) {
  const { meta, sandbox } = readRun(runDir)
  const testCase = loadCase(meta.case)
  const read = (path) => (existsSync(join(sandbox, path)) ? readFileSync(join(sandbox, path), 'utf8') : null)
  const values = { SANDBOX: sandbox, BASE_URL: meta.server?.url }
  const parts = []

  if (userOnly) {
    const route = routeOf(read, testCase.skill)
    return { text: `${fill(route === 'skill' ? testCase.user : testCase.userOld, values)}\n`, route }
  }

  // A case without a server has no base URL. The note then says `none`.
  if (envNote !== null) parts.push(fill(envNote.trim(), values, 'none'))

  if (agentsMd) {
    const agents = read('AGENTS.md')
    if (agents === null) throw new EvalError(`${sandbox} has no AGENTS.md.`)
    parts.push(`AGENTS.md of this project:\n\n${agents.trim()}`)
  }

  const route = routeOf(read, testCase.skill)
  if (route === 'skill') {
    const path = `.cursor/skills/${testCase.skill}/SKILL.md`
    const { body } = splitFrontmatter(read(path))
    parts.push(
      [
        '<manually_attached_skills>',
        'The user has manually attached the following skills to their message.',
        'These skills contain specific instructions or workflows that the user wants you to follow for this request.',
        'Only read the files if needed, the full skill content is inlined here.',
        '',
        `Skill Name: ${testCase.skill}`,
        `Path: ${join(sandbox, path)}`,
        'SKILL.md content:',
        body.slice(0, SKILL_LIMIT),
        '</manually_attached_skills>',
      ].join('\n'),
    )
    parts.push(fill(testCase.user, values))
  } else if (route === 'qa-agent') {
    const { data, body } = splitFrontmatter(read('.cursor/agents/qa.md'))
    parts.push(
      [
        'You are operating as the "qa" custom subagent. DO NOT create unnecessary markdown files unless explicitly requested by the user.',
        '',
        data.description ?? '',
        '',
        body,
      ].join('\n'),
    )
    parts.push(fill(testCase.userOld, values).replace(/^\/qa\s+/, ''))
  } else {
    throw new EvalError(
      `${sandbox} has neither .cursor/skills/${testCase.skill}/SKILL.md nor .cursor/agents/qa.md, so there is no prompt for case ${testCase.id}.`,
    )
  }
  return { text: `${parts.join('\n\n')}\n`, route }
}

function main(argv) {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        'env-note': { type: 'string' },
        'no-agents-md': { type: 'boolean', default: false },
        'user-only': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    })
  } catch (error) {
    console.error(`${error.message}\n\n${USAGE}`)
    return 1
  }
  if (parsed.values.help) {
    console.log(USAGE)
    return 0
  }
  if (parsed.positionals.length !== 1) {
    console.error(`Give exactly one run folder.\n\n${USAGE}`)
    return 1
  }
  try {
    let envNote = null
    if (parsed.values['env-note']) {
      const path = resolve(parsed.values['env-note'])
      if (!existsSync(path)) throw new EvalError(`${path} does not exist.`)
      envNote = readFileSync(path, 'utf8')
    }
    const { text } = buildPrompt(parsed.positionals[0], {
      envNote,
      agentsMd: !parsed.values['no-agents-md'],
      userOnly: parsed.values['user-only'],
    })
    process.stdout.write(text)
    return 0
  } catch (error) {
    if (!(error instanceof EvalError)) throw error
    console.error(`prompt stopped: ${error.message}`)
    return 1
  }
}

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2))
}
