import { defineConfig, type Plugin } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(rootDir, '..')

/** Ship the patched player frontend; channels still select cores and support assets. */
function bundledEmulator(): Plugin {
  return {
    ...serveRepoStatic('emulator', path.join(repoRoot, 'data')),
    name: 'bundled-emulator-frontend',
    generateBundle() {
      for (const name of ['loader.js', 'emulator.min.js', 'emulator.min.css']) {
        this.emitFile({ type: 'asset', fileName: `emulator/${name}`, source: fs.readFileSync(path.join(repoRoot, 'data', name)) })
      }
      // The workers that unpack .zip / .7z / .rar games. Fetched from the CDN they would be needed online
      // every time; bundled, a cached core plays zipped games offline too.
      for (const name of ['extractzip.js', 'extract7z.js', 'libunrar.js', 'libunrar.wasm']) {
        this.emitFile({ type: 'asset', fileName: `emulator/compression/${name}`, source: fs.readFileSync(path.join(repoRoot, 'data', 'compression', name)) })
      }
    },
  }
}

/** Serve EmulatorJS data/ and roms/ from the repo root during Vite dev. */
function serveRepoStatic(route: string, absDir: string): Plugin {
  return {
    name: `serve-repo-${route}`,
    configureServer(server) {
      server.middlewares.use(`/${route}`, async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.statusCode = 405
          res.setHeader('Allow', 'GET, HEAD')
          res.end('Method not allowed')
          return
        }
        const raw = (req.url ?? '/').split('?')[0]
        let rel: string
        try {
          rel = decodeURIComponent(raw === '/' ? '' : raw.replace(/^\//, ''))
          if (rel.includes('\0')) throw new Error('Invalid path')
        } catch {
          res.statusCode = 400
          res.end('Invalid path')
          return
        }
        const filePath = path.resolve(absDir, rel)
        const inside = (base: string, target: string) => {
          const relative = path.relative(base, target)
          return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
        }
        if (!inside(absDir, filePath)) {
          res.statusCode = 403
          res.end('Forbidden')
          return
        }

        try {
          const [realRoot, realFile] = await Promise.all([
            fs.promises.realpath(absDir), fs.promises.realpath(filePath),
          ])
          if (!inside(realRoot, realFile)) {
            res.statusCode = 403
            res.end('Forbidden')
            return
          }
          const stat = await fs.promises.stat(realFile)
          // Do not fall through to the SPA — EmulatorJS would download index.html as a "ROM".
          if (!stat.isFile()) throw new Error('Not a file')

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
          res.setHeader('Content-Length', stat.size)
          if (req.method === 'HEAD') { res.end(); return }
          const stream = fs.createReadStream(realFile)
          stream.on('error', () => res.destroy())
          stream.pipe(res)
        } catch {
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end('Not found')
        }
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
    bundledEmulator(),
    serveRepoStatic('data', path.join(repoRoot, 'data')),
    serveRepoStatic('roms', path.join(repoRoot, 'roms')),
  ],
})
