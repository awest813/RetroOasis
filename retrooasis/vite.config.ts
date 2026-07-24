import { defineConfig, type Plugin } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(rootDir, '..')

/** Serve EmulatorJS data/ and roms/ from the repo root during Vite dev. */
function serveRepoStatic(route: string, absDir: string): Plugin {
  return {
    name: `serve-repo-${route}`,
    configureServer(server) {
      server.middlewares.use(`/${route}`, (req, res, next) => {
        const raw = (req.url ?? '/').split('?')[0]
        const rel = decodeURIComponent(raw === '/' ? '' : raw.replace(/^\//, ''))
        const filePath = path.resolve(absDir, rel)

        if (!filePath.startsWith(absDir)) {
          res.statusCode = 403
          res.end('Forbidden')
          return
        }

        fs.stat(filePath, (err, stat) => {
          if (err || !stat.isFile()) {
            next()
            return
          }

          const ext = path.extname(filePath).toLowerCase()
          const types: Record<string, string> = {
            '.js': 'application/javascript',
            '.mjs': 'application/javascript',
            '.css': 'text/css',
            '.wasm': 'application/wasm',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.zip': 'application/zip',
            '.7z': 'application/x-7z-compressed',
            '.data': 'application/octet-stream',
          }
          res.setHeader('Content-Type', types[ext] ?? 'application/octet-stream')
          fs.createReadStream(filePath).pipe(res)
        })
      })
    },
  }
}

/** Required for SharedArrayBuffer → PPSSPP / DOS / 3DS threaded cores. */
const threadHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  base: './',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    target: 'es2020',
  },
  server: {
    port: 5173,
    headers: threadHeaders,
    fs: {
      allow: [repoRoot],
    },
  },
  preview: {
    headers: threadHeaders,
  },
  plugins: [
    serveRepoStatic('data', path.join(repoRoot, 'data')),
    serveRepoStatic('roms', path.join(repoRoot, 'roms')),
  ],
})
