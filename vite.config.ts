import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vite";

/**
 * GitHub project Pages live at `https://<user>.github.io/<repo>/` — set `VITE_BASE_PATH=/<repo>/`
 * in CI (see `.github/workflows/pages.yml`). User/org root site (`*.github.io`) uses `/`.
 */
const base =
  (typeof process.env.VITE_BASE_PATH === "string" && process.env.VITE_BASE_PATH.trim()) || "/";

export default defineConfig({
  base,
  plugins: [basicSsl()],
  server: {
    /** ArcGIS allowed-origins commonly require https:// for local dev. */
    https: {},
    strictPort: true,
  },
  preview: {
    https: {},
    strictPort: true,
  },
  build: {
    chunkSizeWarningLimit: 7800,
    /** Rolldown: avoids cyclic chunks breaking `@arcgis/core` class mixins on prod (vitejs/vite#22307). */
    rolldownOptions: {
      output: {
        strictExecutionOrder: true,
      },
    },
  },
});
