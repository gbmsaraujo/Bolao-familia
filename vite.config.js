import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    exclude: ["**/*.integration.test.js", "node_modules/**"],
  },
});
