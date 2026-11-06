import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import formulasApi from "./formulas-api.ts";

export default defineConfig({
  // Where the site is served from. GitHub Pages serves it under /perfume-library/, and the
  // publishing workflow (.github/workflows/pages.yml) sets BASE_PATH to that.
  base: process.env.BASE_PATH || "/",
  plugins: [react(), formulasApi()],
  server: {
    // Saving a formula rewrites these files; that shouldn't reload the page.
    watch: { ignored: ["**/data/formulas*.json*"] },
  },
  // The formulary data (published formulas and what was learned from them) is bundled
  // in, so the app is bigger than Vite's default warning size: about 250 KB gzipped.
  build: { chunkSizeWarningLimit: 2000 },
});
