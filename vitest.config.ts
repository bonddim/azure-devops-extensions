import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*', 'extensions/*'],
    // passWithNoTests: true,
    coverage: {
      reporter: ['text', 'lcov'],
    },
    reporters: [
      'default',
      process.env.GITHUB_ACTIONS ? 'github-actions' : {},
      ['vitest-sonar-reporter', { outputFile: 'sonar-report.xml' }],
    ],
  },
})
