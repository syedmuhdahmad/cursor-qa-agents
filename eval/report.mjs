#!/usr/bin/env node
// Turns a results file written by `score.mjs --record` into a Markdown table.
//
//   node eval/report.mjs eval/results/runs.jsonl
//
// One row per case, one column per group of runs. A group is the runs that
// share kit, model, and label. A cell reads `2/3`: two of three runs passed
// every check. `FP 1` means one of them was a false pass: the reply said it
// worked and the scorer's own run says it did not. `blocked 1` means one
// reply said BLOCKED. `not scored 1` means the scorer could not decide.
//
// Node built-ins only.

import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'

export function readRecords(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line, index) => {
      try {
        return JSON.parse(line)
      } catch (error) {
        throw new Error(`Line ${index + 1} is not JSON: ${error.message}`)
      }
    })
}

const groupOf = (record) => [record.label, record.model, `kit ${record.kit} ${record.commit}`].filter(Boolean).join(', ')

export function table(records) {
  const groups = [...new Set(records.map(groupOf))]
  const cases = [...new Set(records.map((record) => record.case))].sort()
  const cell = (runs) => {
    if (runs.length === 0) return ''
    const passed = runs.filter((record) => record.result === 'pass').length
    const falsePasses = runs.filter((record) => record.falsePass).length
    const blocked = runs.filter((record) => record.replyVerdict === 'BLOCKED').length
    const errors = runs.filter((record) => record.result === 'error').length
    return (
      `${passed}/${runs.length}` +
      (falsePasses ? `, FP ${falsePasses}` : '') +
      (blocked ? `, blocked ${blocked}` : '') +
      (errors ? `, not scored ${errors}` : '')
    )
  }
  const lines = [`| Case | ${groups.join(' | ')} |`, `| --- | ${groups.map(() => '---').join(' | ')} |`]
  for (const id of cases) {
    lines.push(`| \`${id}\` | ${groups.map((group) => cell(records.filter((record) => record.case === id && groupOf(record) === group))).join(' | ')} |`)
  }
  lines.push(`| All | ${groups.map((group) => cell(records.filter((record) => groupOf(record) === group))).join(' | ')} |`)
  return lines.join('\n')
}

function main(argv) {
  if (argv.length !== 1 || argv[0] === '--help' || argv[0] === '-h') {
    console.error('Usage: node eval/report.mjs <results.jsonl>')
    return argv.length === 1 ? 0 : 1
  }
  const path = resolve(argv[0])
  if (!existsSync(path)) {
    console.error(`${path} does not exist.`)
    return 1
  }
  try {
    console.log(table(readRecords(readFileSync(path, 'utf8'))))
    return 0
  } catch (error) {
    console.error(`report stopped: ${error.message}`)
    return 1
  }
}

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2))
}
