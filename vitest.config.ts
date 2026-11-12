import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/rls/**/*.test.ts"],
    coverage: { provider: "v8", include: ["lib/ops/**"] },
  },
});
