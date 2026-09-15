// Browser integration fixtures: npm run test:saves, then open the printed URL.
// Uses a fresh loopback port and refuses to run if save data already exists.
import http from 'node:http'
import fs from 'node:fs'
import ts from 'typescript'

const source = fs.readFileSync(new URL('../src/lib/saves.ts', import.meta.url), 'utf8')
const module = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const fixture = fs.readFileSync(new URL('./saves-browser-tests.js', import.meta.url), 'utf8')
const viewSource = fs.readFileSync(new URL('../src/views/saves.ts', import.meta.url), 'utf8')
const view = ts.transpileModule(viewSource.replace(/^import .*$/gm, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const viewModule = `import { decodeBackup, deleteSave, encodeBackup, listSaves, MAX_BACKUP_BYTES, restoreBackup } from '/saves.js';
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hrefFor = path => '#' + path;
const formatBytes = n => n + ' bytes';
const suppressPadBackUntilRelease = () => {};
const registerViewCleanup = () => {};
export const navigationRoots = new Set();
const bindRowFocus = root => { navigationRoots.add(root); return () => navigationRoots.delete(root); };
${view}`
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  if (req.url === '/view.js') {
    res.setHeader('Content-Type', 'text/javascript')
    res.end(viewModule)
  } else if (req.url === '/saves.js' || req.url === '/tests.js') {
    res.setHeader('Content-Type', 'text/javascript')
    res.end(req.url === '/saves.js' ? module : fixture)
  } else if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html')
    res.end('<!doctype html><meta charset="utf-8"><title>Local save integration tests</title><h1>Local save integration tests</h1><pre id="results">Running…</pre><script type="module" src="/tests.js"></script>')
  } else { res.statusCode = 404; res.end() }
})
server.listen(0, '127.0.0.1', () => console.log(`Save tests: http://127.0.0.1:${server.address().port}/`))
