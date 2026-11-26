import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  test: {
    include: ["src/**/*.test.ts"],
    // Test the same mammoth build the browser gets (the Node build reads files, not ArrayBuffers).
    alias: { mammoth: "mammoth/mammoth.browser.js" },
  },
});
