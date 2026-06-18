import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
    setupFiles: "./src/test/setup.ts",
  },
});
