import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['logo-icon.svg', 'logo-icon.png', 'logo-primary.svg', 'logo-wordmark.svg'],
      manifest: {
        name: 'Tee Trip',
        short_name: 'Tee Trip',
        description: 'Plan the trip. Run the tournament. Live scoring, leaderboards, chat.',
        theme_color: '#1a3a2e',
        background_color: '#faf6ed',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'logo-icon.png', sizes: '512x512', type: 'image/png' },
          { src: 'logo-icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
      },
    }),
  ],
})
