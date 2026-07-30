import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  reporter: 'list',
  retries: 0,
  timeout: 75_000,
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
})
