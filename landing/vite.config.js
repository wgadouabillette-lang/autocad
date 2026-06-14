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
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5190,
    strictPort: false,
  },
  preview: {
    host: "127.0.0.1",
    port: 5190,
  },
});
