import { defineConfig } from 'vitest/config'

// Two Vitest projects so unit and integration tests run separately:
//   npx vitest run --project unit
//   npx vitest run --project integration
// Pass --no-passWithNoTests when running a file so a run that collects no tests fails.
export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: true,
    setupFiles: ['test/setup.ts'],
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
          passWithNoTests: true,
          include: ['test/unit/**/*.test.ts'],
          setupFiles: ['test/setup.ts'],
        },
      },
      // Tests that exercise several modules together.
      {
        test: {
          name: 'integration',
          environment: 'node',
          passWithNoTests: true,
          include: ['test/integration/**/*.test.ts'],
          setupFiles: ['test/setup.ts'],
        },
      },
    ],
  },
})
