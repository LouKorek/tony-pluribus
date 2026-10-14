import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // The app shell (pages, scripts, fonts, brand) is stored on the device so Tony Next opens without network.
    VitePWA({
      strategies: 'injectManifest', srcDir: 'src', filename: 'sw.ts', registerType: 'autoUpdate', injectRegister: null, manifest: false,
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff2,webmanifest}'], maximumFileSizeToCacheInBytes: 4 * 1024 * 1024 },
    }),
  ],
})
