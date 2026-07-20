import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createContentSecurityPolicy } from './config/contentSecurityPolicy'

const contentSecurityPolicyPlaceholder = '__OMNIDESIGN_CONTENT_SECURITY_POLICY__'

export default defineConfig(({ command }) => {
  const isDevelopment = command === 'serve'

  return {
    base: './',
    plugins: [
      react(),
      {
        name: 'omnidesign-content-security-policy',
        transformIndexHtml(html) {
          return html.replace(
            contentSecurityPolicyPlaceholder,
            createContentSecurityPolicy(isDevelopment),
          )
        },
      },
    ],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
    },
    build: {
      outDir: 'dist-renderer',
      emptyOutDir: true,
    },
  }
})
