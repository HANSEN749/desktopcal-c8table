import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const devPort = Number.parseInt(process.env.VITE_DEV_PORT ?? "5600", 10);

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: Number.isFinite(devPort) ? devPort : 5600,
    strictPort: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
