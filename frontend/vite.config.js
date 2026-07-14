import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Carga las variables del .env correspondiente al modo (development / production)
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      // ── PWA ────────────────────────────────────────────────
      VitePWA({
        registerType: 'autoUpdate',        // actualiza el SW solo al haber nueva versión
        includeAssets: ['apple-touch-icon.png', 'pwa-192.png', 'pwa-512.png', 'logo.png', 'emblem.png'],
        manifest: {
          name: 'JugaHoy – Gestión de Complejos Deportivos',
          short_name: 'JugaHoy',
          description: 'Reservá y gestioná complejos deportivos',
          start_url: '/',
          scope: '/',
          display: 'standalone',           // se comporta como app nativa
          orientation: 'portrait',
          background_color: '#060a12',     // splash screen
          theme_color: '#060a12',          // barra de estado
          lang: 'es',
          icons: [
            { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          navigateFallback: '/index.html',   // routing SPA offline
          // Excluir la API del fallback de navegación (deben ir a la red)
          navigateFallbackDenylist: [/^\/api\//],
          // Handlers de Web Push: se importan dentro del SW generado por Workbox
          importScripts: ['/push-sw.js'],
          runtimeCaching: [
            {
              // Datos de la API: red primero, cache como respaldo offline.
              // Las mutaciones (POST/PUT/DELETE) no se cachean.
              urlPattern: ({ url, request }) =>
                url.pathname.startsWith('/api/') && request.method === 'GET',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 60, maxAgeSeconds: 300 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,                  // SW solo en build (evita ruido en dev)
        },
      }),
    ],

    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },

    // ── Servidor de desarrollo ──────────────────────────────
    server: {
      port: 5173,
      // El proxy redirige /api al backend local solo en dev.
      // En producción no aplica (el build es estático).
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },

    // ── Build de producción ─────────────────────────────────
    build: {
      outDir:    'dist',
      // Source maps solo en staging/preview, no en producción pública
      sourcemap: mode !== 'production',
      // Avisa si algún chunk supera 500 kB
      chunkSizeWarningLimit: 500,
      rollupOptions: {
        output: {
          // Separar vendors para mejorar el caching del navegador
          manualChunks: {
            'vendor-react':  ['react', 'react-dom', 'react-router-dom'],
            'vendor-radix':  [
              '@radix-ui/react-dialog',
              '@radix-ui/react-dropdown-menu',
              '@radix-ui/react-label',
              '@radix-ui/react-select',
              '@radix-ui/react-slot',
              '@radix-ui/react-tabs',
              '@radix-ui/react-toast',
            ],
            'vendor-utils':  ['axios', 'clsx', 'tailwind-merge', 'lucide-react'],
          },
        },
      },
    },

    // Inyectar variables de entorno en el código compilado
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    },
  };
});
