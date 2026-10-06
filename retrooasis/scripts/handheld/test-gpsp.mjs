import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import createCore from '../../.handheld-cache/gpsp-link.mjs'
const filename = process.argv[2]
if (!filename) throw new Error('Supply your Advance Wars (USA).gba path; no ROM is included.')
const rom = await fs.readFile(filename)
if (rom.subarray(0xac,0xb0).toString() !== 'AWRE') throw new Error('This prototype tests Advance Wars (USA), game code AWRE only.')
const wasmBinary = await fs.readFile(new URL('../../.handheld-cache/gpsp-link.wasm',import.meta.url))
const peers = [], inbox = [[],[]]
let sent = 0, received = 0
const drain = id => {
  const core = peers[id]
  for (const {bytes,sender} of inbox[id].splice(0)) {
    const ptr = core._malloc(bytes.length)
    try { core.HEAPU8.set(bytes,ptr); core._gba_receive(ptr,bytes.length,sender); received++ }
    finally { core._free(ptr) }
  }
}
try {
  for (let id=0;id<2;id++) {
    const core = await createCore({wasmBinary,onPoll:()=>drain(id),onPacket:(_flags,bytes,target)=>{
      assert(bytes.length<=65536)
      if (target===65535 || target===1-id) { inbox[1-id].push({bytes,sender:id}); sent++ }
    }})
    peers.push(core)
    assert.equal(core._gba_connect(1-id),0,'Unstarted cores cannot register peers')
    assert.equal(core._gba_init(),1,'The netpacket interface is available')
    assert.equal(core._gba_init(),0,'A live core cannot be initialized twice')
    core.FS.writeFile('/WrongGame.gba',new Uint8Array(256))
    assert.equal(core.cwrap('gba_load','number',['string','number'])('/WrongGame.gba',3),0,'A file without a GBA header is rejected')
    core.FS.writeFile('/AdvanceWars.gba',rom)
    assert.equal(core.cwrap('gba_load','number',['string','number'])('/AdvanceWars.gba',3),1)
    assert.equal(core._gba_start(id),1)
    assert.equal(core._gba_start(id),0,'A live cable cannot be started twice')
    assert.equal(core._gba_connect(id),0,'A console cannot connect to itself')
  }
  assert.equal(peers[0]._gba_connect(1),1); assert.equal(peers[1]._gba_connect(0),1)
  for(let cycle=0;cycle<5;cycle++) {
    assert.equal(peers[0]._gba_connect(1),1,'Duplicate membership is idempotent')
    assert.equal(peers[0]._gba_disconnect(1),1)
    assert.equal(peers[0]._gba_disconnect(1),0,'Repeated disconnect cannot underflow the core client count')
    assert.equal(peers[0]._gba_connect(1),1,'A disconnected peer can register again')
  }
  for (let frame=0;frame<180;frame++) for (let id=0;id<2;id++) { drain(id); peers[id]._gba_run() }
  for (const core of peers) {
    assert(core._gba_frames()>=180,'Both consoles produced video')
    assert(core._gba_audio_frames()>0,'Both consoles produced audio')
    const pointer=core._gba_pixels()
    assert(new Set(core.HEAPU16.subarray(pointer/2,pointer/2+240*160)).size>1,'ROM rendered content')
  }
  assert(received>0 && received>=sent-2,'Local packets reach the other core without an accumulating queue')
  peers[0]._gba_key(3,1)
  for (let frame=0;frame<10;frame++) for (let id=0;id<2;id++) { drain(id); peers[id]._gba_run() }
  assert(peers[0]._gba_pressed_polls()>0 && peers[0]._gba_observed_keys()===(1<<3),'The core polls Player 1 Start')
  assert.equal(peers[1]._gba_pressed_polls(),0,'Player 1 input cannot reach the other console')
  peers[0]._gba_key(3,0); peers[0]._gba_run()
  assert.equal(peers[0]._gba_observed_keys(),0,'Released input reaches the core')
  const before = peers.map(core=>core._gba_frames())
  peers.forEach(core=>assert.equal(core._gba_set_paused(1),1))
  for(let frame=0;frame<10;frame++) peers.forEach(core=>core._gba_run())
  assert.deepEqual(peers.map(core=>core._gba_frames()),before,'Synchronized pause stops both consoles')
  peers[0]._gba_key(3,1)
  peers.forEach(core=>core._gba_set_paused(0))
  for(let id=0;id<2;id++) { drain(id); peers[id]._gba_run() }
  assert.equal(peers[0]._gba_observed_keys(),0,'Inputs pressed during pause cannot become stuck after resume')
  console.log(`PASS GBA prototype: two isolated gpSP WASM instances boot Advance Wars, render video/audio and register link membership. Packets sent/received: ${sent}/${received}.`)
  console.log('NOT A LINK GAMEPLAY PASS: enter multiplayer and verify a completed match before exposing GBA hosting.')
} finally { peers.forEach(core=>{ core._gba_close(); core._gba_close(); core._gba_run(); assert.equal(core._gba_start(0),0) }) }
