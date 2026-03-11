import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    env: {
      NODE_ENV: "test",
    },
    hookTimeout: 60000, // 60 seconds for beforeAll/afterAll hooks
    fileParallelism: false, // Run test files sequentially to avoid database conflicts
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
});
