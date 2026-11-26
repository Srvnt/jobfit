import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["eval/**/*.eval.ts"], testTimeout: 600_000, silent: false },
});
