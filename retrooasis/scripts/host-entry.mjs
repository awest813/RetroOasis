// Entry for the portable room host (server/server.mjs in the package): everything it
// serves sits one folder up, in app/, data/, roms/ and link/. lan-server.mjs then starts
// as its CLI.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.RETROOASIS_HOME ??= path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
await import('./lan-server.mjs')
