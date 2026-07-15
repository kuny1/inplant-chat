import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // root 默认为当前目录（apps/frontend），无需指定
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist",
  },
});
