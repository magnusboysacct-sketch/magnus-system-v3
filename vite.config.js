import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The build's version (Vercel's commit, or "dev" locally) so Magnus HQ can tell which release an error came from.
const appVersion = (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || "dev";

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
  },
});
