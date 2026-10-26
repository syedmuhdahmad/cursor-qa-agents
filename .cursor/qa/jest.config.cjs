// Jest config for the QA kit in a React Native app. The /qa-rn-unit skill runs:
//
//   RTK_DISABLED=1 npx jest --config .cursor/qa/jest.config.cjs --ci test/unit/components/ProfileCard.test.ts
//
// It is the app's own Jest config with five things changed:
//
//   - the tests are the kit's: *.test.ts under test/unit/ and test/integration/
//   - the reporters are Jest's own and .cursor/qa/jest-verdict.mjs, which prints
//     the last line, the one that starts with QA-VERDICT:
//   - a run with no tests fails, and coverage is off
//   - test/jest.setup.ts, when it exists, runs after the app's own setup files
//   - testResultsProcessor is dropped, so the run writes no report file
//
// Everything else comes from the app: the preset (jest-expo or the React Native
// preset), transform, transformIgnorePatterns, moduleNameMapper, setupFiles, and
// the rest. The app's config is read from jest.config.js, .cjs, .mjs, or .json in
// the project root, or from "jest" in package.json. A config in TypeScript is not
// read: Jest needs a loader for it that the kit does not have.
//
// `--ci` is on the command line, not in this file: Jest 30.5 ignores `ci` in a
// config file, and only the flag stops it from writing a new snapshot. The hook
// allows `jest` only with this file as --config and with --ci, and the agent
// cannot edit this file. Node built-ins only.

const { existsSync, readFileSync, writeSync } = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

// The project root: this file lives at <root>/.cursor/qa/.
const ROOT = path.resolve(__dirname, '..', '..')
const REPORTER = path.join(__dirname, 'jest-verdict.mjs')
const SETUP = path.join(ROOT, 'test', 'jest.setup.ts')
// The key jest-verdict.mjs sets on globalThis once it has printed its line.
const MARK = Symbol.for('cursor-qa-agents.jest-verdict.printed')
const NO_TESTS_LINE = 'QA-VERDICT: FAIL (passed 0, failed 0, skipped 0, files 0) reason: no tests ran'
const CONFIG_FILES = ['jest.config.js', 'jest.config.cjs', 'jest.config.mjs', 'jest.config.json']
const TYPESCRIPT_FILES = ['jest.config.ts', 'jest.config.cts', 'jest.config.mts']

function fail(message) {
  throw new Error(`QA kit, .cursor/qa/jest.config.cjs: ${message}`)
}

// Loads a config file the way Jest does for these four kinds, and calls it when it is a function.
async function loadFile(file) {
  if (file.endsWith('.json')) return JSON.parse(readFileSync(file, 'utf8'))
  const loaded = await import(pathToFileURL(file).href)
  const value = loaded && 'default' in loaded ? loaded.default : loaded
  return typeof value === 'function' ? value() : value
}

// The app's own Jest config, or {} when the app has none.
async function appConfig() {
  for (const name of TYPESCRIPT_FILES) {
    if (existsSync(path.join(ROOT, name))) {
      fail(`the app's Jest config is ${name}, which this file cannot read. Move it to jest.config.js.`)
    }
  }
  for (const name of CONFIG_FILES) {
    const file = path.join(ROOT, name)
    if (existsSync(file)) return loadFile(file)
  }
  const packageFile = path.join(ROOT, 'package.json')
  if (!existsSync(packageFile)) return {}
  const jest = JSON.parse(readFileSync(packageFile, 'utf8')).jest
  if (typeof jest === 'string') return loadFile(path.resolve(ROOT, jest))
  return jest && typeof jest === 'object' ? jest : {}
}

// Jest ends without calling any reporter when no test file matches the command.
// This prints the line jest-verdict.mjs would have printed, straight to file
// descriptor 1, because Jest's exit helper has made process.stdout.write drop
// the text by then. Only the main process loads this file: a worker gets the
// config Jest has already read.
if (process.env.JEST_WORKER_ID === undefined) {
  process.once('exit', () => {
    if (globalThis[MARK]) return
    try {
      writeSync(1, `${NO_TESTS_LINE}\n`)
    } catch {
      // Nothing more can be done while the process exits.
    }
  })
}

module.exports = async () => {
  const base = (await appConfig()) ?? {}
  if (typeof base !== 'object' || Array.isArray(base)) fail("the app's Jest config is not an object.")
  if (Array.isArray(base.projects) && base.projects.length > 0) {
    fail("the app's Jest config has `projects`, which this file does not support.")
  }
  const config = { ...base }
  delete config.testRegex
  delete config.testResultsProcessor
  delete config.projects
  const ownSetup = Array.isArray(base.setupFilesAfterEnv) ? base.setupFilesAfterEnv : []
  return {
    ...config,
    // <rootDir> in the app's own options keeps its meaning. The kit's paths are absolute.
    rootDir: base.rootDir ? path.resolve(ROOT, base.rootDir) : ROOT,
    roots: [ROOT],
    testMatch: [`${ROOT}/test/unit/**/*.test.ts`, `${ROOT}/test/integration/**/*.test.ts`],
    testPathIgnorePatterns: ['/node_modules/'],
    reporters: ['default', REPORTER],
    passWithNoTests: false,
    collectCoverage: false,
    setupFilesAfterEnv: existsSync(SETUP) ? [...ownSetup, SETUP] : ownSetup,
  }
}
