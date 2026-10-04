import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { ControllerSelector, ControllerGate, readControllers } from '../public/controller-input.js'
import { gamepadControls, LAN_CAPABILITIES } from '../public/lan-capabilities.js'
const compile = name => ts.transpileModule(fs.readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const controllerUrl = new URL('../public/controller-input.js', import.meta.url).href
const gamepadSource = compile('gamepad').replace("import { setModalityFromPad } from './inputModality';", 'const setModalityFromPad = () => {};').replace("'../../public/controller-input.js'", JSON.stringify(controllerUrl))
const { MenuRepeater, menuDirection, readConnectedPad, connectedPads, describeConnectedPads } = await import('data:text/javascript;base64,' + Buffer.from(gamepadSource).toString('base64'))
let pads = []
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => pads } })
const pad = { connected: true, index: 2, id: 'Fixture controller', mapping: 'standard', axes: [0, 0], buttons: Array.from({length:17}, () => ({pressed:false, value:0})) }
pads = [null, null, pad]
assert.equal(readConnectedPad(), pad)
pads = [{...pad, mapping:''}, null, pad]
assert.equal(readConnectedPad(), pad)
navigator.getGamepads = () => { throw new Error('Blocked') }
assert.deepEqual(connectedPads(), [])
navigator.getGamepads = () => pads
const reader = new MenuRepeater()
pad.buttons[0].pressed = true
assert.equal(reader.read(pad, 0), null, 'Ignore wake-up press')
pad.buttons[0].pressed = false
reader.read(pad, 10)
pad.buttons[0].pressed = true
assert.equal(reader.read(pad, 20), 'confirm')
assert.equal(reader.read(pad, 1000), null, 'Held confirm must not repeat')
reader.reset()
assert.equal(reader.read(pad, 1100), null, 'Held confirm must not cross views')
pad.buttons[0].pressed = false
reader.read(pad, 1200)
pad.axes = [0.2, -0.3]
assert.equal(menuDirection(pad), null, 'Ignore stick drift')
pad.axes = [0.8, 0.7]
assert.equal(reader.read(pad, 1300), 'right')
assert.equal(reader.read(pad, 1400), null)
assert.equal(reader.read(pad, 1660), 'right')
reader.read(null, 1700)
assert.equal(reader.read(pad, 1800), null, 'Reconnect requires release')
pad.buttons[1].pressed = true
pad.buttons[0].pressed = true
assert.equal(menuDirection(pad), 'back', 'Back wins simultaneous press')
reader.reset()
pad.buttons.forEach(b => b.pressed = false); pad.axes = [0, 0]
reader.read(pad, 1900)
pad.buttons[1].pressed = true; pad.buttons[0].pressed = true
assert.equal(reader.read(pad, 2000), 'back')
pad.buttons[1].pressed = false
assert.equal(reader.read(pad, 2100), null, 'Releasing Back must not activate held Confirm')
pad.buttons[0].pressed = false; reader.read(pad, 2200)
pad.buttons[0].pressed = true
assert.equal(reader.read(pad, 2300), 'confirm', 'Actions resume after full release')
pad.buttons[0].pressed = false
reader.read(pad, 2400)
pad.buttons[4].pressed = true
assert.equal(menuDirection(pad), 'pageleft', 'Left shoulder pages')
assert.equal(reader.read(pad, 2500), 'pageleft')
pad.buttons[4].pressed = false
pad.buttons[5].pressed = true
assert.equal(menuDirection(pad), 'pageright', 'Right shoulder pages')
pad.buttons[5].pressed = false
pad.buttons[6].pressed = true
pad.buttons[6].value = 0.8
assert.equal(menuDirection(pad), null, 'Analog L2 must not page menus')
pad.buttons[6].pressed = false
pad.buttons[6].value = 0
pad.buttons[7].pressed = true
pad.buttons[7].value = 0.8
assert.equal(menuDirection(pad), null, 'Analog R2 must not page menus')
pad.buttons[7].pressed = false
pad.buttons[7].value = 0
const other = { connected: true, index: 4, id: 'Second controller', mapping: 'standard', axes: [0, 0], buttons: Array.from({length:17}, () => ({pressed:false, value:0})) }
pads = [pad, other]
other.buttons[0].pressed = true
reader.read(other, 2600)
assert.equal(readConnectedPad(), other, 'Last active standard pad is preferred')
pad.buttons[0].pressed = true
assert.equal(readConnectedPad(), pad, 'A fresh input on a second connected controller takes over')
assert.equal(readConnectedPad(), pad, 'The other controller holding a button does not steal menus back')
pad.axes = [NaN, Infinity]
pad.buttons.forEach(button => { button.pressed = false; button.value = 0 })
assert.equal(menuDirection(pad), null, 'Invalid axes cannot create phantom navigation')
const selector = new ControllerSelector()
pad.axes = [0, 0]; other.buttons[0].pressed = false
assert.equal(selector.read([pad, other]), pad)
other.buttons[0].pressed = true
assert.equal(selector.read([pad, other]), other)
assert.equal(selector.read([pad]), pad, 'Disconnected selection falls back to a connected controller')
const gate = new ControllerGate()
assert.equal(gate.read(other), null, 'Held wake-up input is ignored')
other.buttons[0].pressed = false; assert.equal(gate.read(other), null)
assert.equal(gate.read(other), other)
other.buttons[0].pressed = true; assert.equal(gate.read(other, false), null)
assert.equal(gate.read(other), null, 'Background-held input requires release')
other.buttons[0].pressed = false; gate.read(other)
assert.equal(gate.read(other), other)
assert.equal(readControllers({}).access, 'unsupported')
assert.equal(readControllers({getGamepads: () => { throw new Error('Denied') }}).access, 'blocked')
globalThis.window = { isSecureContext: true, clearTimeout }
navigator.getGamepads = () => { throw new Error('Blocked') }
assert.equal(describeConnectedPads().state, 'blocked', 'Settings distinguishes blocked access')
navigator.getGamepads = () => pads
for (const core of Object.keys(LAN_CAPABILITIES)) {
  other.buttons.forEach(button => { button.pressed = true; button.value = 1 })
  other.axes = [0.75, -0.6, -0.8, 0.8]
  const input = gamepadControls(other, core)
  assert.ok(input.buttons.every(button => LAN_CAPABILITIES[core].buttons.includes(button)), `${core} does not send unsupported buttons`)
}
other.buttons.forEach(button => { button.pressed = false; button.value = 0 })
other.buttons[6].value = 0.8; other.axes = [0.75, -0.6, -0.8, 0.8]
const n64 = gamepadControls(other, 'n64')
assert.deepEqual(n64.buttons, [12, 21, 22], 'N64 analog trigger maps Z and right stick maps C buttons')
assert.ok(n64.stick[0] > 0 && n64.stick[1] < 0, 'N64 left stick retains analog directions')
other.axes = [NaN, Infinity, NaN, -Infinity]; other.buttons[6].value = 0
assert.deepEqual(gamepadControls(other, 'n64'), {buttons:[], stick:[0,0]}, 'Malformed axes stay neutral')
const { GamepadHandler } = await import('../../data/src/gamepad.js')
globalThis.window = { clearTimeout }
const handler = Object.create(GamepadHandler.prototype)
handler.gamepads = []; handler.listeners = {}; handler.buttonLabels = {}
pad.axes = [0, 0]; pad.buttons.forEach(b => b.pressed = false); pads = [pad]
handler.updateGamepadState()
let downs = 0
handler.on('buttondown', () => downs++)
pad.buttons[0].pressed = true
handler.updateGamepadState()
assert.equal(downs, 1, 'Detect mutation of browser-reused Gamepad object')
const events = []
handler.on('buttonup', event => events.push(event))
handler.on('axischanged', event => events.push(event))
handler.on('disconnected', event => events.push({...event, identity:handler.gamepads.find(pad=>pad.index===event.gamepadIndex)?.id}))
pad.axes[0] = 0.75; handler.updateGamepadState(); events.length = 0
pads = []; handler.updateGamepadState()
assert.equal(events.find(event => event.type === 'axischanged')?.value, 0, 'Disconnect neutralizes held axes')
assert.ok(events.find(event => event.type === 'buttonup')?.release, 'Disconnect releases held buttons')
assert.equal(events.at(-1).identity, pad.id, 'Assignment identity exists until release and disconnect are dispatched')
assert.equal(handler.gamepads.length, 0)
pad.axes = [0, 0]; pad.buttons[0].pressed = false; pads = [pad]
handler.updateGamepadState(); pad.buttons[0].pressed = true; handler.updateGamepadState()
let focused = false
globalThis.document = { hidden: false, hasFocus: () => focused }
handler.updateGamepadState(); const beforeReturn = downs
focused = true; handler.updateGamepadState()
assert.equal(downs, beforeReturn, 'Focus return ignores a background-held button')
pad.buttons[0].pressed = false; handler.updateGamepadState()
pad.buttons[0].pressed = true; handler.updateGamepadState()
assert.equal(downs, beforeReturn + 1, 'Focus return resumes after release')
handler.resetInput(); handler.updateGamepadState()
assert.equal(downs, beforeReturn + 1, 'Pause reset suppresses a held button')
const replacement = {...pad, id:'Replacement controller', buttons:Array.from({length:17},()=>({pressed:false,value:0}))}
pads = [replacement]; handler.updateGamepadState()
assert.equal(handler.gamepads[0].id, replacement.id, 'A reused index does not retain the old identity')
delete globalThis.document
navigator.getGamepads = () => { throw new Error('Blocked') }
assert.doesNotThrow(() => handler.updateGamepadState())
// Exercise the actual emulator's event path, including releases during remapping/pause.
const emulatorSource = fs.readFileSync(new URL('../../data/src/emulator.js', import.meta.url), 'utf8')
const method = emulatorSource.slice(emulatorSource.indexOf('    gamepadEvent(e) {'), emulatorSource.indexOf('    setVirtualGamepad() {'))
const eventMethod = new Function(`return class {${method}}`)().prototype.gamepadEvent
const inputs = []
const player = {started:true, paused:true, getGamepadSelectionValue:()=>pad.id, gamepadSelection:[pad.id], controls:[{0:{value2:'BUTTON_1'},16:{value2:'LEFT_STICK_X:+1'},17:{value2:'LEFT_STICK_X:-1'}}], analogAxes:[16,17], settingsMenu:{style:{display:''}}, isPopupOpen:()=>true, isAutofireEnabled:()=>false, controlPopup:{parentElement:{parentElement:{getAttribute:()=>null}}}, gameManager:{simulateInput:(...input)=>inputs.push(input)}}
eventMethod.call(player, {type:'buttonup', gamepadIndex:2, index:0, label:'BUTTON_1', release:true})
eventMethod.call(player, {type:'axischanged', gamepadIndex:2, axis:'LEFT_STICK_X', value:0, oldValue:0.75, release:true})
assert.ok(inputs.some(input=>input[1]===0 && input[2]===0), 'Forced button release reaches the core while remapping is open')
assert.ok(inputs.some(input=>input[1]===16 && input[2]===0) && inputs.some(input=>input[1]===17 && input[2]===0), 'Forced axis release neutralizes both analog directions while paused')
navigator.getGamepads = () => [replacement]
const startedHandler = new GamepadHandler()
let startupConnections = 0
startedHandler.on('connected', () => startupConnections++)
await new Promise(resolve => setTimeout(resolve, 15))
startedHandler.terminate()
assert.equal(startupConnections, 1, 'Controllers connected before startup are reported after listener attachment')
console.log('PASS controller takeover, access states, input gating, system mapping, disconnect/focus/pause releases, index replacement, startup and live-object snapshots')
if (process.argv.includes('--browser') || process.argv.includes('--settings')) {
  const focus = compile('focus').replace("from './gamepad'", "from '/gamepad.js'").replace(/import \{ sfxConfirm, sfxMove \} from '.\/sfx';/, 'const sfxConfirm = () => {}; const sfxMove = () => {};')
  const fixture = fs.readFileSync(new URL('./gamepad-browser-tests.js', import.meta.url), 'utf8')
  const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const scripts = {'/gamepad.js': gamepadSource.replace(JSON.stringify(controllerUrl), "'/controller-input.js'"), '/controller-input.js':fs.readFileSync(new URL('../public/controller-input.js', import.meta.url),'utf8'), '/lan-capabilities.js':fs.readFileSync(new URL('../public/lan-capabilities.js', import.meta.url),'utf8'), '/emulator-gamepad.js':fs.readFileSync(new URL('../../data/src/gamepad.js', import.meta.url),'utf8'), '/settings-controller-fixture.js':fs.readFileSync(new URL('./settings-controller-fixture.js', import.meta.url),'utf8'), '/focus.js': focus, '/tests.js': fixture}
    if (scripts[req.url]) { res.setHeader('Content-Type', 'text/javascript'); res.end(scripts[req.url]); return }
    if (process.argv.includes('--settings')) {
      const dist = fileURLToPath(new URL('../dist/', import.meta.url))
      const pathname = new URL(req.url,'http://localhost').pathname
      if (pathname === '/settings') {
        res.setHeader('Content-Type','text/html')
        res.end(fs.readFileSync(path.join(dist,'index.html'),'utf8').replace('</body>','<script src="/settings-controller-fixture.js"></script></body>')); return
      }
      const file = path.resolve(dist, '.' + pathname)
      if (file.startsWith(dist) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        const types = {'.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'}
        res.setHeader('Content-Type',types[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res); return
      }
      if (pathname !== '/') { res.writeHead(404); res.end(); return }
    }
    res.setHeader('Content-Type', 'text/html')
    res.end('<!doctype html><title>Controller navigation tests</title><h1>Controller navigation tests</h1><pre id="results">Running…</pre><script type="module" src="/tests.js"></script>')
  })
  server.listen(0, '127.0.0.1', () => {
    console.log(`Controller tests: http://127.0.0.1:${server.address().port}/`)
    if (process.argv.includes('--settings')) console.log(`Controller Settings fixture: http://127.0.0.1:${server.address().port}/settings#/settings`)
  })
}
