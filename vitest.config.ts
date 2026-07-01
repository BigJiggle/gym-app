import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Use the React 17+ automatic JSX runtime so .tsx tests/components don't need
  // an explicit `import React` (matches the app's @vitejs/plugin-react build).
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    globals: true
  }
})
