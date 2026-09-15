import { bindGridFocus, bindRowFocus } from '/focus.js'
import { bindMenuBack } from '/gamepad.js'
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
Object.defineProperty(navigator, 'getGamepads', {configurable:true, value:()=>[null,pad]})
const tick = () => { const current = [...frames.values()]; frames.clear(); current.forEach(cb=>cb(performance.now())) }
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
  output.textContent = lines.join('\n') + '\nAll controller navigation checks passed.'
} catch (error) { output.textContent = lines.join('\n') + '\nFAIL ' + error.stack }
