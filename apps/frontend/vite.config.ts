import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const allowedHosts = (env.VITE_ALLOWED_HOSTS ?? ".localhost")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  return {
    base: env.VITE_FRONTEND_BASE_URL ?? "/",
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const packageName = id.split("node_modules/").pop()?.split("/")[0];

            if (!packageName) {
              return undefined;
            }

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
        [`${(env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "")}/`]: {
          target: env.VITE_BACKEND_API_URL ?? "http://localhost:3000",
          changeOrigin: true,
          secure: false,
        },
      },
      allowedHosts,
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
  };
});
