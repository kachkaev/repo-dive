import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

/**
 * The experimental Effect UI port of the dashboard (`repo-dive --ui effect`).
 * It mirrors ../dashboard/vite.config.ts without React: Effect UI needs no
 * compiler plugin, and its `#dev` import resolves to the production build of
 * the runtime through Vite's own `production` condition.
 *
 * `@effect/ui` and `@effect/ui-kit` are installed from pkg.pr.new snapshots
 * pinned to an Effect-TS/ui commit until they are published to npm, see
 * https://github.com/kachkaev/repo-dive/issues/393.
 */
export default defineConfig({
  root: import.meta.dirname,
  // Relative asset URLs, so a copy of dist/dashboard-effect-ui next to a
  // dashboard.json works from any directory of any static host.
  base: "./",
  plugins: [tailwindcss()],
  build: {
    emptyOutDir: true,
    outDir: path.join(import.meta.dirname, "../dist/dashboard-effect-ui"),
    // dashboard-effect-ui/public only holds local dev data — keep it out of
    // the bundle (`files` in package.json ships dist/ verbatim).
    copyPublicDir: false,
  },
  server: {
    // In dev, dashboard.json is served from dashboard-effect-ui/public — copy
    // one there from the catalog of whichever repo you want to look at. The
    // port is one below the React dashboard's, so both can run side by side.
    port: 5198,
  },
});
