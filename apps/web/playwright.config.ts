import { defineConfig, devices } from '@playwright/test';

const SIM_PORT = 8788;
const WEB_PORT = 4173;
const CI = !!process.env.CI;

// WebGL in headless Chromium needs a software renderer.
const launchOptions = {
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  // Lets you point at a Chromium that is already installed: PW_CHROMIUM_PATH=/path/to/chrome
  ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
};

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions }, grepInvert: /@mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions }, grep: /@mobile/ },
  ],
  webServer: [
    {
      command: `npm run start --workspace @factory-twin/sim-server`,
      cwd: '../..',
      url: `http://localhost:${SIM_PORT}/health`,
      env: { PORT: String(SIM_PORT), SEED: '42' },
      reuseExistingServer: !CI,
    },
    {
      command: `npx vite build && npx vite preview --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { VITE_WS_URL: `ws://localhost:${SIM_PORT}/ws` },
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
});
