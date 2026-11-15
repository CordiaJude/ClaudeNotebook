import { defineConfig } from "@playwright/test";

// One worker: the demo data lives in the server's memory and is shared by every test.
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: process.env.APP_URL ?? "http://localhost:3000",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: "pnpm start",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    env: { INSECURE_COOKIES: "1", DEMO_AI_TOOL_MS: "250", DEMO_AI_WORD_MS: "4" },
  },
});
