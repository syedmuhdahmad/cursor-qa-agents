// Tests for scripts/install-into.mjs. Run them with:
//
//   node --test scripts/install-into.test.mjs
//
// Each test builds a small stand-in kit and a small app in a temporary folder.
// The tests at the end read the real README.md, package.json, and kit files.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  COPY_MARKER,
  DEV_DEPENDENCIES_MARKER,
  HOOKS_FILE,
  InstallError,
  KIT_ROOT,
  MCP_FILE,
  RETIRED_PACKAGE,
  TEST_SCRIPTS,
  TEST_TSCONFIG,
  TEST_TSCONFIG_TEXT,
  VERDICT_CONFIGS,
  formatReport,
  install,
  readInstallLists,
  readMarkedBlock,
} from './install-into.mjs'

const FENCE = '```'
const WINDOWS = process.platform === 'win32'

function write(root, file, text, mode) {
  const path = join(root, file)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
  if (mode) chmodSync(path, mode)
}

function read(root, file) {
  return readFileSync(join(root, file), 'utf8')
}

function readme(copyList, dependencyList) {
  return [
    '# Kit',
    '',
    COPY_MARKER,
    '',
    `${FENCE}text`,
    copyList,
    FENCE,
    '',
    DEV_DEPENDENCIES_MARKER,
    '',
    `${FENCE}text`,
    dependencyList,
    FENCE,
    '',
  ].join('\n')
}

const KIT_PACKAGE = {
  name: 'kit',
  scripts: {
    'test:unit': 'vitest run --project unit',
    'test:integration': 'vitest run --project integration',
    'test:e2e': 'playwright test',
    'test:e2e:list': 'playwright test --list',
    'test:hook': 'python3 -m unittest',
  },
  devDependencies: { vitest: '^5.0.3', jsdom: '^30.1.1', typescript: '^7.0.2' },
}

// The stand-in kit's hook entry, hooks file, and MCP servers. The real kit has
// one server, maestro. The second one here keeps the wording for two servers
// under test.
const KIT_HOOK = { command: '.cursor/hooks/guard.py', failClosed: true }
const HOOK_EVENTS = ['preToolUse', 'beforeShellExecution', 'beforeMCPExecution']
const KIT_HOOKS = { version: 1, hooks: Object.fromEntries(HOOK_EVENTS.map((event) => [event, [KIT_HOOK]])) }
const KIT_MCP = {
  mcpServers: {
    maestro: { command: 'maestro', args: ['mcp'] },
    emulator: { command: 'kit-emulator', args: ['mcp'] },
  },
}
// The entry that earlier versions of the kit added to an app's .cursor/mcp.json.
const OLD_PLAYWRIGHT_SERVER = { command: 'npx', args: ['--no-install', RETIRED_PACKAGE, '--headless', '--isolated'] }
const WITH_CONFIGS = '.cursor/  .cursorignore  test/  AGENTS.md  vitest.config.ts  playwright.config.ts'

let folder
let kit
let app

function makeKit({ copyList = '.cursor/  .cursorignore  test/  AGENTS.md', dependencyList = 'vitest\njsdom' } = {}) {
  write(kit, 'README.md', readme(copyList, dependencyList))
  write(kit, 'package.json', JSON.stringify(KIT_PACKAGE, null, 2))
  write(kit, '.gitignore', '# Dependencies\nnode_modules/\n\n# Test output\ncoverage/\ntest-results/\n')
  write(kit, '.cursorignore', 'package-lock.json\n')
  write(kit, 'AGENTS.md', '# Kit rules\n')
  write(kit, '.cursor/hooks/guard.py', '#!/usr/bin/env python3\n', 0o755)
  write(kit, HOOKS_FILE, `${JSON.stringify(KIT_HOOKS, null, 2)}\n`)
  write(kit, MCP_FILE, `${JSON.stringify(KIT_MCP, null, 2)}\n`)
  write(kit, 'vitest.config.ts', "export default { test: { reporters: ['default', './.cursor/qa/vitest-verdict.mjs'] } }\n")
  write(kit, 'playwright.config.ts', "export default { reporter: [['list'], ['./.cursor/qa/playwright-verdict.mjs']] }\n")
  write(kit, '.cursor/hooks/__pycache__/guard.cpython-314.pyc', 'bytecode')
  write(kit, '.cursor/skills/qa-unit/SKILL.md', '# Skill\n')
  write(kit, 'test/setup.ts', '// kit setup\n')
  write(kit, 'test/unit/.gitkeep', '')
  write(kit, 'docs/hook-rules.md', '# Not in the copy list\n')
}

function makeApp(packageJson = { name: 'app', scripts: { dev: 'next dev' }, devDependencies: { typescript: '^5' } }) {
  write(app, 'package.json', `${JSON.stringify(packageJson, null, 2)}\n`)
  write(app, '.gitignore', 'node_modules/\n.next/\n')
  write(app, 'src/page.tsx', 'export default function Page() {}\n')
  write(app, 'test/unit/mine.test.ts', '// my test\n')
}

function readJsonFile(root, file) {
  return JSON.parse(read(root, file))
}

function entryFor(report, file) {
  return report.files.find((entry) => entry.file === file)
}

function skippedFiles(report) {
  return report.files.filter((entry) => entry.action === 'skip').map((entry) => entry.file)
}

function warningIds(report) {
  return report.warnings.map((warning) => warning.id)
}

// Every file under `root` with its bytes, to show that a run wrote nothing there.
function snapshot(root) {
  const found = {}
  const visit = (path) => {
    const stats = lstatSync(path)
    if (stats.isSymbolicLink()) found[path] = 'link'
    else if (stats.isDirectory()) readdirSync(path).sort().forEach((name) => visit(join(path, name)))
    else found[path] = readFileSync(path, 'hex')
  }
  visit(root)
  return found
}

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'install-into-test-'))
  kit = join(folder, 'kit')
  app = join(folder, 'app')
  mkdirSync(kit)
  mkdirSync(app)
  makeKit()
  makeApp()
})

afterEach(() => {
  rmSync(folder, { recursive: true, force: true })
})

describe('readMarkedBlock', () => {
  it('returns the words of the block after the marker', () => {
    const words = readMarkedBlock(readme('.cursor/  test/\nAGENTS.md', 'vitest'), COPY_MARKER)
    assert.deepEqual(words, ['.cursor/', 'test/', 'AGENTS.md'])
  })

  it('reads a marker and a block that are indented inside a list item', () => {
    const text = ['- Add these:', '', `  ${DEV_DEPENDENCIES_MARKER}`, '', `  ${FENCE}text`, '  vitest', '  jsdom', `  ${FENCE}`].join('\n')
    assert.deepEqual(readMarkedBlock(text, DEV_DEPENDENCIES_MARKER), ['vitest', 'jsdom'])
  })

  it('fails when the marker is missing or is there twice', () => {
    assert.throws(() => readMarkedBlock('# Kit\n', COPY_MARKER), /exactly one .* Found 0/)
    assert.throws(() => readMarkedBlock(`${COPY_MARKER}\n${COPY_MARKER}\n`, COPY_MARKER), /Found 2/)
  })

  it('fails when something other than a code block follows the marker', () => {
    assert.throws(() => readMarkedBlock(`${COPY_MARKER}\n\nSome text.\n\n${FENCE}\na\n${FENCE}\n`, COPY_MARKER), /fenced code block must follow/)
  })

  it('fails on an empty block and on a block that is never closed', () => {
    assert.throws(() => readMarkedBlock(`${COPY_MARKER}\n\n${FENCE}text\n${FENCE}\n`, COPY_MARKER), /is empty/)
    assert.throws(() => readMarkedBlock(`${COPY_MARKER}\n\n${FENCE}text\na\n`, COPY_MARKER), /never closed/)
  })
})

