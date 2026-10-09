import { configDefaults, defineConfig } from 'vitest/config'

// Vitest's own reporter: `minimal` when a coding agent runs the tests, `default` otherwise.
const ownReporters = configDefaults.reporters.length > 0 ? configDefaults.reporters : ['default']

// Two Vitest projects so unit and integration tests run separately:
//   npx vitest run test/unit/components/SignIn.test.ts   (the path selects the project)
//   npm run test:unit
//   npm run test:integration
// A run that collects no tests fails. The two npm scripts pass --passWithNoTests,
// so they exit 0 while a folder is still empty.
export default defineConfig({
  // Resolve import aliases such as `@/lib/db` from the `paths` in tsconfig.json.
  // The paths apply only to the files that tsconfig.json includes. When it leaves
  // out `test`, test/tsconfig.json makes them apply to the tests. See the README.
  resolve: { tsconfigPaths: true },
  // Some apps, for example older Next.js apps, set "jsx": "preserve" in tsconfig.json.
  // Vite cannot parse JSX that is left as it is, so compile it here.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    passWithNoTests: false,
    // A stray .only fails the run. Without this, only that test runs and the run still passes.
    allowOnly: false,
    setupFiles: ['test/setup.ts'],
    // Vitest's own output, then one last line that starts with `QA-VERDICT:`.
    // A --reporter flag on the command line replaces both.
    reporters: [...ownReporters, './.cursor/qa/vitest-verdict.mjs'],
    // Coverage is shared by both projects. Enable with --coverage.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
    projects: [
      // Fast, isolated tests of single modules.
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['test/unit/**/*.test.ts'],
          setupFiles: ['test/setup.ts'],
        },
      },
      // Tests that exercise several modules together.
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['test/integration/**/*.test.ts'],
          setupFiles: ['test/setup.ts'],
        },
      },
    ],
  },
})
