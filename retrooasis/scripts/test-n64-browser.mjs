// An owned, loopback-only player fixture. Never changes the supplied ROM.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLanServer } from './lan-server.mjs'
const here = path.dirname(fileURLToPath(import.meta.url))
const app = path.resolve(here,'..')
const filename = process.argv[2]
if(!filename) throw Error('Supply an N64 ROM path. No cartridge is included.')
const extension = path.extname(filename).toLowerCase()
if(!['.z64','.n64','.v64'].includes(extension)) throw Error('Use an uncompressed N64 cartridge for this fixture.')
const rom=fs.readFileSync(filename)
if(rom.length < 4096 || rom.length > 128*1024*1024 || ![0x80371240,0x37804012,0x40123780].includes(rom.readUInt32BE(0))) throw Error('Invalid N64 cartridge header / size.')
const fixture=fs.mkdtempSync(path.join(here,'.lan-test-cache-'))
const removeFixture=()=>{
  if(!fixture.startsWith(here+path.sep+'.lan-test-cache-')) throw Error('Test cleanup outside workspace')
  fs.rmSync(fixture,{recursive:true,force:true})
}
try {
  fs.cpSync(path.join(app,'public'),fixture,{recursive:true})
  fs.copyFileSync(path.join(here,'n64-browser-controls.js'),path.join(fixture,'n64-browser-controls.js'))
  const frontend = path.join(app, 'dist/emulator')
  if (!fs.existsSync(frontend)) throw new Error('Build RetroOasis first: npm run oasis:build')
  fs.cpSync(frontend, path.join(fixture, 'emulator'), { recursive: true })
  fs.writeFileSync(path.join(fixture,'audit-rom'+extension),rom)
  const player=fs.readFileSync(path.join(fixture,'player.html'),'utf8')
    .replace('</head>','<script src="./n64-browser-controls.js"></script></head>')
    .replace('window.EJS_onGameStart = function () {','window.EJS_onGameStart = function () { window.installN64Audit(window.EJS_emulator);')
  fs.writeFileSync(path.join(fixture,'player.html'),player)
} catch(error) { removeFixture(); throw error }
const lan=createLanServer({port:0,staticRoot:fixture})
lan.server.listen(0,'127.0.0.1',()=>{
  lan.setPort(lan.server.address().port)
  const query=new URLSearchParams({rom:'./audit-rom'+extension,core:'n64',name:'N64 controller audit',channel:'local',lanhost:'1'})
  console.log(`N64 browser fixture: http://127.0.0.1:${lan.server.address().port}/player.html?${query}`)
  console.log('Prepare the local core first. Create a room and join /lan.html#<code> to test real guest inputs. Ctrl+C removes the disposable ROM copy.')
})
const cleanup=()=>{ lan.rooms.close(); lan.io.close(); lan.server.close(); removeFixture() }
process.once('SIGINT',cleanup); process.once('SIGTERM',cleanup)
process.once('exit',removeFixture)
