// Exercise the production host with controlled peers, channels and a raw core boundary.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { LAN_CAPABILITIES, LAN_PROTOCOL, inputIndices } from '../public/lan-capabilities.js'
import { inputReceiver, roomSummary } from '../public/lan-shared.js'

class Element {
  constructor() { this.children = []; this.textContent = ''; this.hidden = false; this.disabled = false; this.value = '' }
  setAttribute() {}
  append(child) { this.children.push(child); if (child.value) this.value ||= child.value }
  contains() { return false }
  focus() {}
  querySelector(selector) { return this.nodes?.[selector] }
}
const selectors = ['form', '[data-lan-room]', '[data-lan-address]', '[data-lan-invite]', '[data-lan-lock]', '[data-lan-retry]', '[data-lan-pause]', '[data-lan-end]', '[data-lan-copy]', '[data-lan-qr]', '[data-lan-players]', '[data-lan-capacity]']
const panel = new Element()
panel.nodes = Object.fromEntries(selectors.map(selector => [selector, new Element()]))
panel.nodes.form.nodes = {button:new Element()}
panel.nodes.form.elements = {nickname:new Element()}
const inviteDetails = {open:false}
let inviteFocused = false, inviteSelected = false
panel.nodes['[data-lan-invite]'].closest = () => inviteDetails
panel.nodes['[data-lan-invite]'].focus = () => { inviteFocused = true }
panel.nodes['[data-lan-invite]'].select = () => { inviteSelected = true }
const events = new Map(), timers = new Map(), peers = [], inputs = new Map()
let timerId = 0, rosterStates, lastStatus, stoppedUnusedAudio = 0
const room = {code:'1234567890',core:'n64',maxPlayers:4,locked:false,players:[{slot:0,id:'host',socketId:'host',nickname:'Host',connected:true}]}
const socket = {connected:true,on:(name, handler)=>events.set(name,handler),emit(){},disconnect(){this.connected=false}}
const localInputs = []
const originalInput = (...args) => localInputs.push(args)
const emu = {getCore:()=> 'n64',config:{gameName:'Audit'},canvas:{captureStream:()=>({getVideoTracks:()=>[{}],getAudioTracks:()=>[],getTracks:()=>[{stop(){}}]})},
  gameManager:{simulateInput:originalInput,
    audioContext:{resume:async()=>{},createMediaStreamDestination:()=>({stream:{getTracks:()=>[{stop(){stoppedUnusedAudio++}}]}})},
    functions:{simulateInput(port,index,value){const key=`${port}:${index}`;if(value)inputs.set(key,value);else inputs.delete(key)}}}}
const sandbox = {
  document:{createElement:tag=>tag==='aside'?panel:new Element(),body:new Element(),head:new Element()},
  window:{addEventListener(){}},location:{origin:'http://localhost'},FormData:class {get(key){return key==='maxPlayers'?'4':'Host'}},
  navigator:{clipboard:{writeText:async()=>{throw new Error('Clipboard unavailable')}}},
  LAN_CAPABILITIES,inputIndices,inputReceiver,roomSummary,
  setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id),setInterval:()=>0,clearInterval(){},
  status:message=>lastStatus=message,roster:(list,next,kick,states)=>rosterStates=new Map(states),
  lanInfo:async()=>({addresses:[]}),connectSocket:async()=>socket,request:async(s,event)=> event==='room:create'?{room}: {},
  createPeer:(s,id,onTrack,onState)=>{
    const channel={readyState:'connecting'}
    const peer={pc:{connectionState:'new',addTrack(){},createDataChannel:()=>channel,createOffer:async()=>({}),setLocalDescription:async()=>{},localDescription:{toJSON:()=>({})}},accept(){},close(){peer.pc.connectionState='closed'},
      setState(state){peer.pc.connectionState=state;onState(state)}}
    peers.push(peer);return peer
  },
}
vm.createContext(sandbox)
// Git may check out Windows CRLF even when the committed source uses LF.
const source=fs.readFileSync(new URL('../public/lan-host.js',import.meta.url),'utf8').replace(/^import [^\r\n]*\r?\n/gm,'').replace(/export /g,'')
vm.runInContext(source+'\nglobalThis.mountHost = mountHost;',sandbox)
const {cleanup}=await sandbox.mountHost(emu)
await panel.nodes.form.onsubmit({preventDefault(){}})
await panel.nodes['[data-lan-copy]'].onclick()
assert(inviteDetails.open && inviteFocused && inviteSelected, 'Manual copy reveals and selects the invite when clipboard access fails')
for (let port=0;port<4;port++) emu.gameManager.simulateInput(port,0,1)
assert.deepEqual(localInputs,[[0,0,1]],'Local controllers cannot overwrite guest-owned ports')
room.players.push(...[1,2,3].map(slot=>({slot,id:`p${slot}`,socketId:`s${slot}`,nickname:`Guest ${slot}`,connected:true})))
events.get('room:update')(room)
assert.equal(peers.length,3)
for(const peer of peers){peer.setState('connected');assert(timers.has(peer.deadline),'Media connection alone must not cancel the control-channel deadline')}
assert([...rosterStates.values()].every(state=>state==='Connecting to game…'))
const timedOut=peers[1]
timers.get(timedOut.deadline)()
assert.equal(rosterStates.get('s2'),'Timed out · reconnect')
assert.match(lastStatus,/Player 3/)
for(const peer of peers){peer.channel.readyState='open';peer.channel.onopen();assert(!timers.has(peer.deadline))}
assert([...rosterStates.values()].every(state=>state==='Ready to play'))
const packet=seq=>JSON.stringify({type:'controls',v:LAN_PROTOCOL,seq,buttons:[0,12,21],stick:[.5,-.5]})
peers.forEach(peer=>peer.channel.onmessage({data:packet(0)}))
assert.equal(inputs.size,15)
peers[1].setState('disconnected')
assert.equal(inputs.size,10,'Only the disconnected port releases')
peers[1].channel.onmessage({data:packet(1)})
assert.equal(inputs.size,10,'A late packet during disconnection cannot restore held controls')
peers[1].setState('connected')
peers[1].channel.onmessage({data:packet(1)})
assert.equal(inputs.size,10,'Disconnected packet sequences cannot replay after recovery')
peers[1].channel.onmessage({data:packet(2)})
assert.equal(inputs.size,15,'Fresh input recovers only the assigned port')
emu.paused=true
peers.forEach(peer=>peer.channel.onmessage({data:packet(3)}))
assert.equal(inputs.size,0,'Paused snapshots neutralize every guest')
cleanup()
assert.equal(emu.gameManager.simulateInput,originalInput)
emu.gameManager.simulateInput(3,0,1)
assert.deepEqual(localInputs.at(-1),[3,0,1],'Room cleanup restores local multiplayer input')
assert.equal(timers.size,0,'Room cleanup cancels all peer deadlines')
assert.equal(stoppedUnusedAudio,1,'Cleanup stops an audio destination even when the core has no connectable audio node')
console.log('PASS host four-port isolation, disconnected/paused packet gating, control readiness, timeout recovery and cleanup')
