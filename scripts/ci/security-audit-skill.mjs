#!/usr/bin/env node
// Checks that .cursor/skills/security-audit/ is still the skill that Cloudflare
// published at the commit named in scripts/ci/security-audit-skill.json.
//
//   node scripts/ci/security-audit-skill.mjs                 checks the folder against the manifest, offline
//   node scripts/ci/security-audit-skill.mjs --upstream      also downloads that commit and compares with it
//   node scripts/ci/security-audit-skill.mjs --write main    copies the skill again from a branch, tag, or commit
//
// The folder is a copy of skills/security-audit/ in
// https://github.com/cloudflare/security-audit-skill, with the LICENSE file of
// that repository's root next to it. The check passes when all of this holds:
//
//   files         Every file the manifest names is in the folder, and its
//                 SHA-256 is the one in the manifest.
//   SKILL.md      The text after the frontmatter has the SHA-256 in the
//                 manifest. Only the frontmatter is written for this repository.
//   commit        `commit` in the frontmatter of SKILL.md is the manifest's commit.
//   no extras     The folder holds no file that the manifest does not name.
//
// --upstream and --write need a network connection and the `tar` program.
// --write keeps the frontmatter of SKILL.md and puts the new commit into it.
//
// Node built-ins only.

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const USAGE = 'Usage: node scripts/ci/security-audit-skill.mjs [--upstream | --write REF]'
const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const COPY_PATH = '.cursor/skills/security-audit'
const MANIFEST_PATH = 'scripts/ci/security-audit-skill.json'
const REPOSITORY = 'cloudflare/security-audit-skill'
const UPSTREAM_PATH = 'skills/security-audit'
// The key of the manifest that holds the hash of the text of SKILL.md after its frontmatter.
const SKILL_BODY = 'SKILL.md (after the frontmatter)'
const COMMIT_LINE = /^([ \t]+commit:[ \t]*)"?([0-9a-f]*)"?[ \t]*$/m

