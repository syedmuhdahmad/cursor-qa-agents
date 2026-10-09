#!/usr/bin/env node
// Prints the Node version a CI job installs, read from "engines" in package.json.
// .github/workflows/ci.yml appends the printed line to $GITHUB_OUTPUT.
//
//   node scripts/ci/node-version.mjs lowest     prints version=22.22.2
//   node scripts/ci/node-version.mjs highest    prints version=26
//
//   lowest   The lower bound of the first range, to the patch number.
//            It is the oldest Node that package.json says the kit runs on.
//   highest  The major version of the last range. setup-node installs the
//            newest release of that major version.
//
// The range must be parts such as ^22.22.2 or >=26.0.0, joined with ||, lowest
// first. The script stops on any other form, so a range it does not understand
// fails the job and is never guessed at.
//
// Node built-ins only. It runs on the Node the runner image ships, before
// setup-node, so it uses nothing that needs a recent Node.

import { readFileSync } from 'node:fs'

const USAGE = 'Usage: node scripts/ci/node-version.mjs lowest|highest'

function fail(message) {
  console.error(message)
  process.exit(1)
}

const which = process.argv[2]
if (process.argv.length !== 3 || (which !== 'lowest' && which !== 'highest')) fail(USAGE)

const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
const range = packageJson.engines && packageJson.engines.node
if (typeof range !== 'string') fail('package.json has no engines.node.')

const parts = range.split('||').map((part) => {
  const match = /^(\^|>=)(\d+)\.(\d+)\.(\d+)$/.exec(part.trim())
  if (!match) {
    fail(
      `Cannot read "${part.trim()}" in engines.node "${range}". ` +
        'Each part must look like ^22.22.2 or >=26.0.0. Change scripts/ci/node-version.mjs to read the new form.',
    )
  }
  return { open: match[1] === '>=', major: Number(match[2]), version: `${match[2]}.${match[3]}.${match[4]}` }
})

parts.forEach((part, index) => {
  if (index > 0 && part.major <= parts[index - 1].major) {
    fail(`The parts of engines.node "${range}" must be in order, lowest major version first.`)
  }
  if (part.open && index !== parts.length - 1) {
    fail(`Only the last part of engines.node "${range}" may start with >=.`)
  }
})

const version = which === 'lowest' ? parts[0].version : String(parts[parts.length - 1].major)
console.error(`engines.node is "${range}". The ${which} Node for CI is ${version}.`)
console.log(`version=${version}`)
