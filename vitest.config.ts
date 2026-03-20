import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*', 'extensions/*'],
    coverage: {
      reporter: ['text', 'lcov'],
    },
    reporters:
      process.env.GITHUB_ACTIONS === 'true'
        ? ['default', ['github-actions'], ['vitest-sonar-reporter', { outputFile: 'sonar-report.xml' }]]
        : ['default'],
  },
})
