import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Carga las variables del .env correspondiente al modo (development / production)
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],

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
