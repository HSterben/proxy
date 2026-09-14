import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { contactApiPlugin } from './vite-contact-api'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const backendEnv = loadEnv(mode, path.resolve(__dirname, '../backend'), '')
  const merged = { ...backendEnv, ...env }

  // Server-side contact form (Vite middleware + Vercel /api)
  process.env.RESEND_API_KEY = merged.RESEND_API_KEY || process.env.RESEND_API_KEY
  process.env.CONTACT_TO_EMAIL = merged.CONTACT_TO_EMAIL || process.env.CONTACT_TO_EMAIL
  process.env.CONTACT_FROM_EMAIL = merged.CONTACT_FROM_EMAIL || process.env.CONTACT_FROM_EMAIL

  return {
    plugins: [react(), tailwindcss(), contactApiPlugin()],
    define: {
      'import.meta.env.VITE_CONVEX_URL': JSON.stringify(
        merged.VITE_CONVEX_URL || 'https://strong-poodle-712.convex.cloud',
      ),
      'import.meta.env.VITE_CONVEX_SITE_URL': JSON.stringify(
        merged.VITE_CONVEX_SITE_URL ||
          (merged.VITE_CONVEX_URL || 'https://strong-poodle-712.convex.cloud').replace(
            '.convex.cloud',
            '.convex.site',
          ),
      ),
    },
    server: {
      proxy: {
        '/user_management': {
          target: 'https://api.workos.com',
          changeOrigin: true,
          secure: true,
        },
      },
    },
  }
})
