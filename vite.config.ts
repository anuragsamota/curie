import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { strictPort: true },
  worker: { format: "es" },
  define: { __APP_VERSION__: JSON.stringify(version) },
  // Unit and component tests; browser tests in tests/e2e run with Playwright.
  test: { exclude: [...configDefaults.exclude, "tests/e2e/**"] },
});