function fail(message) {
  console.error(message)
  process.exit(1)
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

// Every file under a folder, as paths with forward slashes, sorted.
function listFiles(folder, prefix = '') {
  const files = []
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.isDirectory()) files.push(...listFiles(join(folder, entry.name), `${prefix}${entry.name}/`))
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

// The manifest of a folder laid out as the copy is: every file but SKILL.md by
// its bytes, and SKILL.md by the text after its frontmatter.
function hashFolder(folder) {
  const files = {}
  for (const file of listFiles(folder)) {
    const bytes = readFileSync(join(folder, file))
    if (file === 'SKILL.md') {
      const parts = splitSkill(bytes)
      if (!parts) throw new Error(`${folder}/SKILL.md has no frontmatter between two --- lines.`)
      files[SKILL_BODY] = sha256(parts.body)
    } else {
      files[file] = sha256(bytes)
    }
  }
  return files
}

function readManifest() {
  const full = join(ROOT, MANIFEST_PATH)
  if (!existsSync(full)) fail(`${MANIFEST_PATH} is missing. Run: node scripts/ci/security-audit-skill.mjs --write main`)
  return JSON.parse(readFileSync(full, 'utf8'))
}

// Returns one line for each thing that is wrong. An empty list means the copy is good.
function check(manifest) {
  const folder = join(ROOT, COPY_PATH)
  if (!existsSync(folder)) return [`${COPY_PATH}/ is missing.`]
  const problems = []
  const skill = existsSync(join(folder, 'SKILL.md')) ? readFileSync(join(folder, 'SKILL.md')) : null
  const parts = skill && splitSkill(skill)
  if (!skill) problems.push(`${COPY_PATH}/SKILL.md is missing.`)
  else if (!parts) problems.push(`${COPY_PATH}/SKILL.md has no frontmatter between two --- lines.`)
  else {
    const commit = COMMIT_LINE.exec(parts.frontmatter.toString('utf8'))?.[2]
    if (commit !== manifest.commit) {
      problems.push(
        `The frontmatter of ${COPY_PATH}/SKILL.md says commit ${commit ? `"${commit}"` : '(none)'}, ` +
          `but ${MANIFEST_PATH} is for commit ${manifest.commit}.`,
      )
    }
  }
  let ours
  try {
    ours = hashFolder(folder)
  } catch (error) {
    return [...problems, error.message]
  }
  for (const [file, hash] of Object.entries(manifest.files)) {
    const shown = file === SKILL_BODY ? `${COPY_PATH}/SKILL.md, after the frontmatter,` : `${COPY_PATH}/${file}`
    if (!(file in ours)) problems.push(`${shown} is missing. The upstream skill has it.`)
    else if (ours[file] !== hash) problems.push(`${shown} differs from the upstream file.`)
  }
  for (const file of Object.keys(ours)) {
    if (!(file in manifest.files)) problems.push(`${COPY_PATH}/${file} is not in the upstream skill. Remove it.`)
  }
  return problems
}

async function fetchOk(url, headers = {}) {
  const response = await fetch(url, { headers: { 'User-Agent': 'qa-agent-kit', ...headers } })
  if (!response.ok) fail(`GET ${url} answered ${response.status} ${response.statusText}.`)
  return response
}

// Downloads the repository at a ref into a new temporary folder. Returns the folder, the tree, and the commit.
async function download(ref) {
  const commit = (
    await (
      await fetchOk(`https://api.github.com/repos/${REPOSITORY}/commits/${encodeURIComponent(ref)}`, {
        Accept: 'application/vnd.github.sha',
      })
    ).text()
  ).trim()
  if (!/^[0-9a-f]{40}$/.test(commit)) fail(`GitHub did not give a commit for ${ref}: ${commit.slice(0, 80)}`)
  const archive = Buffer.from(
    await (await fetchOk(`https://codeload.github.com/${REPOSITORY}/tar.gz/${commit}`)).arrayBuffer(),
  )
  const temporary = mkdtempSync(join(tmpdir(), 'security-audit-skill-'))
  writeFileSync(join(temporary, 'source.tar.gz'), archive)
  const tree = join(temporary, 'tree')
  mkdirSync(tree)
  execFileSync('tar', ['-xzf', join(temporary, 'source.tar.gz'), '-C', tree, '--strip-components=1'])
  for (const file of [`${UPSTREAM_PATH}/SKILL.md`, 'LICENSE']) {
    if (!existsSync(join(tree, file))) fail(`The download of ${REPOSITORY} at ${commit} has no ${file}.`)
  }
  return { temporary, tree, commit }
}

// The upstream folder as the copy holds it: the skill, and the root LICENSE next to it.
function upstreamFiles(temporary, tree) {
  const staged = join(temporary, 'staged')
  cpSync(join(tree, UPSTREAM_PATH), staged, { recursive: true })
  cpSync(join(tree, 'LICENSE'), join(staged, 'LICENSE'))
  return staged
}

async function compareUpstream(manifest) {
  const { temporary, tree, commit } = await download(manifest.commit)
  try {
    const upstream = hashFolder(upstreamFiles(temporary, tree))
    const problems = []
    for (const file of new Set([...Object.keys(upstream), ...Object.keys(manifest.files)])) {
      if (upstream[file] !== manifest.files[file]) problems.push(`${file} in ${MANIFEST_PATH} is not the file at ${commit}.`)
    }
    return problems
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

async function write(ref) {
  const folder = join(ROOT, COPY_PATH)
  const old = existsSync(join(folder, 'SKILL.md')) ? splitSkill(readFileSync(join(folder, 'SKILL.md'))) : null
  if (!old) {
    fail(
      `${COPY_PATH}/SKILL.md is missing or has no frontmatter, and --write keeps that frontmatter. ` +
        `Restore the file first: git checkout -- ${COPY_PATH}/SKILL.md`,
    )
  }
  const frontmatter = old.frontmatter.toString('utf8')
  if (!COMMIT_LINE.test(frontmatter)) {
    fail(`The frontmatter of ${COPY_PATH}/SKILL.md has no \`commit:\` line under \`metadata:\`. Add one, then run this again.`)
  }
  const { temporary, tree, commit } = await download(ref)
  try {
    const staged = upstreamFiles(temporary, tree)
    const upstreamSkill = splitSkill(readFileSync(join(staged, 'SKILL.md')))
    if (!upstreamSkill) fail(`${UPSTREAM_PATH}/SKILL.md at ${commit} has no frontmatter. Change this script to read the new form.`)
    const manifest = {
      repository: `https://github.com/${REPOSITORY}`,
      path: UPSTREAM_PATH,
      commit,
      files: hashFolder(staged),
    }
    rmSync(folder, { recursive: true })
    cpSync(staged, folder, { recursive: true })
    writeFileSync(
      join(folder, 'SKILL.md'),
      Buffer.concat([Buffer.from(frontmatter.replace(COMMIT_LINE, `$1"${commit}"`), 'utf8'), upstreamSkill.body]),
    )
    writeFileSync(join(ROOT, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`)
    return manifest
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

const args = process.argv.slice(2)
const writing = args[0] === '--write'
const valid =
  args.length === 0 || (args.length === 1 && args[0] === '--upstream') || (args.length === 2 && writing)
if (!valid) fail(USAGE)

const manifest = writing ? await write(args[1]) : readManifest()
const problems = check(manifest)
if (args[0] === '--upstream') problems.push(...(await compareUpstream(manifest)))
if (problems.length > 0) {
  fail(
    [
      `${COPY_PATH}/ is not the skill of ${REPOSITORY} at ${manifest.commit}:`,
      '',
      ...problems.map((problem) => `  - ${problem}`),
      '',
      'Do not edit the copy by hand. Only the frontmatter of SKILL.md is written here.',
      'To copy the skill again, run: node scripts/ci/security-audit-skill.mjs --write main',
      'After a new copy, also update the commit in THIRD_PARTY_NOTICES.md.',
    ].join('\n'),
  )
}

const done = writing ? 'was copied from' : args[0] === '--upstream' ? 'matches the download of' : 'matches the manifest of'
console.log(
  `${COPY_PATH}/ ${done} ${REPOSITORY} at ${manifest.commit}: the text of SKILL.md after the frontmatter, ` +
    `and ${Object.keys(manifest.files).length - 1} more files.`,
)
