import { defineConfig, devices } from "@playwright/test";
// @ts-expect-error plain ESM helper without types
import { APP_PORT, MOCK_PORT, testEnv } from "./e2e/test-env.mjs";

// Against the mock Store API by default (instance not provisioned; CLAUDE.md).
// Set E2E_BASE_URL to run against a deployed URL instead (Phase 8).
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: external ?? `http://127.0.0.1:${APP_PORT}`, trace: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Phase 7: the presenter tour must also run on a tablet (iPad-sized viewport, touch; Chromium engine).
    {
      name: "tablet",
      testMatch: /phase7-tour\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 810, height: 1080 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
    },
  ],
  webServer: external
    ? undefined
    : [
        {
          command: "node e2e/mock-store-api.mjs",
          url: `http://127.0.0.1:${MOCK_PORT}/__mock/hits`,
          env: testEnv,
          reuseExistingServer: false,
        },
        {
          command: `npx next start -p ${APP_PORT} -H 127.0.0.1`,
          url: `http://127.0.0.1:${APP_PORT}/gate`,
          env: { ...testEnv, NODE_ENV: "production" },
          reuseExistingServer: false,
          timeout: 120_000,
        },
      ],
});
