import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1100,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'blockly',
              test: /[\\/]node_modules[\\/]blockly[\\/]/,
              priority: 20,
              includeDependenciesRecursively: false,
            },
            {
              name: 'three',
              test: /[\\/]node_modules[\\/]three[\\/]/,
              priority: 20,
              includeDependenciesRecursively: false,
            },
            {
              // Firebase is needed at boot (auth gate) but changes far less
              // often than app code, so a separate chunk stays browser-cached
              // across SunRoot deploys.
              name: 'vendor-firebase',
              test: /[\\/]node_modules[\\/](firebase|@firebase|idb|tslib)[\\/]/,
              priority: 18,
              includeDependenciesRecursively: false,
            },
            {
              name: 'vendor-react',
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 15,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  },
})
