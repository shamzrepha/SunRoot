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
