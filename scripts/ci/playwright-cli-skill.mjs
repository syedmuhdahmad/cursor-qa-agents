#!/usr/bin/env node
// Checks that .cursor/skills/playwright-cli/ is still the skill that the
// installed @playwright/cli package ships. Run `npm ci` first.
//
//   node scripts/ci/playwright-cli-skill.mjs            checks and changes nothing
//   node scripts/ci/playwright-cli-skill.mjs --write    copies the skill from the package again
//
// The folder is a copy of node_modules/@playwright/cli/skills/playwright-cli/.
// The check passes when all of this holds:
//
//   references/   Every file of the package is here, byte for byte.
//   SKILL.md      The text after the frontmatter is the package's, byte for byte.
//   LICENSE       The LICENSE file of the package, byte for byte. The same for
//                 NOTICE when the package has one.
//   version       `version` in the frontmatter of SKILL.md is the version of
//                 the installed package.
//   no extras     The folder holds no file that the package does not have.
//
// Only the frontmatter of SKILL.md is written for this repository. --write keeps
// it and puts the new version number into it. It deletes the rest of the folder
// first, because the package adds and drops reference files between versions.
//
// Nothing else looks at this copy: `playwright-cli install --skills` and the
// package's own staleness check read .claude/skills/ and .agents/skills/ only.
//
// Node built-ins only.

import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const USAGE = 'Usage: node scripts/ci/playwright-cli-skill.mjs [--write]'
const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const PACKAGE_PATH = 'node_modules/@playwright/cli'
const UPSTREAM_PATH = `${PACKAGE_PATH}/skills/playwright-cli`
const COPY_PATH = '.cursor/skills/playwright-cli'
// Files from the package root that sit next to the copied skill.
const LICENSE_FILES = ['LICENSE', 'NOTICE']
const REFRESH = 'node scripts/ci/playwright-cli-skill.mjs --write'

function fail(message) {
  console.error(message)
  process.exit(1)
}

function read(path) {
  const full = join(ROOT, path)
  return existsSync(full) ? readFileSync(full) : null
}

// Every file under a folder, as paths with forward slashes, sorted.
function listFiles(path, prefix = '') {
  const files = []
  for (const entry of readdirSync(join(ROOT, path), { withFileTypes: true })) {
    if (entry.isDirectory()) files.push(...listFiles(`${path}/${entry.name}`, `${prefix}${entry.name}/`))
    else files.push(`${prefix}${entry.name}`)
  }
  return files.sort()
}

// Splits a SKILL.md into the frontmatter, with its two --- lines, and the bytes
// after it. latin1 keeps one character for each byte, so the split is exact.
function splitSkill(buffer) {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(buffer.toString('latin1'))
  if (!match) return null
  return { frontmatter: buffer.subarray(0, match[0].length), body: buffer.subarray(match[0].length) }
}

const VERSION_LINE = /^([ \t]+version:[ \t]*)"?([^"\r\n]*?)"?[ \t]*$/m

// Where two files first differ, for the message: the byte, and the line in ours.
function firstDifference(ours, theirs) {
  const length = Math.min(ours.length, theirs.length)
  let at = 0
  while (at < length && ours[at] === theirs[at]) at += 1
  return { byte: at + 1, line: countLines(ours.subarray(0, at)) }
}

function countLines(buffer) {
  return buffer.toString('latin1').split('\n').length
}

function loadPackage() {
  const packageJson = read(`${PACKAGE_PATH}/package.json`)
  if (!packageJson || !existsSync(join(ROOT, UPSTREAM_PATH))) {
    fail(`${UPSTREAM_PATH}/ is missing. Run \`npm ci\` first.`)
  }
  const upstreamSkill = splitSkill(read(`${UPSTREAM_PATH}/SKILL.md`) ?? Buffer.alloc(0))
  if (!upstreamSkill) {
    fail(`${UPSTREAM_PATH}/SKILL.md is missing or has no frontmatter. Change this script to read the new form.`)
  }
  if (!existsSync(join(ROOT, PACKAGE_PATH, 'LICENSE'))) {
    fail(`${PACKAGE_PATH}/LICENSE is missing. Find out how the package is licensed before you copy from it.`)
  }
  return {
    version: JSON.parse(packageJson.toString('utf8')).version,
    files: listFiles(UPSTREAM_PATH).filter((file) => file !== 'SKILL.md'),
    licenseFiles: LICENSE_FILES.filter((file) => existsSync(join(ROOT, PACKAGE_PATH, file))),
    body: upstreamSkill.body,
  }
}

