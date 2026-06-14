import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Bolão da Família · Copa 2026",
        short_name: "Bolão 2026",
        description: "Palpites do Grupo C do Brasil na Copa 2026",
        start_url: "/",
        display: "standalone",
        background_color: "#06140d",
        theme_color: "#06140d",
        lang: "pt-BR",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
    }),
  ],
  test: {
    environment: "node",
    exclude: ["**/*.integration.test.js", "node_modules/**"],
  },
});
