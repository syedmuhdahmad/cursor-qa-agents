import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: true,
    setupFiles: ['test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          passWithNoTests: true,
          include: ['test/unit/**/*.test.ts'],
          setupFiles: ['test/setup.ts'],
        },
      },
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
