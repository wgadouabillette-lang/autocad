import { defineConfig } from "vite";
import { resolve } from "path";
import { fileURLToPath } from "url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: ".",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(rootDir, "index.html"),
        tarifs: resolve(rootDir, "tarifs.html"),
        careers: resolve(rootDir, "careers.html"),
        ressources: resolve(rootDir, "ressources.html"),
        auth: resolve(rootDir, "auth.html"),
        terms: resolve(rootDir, "terms.html"),
        privacy: resolve(rootDir, "privacy.html"),
        subprocessors: resolve(rootDir, "subprocessors.html"),
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5190,
    strictPort: false,
    proxy: {
      "/app": {
        target: "http://localhost:5173",
        changeOrigin: true,
        ws: true,
      },
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 5190,
  },
});
