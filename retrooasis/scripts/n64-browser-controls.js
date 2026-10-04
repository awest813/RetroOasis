// Instrumentation for the explicitly launched, disposable N64 browser fixture.
window.installN64Audit = emu => {
  const panel = document.createElement('aside')
  panel.style.cssText = 'position:fixed;left:12px;top:62px;z-index:100000;background:#071018ee;color:white;padding:12px;width:270px;max-height:80vh;overflow:auto;font:13px system-ui;border:1px solid #2ee6d6'
  panel.innerHTML = '<details open><summary>N64 controller audit</summary><p>Raw core inputs. This panel is only in the test fixture.</p><label>Controller <select id="audit-port"><option value="0">Player 1</option><option value="1">Player 2</option><option value="2">Player 3</option><option value="3">Player 4</option></select></label><div id="audit-buttons"></div><button id="audit-fast">Enable fast-forward</button><pre id="audit-trace" role="status"></pre></details>'
  document.body.append(panel)
  panel.querySelector('#audit-trace').style.cssText='max-height:180px;overflow:auto'
  const raw = emu.gameManager.functions.simulateInput
  const held = new Map(), timers = new Set(), history = []
  emu.gameManager.functions.simulateInput = (port,index,value) => {
    const key = `${port}:${index}`
    if (value) held.set(key,value); else held.delete(key)
    history.push([port,index,value])
    if(history.length>12) history.shift()
    return raw(port,index,value)
  }
  for(const [index,label] of [[3,'Start'],[0,'A'],[1,'B'],[4,'D-pad up'],[5,'D-pad down'],[6,'D-pad left'],[7,'D-pad right'],[16,'Stick right'],[17,'Stick left'],[18,'Stick down'],[19,'Stick up'],[12,'Z'],[23,'C up']]) {
    const button=document.createElement('button'); button.textContent=label; button.style.cssText='margin:3px;padding:6px'
    button.onclick=()=>{
      const port=Number(panel.querySelector('#audit-port').value)
      const key=`${port}:${index}`, existing=held.get(key)
      if(existing) return
      const ctx=emu.gameManager.audioContext || emu.Module?.AL?.currentCtx?.audioCtx
      void ctx?.resume().catch(()=>{})
      emu.gameManager.functions.simulateInput(port,index,index>=16?32767:1)
      const timer=setTimeout(()=>{timers.delete(timer);emu.gameManager.functions.simulateInput(port,index,0)},300)
      timers.add(timer)
    }
    panel.querySelector('#audit-buttons').append(button)
  }
  let fast=false
  panel.querySelector('#audit-fast').onclick=()=>{
    fast=!fast; emu.gameManager.setFastForwardRatio(4); emu.gameManager.toggleFastForward(fast)
    panel.querySelector('#audit-fast').textContent=fast?'Disable fast-forward':'Enable fast-forward'
  }
  const monitor=setInterval(()=>{
    panel.querySelector('#audit-trace').textContent=JSON.stringify({frame:emu.gameManager.getFrameNum(),held:[...held],inputs:history},null,1)
  },500)
  window.addEventListener('pagehide',()=>{
    clearInterval(monitor); timers.forEach(clearTimeout)
    for(const key of held.keys()) { const [port,index]=key.split(':').map(Number); raw(port,index,0) }
    emu.gameManager.functions.simulateInput=raw
  },{once:true})
}
