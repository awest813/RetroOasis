#!/usr/bin/env node
/**
 * Copy RetroOasis production build to repo-root dist/ for Cloudflare Pages
 * (and other hosts that expect `npm run build` → ./dist).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'retrooasis', 'dist')
const dest = path.join(root, 'dist')

if (!fs.existsSync(src)) {
  console.error('Missing retrooasis/dist — run the RetroOasis build first.')
  process.exit(1)
}

fs.rmSync(dest, { recursive: true, force: true })
fs.cpSync(src, dest, { recursive: true })
console.log(`Synced ${path.relative(root, src)} → ${path.relative(root, dest)}`)
