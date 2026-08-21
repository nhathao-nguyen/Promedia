import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
        },
      },
    },
  },
  renderer: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
      },
    },
  },
})
