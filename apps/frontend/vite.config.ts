import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  base: process.env.VITE_API_ENV === "development" ? "/" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      [process.env.VITE_API_ENV === "development" ? "/api/" : "/api/"]: {
        target: "https://example.com",
        changeOrigin: true,
        secure: true,
      },
    },
    allowedHosts: [".example.com"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
});

