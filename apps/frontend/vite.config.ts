import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  base: process.env.VITE_API_ENV === "development" ? "/" : "/",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Handle node_modules paths - extract the package name from the import id
          const packageName = id.split("node_modules/").pop()?.split("/")[0];

          if (!packageName) {
            return undefined;
          }

          // Handle scoped packages (e.g., @codemirror/language, @tanstack/react-query)
          if (id.startsWith("@codemirror/")) {
            return "editor-vendor";
          }

          if (packageName === "@tanstack/react-query") {
            return "query-vendor";
          }

          if (
            packageName === "react" ||
            packageName === "react-dom" ||
            packageName === "react-router-dom"
          ) {
            return "react-vendor";
          }

          // Return undefined to use default chunking for other modules
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      [process.env.VITE_API_ENV === "development"
        ? "/api/api/"
        : "/api/"]: {
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
