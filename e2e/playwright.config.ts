import fs from 'node:fs';
import { defineConfig } from '@playwright/test';

const BROWSER_CANDIDATES = [
  '/usr/lib/chromium/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const CHROMIUM_EXECUTABLE =
  process.env.E2E_CHROMIUM_PATH ||
  BROWSER_CANDIDATES.find((candidate) => fs.existsSync(candidate));

export const SWIFTSHADER_WEBGL_ARGS = [
  '--no-sandbox',
  '--disable-gpu-sandbox',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
];

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    headless: true,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: CHROMIUM_EXECUTABLE,
      args: SWIFTSHADER_WEBGL_ARGS,
    },
  },
  projects: [
    {
      name: 'harness-selftest',
      testMatch: /harness\/.*\.self\.test\.ts/,
    },
    {
      name: 'tier1',
      testMatch: /tests\/tier1\/.*\.spec\.ts/,
    },
    {
      name: 'tier2',
      testMatch: /tests\/tier2\/.*\.spec\.ts/,
    },
    {
      name: 'tier3',
      testMatch: /tests\/tier3\/.*\.spec\.ts/,
    },
    {
      name: 'tier4',
      testMatch: /tests\/tier4\/.*\.spec\.ts/,
    },
  ],
});
