import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@ferbli/protocol": path.join(repoRoot, "packages/protocol/src/index.ts"),
      "@ferbli/rules": path.join(repoRoot, "packages/rules/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Use http:// + ws:true so the dev server performs a proper WS upgrade
      // (some setups break when target is ws:// — browser stays on "Connecting…").
      "/ws": {
        target: "http://127.0.0.1:3333",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
