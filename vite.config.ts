import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  return {
    root: "src",
    publicDir: resolve(process.cwd(), "public"),
    plugins: [react()],
    build: {
      outDir: resolve(process.cwd(), "dist"),
      emptyOutDir: true,
      sourcemap: false,
      modulePreload: false,
      rollupOptions: {
        input: {
          sidepanel: resolve(process.cwd(), "src/sidepanel/index.html"),
          reader: resolve(process.cwd(), "src/reader/index.html"),
          background: resolve(process.cwd(), "src/background/service-worker.ts"),
          shield: resolve(process.cwd(), "src/content/shield.ts"),
        },
        output: {
          entryFileNames: (entry) =>
            entry.name === "background"
              ? "assets/background.js"
              : entry.name === "shield"
                ? "assets/shield.js"
              : "assets/[name]-[hash].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
  };
});
