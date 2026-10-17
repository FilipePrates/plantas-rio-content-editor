import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { inaturalistPlugin } from "./server/inaturalist.mjs";
export default defineConfig({
  plugins: [react(), inaturalistPlugin()],
  server: { host: "127.0.0.1", port: 5174, strictPort: true },
});
