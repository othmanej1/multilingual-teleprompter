import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }

export default defineConfig({
  plugins: [react()],
  // base: './' makes all asset paths relative so Electron can load
  // dist/index.html via file:// without path resolution failures.
  base: './',
  define: {
    // Injected at build time so the renderer can show the version without IPC.
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    // Fixed port so electron:dev always knows where to connect.
    port: 5173,
  },
})
