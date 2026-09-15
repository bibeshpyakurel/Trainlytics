import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],

      // Coverage is measured over the pure-logic surface only: plain .ts
      // modules under lib/, features/ and shared/. React components are
      // excluded because nothing here renders them — counting them would
      // report ~13% and make the number meaningless rather than useful.
      include: ["lib/**/*.ts", "features/**/*.ts", "shared/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.d.ts", "**/types.ts"],

      // A ratchet, not an aspiration. These sit just under the real numbers as
      // measured on 2026-09-15 (statements 33.96, branches 69.80, functions
      // 62.18), so the build fails the moment coverage drops. Raise them when
      // coverage rises; never lower them to make a red build green.
      thresholds: {
        statements: 33,
        branches: 68,
        functions: 60,
        lines: 33,
      },
    },
  },
});
