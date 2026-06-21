import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

declare const process: { env: Record<string, string | undefined> };

const apiProxyTarget = process.env.ART_PIPELINE_API_PROXY ?? "http://127.0.0.1:8000";
const frontendPort = Number(process.env.ART_PIPELINE_FRONTEND_PORT ?? "5176");

export default defineConfig({
  plugins: [react()],
  server: {
    port: frontendPort,
    proxy: {
      "/api": apiProxyTarget,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./tests/setup.ts",
  },
});
