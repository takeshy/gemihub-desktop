import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  assetsInclude: ["**/*.json.gz"],
  build: {
    rollupOptions: {
      external: ["/wails/runtime.js"],
    },
  },
  plugins: [react()],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
