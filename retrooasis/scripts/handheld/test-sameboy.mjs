import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import createCore from '../../.handheld-cache/sameboy-link.mjs'
import { cartridge, boot, blockCartridge, transferByte } from './link-fixtures.js'

const core = await createCore({wasmBinary: await fs.readFile(new URL('../../.handheld-cache/sameboy-link.wasm',import.meta.url))})
const load = (slot, bytes, boot) => {
  const romPtr = core._malloc(bytes.length), bootPtr = core._malloc(boot.length)
  try { core.HEAPU8.set(bytes,romPtr); core.HEAPU8.set(boot,bootPtr); assert.equal(core._link_load(slot,romPtr,bytes.length,bootPtr,boot.length),1) }
  finally { core._free(romPtr); core._free(bootPtr) }
}
const backup = slot => {
  const size = core._link_save_size(slot), ptr = core._malloc(size)
  try { assert.equal(core._link_save(slot,ptr,size),0); return core.HEAPU8.slice(ptr,ptr+size) }
  finally { core._free(ptr) }
}
const restore = (slot, bytes) => {
  const ptr = core._malloc(bytes.length)
  try { core.HEAPU8.set(bytes,ptr); assert.equal(core._link_restore(slot,ptr,bytes.length),1) }
  finally { core._free(ptr) }
}
for (const color of [0,1]) {
  assert.equal(core._link_init(color),1)
  assert.equal(core._link_save_size(0),-1,'A console without a loaded cartridge cannot export a save')
  assert.equal(core._link_restore(0,0,0),0)
  assert.equal(core._link_load(0,0,32768,0,256),0,'Null ROM/boot pointers are rejected')
  load(0,cartridge(true,color),boot)
  assert.equal(core._link_step(280896),0,'Both cartridges must be loaded before stepping')
  load(1,cartridge(false,color),boot)
  for (let i=0;i<10;i++) assert(core._link_step(280896)>0)
  assert.equal(core._link_peek(0,0xc000),0x5a,'First console received the second console byte')
  assert.equal(core._link_peek(1,0xc000),0xa5,'Second console received the first console byte')
  assert.equal(core._link_serial_bits(),8,'Eight actual emulated serial clocks occurred')
  assert.equal(core._link_peek(0,0xa000),0x11); assert.equal(core._link_peek(1,0xa000),0x22)
  const saves = [backup(0),backup(1)]
  assert.notDeepEqual(saves[0],saves[1],'Each console exports a separate battery save')
  assert.equal(core._link_restore(0,0,saves[0].length),0,'A running session cannot import a save')
  core._link_init(color); load(0,cartridge(true,color),boot); load(1,cartridge(false,color),boot)
  restore(0,saves[0]); restore(1,saves[1])
  assert.deepEqual(backup(0),saves[0]); assert.deepEqual(backup(1),saves[1])
  const invalid = core._malloc(saves[0].length + 1)
  try {
    core.HEAPU8.fill(0,invalid,invalid+saves[0].length+1)
    for (const size of [0,saves[0].length-1,saves[0].length+1]) {
      assert.equal(core._link_restore(0,invalid,size),0,'Reject incorrectly sized save imports')
      assert.equal(core._link_save(0,invalid,size),-1,'Reject incorrectly sized export buffers')
    }
    assert.equal(core._link_restore(0,0,saves[0].length),0,'Reject null save buffers')
    assert.deepEqual(backup(0),saves[0],'Rejected imports leave the current save intact')
  } finally { core._free(invalid) }
  assert.equal(core._link_step(1000001),0,'Oversized stepping budgets are rejected')
  assert.equal(core._link_peek(2,0xc000),-1,'Invalid console slots are rejected')
  core._link_close()
  core._link_close()
  assert.equal(core._link_step(1),0,'Closed sessions do not run')
  console.log(`PASS ${color?'GBC':'GB'} SameBoy WASM: real bidirectional serial exchange and isolated battery save reloads`)
}

const clockWindows = new Map()
for (const [color,fast] of [[0,false],[1,false],[1,true]]) {
  core._link_init(color)
  for (let slot=0;slot<2;slot++) load(slot,blockCartridge(slot,color,{fast}),boot)
  // Stop in the middle of the very first transfer; a synchronized pause must
  // preserve both clocks and resume the remaining bits exactly once.
  for (let step=0;core._link_serial_bits()===0 && step<10000;step++) core._link_step(16)
  const before = core._link_serial_bits()
  assert(before>0 && before<8,'Pause test starts during a transfer')
  assert.equal(core._link_set_paused(1),1)
  assert.equal(core._link_step(280896),0)
  assert.equal(core._link_serial_bits(),before,'Pausing advances neither console')
  assert.equal(core._link_set_paused(0),1)
  let remainingCycles = 0
  while(core._link_serial_bits()<8 && remainingCycles<100000) remainingCycles += core._link_step(16)
  assert.equal(core._link_serial_bits(),8,'The first byte completes after resume')
  if(color) clockWindows.set(fast,remainingCycles)
  for(let frame=0;frame<80 && (core._link_peek(0,0xc100)!==1 || core._link_peek(1,0xc100)!==1);frame++) core._link_step(280896)
  for(let slot=0;slot<2;slot++) {
    assert.equal(core._link_peek(slot,0xc100),1,'Both consoles complete the block')
    const save = backup(slot)
    for(let index=0;index<64;index++) {
      assert.equal(core._link_peek(slot,0xc000+index),transferByte(1-slot,index),`Console ${slot} receives byte ${index}`)
      assert.equal(save[index],transferByte(1-slot,index),'Received data persists in the correct battery save')
    }
    const pointer=core._malloc(save.length)
    try { core.HEAPU8.set(save,pointer); assert.equal(core._link_restore(slot,pointer,save.length),0,'Save import is refused after stepping even while paused') }
    finally { core._free(pointer) }
  }
  assert.equal(core._link_serial_bits(),512,'Exactly 64 bytes cross the real cable with clock ownership reversed')
  core._link_close()
  console.log(`PASS ${color?'GBC':'GB'} ${fast?'fast':'normal'} serial: 64-byte exchange, master reversal, mid-transfer pause and isolated saves`)
}
assert(clockWindows.get(true)<clockWindows.get(false)/8,'GBC fast-clock transfers run faster than normal-clock transfers')

core._link_init(0)
load(0,cartridge(true,0),boot); load(1,cartridge(false,0),boot)
assert.equal(core._link_set_cable(0),1)
for(let frame=0;frame<10;frame++) core._link_step(280896)
assert.equal(core._link_serial_bits(),0,'Disconnected consoles exchange no bits')
assert.equal(core._link_peek(0,0xc000),255,'An unplugged internal-clock cable reads a pulled-up line')
assert.notEqual(core._link_peek(1,0xff02)&128,0,'The external-clock console waits when unplugged')
core._link_init(0)
assert.equal(core._link_set_cable(0),1); assert.equal(core._link_set_cable(1),1)
load(0,cartridge(true,0),boot); load(1,cartridge(false,0),boot)
for(let frame=0;frame<10;frame++) core._link_step(280896)
assert.equal(core._link_peek(1,0xc000),0xa5,'A newly connected session has no stale cable bits')
assert.equal(core._link_serial_bits(),8)
core._link_close()
console.log('PASS cable disconnect / fresh reconnect and idempotent cleanup')
