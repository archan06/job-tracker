import { config } from "dotenv";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

config({ path: ".env.local", quiet: true });

const testDb = process.env.TEST_DATABASE_URL ?? "";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          // Tests share one database, so files must not run concurrently.
          fileParallelism: false,
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          env: { DATABASE_URL: testDb, DIRECT_URL: testDb },
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
