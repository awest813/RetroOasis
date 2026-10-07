// Where the room server finds what it serves. In the repository: the built app, EmulatorJS's
// data folder, hosted ROMs and the built link cores. In the portable host (npm run
// oasis:host:pack), RETROOASIS_HOME points at a folder holding app/, data/, roms/ and link/.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const home = process.env.RETROOASIS_HOME

export const lanPaths = home
  ? { app: path.join(home, 'app'), data: path.join(home, 'data'), roms: path.join(home, 'roms'), link: path.join(home, 'link'), portable: true }
  : { app: path.join(repo, 'retrooasis/dist'), data: path.join(repo, 'data'), roms: path.join(repo, 'roms'), link: path.join(repo, 'retrooasis/.handheld-cache/link'), portable: false }
