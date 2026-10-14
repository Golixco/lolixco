import { defineConfig } from "vite";
import { checkAssets } from "./scripts/check-assets.mjs";

export default defineConfig({
  plugins: [
    {
      name: "verify-local-assets",
      buildStart() {
        checkAssets();
      },
    },
  ],
});
