import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// One source of version, at the repository root.
const version = readFileSync(
  fileURLToPath(new URL("../VERSION", import.meta.url)), "utf8").trim()

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://127.0.0.1:8765", changeOrigin: true } },
  },
})
