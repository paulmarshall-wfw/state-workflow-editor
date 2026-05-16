import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

declare const process: {
  env: Record<string, string | undefined>;
};

const host = process.env.VITE_HOST ?? process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.VITE_PORT ?? process.env.PORT ?? 5174);

export default defineConfig({
  plugins: [react()],
  server: {
    host,
    port,
    strictPort: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
