import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { coreMenuOptions } from '../data/src/coreOptions.js';
import { EJS_GameManager } from '../data/src/GameManager.js';

const modern = (overrides = {}) => ({ options: [{ key: 'quality', desc: 'Graphics quality', info: 'Quality help',
    current: 'fast', default: 'normal', values: [{ value: 'normal', label: 'Normal quality' }, { value: 'fast', label: 'Fast rendering' }], ...overrides }] });
assert.equal(coreMenuOptions(modern(), null)[0].selected, 'fast');
assert.equal(coreMenuOptions(modern({ current: 'removed' }), null)[0].selected, 'normal');
assert.equal(coreMenuOptions(modern({ current: 'removed', default: 'removed' }), null)[0].selected, 'normal');
assert.equal(coreMenuOptions(modern({ visible: false }), null).length, 0);
assert.equal(coreMenuOptions(modern({ values: [{value:'same'}, {value:'same'}] }), null).length, 0);
assert.equal(coreMenuOptions(modern({ current: '', values: [{value:''}, {value:'other'}] }), null)[0].selected, '');
assert.equal(coreMenuOptions(modern({ values: [{value:'__proto__'}, {value:'other'}] }), null)[0].values[0].label, '__proto__');
const legacy = coreMenuOptions(null, '\ninvalid\nquality|fast; normal|fast\r\nmode; (Default) enabled|disabled|\nonly; one\n');
assert.equal(legacy.length, 2);
assert.equal(legacy[0].selected, 'fast');
assert.equal(legacy[1].selected, 'enabled');
assert.deepEqual(legacy[1].values.map(v => v.value), ['enabled', 'disabled']);
assert.deepEqual(coreMenuOptions(null, null), []);
const manager = output => ({ Module: { _get_core_options_json() {} }, functions: { getCoreOptionsJSON: () => output }, EJS: {debug:false} });
for (const output of ['invalid', 'null', '{"options":[null]}', '{"options":[{"key":"a","values":null}]}']) {
    assert.equal(EJS_GameManager.prototype.getCoreOptionsJSON.call(manager(output)), null);
}
assert.equal(EJS_GameManager.prototype.getCoreOptionsJSON.call({Module:{}}), null);
assert.deepEqual(EJS_GameManager.prototype.getCoreOptionsJSON.call(manager(JSON.stringify(modern()))), modern());
console.log('PASS core option normalization, legacy parsing, selection fallback, visibility, labels and older-core compatibility');

// Optional browser fixture runs the real settings-row builder with a stub core.
if (process.argv.includes('--browser')) {
    const source = fs.readFileSync(new URL('../data/src/emulator.js', import.meta.url), 'utf8');
    const start = source.indexOf('        const addToMenu = (title, id, options, defaultOption, parentElement, useParentParent, info)');
    const end = source.indexOf('        const cores = this.getCores();', start);
    assert(start > 0 && end > start);
    const buildRows = source.slice(start, end);
    const script = `
      const home = document.querySelector('#home'), nested = document.querySelector('#nested');
      const menus = [], funcs = [], settings = {}, allOpts = {};
      const ejs = {config:{}, createElement:tag=>document.createElement(tag), addEventListener:(el,event,fn)=>el.addEventListener(event,fn),
        getElementSize:()=>({width:340,height:380}), menuOptionChanged(){}, changeSettingOption:(id,value)=>{settings[id]=value;funcs.forEach(fn=>fn(id));}};
      (function(){${buildRows}
        addToMenu('Graphics quality', 'quality', {'normal':'Normal quality','fast':'Fast rendering'}, 'normal', home, false,
          'Choose how the game is rendered. Normal quality favors detail; Fast rendering can help on slower devices.');
        addToMenu('A longer option name that should remain readable', 'long', {'a':'A longer selected value','b':'Alternative'}, 'a', home);
      }).call(ejs);
      const rows = home.querySelectorAll('button');
      rows[0].click();
      const selected = document.querySelector('.ejs_option_row_selected');
      if(document.activeElement !== selected || selected.getAttribute('aria-pressed') !== 'true') throw Error('Selected option focus/state failed');
      const fast = document.querySelector('[ejs_value="fast"]'); fast.click();
      if(document.activeElement !== rows[0] || fast.getAttribute('aria-pressed') !== 'true' || selected.getAttribute('aria-pressed') !== 'false') throw Error('Selection/focus restoration failed');
      rows[0].click();fast.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      if(document.activeElement !== rows[0]) throw Error('Escape did not restore focus');
      ejs.changeSettingOption('quality', 'normal');
      if(selected.getAttribute('aria-pressed') !== 'true' || fast.getAttribute('aria-pressed') !== 'false' || !rows[0].innerText.includes('Normal quality')) throw Error('External setting update did not synchronize the row');
      document.querySelector('#result').textContent='PASS browser selection, pressed state, focus restoration and Escape';
    `;
    const server = http.createServer((req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); res.end(fs.readFileSync(new URL('../data/emulator.css', import.meta.url))); }
        else if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(script); }
        else { res.setHeader('Content-Type', 'text/html'); res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Core Options preview</title><link rel="stylesheet" href="/style.css"><style>body{margin:24px;background:#101821;color:white;font:14px system-ui;--ejs-primary-color:0,120,140}.fixture{position:relative;width:min(360px,100%);background:#222;border-radius:8px;padding:8px;box-sizing:border-box}.ejs_settings_transition{max-width:100%;height:auto!important}button{font:inherit}.ejs_button_style{color:#ccc;background:transparent;border:0;width:100%;min-height:40px;text-align:left}[hidden]{display:none!important}</style><h1>Core Options</h1><p id="result">Running browser checks…</p><div class="fixture"><div id="nested" class="ejs_settings_transition"><div id="home" class="ejs_setting_menu"></div></div></div><script src="/fixture.js"></script>`); }
    });
    server.listen(0, '127.0.0.1', () => console.log(`Core Options preview: http://127.0.0.1:${server.address().port}/`));
}