// Returns one line for each thing that is wrong. An empty list means the copy is good.
function check(pkg) {
  if (!existsSync(join(ROOT, COPY_PATH))) return [`${COPY_PATH}/ is missing.`]
  const problems = []

  const compare = (file, upstreamPath) => {
    const ours = read(`${COPY_PATH}/${file}`)
    const theirs = read(upstreamPath)
    if (!ours) problems.push(`${COPY_PATH}/${file} is missing. The package has it.`)
    else if (!ours.equals(theirs)) {
      const { byte, line } = firstDifference(ours, theirs)
      problems.push(
        `${COPY_PATH}/${file} differs from ${upstreamPath}: first difference at byte ${byte}, line ${line}.`,
      )
    }
  }
  for (const file of pkg.files) compare(file, `${UPSTREAM_PATH}/${file}`)
  for (const file of pkg.licenseFiles) compare(file, `${PACKAGE_PATH}/${file}`)

  const skill = read(`${COPY_PATH}/SKILL.md`)
  const parts = skill && splitSkill(skill)
  if (!skill) problems.push(`${COPY_PATH}/SKILL.md is missing.`)
  else if (!parts) problems.push(`${COPY_PATH}/SKILL.md has no frontmatter between two --- lines.`)
  else {
    if (!parts.body.equals(pkg.body)) {
      // The frontmatter ends with a line break, so its last "line" is empty.
      const line = countLines(parts.frontmatter) - 1 + firstDifference(parts.body, pkg.body).line
      problems.push(
        `${COPY_PATH}/SKILL.md differs from ${UPSTREAM_PATH}/SKILL.md after the frontmatter: ` +
          `first difference at line ${line} of the copy.`,
      )
    }
    const version = VERSION_LINE.exec(parts.frontmatter.toString('utf8'))?.[2]
    if (version !== pkg.version) {
      problems.push(
        `The frontmatter of ${COPY_PATH}/SKILL.md says version ${version ? `"${version}"` : '(none)'}, ` +
          `but the installed @playwright/cli is ${pkg.version}.`,
      )
    }
  }

  const expected = new Set(['SKILL.md', ...pkg.files, ...pkg.licenseFiles])
  for (const file of listFiles(COPY_PATH)) {
    if (!expected.has(file)) problems.push(`${COPY_PATH}/${file} is not in the package. Remove it.`)
  }
  return problems
}

function write(pkg) {
  const old = splitSkill(read(`${COPY_PATH}/SKILL.md`) ?? Buffer.alloc(0))
  if (!old) {
    fail(
      `${COPY_PATH}/SKILL.md is missing or has no frontmatter, and --write keeps that frontmatter. ` +
        `Restore the file first: git checkout -- ${COPY_PATH}/SKILL.md`,
    )
  }
  const frontmatter = old.frontmatter.toString('utf8')
  if (!VERSION_LINE.test(frontmatter)) {
    fail(
      `The frontmatter of ${COPY_PATH}/SKILL.md has no \`version:\` line under \`metadata:\`. ` +
        'Add one, then run this again.',
    )
  }
  rmSync(join(ROOT, COPY_PATH), { recursive: true })
  cpSync(join(ROOT, UPSTREAM_PATH), join(ROOT, COPY_PATH), { recursive: true })
  for (const file of pkg.licenseFiles) cpSync(join(ROOT, PACKAGE_PATH, file), join(ROOT, COPY_PATH, file))
  writeFileSync(
    join(ROOT, COPY_PATH, 'SKILL.md'),
    Buffer.concat([Buffer.from(frontmatter.replace(VERSION_LINE, `$1"${pkg.version}"`), 'utf8'), pkg.body]),
  )
}

const args = process.argv.slice(2)
if (args.length > 1 || (args.length === 1 && args[0] !== '--write')) fail(USAGE)

const pkg = loadPackage()
if (args[0] === '--write') write(pkg)

const problems = check(pkg)
if (problems.length > 0) {
  fail(
    [
      `${COPY_PATH}/ is not the skill of the installed @playwright/cli ${pkg.version}:`,
      '',
      ...problems.map((problem) => `  - ${problem}`),
      '',
      'Do not edit the copy by hand. Only the frontmatter of SKILL.md is written here.',
      `To copy the skill from the package again, run: ${REFRESH}`,
      'After a version change, also update the version in THIRD_PARTY_NOTICES.md.',
    ].join('\n'),
  )
}

const done = args[0] === '--write' ? 'was copied from' : 'matches'
console.log(
  `${COPY_PATH}/ ${done} @playwright/cli ${pkg.version}: the text of SKILL.md after the frontmatter, ` +
    `${pkg.files.length} more files of the skill, and ${pkg.licenseFiles.join(' and ')}.`,
)
