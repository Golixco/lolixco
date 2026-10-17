import { defineConfig } from "vite";
import { checkAssets } from "./scripts/check-assets.mjs";

export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  plugins: [
    {
      name: "verify-local-assets",
      buildStart() {
        checkAssets();
      },
    },
  ],
});
