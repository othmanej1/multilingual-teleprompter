import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // base: './' makes all asset paths relative so Electron can load
  // dist/index.html via file:// without path resolution failures.
  base: './',
  server: {
    // Fixed port so electron:dev always knows where to connect.
    port: 5173,
  },
})
