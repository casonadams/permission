import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "#src": path.resolve(import.meta.dirname, "extensions/permission"),
      "#test": path.resolve(import.meta.dirname, "extensions/permission/test"),
    },
  },
  test: {
    include: ["extensions/permission/**/*.test.ts"],
  },
});