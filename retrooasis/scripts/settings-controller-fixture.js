// Owned browser fixture. Simulates controller access without changing app code.
(() => {
  const makePad = (index, mapping = 'standard') => ({connected:true, mapping, index, id:`Simulated ${mapping || 'custom'} controller ${index + 1}`, axes:[0,0,0,0], buttons:Array.from({length:17},()=>({pressed:false,value:0}))})
  let pads = [], blocked = false
  Object.defineProperty(navigator, 'getGamepads', {configurable:true, value:()=>{ if (blocked) throw new DOMException('Fixture permissions block','SecurityError'); return pads }})
  window.addEventListener('DOMContentLoaded', () => {
    const panel = document.createElement('aside')
    panel.setAttribute('aria-label','Simulated controller fixture')
    panel.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:10000;max-width:330px;background:#142433;color:white;padding:8px;border:1px solid #2ee6d6;font:12px system-ui;display:flex;flex-wrap:wrap;gap:6px'
    const add = (label, action) => {
      const button = document.createElement('button'); button.textContent = label; button.type='button'; button.onclick=action; panel.append(button)
    }
    add('Connect standard',()=>{blocked=false;pads=[makePad(0)]})
    add('Connect second',()=>{blocked=false;pads.push(makePad(3))})
    add('Custom layout',()=>{blocked=false;pads=[makePad(0,'')]})
    add('Block access',()=>{blocked=true})
    add('Disconnect all',()=>{blocked=false;pads=[]})
    add('Hold A',()=>{if(pads[0])pads[0].buttons[0].pressed=true})
    add('Hold B',()=>{if(pads[0])pads[0].buttons[1].pressed=true})
    add('Second A',()=>{if(pads[1])pads[1].buttons[0].pressed=true})
    add('Move sticks',()=>{if(pads[0])pads[0].axes=[0.75,-0.5,-0.8,0.6]})
    add('Release all',()=>pads.forEach(pad=>{pad.buttons.forEach(button=>{button.pressed=false;button.value=0});pad.axes=[0,0,0,0]}))
    add('Hide fixture controls',()=>{panel.hidden=true})
    document.body.append(panel)
  })
})()
