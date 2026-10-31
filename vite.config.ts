import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'celmart-offline-shell',
        apply: 'build',
        generateBundle(_options, bundle) {
          const assets = Object.keys(bundle)
            .filter((file) => /\.(js|css|html)$/.test(file))
            .map((file) => `/${file}`)
            .sort();
          const version = createHash('sha256')
            .update(assets.join('\n'))
            .digest('hex')
            .slice(0, 16);
          const source = readFileSync(
            new URL('./public/sw.js', import.meta.url),
            'utf8'
          )
            .replace('__CELMART_BUILD__', version)
            .replace('self.__CELMART_ASSETS__', JSON.stringify(assets));
          this.emitFile({ type: 'asset', fileName: 'sw.js', source });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
