import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

import path from "node:path"
import { fileURLToPath } from "node:url"

// recreate __dirname for ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// @ts-expect-error process is a nodejs global (tauri injects this)
const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // Tauri-specific dev configuration
  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    host: host || false,

    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,

    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
})
