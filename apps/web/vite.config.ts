import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const devPort = Number.parseInt(process.env.VITE_DEV_PORT ?? "5600", 10);
const devHost = process.env.VITE_DEV_HOST ?? "0.0.0.0";

export default defineConfig({
  plugins: [react()],
  server: {
    host: devHost,
    port: Number.isFinite(devPort) ? devPort : 5600,
    strictPort: true,
  },
  preview: {
    host: devHost,
    port: Number.isFinite(devPort) ? devPort : 5600,
    strictPort: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
