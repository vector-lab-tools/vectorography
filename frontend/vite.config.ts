import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// One source of version, at the repository root. The image build copies the
// frontend on its own, so the file is looked for in both places it can be and
// the build carries on without it rather than stopping.
function readVersion(): string {
  for (const at of ["../VERSION", "/VERSION"]) {
    try {
      return readFileSync(
        fileURLToPath(new URL(at, import.meta.url)), "utf8").trim()
    } catch { /* try the next */ }
  }
  return process.env.APP_VERSION?.trim() || "0.0"
}

const version = readVersion()

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://127.0.0.1:8765", changeOrigin: true } },
  },
})
