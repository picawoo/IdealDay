import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), VitePWA({
    filename: 'sw.js',
    strategies: 'generateSW',
    registerType: 'prompt',
    injectRegister: false,
    manifest: {
      id: '/',
      name: 'Идеальный День',
      short_name: 'Идеальный День',
      lang: 'ru',
      start_url: '/dashboard',
      scope: '/',
      display: 'standalone',
      theme_color: '#7054E8',
      background_color: '#F7F6FF',
      icons: [
        { src: 'icons/ideal-day-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icons/ideal-day-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icons/ideal-day-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      cacheId: 'ideal-day',
      globPatterns: ['**/*.{html,js,css,svg,png,ttf,woff,woff2,webmanifest}'],
      navigateFallback: 'index.html',
      navigateFallbackDenylist: [
        /^\/(?:api|assets|icons)(?:\/|\?|$)/,
        /^\/(?:sw\.js|manifest\.webmanifest|workbox-[^/]+\.js)(?:\?|$)/,
      ],
      cleanupOutdatedCaches: true,
      skipWaiting: false,
      clientsClaim: true,
    },
  })],
})
