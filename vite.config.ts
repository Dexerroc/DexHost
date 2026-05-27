import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  cacheDir: ".vite-cache",
  server: {
    port: 5184,
    host: "127.0.0.1"
  }
});
