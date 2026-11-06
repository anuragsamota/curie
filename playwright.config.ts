import { defineConfig, devices } from "@playwright/test";

// Browser tests run against the production build (`pnpm build` first). Set CHROMIUM_PATH to use a
// system Chromium instead of Playwright's own (`pnpm exec playwright install chromium`).
const launchOptions = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:4318", trace: "retain-on-failure" },
  webServer: { command: "pnpm exec vite preview --port 4318 --strictPort", url: "http://localhost:4318", reuseExistingServer: !process.env.CI },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 }, launchOptions } },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions } },
  ],
});
