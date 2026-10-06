import { bindGridFocus, bindRowFocus } from '/focus.js'
import { bindMenuBack, onPadInputChange } from '/gamepad.js'
import { GamepadHandler } from '/emulator-gamepad.js'
const output = document.querySelector('#results')
const lines = []
const assert = (ok, message) => { if (!ok) throw new Error(message); lines.push('PASS ' + message) }
const frames = new Map()
let frameId = 0
window.requestAnimationFrame = cb => { frames.set(++frameId, cb); return frameId }
window.cancelAnimationFrame = id => frames.delete(id)
let pageFocused = true
Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => pageFocused })
const pad = {connected:true, mapping:'standard', index:0, id:'Browser fixture', axes:[0,0], buttons:Array.from({length:17},()=>({pressed:false,value:0}))}
let pads = [null, pad]
Object.defineProperty(navigator, 'getGamepads', {configurable:true, value:()=>pads})
let fixtureTime = 1000
Object.defineProperty(performance, 'now', {configurable:true, value:()=>fixtureTime})
const tick = () => { fixtureTime += 60; const current = [...frames.values()]; frames.clear(); current.forEach(cb=>cb(performance.now())) }
const press = index => { pad.buttons[index].pressed = true; tick(); pad.buttons[index].pressed = false; tick() }
try {
  const left = document.createElement('section')
  const right = document.createElement('section')
  left.innerHTML = '<button>First region</button>'
  right.innerHTML = '<button id="one">One</button><button hidden>Hidden</button><button disabled>Disabled</button><fieldset disabled style="display:inline;border:0;margin:0;padding:0"><button>Disabled by fieldset</button></fieldset><button id="two">Two</button><input aria-label="Search"><button id="last">Last</button>'
  document.body.append(left, right)
  let firstClicks = 0, secondClicks = 0
  let backClicks = 0
  const cleanBack = bindMenuBack(() => backClicks++)
  left.firstChild.onclick = () => firstClicks++
  right.querySelector('#one').onclick = () => secondClicks++
  const cleanLeft = bindGridFocus(left)
  let cleanRight = bindGridFocus(right)
  right.querySelector('#one').focus(); tick(); press(0)
  assert(firstClicks === 0 && secondClicks === 1, 'Only the focused region activates')
  press(15)
  assert(document.activeElement.id === 'two', 'D-pad skips hidden and disabled buttons')
  press(15)
  assert(document.activeElement.tagName === 'INPUT', 'Controller can reach search')
  press(15)
  assert(document.activeElement.id === 'last', 'Controller can leave a text field')
  right.querySelector('#one').focus()
  pad.buttons[0].pressed = true; tick()
  cleanRight(); cleanRight = bindGridFocus(right); tick()
  assert(secondClicks === 2, 'Held confirm does not activate after rebinding')
  pad.buttons[0].pressed = false; tick(); press(0)
  assert(secondClicks === 3, 'Confirm works again after release')
  pad.buttons[1].pressed = true; tick(); tick()
  assert(backClicks === 1, 'Held Back navigates only once')
  pad.buttons[1].pressed = false; tick()
  right.querySelector('#one').blur()
  press(0)
  assert(firstClicks === 0 && secondClicks === 3, 'Unfocused confirm establishes focus without activating')
  right.querySelector('#one').focus()
  pageFocused = false; pad.buttons[0].pressed = true; tick()
  pageFocused = true; tick()
  assert(secondClicks === 3, 'Returning to a tab ignores a button held in the background')
  pad.buttons[0].pressed = false; tick(); press(0)
  assert(secondClicks === 4, 'Controller resumes after returning and releasing buttons')
  const secondPad = { ...pad, index:3, id:'Second fixture', buttons:Array.from({length:17},()=>({pressed:false,value:0})) }
  pads = [pad, secondPad]
  secondPad.buttons[0].pressed = true; tick()
  secondPad.buttons[0].pressed = false; tick()
  secondPad.buttons[0].pressed = true; tick()
  assert(secondClicks === 5, 'A second connected controller can take over menu input after release')
  secondPad.buttons[0].pressed = false; tick()
  let testPad = null
  const stopTest = onPadInputChange(pad => { testPad = pad })
  secondPad.buttons[0].pressed = true; tick()
  secondPad.buttons[1].pressed = true; tick()
  assert(testPad === secondPad && secondClicks === 5 && backClicks === 1, 'Controller tester reads buttons without activating menus or Back')
  stopTest(); tick()
  assert(secondClicks === 5 && backClicks === 1, 'Closing the tester ignores its held buttons')
  secondPad.buttons[0].pressed = false; secondPad.buttons[1].pressed = false; tick()
  secondPad.buttons[0].pressed = true; tick()
  assert(secondClicks === 6, 'Menu controls resume after closing the tester and releasing')
  secondPad.buttons[0].pressed = false; pads = [null, pad]; tick()
  cleanBack(); cleanLeft(); cleanRight(); left.remove(); right.remove()
  assert(frames.size === 0, 'Removing all menu bindings stops controller polling')
  const rows = document.createElement('section')
  rows.innerHTML = '<div data-ro-focus-row><button id="row-start">Start</button></div><div data-ro-focus-row hidden><button>Hidden row</button></div><div data-ro-focus-row><button>Other</button><button id="row-selected" aria-pressed="true">Selected</button></div>'
  document.body.append(rows)
  const cleanRows = bindRowFocus(rows)
  rows.querySelector('#row-start').focus(); tick(); press(13)
  assert(document.activeElement.id === 'row-selected', 'Row navigation skips hidden rows and preserves the selected choice')
  const selected = document.activeElement
  selected.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowUp', ctrlKey:true, bubbles:true}))
  assert(document.activeElement === selected, 'Menu navigation leaves modified keyboard shortcuts alone')
  // Library layout: a wide search box above a two-column grid.
  const library = document.createElement('div')
  library.innerHTML = '<input type="search" id="lib-search" style="display:block;width:300px"><div style="display:grid;grid-template-columns:repeat(3,90px);gap:12px;margin-top:20px"><button id="tile-a">A</button><button id="tile-b">B</button><button id="tile-c">C</button></div>'
  document.body.append(library)
  const cleanLibrary = bindGridFocus(library)
  const search = library.querySelector('#lib-search')
  search.focus()
  const down = new KeyboardEvent('keydown', {key:'ArrowDown', bubbles:true, cancelable:true})
  search.dispatchEvent(down)
  assert(down.defaultPrevented && document.activeElement.id === 'tile-a', 'Down leaves a search field for the first tile beneath it')
  const caret = new KeyboardEvent('keydown', {key:'ArrowLeft', bubbles:true, cancelable:true})
  search.focus(); search.dispatchEvent(caret)
  assert(!caret.defaultPrevented && document.activeElement === search, 'Left/right still move the caret in a search field')
  library.querySelector('#tile-b').focus()
  library.querySelector('#tile-b').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowUp', bubbles:true, cancelable:true}))
  assert(document.activeElement === search, 'Up from any tile under the search box reaches it')
  cleanLibrary(); library.remove()
  const editor = document.createElement('div')
  editor.contentEditable = 'true'; editor.textContent = 'Editable text'
  rows.append(editor); editor.focus()
  const editKey = new KeyboardEvent('keydown', {key:'ArrowUp', bubbles:true, cancelable:true})
  editor.dispatchEvent(editKey)
  assert(!editKey.defaultPrevented && document.activeElement === editor, 'Arrow keys remain available when editing text')
  selected.focus()
  const composingKey = new KeyboardEvent('keydown', {key:'Enter', isComposing:true, bubbles:true, cancelable:true})
  selected.dispatchEvent(composingKey)
  assert(!composingKey.defaultPrevented, 'Text composition does not activate menu shortcuts')
  cleanRows(); rows.remove()
  const handler = Object.create(GamepadHandler.prototype)
  handler.gamepads = []; handler.listeners = {}; handler.buttonLabels = {}
  pads = [pad]; pad.axes = [0, 0]; pad.buttons.forEach(button=>button.pressed=false)
  handler.updateGamepadState()
  const events = []
  handler.on('buttonup', event=>events.push(event))
  handler.on('axischanged', event=>events.push(event))
  pad.buttons[0].pressed = true; pad.axes[0] = 0.8; handler.updateGamepadState()
  pads = []; handler.updateGamepadState()
  assert(events.some(event=>event.type==='buttonup' && event.release) && events.some(event=>event.type==='axischanged' && event.value===0 && event.release), 'Emulator disconnect releases held buttons and axes in a browser')
  output.textContent = lines.join('\n') + '\nAll controller navigation checks passed.'
} catch (error) { output.textContent = lines.join('\n') + '\nFAIL ' + error.stack }
