import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname), "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts") } },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    coverage: { provider: "v8", include: ["lib/doc/**", "lib/ai/**", "lib/data/**"] },
  },
});
