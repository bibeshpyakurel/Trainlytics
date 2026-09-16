import { defineConfig, devices } from "@playwright/test";

const port = process.env.PORT ? Number(process.env.PORT) : 3100;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const useProductionBuild = Boolean(process.env.CI) || process.env.PLAYWRIGHT_PROD === "1";

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
        // In CI, build and serve the app the way production does. The dev
        // server runs webpack (`next dev --webpack`) with dev-mode rendering,
        // while production is a `next build`; a hydration failure is exactly
        // the kind of fault that appears in one and not the other. DECISIONS.md
        // names this suite as the acceptance gate for the Next upgrade that was
        // reverted for breaking client-side rendering — running it against a
        // dev server would let that same break through.
        //
        // Locally the dev server is kept, because rebuilding on every run makes
        // the suite too slow to reach for. Set PLAYWRIGHT_PROD=1 to reproduce
        // CI exactly.
        command: useProductionBuild
          ? `npm run build && npm run start -- --port ${port}`
          : `npm run dev -- --port ${port}`,
        url: `${baseURL}/login`,
        // A production build has to compile before it can serve, so it needs
        // considerably longer to come up than the dev server does.
        timeout: useProductionBuild ? 300000 : 120000,
        reuseExistingServer: !process.env.CI,
      },
});