describe('install', () => {
  it('copies the listed paths and leaves out everything else', () => {
    install(app, { kitRoot: kit })
    assert.equal(read(app, 'AGENTS.md'), '# Kit rules\n')
    assert.equal(read(app, '.cursorignore'), 'package-lock.json\n')
    assert.equal(read(app, '.cursor/skills/qa-unit/SKILL.md'), '# Skill\n')
    assert.equal(read(app, 'test/setup.ts'), '// kit setup\n')
    assert.ok(existsSync(join(app, 'test/unit/.gitkeep')))
    assert.ok(!existsSync(join(app, 'docs')), 'docs/ is not in the copy list')
    assert.ok(!existsSync(join(app, 'README.md')), 'README.md is not in the copy list')
    assert.ok(!existsSync(join(app, '.cursor/hooks/__pycache__')), 'bytecode is never copied')
  })

  it('keeps the hook executable', { skip: process.platform === 'win32' }, () => {
    install(app, { kitRoot: kit })
    assert.equal(statSync(join(app, '.cursor/hooks/guard.py')).mode & 0o111, 0o111)
  })

  it('keeps the files the app already has', () => {
    install(app, { kitRoot: kit })
    assert.equal(read(app, 'src/page.tsx'), 'export default function Page() {}\n')
    assert.equal(read(app, 'test/unit/mine.test.ts'), '// my test\n')
  })

  it('adds the listed dev dependencies and the four test scripts, and nothing else', () => {
    install(app, { kitRoot: kit })
    const result = JSON.parse(read(app, 'package.json'))
    assert.deepEqual(result.devDependencies, { jsdom: '^30.1.1', typescript: '^5', vitest: '^5.0.3' })
    assert.deepEqual(Object.keys(result.devDependencies), ['jsdom', 'typescript', 'vitest'])
    assert.deepEqual(Object.keys(result.scripts), ['dev', ...TEST_SCRIPTS])
    assert.equal(result.scripts['test:unit'], 'vitest run --project unit')
    assert.equal(result.scripts['test:hook'], undefined)
  })

  it('adds only the .gitignore lines the app lacks', () => {
    install(app, { kitRoot: kit })
    assert.equal(
      read(app, '.gitignore'),
      'node_modules/\n.next/\n\n# Added with the Cursor QA agent kit\ncoverage/\ntest-results/\n',
    )
  })

  it('creates .gitignore when the app has none', () => {
    rmSync(join(app, '.gitignore'))
    install(app, { kitRoot: kit })
    assert.equal(read(app, '.gitignore'), '# Added with the Cursor QA agent kit\nnode_modules/\ncoverage/\ntest-results/\n')
  })

  it('writes nothing on a dry run and reports the same plan', () => {
    const before = { package: read(app, 'package.json'), gitignore: read(app, '.gitignore') }
    const report = install(app, { kitRoot: kit, dryRun: true })
    assert.equal(read(app, 'package.json'), before.package)
    assert.equal(read(app, '.gitignore'), before.gitignore)
    assert.ok(!existsSync(join(app, 'AGENTS.md')))
    assert.ok(!existsSync(join(app, '.cursor')))
    assert.equal(report.files.filter((entry) => entry.action === 'add').length, 8)
    assert.match(formatReport(report), /^Dry run\. Nothing is written\./)
    assert.match(formatReport(report), /would add {5}AGENTS\.md/)
  })

  it('changes nothing on a second run', () => {
    install(app, { kitRoot: kit })
    const before = { package: read(app, 'package.json'), gitignore: read(app, '.gitignore') }
    const report = install(app, { kitRoot: kit })
    assert.ok(report.files.every((entry) => entry.action === 'same'))
    assert.ok(report.devDependencies.every((entry) => entry.action === 'same'))
    assert.ok(report.scripts.every((entry) => entry.action === 'same'))
    assert.deepEqual(report.gitignoreLines, [])
    assert.equal(read(app, 'package.json'), before.package)
    assert.equal(read(app, '.gitignore'), before.gitignore)
  })

  it('skips a file the app already has with other content, and lists it', () => {
    write(app, 'AGENTS.md', '# My rules\n')
    const report = install(app, { kitRoot: kit })
    assert.equal(read(app, 'AGENTS.md'), '# My rules\n')
    assert.deepEqual(report.files.filter((entry) => entry.action === 'skip').map((entry) => entry.file), ['AGENTS.md'])
    assert.match(formatReport(report), /skipped {7}AGENTS\.md/)
    assert.match(formatReport(report), /run again with --force/)
  })

  it('replaces that file with --force', () => {
    write(app, 'AGENTS.md', '# My rules\n')
    const report = install(app, { kitRoot: kit, force: true })
    assert.equal(read(app, 'AGENTS.md'), '# Kit rules\n')
    assert.deepEqual(report.files.filter((entry) => entry.action === 'replace').map((entry) => entry.file), ['AGENTS.md'])
  })

  it('keeps a dependency range and a script the app already has, and takes the kit\'s with --force', () => {
    makeApp({
      name: 'app',
      scripts: { 'test:unit': 'jest' },
      dependencies: { jsdom: '^25.0.0' },
      devDependencies: { vitest: '^3.0.0' },
    })
    const report = install(app, { kitRoot: kit })
    let result = JSON.parse(read(app, 'package.json'))
    assert.equal(result.scripts['test:unit'], 'jest')
    assert.equal(result.dependencies.jsdom, '^25.0.0')
    assert.equal(result.devDependencies.vitest, '^3.0.0')
    assert.equal(result.devDependencies.jsdom, undefined, 'no second entry under devDependencies')
    assert.deepEqual(report.devDependencies.map((entry) => entry.action), ['skip', 'skip'])
    assert.match(formatReport(report), /vitest \(your app has \^3\.0\.0, the kit uses \^5\.0\.3\)/)
    assert.match(formatReport(report), /If `npm install` stops with ERESOLVE/)

    install(app, { kitRoot: kit, force: true })
    result = JSON.parse(read(app, 'package.json'))
    assert.equal(result.scripts['test:unit'], 'vitest run --project unit')
    assert.equal(result.dependencies.jsdom, '^30.1.1')
    assert.equal(result.devDependencies.vitest, '^5.0.3')
  })

  it('never removes a file or folder that is in the way, also with --force', () => {
    mkdirSync(join(app, 'AGENTS.md'))
    write(app, '.cursor', 'a file named .cursor\n')
    const report = install(app, { kitRoot: kit, force: true })
    assert.ok(statSync(join(app, 'AGENTS.md')).isDirectory())
    assert.equal(read(app, '.cursor'), 'a file named .cursor\n')
    const skipped = report.files.filter((entry) => entry.action === 'skip').map((entry) => entry.file)
    assert.deepEqual(skipped, ['.cursor/hooks/guard.py', HOOKS_FILE, MCP_FILE, '.cursor/skills/qa-unit/SKILL.md', 'AGENTS.md'])
    assert.match(formatReport(report), /--force does not remove/)
  })

  it('keeps the indentation and the missing final newline of package.json', () => {
    writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'app' }, null, '\t'))
    install(app, { kitRoot: kit })
    const text = read(app, 'package.json')
    assert.match(text, /^\{\n\t"name": "app",\n\t"devDependencies": \{\n\t\t"jsdom"/)
    assert.ok(text.endsWith('}'))
  })

  it('stops before the first write when the README names a path the kit does not have', () => {
    makeKit({ copyList: '.cursor/  missing-folder/' })
    assert.throws(() => install(app, { kitRoot: kit }), (error) => error instanceof InstallError && /no such path/.test(error.message))
    assert.ok(!existsSync(join(app, '.cursor')))
  })

  it('stops when the README names a path outside the kit', () => {
    for (const copyList of ['../secrets', '/etc/passwd', '.', 'test/../..']) {
      makeKit({ copyList })
      assert.throws(() => install(app, { kitRoot: kit }), /not a path inside this repository/, copyList)
    }
  })

  it('stops when the README names a dev dependency the kit does not have', () => {
    makeKit({ dependencyList: 'vitest\nleft-pad' })
    assert.throws(() => install(app, { kitRoot: kit }), /lists the dev dependency "left-pad"/)
    assert.ok(!existsSync(join(app, '.cursor')))
  })

  it('stops when the folder is not an app or sits inside the kit', () => {
    assert.throws(() => install(join(folder, 'nowhere'), { kitRoot: kit }), /is not a folder/)
    rmSync(join(app, 'package.json'))
    assert.throws(() => install(app, { kitRoot: kit }), /has no package\.json/)
    write(kit, 'examples/app/package.json', '{}')
    assert.throws(() => install(join(kit, 'examples/app'), { kitRoot: kit }), /is inside this repository/)
    assert.throws(() => install(kit, { kitRoot: kit }), /is inside this repository/)
  })

  it('stops on a package.json that is not valid JSON', () => {
    writeFileSync(join(app, 'package.json'), '{ nope')
    assert.throws(() => install(app, { kitRoot: kit }), /is not valid JSON/)
    assert.ok(!existsSync(join(app, '.cursor')))
  })
})

