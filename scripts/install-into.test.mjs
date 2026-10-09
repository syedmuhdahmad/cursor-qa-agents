// Tests for scripts/install-into.mjs. Run them with:
//
//   node --test scripts/install-into.test.mjs
//
// Each test builds a small stand-in kit and a small app in a temporary folder.
// One test at the end reads the real README.md and package.json.

import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  COPY_MARKER,
  DEV_DEPENDENCIES_MARKER,
  InstallError,
  KIT_ROOT,
  TEST_SCRIPTS,
  formatReport,
  install,
  readInstallLists,
  readMarkedBlock,
} from './install-into.mjs'

const FENCE = '```'

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
    assert.equal(report.files.filter((entry) => entry.action === 'add').length, 6)
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
    assert.deepEqual(skipped, ['.cursor/hooks/guard.py', '.cursor/skills/qa-unit/SKILL.md', 'AGENTS.md'])
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

describe('this repository', () => {
  it('has a README copy list and dev dependency list that match its files and package.json', () => {
    const lists = readInstallLists(KIT_ROOT)
    assert.ok(lists.copyPaths.includes('.cursor'))
    assert.ok(lists.copyPaths.includes('.cursorignore'))
    assert.ok(Object.keys(lists.devDependencies).includes('vitest'))
    assert.deepEqual(Object.keys(lists.scripts), TEST_SCRIPTS)
  })
})
