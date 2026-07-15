import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  assetsInclude: ["**/*.json.gz"],
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