describe('install: symbolic links in the app', { skip: WINDOWS }, () => {
  let outside

  beforeEach(() => {
    outside = join(folder, 'outside')
    mkdirSync(outside)
  })

  it('does not create a file through a link that points at nothing', () => {
    symlinkSync('../outside/CLAUDE.md', join(app, 'AGENTS.md'))
    const report = install(app, { kitRoot: kit })
    assert.deepEqual(readdirSync(outside), [], 'nothing is written outside the app')
    assert.ok(lstatSync(join(app, 'AGENTS.md')).isSymbolicLink())
    assert.equal(entryFor(report, 'AGENTS.md').action, 'skip')
    assert.equal(entryFor(report, 'AGENTS.md').reason, 'link')
    assert.match(formatReport(report), /skipped {7}AGENTS\.md \(your app has a symbolic link here\)/)
    assert.match(formatReport(report), /never writes through a link, also with --force/)
  })

  it('does not replace the file a link points at, with and without --force', () => {
    write(outside, 'CLAUDE.md', '# My own rules\n')
    symlinkSync('../outside/CLAUDE.md', join(app, 'AGENTS.md'))
    for (const force of [false, true]) {
      const report = install(app, { kitRoot: kit, force })
      assert.equal(read(outside, 'CLAUDE.md'), '# My own rules\n', `force: ${force}`)
      assert.ok(lstatSync(join(app, 'AGENTS.md')).isSymbolicLink())
      assert.equal(entryFor(report, 'AGENTS.md').action, 'skip')
    }
  })

  it('writes nothing into a folder that a link stands for, with and without --force', () => {
    mkdirSync(join(outside, 'shared-cursor'))
    symlinkSync('../outside/shared-cursor', join(app, '.cursor'))
    for (const force of [false, true]) {
      const report = install(app, { kitRoot: kit, force })
      assert.deepEqual(readdirSync(join(outside, 'shared-cursor')), [], `force: ${force}`)
      const under = report.files.filter((entry) => entry.file.startsWith('.cursor/'))
      assert.equal(under.length, 4)
      assert.ok(under.every((entry) => entry.action === 'skip' && entry.reason === 'link'))
      assert.match(formatReport(report), /\.cursor\/hooks\/guard\.py \(\.cursor in your app is a symbolic link\)/)
    }
    assert.equal(read(app, 'AGENTS.md'), '# Kit rules\n', 'a file that is not behind a link is installed')
  })

  it('checks every folder between the app root and the file', () => {
    mkdirSync(join(outside, 'unit'))
    rmSync(join(app, 'test/unit'), { recursive: true })
    symlinkSync('../../outside/unit', join(app, 'test/unit'))
    const report = install(app, { kitRoot: kit, force: true })
    assert.deepEqual(readdirSync(join(outside, 'unit')), [])
    assert.deepEqual(skippedFiles(report), ['test/unit/.gitkeep'])
    assert.equal(entryFor(report, 'test/unit/.gitkeep').note, 'test/unit in your app is a symbolic link')
    assert.equal(read(app, 'test/setup.ts'), '// kit setup\n')
  })

  it('reports the same skip on a dry run', () => {
    symlinkSync('../outside/CLAUDE.md', join(app, 'AGENTS.md'))
    const report = install(app, { kitRoot: kit, dryRun: true })
    assert.equal(entryFor(report, 'AGENTS.md').action, 'skip')
    assert.match(formatReport(report), /would skip {4}AGENTS\.md \(your app has a symbolic link here\)/)
  })

  it('does not write package.json or .gitignore through a link', () => {
    const packageText = read(app, 'package.json')
    rmSync(join(app, 'package.json'))
    rmSync(join(app, '.gitignore'))
    write(outside, 'package.json', packageText)
    write(outside, 'gitignore', 'node_modules/\n')
    symlinkSync('../outside/package.json', join(app, 'package.json'))
    symlinkSync('../outside/gitignore', join(app, '.gitignore'))
    const report = install(app, { kitRoot: kit, force: true })
    assert.equal(read(outside, 'package.json'), packageText)
    assert.equal(read(outside, 'gitignore'), 'node_modules/\n')
    assert.ok(report.devDependencies.every((entry) => entry.action === 'skip' && entry.reason === 'link'))
    assert.ok(report.scripts.every((entry) => entry.action === 'skip' && entry.reason === 'link'))
    assert.deepEqual(report.gitignoreLines, [])
    assert.deepEqual(report.gitignoreSkipped, ['coverage/', 'test-results/'])
    const output = formatReport(report)
    assert.match(output, /skipped {7}vitest \^5\.0\.3 \(package\.json in your app is a symbolic link\)/)
    assert.match(output, /skipped {7}2 lines \(\.gitignore in your app is a symbolic link\)/)
  })

  it('does not create .gitignore through a link that points at nothing', () => {
    rmSync(join(app, '.gitignore'))
    symlinkSync('../outside/gitignore', join(app, '.gitignore'))
    install(app, { kitRoot: kit })
    assert.deepEqual(readdirSync(outside), [])
  })

  it('installs into an app folder that is itself given as a link', () => {
    symlinkSync('app', join(folder, 'app-link'))
    const report = install(join(folder, 'app-link'), { kitRoot: kit })
    assert.equal(read(app, 'AGENTS.md'), '# Kit rules\n')
    assert.deepEqual(skippedFiles(report), [])
  })
})

