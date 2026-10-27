import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1", // this computer only: the relays below must never be open to the network
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
    proxy: {
      /**
       * Two providers will not talk to a browser, so their requests go through
       * here. Node has no such rule, so the MCP server calls both directly.
       *
       * Cloudflare sends no CORS headers at all — verified 2026-09-02, even an
       * unauthenticated request throws "Failed to fetch" before it leaves the
       * page.
       *
       * NVIDIA answers the preflight 200 but with no Access-Control-Allow-Origin
       * header, which a browser reads as a refusal — verified 4 September 2026.
       * That is what "the NVIDIA account failed to fetch" was: not the key, not
       * the address, and nothing a page can work around.
       *
       * Everything else we talk to (Google, OpenAI, Mistral, OpenRouter,
       * Pollinations) sends the header and is called directly. Checked, not
       * assumed.
       */
      "/cf-api": {
        target: "https://api.cloudflare.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/cf-api/, ""),
      },
      "/nv-api": {
        target: "https://integrate.api.nvidia.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/nv-api/, ""),
      },
    },
  },
});
