import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // All /api requests → miya server (port 8001)
      "/api": {
        target: "http://localhost:8001",
        changeOrigin: true,
      },
      // VRM models → miya server
      "/models": {
        target: "http://localhost:8001",
        changeOrigin: true,
      },
      // TTS WebSocket (legacy, kept for compatibility)
      "/tts-stream": {
        target: "http://localhost:8001",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
