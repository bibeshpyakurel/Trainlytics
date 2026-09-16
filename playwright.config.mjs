import { defineConfig, devices } from "@playwright/test";

const port = process.env.PORT ? Number(process.env.PORT) : 3100;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        // Build and serve the app the way production does, rather than running
        // the dev server. `npm run dev` is webpack with dev-mode rendering,
        // while production is a `next build`; a hydration failure is exactly
        // the kind of fault that appears in one and not the other. DECISIONS.md
        // names this suite as the acceptance gate for the Next upgrade that was
        // reverted for breaking client-side rendering, so a dev server here
        // would let that break straight through the gate meant to catch it.
        //
        // This runs everywhere, not only in CI. A cold build is a few seconds
        // under Turbopack, which is too cheap to justify testing one mode
        // locally and a different one on the way to production.
        command: `npm run build && npm run start -- --port ${port}`,
        url: `${baseURL}/login`,
        // The build has to compile before the server can answer.
        timeout: 180000,
        // Show the build output. Playwright ignores webServer stdout by
        // default, which makes a broken build read only as "Timed out waiting
        // for the web server", and leaves no way to confirm from a passing log
        // that the build ran at all.
        stdout: "pipe",
        reuseExistingServer: !process.env.CI,
      },
});
