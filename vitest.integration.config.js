import { defineConfig } from "vite";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/lib/*.integration.test.js"],
    testTimeout: 30_000,
  },
});
