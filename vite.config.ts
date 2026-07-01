import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vitest/config";

function apiGuardPlugin(): Plugin {
  return {
    name: "pms-mock-api-guard",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/")) {
          next();
          return;
        }

        res.statusCode = 503;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ message: "pms-mock API routes require the Better Auth server. Start the app with pnpm dev, not vite or pnpm dev:vite." }));
      });
    },
  };
}

export default defineConfig({
  plugins: [apiGuardPlugin(), react()],
  server: {
    port: 3000,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: ["pms-mock.127.0.0.1.sslip.io", "localhost", "127.0.0.1"],
  },
  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
    globals: true,
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