describe('install: an app with its own .cursor/hooks.json', () => {
  const OWN = { command: './scripts/format.sh' }
  const AUDIT = { command: './scripts/audit.sh', timeout: 5 }

  function appHooks(value, indent = 2) {
    write(app, HOOKS_FILE, typeof value === 'string' ? value : `${JSON.stringify(value, null, indent)}\n`)
  }

  it("adds the kit's entries, keeps the app's own, and says so", () => {
    appHooks({ version: 1, hooks: { afterFileEdit: [OWN], beforeShellExecution: [AUDIT] } })
    const report = install(app, { kitRoot: kit })
    const result = readJsonFile(app, HOOKS_FILE)
    assert.deepEqual(result, {
      version: 1,
      hooks: {
        afterFileEdit: [OWN],
        beforeShellExecution: [AUDIT, KIT_HOOK],
        preToolUse: [KIT_HOOK],
        beforeMCPExecution: [KIT_HOOK],
      },
    })
    assert.deepEqual(Object.keys(result.hooks), ['afterFileEdit', 'beforeShellExecution', 'preToolUse', 'beforeMCPExecution'])
    assert.equal(entryFor(report, HOOKS_FILE).action, 'merge')
    assert.deepEqual(report.warnings, [])
    const output = formatReport(report)
    assert.match(
      output,
      /merged {8}\.cursor\/hooks\.json \(added the kit's hook to preToolUse, beforeShellExecution, beforeMCPExecution\. Your own entries are kept\)/,
    )
    assert.match(output, /, 1 merged, /)
    assert.doesNotMatch(output, /WARNING/)
  })

  it('adds nothing on a second run', () => {
    appHooks({ version: 1, hooks: { afterFileEdit: [OWN], beforeShellExecution: [AUDIT] } })
    install(app, { kitRoot: kit })
    const before = read(app, HOOKS_FILE)
    const report = install(app, { kitRoot: kit })
    assert.equal(entryFor(report, HOOKS_FILE).action, 'same')
    assert.equal(read(app, HOOKS_FILE), before)
  })

  it('leaves a file alone that already has every entry of the kit, whatever its layout', () => {
    const text = JSON.stringify({ hooks: { ...KIT_HOOKS.hooks, afterFileEdit: [OWN] }, version: 1 })
    appHooks(text)
    for (const force of [false, true]) {
      const report = install(app, { kitRoot: kit, force })
      assert.equal(entryFor(report, HOOKS_FILE).action, 'same', `force: ${force}`)
      assert.equal(read(app, HOOKS_FILE), text)
    }
  })

  it("keeps the app's own entries with --force too", () => {
    appHooks({ version: 1, hooks: { afterFileEdit: [OWN] } })
    const report = install(app, { kitRoot: kit, force: true })
    assert.deepEqual(readJsonFile(app, HOOKS_FILE).hooks.afterFileEdit, [OWN])
    assert.deepEqual(readJsonFile(app, HOOKS_FILE).hooks.preToolUse, [KIT_HOOK])
    assert.equal(entryFor(report, HOOKS_FILE).action, 'merge')
  })

  it('adds "version" and "hooks" when the file has neither', () => {
    appHooks('{}\n')
    install(app, { kitRoot: kit })
    assert.deepEqual(readJsonFile(app, HOOKS_FILE), KIT_HOOKS)
  })

  it('keeps the indentation of the file', () => {
    appHooks({ version: 1, hooks: { afterFileEdit: [OWN] } }, '\t')
    install(app, { kitRoot: kit })
    assert.match(read(app, HOOKS_FILE), /^\{\n\t"version": 1,\n\t"hooks": \{\n\t\t"afterFileEdit"/)
  })

  it('writes nothing on a dry run and says what it would merge', () => {
    appHooks({ version: 1, hooks: { afterFileEdit: [OWN] } })
    const before = read(app, HOOKS_FILE)
    const report = install(app, { kitRoot: kit, dryRun: true })
    assert.equal(read(app, HOOKS_FILE), before)
    assert.match(formatReport(report), /would merge {3}\.cursor\/hooks\.json \(added the kit's hook to/)
  })

  it("keeps an entry that starts the kit's hook with other options, and takes the kit's with --force", () => {
    const narrowed = { command: KIT_HOOK.command, matcher: 'Write' }
    appHooks({ version: 1, hooks: { ...KIT_HOOKS.hooks, preToolUse: [OWN, narrowed] } })
    let report = install(app, { kitRoot: kit })
    assert.deepEqual(readJsonFile(app, HOOKS_FILE).hooks.preToolUse, [OWN, narrowed])
    assert.equal(entryFor(report, HOOKS_FILE).action, 'skip')
    assert.equal(entryFor(report, HOOKS_FILE).reason, 'differs')
    assert.match(formatReport(report), /kept your own entry for the kit's hook in preToolUse/)
    assert.match(formatReport(report), /run again with --force/)
    assert.deepEqual(report.warnings, [], 'the hook is registered, so there is no warning')

    report = install(app, { kitRoot: kit, force: true })
    assert.deepEqual(readJsonFile(app, HOOKS_FILE).hooks.preToolUse, [OWN, KIT_HOOK])
    assert.equal(entryFor(report, HOOKS_FILE).action, 'merge')
    assert.match(formatReport(report), /took the kit's entry for its hook in preToolUse/)
  })

  it('does not add a second entry when the app starts the same script with another command', () => {
    const viaPython = { command: 'python3 ./.cursor/hooks/guard.py', failClosed: true }
    const windows = { command: 'python .cursor\\hooks\\guard.py', failClosed: true }
    appHooks({ version: 1, hooks: { preToolUse: [viaPython], beforeShellExecution: [windows] } })
    let report = install(app, { kitRoot: kit })
    assert.deepEqual(readJsonFile(app, HOOKS_FILE).hooks, {
      preToolUse: [viaPython],
      beforeShellExecution: [windows],
      beforeMCPExecution: [KIT_HOOK],
    })
    assert.equal(entryFor(report, HOOKS_FILE).action, 'merge')
    assert.match(
      formatReport(report),
      /added the kit's hook to beforeMCPExecution; kept your own entry for the kit's hook in preToolUse, beforeShellExecution\)/,
    )

    report = install(app, { kitRoot: kit })
    assert.equal(entryFor(report, HOOKS_FILE).action, 'skip')
    assert.equal(entryFor(report, HOOKS_FILE).reason, 'differs')
    assert.deepEqual(report.warnings, [], 'the hook is registered')

    install(app, { kitRoot: kit, force: true })
    assert.deepEqual(readJsonFile(app, HOOKS_FILE).hooks, KIT_HOOKS.hooks)
  })

  for (const [name, text, problem] of [
    ['is not valid JSON', '{ "version": 1, "hooks": {', /is not valid JSON/],
    ['holds a list', '[]\n', /does not hold a JSON object/],
    ['has a "hooks" that is a list', '{"version":1,"hooks":[]}\n', /"hooks" is not an object/],
    ['has an event that is not a list', '{"version":1,"hooks":{"preToolUse":{}}}\n', /"hooks\.preToolUse" is not a list/],
    ['has another "version"', '{"version":2,"hooks":{}}\n', /"version" is 2/],
  ]) {
    it(`skips a file that ${name}, and warns that nothing is guarded`, () => {
      appHooks(text)
      const report = install(app, { kitRoot: kit })
      assert.equal(read(app, HOOKS_FILE), text)
      const entry = entryFor(report, HOOKS_FILE)
      assert.equal(entry.action, 'skip')
      assert.equal(entry.reason, 'unmergeable')
      assert.match(entry.note, problem)
      assert.deepEqual(warningIds(report), ['hook'])
      const output = formatReport(report)
      assert.match(output, /^WARNING: the hook is not registered, so nothing is guarded\.$/m)
      assert.match(output, /\.cursor\/hooks\.json was skipped: it could not be merged, because /)
      assert.match(output, /the agent can edit application source/)
      assert.match(output, /What to do: /)
      assert.ok(output.includes(join(kit, HOOKS_FILE)), 'names the kit file to copy the entries from')
      assert.ok(output.trimEnd().split('\n').at(-1).startsWith('  '), 'the warning is the last thing printed')
    })
  }

  it('replaces a file that cannot be merged with --force, and does not warn', () => {
    appHooks('{ nope')
    const report = install(app, { kitRoot: kit, force: true })
    assert.deepEqual(readJsonFile(app, HOOKS_FILE), KIT_HOOKS)
    assert.equal(entryFor(report, HOOKS_FILE).action, 'replace')
    assert.deepEqual(report.warnings, [])
  })

  it('warns on a dry run too', () => {
    appHooks('{ nope')
    const report = install(app, { kitRoot: kit, dryRun: true })
    assert.deepEqual(warningIds(report), ['hook'])
    assert.match(formatReport(report), /^WARNING: the hook is not registered, so nothing is guarded\.$/m)
  })

  it('warns when the file is behind a link and does not register the hook', { skip: WINDOWS }, () => {
    write(folder, 'outside/hooks.json', `${JSON.stringify({ version: 1, hooks: { afterFileEdit: [OWN] } })}\n`)
    mkdirSync(join(app, '.cursor'))
    symlinkSync('../../outside/hooks.json', join(app, HOOKS_FILE))
    const report = install(app, { kitRoot: kit, force: true })
    assert.deepEqual(readJsonFile(folder, 'outside/hooks.json'), { version: 1, hooks: { afterFileEdit: [OWN] } })
    assert.deepEqual(warningIds(report), ['hook'])
    assert.match(formatReport(report), /What to do: replace the link with a real file or folder/)
  })

  it('does not warn when the file behind a link registers the hook', { skip: WINDOWS }, () => {
    write(folder, 'outside/hooks.json', `${JSON.stringify(KIT_HOOKS)}\n`)
    mkdirSync(join(app, '.cursor'))
    symlinkSync('../../outside/hooks.json', join(app, HOOKS_FILE))
    const report = install(app, { kitRoot: kit })
    assert.equal(entryFor(report, HOOKS_FILE).action, 'skip')
    assert.deepEqual(report.warnings, [])
  })

  it('warns when a file named .cursor is in the way', () => {
    write(app, '.cursor', 'a file named .cursor\n')
    const report = install(app, { kitRoot: kit, force: true })
    assert.deepEqual(warningIds(report), ['hook', 'mcp'])
    assert.match(formatReport(report), /What to do: move what is in the way/)
  })
})

describe('install: an app with its own .cursor/mcp.json', () => {
  const GITHUB = { command: 'npx', args: ['github-mcp'] }

  it("adds the kit's servers that are missing, keeps the app's own, and says so", () => {
    write(app, MCP_FILE, `${JSON.stringify({ inputs: ['token'], mcpServers: { github: GITHUB } }, null, 2)}\n`)
    const report = install(app, { kitRoot: kit })
    const result = readJsonFile(app, MCP_FILE)
    assert.deepEqual(result, { inputs: ['token'], mcpServers: { github: GITHUB, ...KIT_MCP.mcpServers } })
    assert.deepEqual(Object.keys(result.mcpServers), ['github', 'maestro', 'emulator'])
    assert.equal(entryFor(report, MCP_FILE).action, 'merge')
    assert.deepEqual(report.warnings, [])
    assert.match(
      formatReport(report),
      /merged {8}\.cursor\/mcp\.json \(added the servers maestro, emulator\. Your own entries are kept\)/,
    )

    const before = read(app, MCP_FILE)
    assert.equal(entryFor(install(app, { kitRoot: kit }), MCP_FILE).action, 'same')
    assert.equal(read(app, MCP_FILE), before)
  })

  it('adds "mcpServers" when the file has none', () => {
    write(app, MCP_FILE, '{}')
    install(app, { kitRoot: kit })
    assert.deepEqual(readJsonFile(app, MCP_FILE), KIT_MCP)
  })

  it("keeps the app's own server of the same name, and takes the kit's with --force", () => {
    const mine = { command: 'maestro', args: ['mcp', '--no-viewer'] }
    write(app, MCP_FILE, JSON.stringify({ mcpServers: { maestro: mine } }))
    let report = install(app, { kitRoot: kit })
    assert.deepEqual(readJsonFile(app, MCP_FILE).mcpServers, { maestro: mine, emulator: KIT_MCP.mcpServers.emulator })
    assert.equal(entryFor(report, MCP_FILE).action, 'merge')
    assert.match(formatReport(report), /added the server emulator; kept your own maestro, which differs from the kit's\)/)

    report = install(app, { kitRoot: kit })
    assert.equal(entryFor(report, MCP_FILE).action, 'skip')
    assert.equal(entryFor(report, MCP_FILE).reason, 'differs')
    assert.deepEqual(report.warnings, [])

    report = install(app, { kitRoot: kit, force: true })
    assert.deepEqual(readJsonFile(app, MCP_FILE).mcpServers.maestro, KIT_MCP.mcpServers.maestro)
    assert.match(formatReport(report), /took the kit's maestro/)
  })

  for (const [name, text, problem] of [
    ['is not valid JSON', '{ "mcpServers": ', /is not valid JSON/],
    ['holds a list', '[]', /does not hold a JSON object/],
    ['has an "mcpServers" that is a list', '{"mcpServers":[]}', /"mcpServers" is not an object/],
  ]) {
    it(`skips a file that ${name}, and warns that the servers are missing`, () => {
      write(app, MCP_FILE, text)
      const report = install(app, { kitRoot: kit })
      assert.equal(read(app, MCP_FILE), text)
      assert.equal(entryFor(report, MCP_FILE).action, 'skip')
      assert.equal(entryFor(report, MCP_FILE).reason, 'unmergeable')
      assert.match(entryFor(report, MCP_FILE).note, problem)
      assert.deepEqual(warningIds(report), ['mcp'])
      const output = formatReport(report)
      assert.match(output, /^WARNING: the kit's MCP servers are not registered: maestro, emulator\.$/m)
      assert.match(output, /\.cursor\/mcp\.json was skipped: it could not be merged, because /)
      assert.match(output, /The three mobile jobs read the device through the maestro server/)
      assert.doesNotMatch(output, /\/qa-plan|\/qa-generate/, 'the web jobs need no MCP server')
      assert.match(output, /stop with BLOCKED/)
      assert.match(output, /What to do: /)
      assert.ok(output.includes(join(kit, MCP_FILE)))
    })
  }

  it('names only the servers that are missing', { skip: WINDOWS }, () => {
    write(folder, 'outside/mcp.json', JSON.stringify({ mcpServers: { emulator: KIT_MCP.mcpServers.emulator } }))
    mkdirSync(join(app, '.cursor'))
    symlinkSync('../../outside/mcp.json', join(app, MCP_FILE))
    const output = formatReport(install(app, { kitRoot: kit }))
    assert.match(output, /^WARNING: the kit's MCP server is not registered: maestro\.$/m)
    assert.match(output, /The three mobile jobs read the device through the maestro server/)
    assert.doesNotMatch(output, /emulator server/, 'a server that is registered is not named')
  })

  it('replaces a file that cannot be merged with --force', () => {
    write(app, MCP_FILE, '{ nope')
    const report = install(app, { kitRoot: kit, force: true })
    assert.deepEqual(readJsonFile(app, MCP_FILE), KIT_MCP)
    assert.deepEqual(report.warnings, [])
  })
})

describe('install: an app that still has the Playwright MCP server of an earlier kit', () => {
  const withPackage = (section = 'devDependencies') => ({ name: 'app', scripts: { dev: 'next dev' }, [section]: { [RETIRED_PACKAGE]: '^0.0.83' } })
  const noteIds = (report) => report.notes.map((note) => note.id)

  it('says so in a note, names both places, and removes nothing', () => {
    write(app, MCP_FILE, `${JSON.stringify({ mcpServers: { playwright: OLD_PLAYWRIGHT_SERVER } }, null, 2)}\n`)
    makeApp(withPackage())
    const report = install(app, { kitRoot: kit })
    assert.deepEqual(noteIds(report), ['playwright-mcp'])
    assert.deepEqual(report.warnings, [])
    assert.deepEqual(readJsonFile(app, MCP_FILE).mcpServers, { playwright: OLD_PLAYWRIGHT_SERVER, ...KIT_MCP.mcpServers }, 'the old server is still there')
    assert.equal(readJsonFile(app, 'package.json').devDependencies[RETIRED_PACKAGE], '^0.0.83', 'the package is still listed')
    const output = formatReport(report)
    assert.match(output, /^NOTE: the kit no longer uses the Playwright MCP server, and your app still has it\.$/m)
    assert.match(output, /^ {2}\.cursor\/mcp\.json starts @playwright\/mcp as the server "playwright"\.$/m)
    assert.match(output, /^ {2}package\.json lists @playwright\/mcp in devDependencies\.$/m)
    assert.match(output, /^ {2}\/qa-plan and \/qa-generate now open the browser with playwright-cli commands\. No job of the kit uses that server\.$/m)
    assert.match(output, /^ {2}What to do: if you do not use it yourself, delete the server from \.cursor\/mcp\.json and the package from package\.json\. The installer never removes anything\.$/m)

    // Still there on a second run, when nothing else is left to do.
    const again = install(app, { kitRoot: kit })
    assert.equal(entryFor(again, MCP_FILE).action, 'same')
    assert.deepEqual(noteIds(again), ['playwright-mcp'])
  })

  it('keeps the note with --force and on a dry run', () => {
    write(app, MCP_FILE, JSON.stringify({ mcpServers: { playwright: OLD_PLAYWRIGHT_SERVER } }))
    const before = read(app, MCP_FILE)
    const dry = install(app, { kitRoot: kit, dryRun: true })
    assert.deepEqual(noteIds(dry), ['playwright-mcp'])
    assert.equal(read(app, MCP_FILE), before)
    const forced = install(app, { kitRoot: kit, force: true })
    assert.deepEqual(noteIds(forced), ['playwright-mcp'])
    assert.deepEqual(readJsonFile(app, MCP_FILE).mcpServers.playwright, OLD_PLAYWRIGHT_SERVER, '--force replaces only what the kit ships')
  })

  it('names only the package when no server starts it', () => {
    makeApp(withPackage('dependencies'))
    const output = formatReport(install(app, { kitRoot: kit }))
    assert.match(output, /^ {2}package\.json lists @playwright\/mcp in dependencies\.$/m)
    assert.doesNotMatch(output, /starts @playwright\/mcp/)
    assert.match(output, /What to do: if you do not use it yourself, delete the package from package\.json\./)
  })

  it('finds the server under any name and with a version after the package name', () => {
    write(app, MCP_FILE, JSON.stringify({ mcpServers: { browser: { command: 'npx', args: ['@playwright/mcp@latest'] }, direct: { command: RETIRED_PACKAGE } } }))
    const output = formatReport(install(app, { kitRoot: kit }))
    assert.match(output, /starts @playwright\/mcp as the server "browser", "direct"\./)
    assert.match(output, /What to do: if you do not use it yourself, delete the server from \.cursor\/mcp\.json\./)
  })

  it('has no note for a new app, or for a server that is only named playwright', () => {
    assert.deepEqual(install(app, { kitRoot: kit, dryRun: true }).notes, [])
    write(app, MCP_FILE, JSON.stringify({ mcpServers: { playwright: { command: 'my-own-server', args: ['@playwright/mcp-like'] } } }))
    const report = install(app, { kitRoot: kit })
    assert.deepEqual(report.notes, [])
    assert.doesNotMatch(formatReport(report), /^NOTE: /m)
  })

  it('reads a file it cannot merge without failing', () => {
    write(app, MCP_FILE, '{ nope')
    makeApp(withPackage())
    const report = install(app, { kitRoot: kit })
    assert.deepEqual(noteIds(report), ['playwright-mcp'])
    assert.deepEqual(warningIds(report), ['mcp'])
    const lines = formatReport(report).split('\n')
    assert.ok(lines.findIndex((line) => line.startsWith('NOTE: ')) < lines.findIndex((line) => line.startsWith('WARNING: ')), 'the warning comes last')
  })

  it('has no note when the kit itself still uses the package', () => {
    write(app, MCP_FILE, JSON.stringify({ mcpServers: { playwright: OLD_PLAYWRIGHT_SERVER } }))
    makeApp(withPackage())

    // As a dev dependency in the README list.
    write(kit, 'package.json', JSON.stringify({ ...KIT_PACKAGE, devDependencies: { ...KIT_PACKAGE.devDependencies, [RETIRED_PACKAGE]: '^0.0.83' } }))
    write(kit, 'README.md', readme('.cursor/  .cursorignore  test/  AGENTS.md', `vitest\njsdom\n${RETIRED_PACKAGE}`))
    assert.deepEqual(install(app, { kitRoot: kit, dryRun: true }).notes, [])

    // As a server in its .cursor/mcp.json.
    makeKit()
    write(kit, MCP_FILE, JSON.stringify({ mcpServers: { playwright: OLD_PLAYWRIGHT_SERVER } }))
    assert.deepEqual(install(app, { kitRoot: kit, dryRun: true }).notes, [])
  })
})

describe('install: an app with its own runner config', () => {
  beforeEach(() => {
    makeKit({ copyList: WITH_CONFIGS })
  })

  it('has no warning on a clean install', () => {
    const report = install(app, { kitRoot: kit })
    assert.deepEqual(skippedFiles(report), [])
    assert.deepEqual(report.warnings, [])
    assert.doesNotMatch(formatReport(report), /WARNING/)
  })

  it('warns that there is no verdict line when the kept config does not load the reporter', () => {
    write(app, 'vitest.config.ts', 'export default {}\n')
    const report = install(app, { kitRoot: kit })
    assert.equal(read(app, 'vitest.config.ts'), 'export default {}\n')
    assert.deepEqual(warningIds(report), ['verdict'])
    const output = formatReport(report)
    assert.match(output, /^WARNING: Vitest runs print no QA-VERDICT line\.$/m)
    assert.match(output, /vitest\.config\.ts was skipped, and yours does not load \.cursor\/qa\/vitest-verdict\.mjs/)
    assert.match(output, /stop with BLOCKED/)
    assert.match(output, /What to do: /)
    assert.doesNotMatch(output, /playwright\.config\.ts was skipped/)
  })

  it('names both runners when both configs are kept', () => {
    write(app, 'vitest.config.ts', 'export default {}\n')
    write(app, 'playwright.config.ts', 'export default {}\n')
    const output = formatReport(install(app, { kitRoot: kit }))
    assert.match(output, /^WARNING: Vitest and Playwright runs print no QA-VERDICT line\.$/m)
    assert.match(output, /playwright\.config\.ts was skipped, and yours does not load \.cursor\/qa\/playwright-verdict\.mjs/)
  })

  it('does not warn when the kept config loads the reporter', () => {
    write(app, 'playwright.config.ts', "export default { retries: 1, reporter: [['./.cursor/qa/playwright-verdict.mjs']] }\n")
    const report = install(app, { kitRoot: kit })
    assert.deepEqual(skippedFiles(report), ['playwright.config.ts'])
    assert.deepEqual(report.warnings, [])
  })

  it("does not warn when --force takes the kit's config", () => {
    write(app, 'vitest.config.ts', 'export default {}\n')
    assert.deepEqual(install(app, { kitRoot: kit, force: true }).warnings, [])
  })
})

describe('install: the executable bit of the hook', { skip: WINDOWS }, () => {
  const hook = '.cursor/hooks/guard.py'
  const isExecutable = () => (statSync(join(app, hook)).mode & 0o111) !== 0

  it('sets the bit again when the bytes are the same and the bit is missing', () => {
    install(app, { kitRoot: kit })
    chmodSync(join(app, hook), 0o644)
    const report = install(app, { kitRoot: kit })
    assert.ok(isExecutable())
    assert.equal(entryFor(report, hook).action, 'chmod')
    const output = formatReport(report)
    assert.match(output, /fixed {9}\.cursor\/hooks\/guard\.py \(the content is the same, the executable bit was missing\)/)
    assert.match(output, /, 1 fixed, /)
    assert.equal(entryFor(install(app, { kitRoot: kit }), hook).action, 'same')
  })

  it('leaves the bit alone on a dry run and says what it would do', () => {
    install(app, { kitRoot: kit })
    chmodSync(join(app, hook), 0o644)
    const report = install(app, { kitRoot: kit, dryRun: true })
    assert.ok(!isExecutable())
    assert.match(formatReport(report), /would fix {5}\.cursor\/hooks\/guard\.py/)
  })

  it('makes the hook executable when --force replaces a copy with other content', () => {
    write(app, hook, '# an old hook\n', 0o644)
    install(app, { kitRoot: kit, force: true })
    assert.equal(read(app, hook), '#!/usr/bin/env python3\n')
    assert.ok(isExecutable())
  })

  it('leaves a copy with other content alone without --force', () => {
    write(app, hook, '# an old hook\n', 0o644)
    const report = install(app, { kitRoot: kit })
    assert.ok(!isExecutable())
    assert.equal(entryFor(report, hook).action, 'skip')
  })

  it('does not change the mode of a file the kit does not ship as executable', () => {
    install(app, { kitRoot: kit })
    chmodSync(join(app, 'AGENTS.md'), 0o600)
    const report = install(app, { kitRoot: kit })
    assert.equal(entryFor(report, 'AGENTS.md').action, 'same')
    assert.equal(statSync(join(app, 'AGENTS.md')).mode & 0o777, 0o600)
  })
})

describe('install: test/tsconfig.json', () => {
  const ROOT_TSCONFIG = '{ "compilerOptions": { "paths": { "@/*": ["./*"] } }, "exclude": ["node_modules", "test"] }\n'
  const OWN = '{ "extends": "../tsconfig.json" }\n'

  it('adds the file when the app has a tsconfig.json and no test/tsconfig.json, and says so', () => {
    write(app, 'tsconfig.json', ROOT_TSCONFIG)
    const report = install(app, { kitRoot: kit })
    assert.equal(read(app, TEST_TSCONFIG), TEST_TSCONFIG_TEXT)
    assert.equal(read(app, 'tsconfig.json'), ROOT_TSCONFIG)
    assert.deepEqual(report.testTsconfig, { file: TEST_TSCONFIG, action: 'add' })
    const output = formatReport(report)
    assert.match(output, /^test\/tsconfig\.json\n {2}added {9}test\/tsconfig\.json$/m)
    assert.match(output, /import alias such as @\/lib\/db resolves in a test file/)
  })

  it('does not add it to an app without a tsconfig.json, and says so', () => {
    const report = install(app, { kitRoot: kit })
    assert.ok(!existsSync(join(app, TEST_TSCONFIG)))
    assert.equal(report.testTsconfig.action, 'none')
    assert.match(formatReport(report), /^test\/tsconfig\.json\n {2}not added: your app has no tsconfig\.json to extend$/m)
  })

  it("keeps the app's own test/tsconfig.json, with and without --force", () => {
    write(app, 'tsconfig.json', ROOT_TSCONFIG)
    write(app, TEST_TSCONFIG, OWN)
    for (const force of [false, true]) {
      const report = install(app, { kitRoot: kit, force })
      assert.equal(read(app, TEST_TSCONFIG), OWN, `force: ${force}`)
      assert.equal(report.testTsconfig.action, 'keep')
      assert.match(formatReport(report), /kept {10}test\/tsconfig\.json \(your app has its own\)/)
      assert.doesNotMatch(formatReport(report), /\d+ skipped\./)
    }
  })

  it('reports the file as the same on a second run', () => {
    write(app, 'tsconfig.json', ROOT_TSCONFIG)
    install(app, { kitRoot: kit })
    const report = install(app, { kitRoot: kit })
    assert.equal(report.testTsconfig.action, 'same')
    assert.match(formatReport(report), /^test\/tsconfig\.json\n {2}already the same$/m)
  })

  it('writes nothing on a dry run and says what it would add', () => {
    write(app, 'tsconfig.json', ROOT_TSCONFIG)
    const report = install(app, { kitRoot: kit, dryRun: true })
    assert.ok(!existsSync(join(app, TEST_TSCONFIG)))
    assert.match(formatReport(report), /would add {5}test\/tsconfig\.json/)
  })

  it('does not write it through a link', { skip: WINDOWS }, () => {
    write(app, 'tsconfig.json', ROOT_TSCONFIG)
    rmSync(join(app, 'test'), { recursive: true })
    mkdirSync(join(folder, 'outside-test'))
    symlinkSync('../outside-test', join(app, 'test'))
    const report = install(app, { kitRoot: kit, force: true })
    assert.deepEqual(readdirSync(join(folder, 'outside-test')), [])
    assert.equal(report.testTsconfig.action, 'skip')
    assert.equal(report.testTsconfig.reason, 'link')
    assert.match(formatReport(report), /skipped {7}test\/tsconfig\.json \(test in your app is a symbolic link\)/)
  })

  it('does not write it when a file named test is in the way', () => {
    write(app, 'tsconfig.json', ROOT_TSCONFIG)
    rmSync(join(app, 'test'), { recursive: true })
    write(app, 'test', 'a file named test\n')
    const report = install(app, { kitRoot: kit })
    assert.equal(read(app, 'test'), 'a file named test\n')
    assert.equal(report.testTsconfig.action, 'skip')
    assert.equal(report.testTsconfig.reason, 'blocked')
  })

  it("extends the app's tsconfig.json and includes every .ts file under test/", () => {
    const withoutComments = TEST_TSCONFIG_TEXT.split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')
    assert.deepEqual(JSON.parse(withoutComments), { extends: '../tsconfig.json', include: ['**/*.ts'], exclude: [] })
  })
})

describe('install: what one run changes', () => {
  it('writes nothing outside the app folder', () => {
    write(app, 'tsconfig.json', '{}\n')
    write(app, HOOKS_FILE, '{"version":1,"hooks":{}}')
    const kitBefore = snapshot(kit)
    install(app, { kitRoot: kit, force: true })
    assert.deepEqual(snapshot(kit), kitBefore)
    assert.deepEqual(readdirSync(folder).sort(), ['app', 'kit'])
  })
})

describe('this repository', () => {
  it('has a README copy list and dev dependency list that match its files and package.json', () => {
    const lists = readInstallLists(KIT_ROOT)
    assert.ok(lists.copyPaths.includes('.cursor'))
    assert.ok(lists.copyPaths.includes('.cursorignore'))
    assert.ok(Object.keys(lists.devDependencies).includes('vitest'))
    assert.deepEqual(Object.keys(lists.scripts), TEST_SCRIPTS)
  })

  it('has runner configs that load the reporters the installer warns about', () => {
    const lists = readInstallLists(KIT_ROOT)
    for (const { file, reporter } of VERDICT_CONFIGS) {
      assert.ok(lists.copyPaths.includes(file), `${file} is in the copy list`)
      assert.ok(readFileSync(join(KIT_ROOT, file), 'utf8').includes(reporter), `${file} loads ${reporter}`)
      assert.ok(existsSync(join(KIT_ROOT, reporter)), `${reporter} exists`)
    }
  })

  it('has a hooks file and an MCP file that the installer can merge into an app that has its own', () => {
    write(app, HOOKS_FILE, '{"version":1,"hooks":{"afterFileEdit":[{"command":"./format.sh"}]}}')
    write(app, MCP_FILE, '{"mcpServers":{"github":{"command":"npx"}}}')
    const report = install(app, { dryRun: true })
    assert.equal(entryFor(report, HOOKS_FILE).action, 'merge')
    assert.match(entryFor(report, HOOKS_FILE).note, /preToolUse, beforeShellExecution, beforeMCPExecution/)
    assert.equal(entryFor(report, MCP_FILE).action, 'merge')
    assert.match(entryFor(report, MCP_FILE).note, /^added the server maestro\. Your own entries are kept$/)
    assert.deepEqual(report.warnings, [])
    assert.deepEqual(report.notes, [])
  })

  it('opens the browser with playwright-cli and ships no Playwright MCP server', () => {
    const lists = readInstallLists(KIT_ROOT)
    assert.ok(Object.hasOwn(lists.devDependencies, '@playwright/cli'), 'the README lists @playwright/cli as a dev dependency')
    assert.ok(!Object.hasOwn(lists.devDependencies, RETIRED_PACKAGE), `the README does not list ${RETIRED_PACKAGE}`)
    const kitPackage = readJsonFile(KIT_ROOT, 'package.json')
    assert.ok(!Object.hasOwn(kitPackage.devDependencies, RETIRED_PACKAGE), `package.json does not list ${RETIRED_PACKAGE}`)
    const servers = readJsonFile(KIT_ROOT, MCP_FILE).mcpServers
    assert.deepEqual(Object.keys(servers), ['maestro'], 'the maestro server is the only one')
    assert.ok(!JSON.stringify(servers).includes(RETIRED_PACKAGE), `no server starts ${RETIRED_PACKAGE}`)
    assert.ok(existsSync(join(KIT_ROOT, '.cursor', 'skills', 'playwright-cli', 'SKILL.md')), 'the vendored playwright-cli skill is in the copy list through .cursor/')
  })

  it('tells an app that installed an earlier version what is left of the Playwright MCP server', () => {
    write(app, MCP_FILE, JSON.stringify({ mcpServers: { playwright: OLD_PLAYWRIGHT_SERVER, maestro: { command: 'maestro', args: ['mcp', '--no-viewer'] } } }))
    write(app, 'package.json', JSON.stringify({ name: 'app', devDependencies: { [RETIRED_PACKAGE]: '^0.0.83' } }))
    const report = install(app, { dryRun: true })
    assert.deepEqual(report.notes.map((note) => note.id), ['playwright-mcp'])
    assert.match(formatReport(report), /^NOTE: the kit no longer uses the Playwright MCP server, and your app still has it\.$/m)
  })

  it("has an example app whose test/tsconfig.json is the file the installer writes", () => {
    assert.equal(readFileSync(join(KIT_ROOT, 'examples', 'next-app', TEST_TSCONFIG), 'utf8'), TEST_TSCONFIG_TEXT)
  })

  it('has no test/tsconfig.json in its own test/ folder, because the copy list would install it into every app', () => {
    assert.ok(!existsSync(join(KIT_ROOT, TEST_TSCONFIG)))
  })

  it('prints its warnings and exits with 0 when it is run as a command', () => {
    write(app, HOOKS_FILE, '{ nope')
    write(app, 'vitest.config.ts', 'export default {}\n')
    const script = fileURLToPath(new URL('./install-into.mjs', import.meta.url))
    const result = spawnSync(process.execPath, [script, app, '--dry-run'], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /^WARNING: the hook is not registered, so nothing is guarded\.$/m)
    assert.match(result.stdout, /Cursor does not start \.cursor\/hooks\/guard-test-writes\.py/)
    assert.match(result.stdout, /^WARNING: Vitest runs print no QA-VERDICT line\.$/m)
    assert.equal(read(app, HOOKS_FILE), '{ nope')
    assert.ok(!existsSync(join(app, 'AGENTS.md')), 'a dry run writes nothing')
  })
})
