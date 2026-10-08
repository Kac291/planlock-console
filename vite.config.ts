import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL("./web", import.meta.url)),
  plugins: [vue()],
  resolve: { alias: { "@server": fileURLToPath(new URL("./server", import.meta.url)) } },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://127.0.0.1:5174", changeOrigin: false } },
  },
  build: { outDir: fileURLToPath(new URL("./dist", import.meta.url)), emptyOutDir: true },
});
