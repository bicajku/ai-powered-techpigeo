import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, PluginOption } from "vite";

import sparkPlugin from "@github/spark/spark-vite-plugin";
import createIconImportProxy from "@github/spark/vitePhosphorIconProxyPlugin";
import { resolve } from 'path'

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname

/**
 * Build-time safeguard: fail the production build if VITE_BACKEND_API_KEY is
 * present in the environment. VITE_* variables are bundled into client assets,
 * so a backend API key would be publicly readable — this is insecure.
 * Use JWT/cookie session auth (BACKEND_REQUIRE_AUTH + Sentinel login) instead.
 */
function rejectClientApiKeyPlugin(): PluginOption {
  return {
    name: 'reject-client-api-key',
    config(_config, env) {
      if (env.command === 'build' && env.mode !== 'development') {
        const key = process.env.VITE_BACKEND_API_KEY
        if (key && key.trim().length > 0) {
          throw new Error(
            '\n[SECURITY BUILD ERROR] VITE_BACKEND_API_KEY is set in your environment.\n' +
            'This variable is bundled into client assets and is publicly readable.\n' +
            'Remove VITE_BACKEND_API_KEY from your production environment and use\n' +
            'JWT/cookie session auth (BACKEND_REQUIRE_AUTH=true + Sentinel login).\n'
          )
        }
      }
    },
  }
}

/**
 * Dev-only plugin: exposes /__github-user endpoint that proxies the
 * Codespace's GITHUB_TOKEN to api.github.com so the browser can
 * authenticate the real GitHub user without exposing the token client-side.
 */
function codespaceGitHubUserPlugin(): PluginOption {
  return {
    name: 'codespace-github-user',
    configureServer(server) {
      server.middlewares.use('/__github-user', async (_req, res) => {
        const token = process.env.GITHUB_TOKEN
        if (!token) {
          res.writeHead(503, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'No GITHUB_TOKEN in environment' }))
          return
        }
        try {
          const resp = await fetch('https://api.github.com/user', {
            headers: { Authorization: `token ${token}`, Accept: 'application/json' },
          })
          if (!resp.ok) {
            res.writeHead(resp.status, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'GitHub API error' }))
            return
          }
          const data = await resp.json() as Record<string, unknown>
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            id: String(data.id),
            login: data.login,
            email: data.email || null,
            avatar_url: data.avatar_url || null,
          }))
        } catch {
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Failed to reach GitHub API' }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    codespaceGitHubUserPlugin(),
    rejectClientApiKeyPlugin(),
    // DO NOT REMOVE
    createIconImportProxy() as PluginOption,
    sparkPlugin() as PluginOption,
  ],
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src')
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor: React core
          'vendor-react': ['react', 'react-dom'],
          // Vendor: animation
          'vendor-motion': ['framer-motion'],
          // Vendor: document processing (used by PlagiarismChecker, NGOModule)
          'vendor-doc-processing': ['pdfjs-dist', 'mammoth'],
          // Vendor: OCR (used by PlagiarismChecker only)
          'vendor-tesseract': ['tesseract.js'],
          // Vendor: PDF export (used on-demand)
          'vendor-pdf-export': ['jspdf'],
          // Vendor: HTML-to-canvas (used on-demand for PDF export)
          'vendor-html2canvas': ['html2canvas'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        secure: false,
      }
    }
  }
});
