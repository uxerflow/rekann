import { defineConfig } from '@playwright/test'
const unitOnly = process.argv.includes('--project=unit')
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  projects: [
    { name: 'unit', testMatch: '**/unit.spec.ts' },
    { name: 'e2e', testIgnore: '**/unit.spec.ts' },
  ],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  webServer: unitOnly
    ? undefined
    : [
        {
          command: 'corepack pnpm mail:dev',
          url: 'http://127.0.0.1:8025',
          reuseExistingServer: true,
        },
        {
          command: 'corepack pnpm dev',
          url: 'http://127.0.0.1:3000/sign-in',
          reuseExistingServer: true,
          timeout: 120_000,
        },
      ],
})
