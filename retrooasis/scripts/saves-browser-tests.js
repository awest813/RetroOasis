import { listSaves, encodeBackup, decodeBackup, restoreBackup, deleteSave } from '/saves.js'

const results = document.querySelector('#results')
const lines = []
function assert(value, message) {
  if (!value) throw new Error(message)
}
async function test(name, work) {
  await work()
  lines.push(`PASS ${name}`)
  results.textContent = lines.join('\n')
}
function rejects(fn) {
  let rejected = false
  try { fn() } catch { rejected = true }
  assert(rejected, 'Malformed backup was accepted')
}
const file = (key, value = 42) => ({ key, bytes: new Uint8Array([0, value, 255]), mode: 0x81a4, modified: '2026-09-14T00:00:00.000Z' })
const folder = key => ({ key, mode: 0x41ed, modified: '2026-09-14T00:00:00.000Z' })
const backup = (kind, entries) => decodeBackup(encodeBackup(kind, entries))
async function runTests() {
try {
  const databases = await indexedDB.databases()
  assert(!databases.some(db => ['/data/saves', 'EmulatorJS-states'].includes(db.name)), 'Use a fresh test origin; existing emulator data found.')
  await test('Reading empty storage creates no databases', async () => {
    assert((await listSaves('game')).length === 0, 'Expected no game saves')
    assert((await listSaves('state')).length === 0, 'Expected no states')
    assert((await indexedDB.databases()).length === 0, 'Read created a database')
  })
  await test('Binary round trip preserves every byte, folder and timestamp', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i)
    const decoded = backup('game', [folder('/data/saves/nested'), { ...file('/data/saves/nested/game.srm'), bytes }])
    assert(decoded.entries[1].bytes.every((b, i) => b === i), 'Byte mismatch')
    assert(decoded.entries[0].mode === 0x41ed, 'Directory mode lost')
    assert(decoded.entries[1].modified === '2026-09-14T00:00:00.000Z', 'Date lost')
  })
  await test('Malformed and hostile backups are rejected before writing', () => {
    let message = ''
    try { decodeBackup('{unfinished') } catch (error) { message = error.message }
    assert(message.includes('Choose a RetroOasis backup'), 'Broken JSON did not provide recovery guidance')
    const raw = JSON.parse(encodeBackup('game', [file('/data/saves/game.srm')]))
    for (const key of ['/other/save', '/data/saves/../save', '/data/saves//save', '/data/saves/a/./save', '/data/saves/a\\b', '?EJS_KEYS!']) {
      rejects(() => decodeBackup(JSON.stringify({ ...raw, entries: [{ ...raw.entries[0], key }] })))
    }
    for (const changes of [{ data: '***' }, { modified: 'bad' }, { mode: 0xa1ff }]) {
      rejects(() => decodeBackup(JSON.stringify({ ...raw, entries: [{ ...raw.entries[0], ...changes }] })))
    }
    rejects(() => decodeBackup(JSON.stringify({ ...raw, entries: [...raw.entries, ...raw.entries] })))
    rejects(() => decodeBackup(JSON.stringify({ ...raw, version: 2 })))
    rejects(() => backup('game', [file('/data/saves/missing/game.srm')]))
    for (const data of ['A===', 'AA=A', 'AAAA=', 'AA?=', '=AAA']) {
      rejects(() => decodeBackup(JSON.stringify({ ...raw, entries: [{ ...raw.entries[0], data }] })))
    }
  })
  await test('Large save states restore without a regexp stack overflow', () => {
    const bytes = new Uint8Array(8 * 1024 * 1024)
    bytes[0] = 7
    bytes[bytes.length - 1] = 255
    const decoded = backup('state', [{ key: 'Large.state', bytes }])
    assert(decoded.entries[0].bytes.length === bytes.length, 'Large state truncated')
    assert(decoded.entries[0].bytes[0] === 7 && decoded.entries[0].bytes.at(-1) === 255, 'Large state corrupted')
  })
  await test('Game backup restores into a fresh IDBFS database', async () => {
    const result = await restoreBackup(backup('game', [folder('/data/saves/nested'), file('/data/saves/nested/game.srm')]), false)
    assert(result.restored === 1, 'Wrong restore count')
    const entries = await listSaves('game')
    assert(entries.length === 2 && entries[1].bytes[1] === 42, 'Restore mismatch')
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('/data/saves', 21)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    assert(db.transaction('FILE_DATA').objectStore('FILE_DATA').indexNames.contains('timestamp'), 'Missing IDBFS index')
    db.close()
  })
  await test('Existing progress stays intact by default; replacement is explicit', async () => {
    const incoming = backup('game', [folder('/data/saves/nested'), file('/data/saves/nested/game.srm', 7)])
    let result = await restoreBackup(incoming, false)
    assert(result.skipped === 1 && (await listSaves('game'))[1].bytes[1] === 42, 'Save overwritten without replacement')
    result = await restoreBackup(incoming, true)
    assert(result.restored === 1 && (await listSaves('game'))[1].bytes[1] === 7, 'Explicit replacement failed')
  })
  await test('File/folder conflict rolls the entire restore back', async () => {
    let rejected = false
    try {
      await restoreBackup(backup('game', [file('/data/saves/new.srm'), file('/data/saves/nested')]), true)
    } catch { rejected = true }
    assert(rejected, 'Expected transaction rejection')
    assert(!(await listSaves('game')).some(e => e.key === '/data/saves/new.srm'), 'Partial restore leaked through')
  })
  await test('Save-state restore and deletion maintain the EmulatorJS key index', async () => {
    await restoreBackup(backup('state', [{ key: 'Fixture.state', bytes: new Uint8Array([1, 2, 3]) }]), false)
    assert((await listSaves('state'))[0].bytes[2] === 3, 'State mismatch')
    await deleteSave('state', 'Fixture.state')
    assert((await listSaves('state')).length === 0, 'Deleted state still listed')
    const db = await new Promise(resolve => {
      const request = indexedDB.open('EmulatorJS-states')
      request.onsuccess = () => resolve(request.result)
    })
    const keys = await new Promise(resolve => {
      const request = db.transaction('states').objectStore('states').get('?EJS_KEYS!')
      request.onsuccess = () => resolve(request.result)
    })
    db.close()
    assert(Array.isArray(keys) && keys.length === 0, 'Stale index after delete')
  })
  await test('Deleting one in-game save preserves folders and other data', async () => {
    await deleteSave('game', '/data/saves/nested/game.srm')
    const entries = await listSaves('game')
    assert(entries.length === 1 && entries[0].key === '/data/saves/nested', 'Delete changed unrelated data')
  })
  await test('Bulk state restores keep a complete index across skipped and new saves', async () => {
    const entries = Array.from({ length: 300 }, (_, i) => ({ key: `Bulk-${i}.state`, bytes: new Uint8Array([i % 256]) }))
    await restoreBackup(backup('state', entries.slice(0, 150)), false)
    const result = await restoreBackup(backup('state', entries), false)
    assert(result.restored === 150 && result.skipped === 150, 'Bulk restore counts mismatch')
    assert((await listSaves('state')).length === 300, 'Bulk files missing')
    const db = await new Promise(resolve => {
      const request = indexedDB.open('EmulatorJS-states')
      request.onsuccess = () => resolve(request.result)
    })
    const keys = await new Promise(resolve => {
      const request = db.transaction('states').objectStore('states').get('?EJS_KEYS!')
      request.onsuccess = () => resolve(request.result)
    })
    db.close()
    assert(keys.length === 300 && entries.every(e => keys.includes(e.key)), 'Bulk index incomplete')
    const kept = await restoreBackup(backup('state', entries), false)
    assert(kept.restored === 0 && kept.skipped === 300, 'All-existing restore changed saves')
  })
  await test('Restore preview counts, paths, replacement toggle and cancel stay consistent', async () => {
    const { renderSaves } = await import('/view.js')
    const root = document.createElement('div')
    document.body.append(root)
    await renderSaves(root)
    const incoming = backup('game', [folder('/data/saves/nested'), file('/data/saves/nested/preview.srm')])
    await restoreBackup(incoming, false)
    const transfer = new DataTransfer()
    transfer.items.add(new File([encodeBackup('game', incoming.entries)], 'preview.json', { type: 'application/json' }))
    const input = root.querySelector('#ro-save-file')
    input.files = transfer.files
    input.dispatchEvent(new Event('change'))
    assert(root.querySelector('#ro-save-query').disabled, 'Search not locked during import')
    for (let i = 0; i < 100 && root.querySelector('#ro-save-query').disabled; i++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(root.querySelector('#ro-save-confirm')?.textContent === 'Keep existing saves', 'Existing saves counted as new')
    assert(root.querySelector('.ro-saves__preview').textContent.includes('nested/preview.srm'), 'Folder omitted from preview')
    root.querySelector('#ro-save-replace').click()
    assert(root.querySelector('#ro-save-confirm').textContent === 'Restore 1 save', 'Replacement count not updated')
    root.querySelector('#ro-save-cancel').click()
    assert(root.querySelector('#ro-save-review').hidden, 'Cancel left preview open')
    assert(document.activeElement === root.querySelector('#ro-save-import'), 'Cancel lost keyboard focus')
    root.remove()
  })
  await test('Zero-byte saves survive backup, restore and deletion', async () => {
    for (const kind of ['game', 'state']) {
      const key = kind === 'game' ? '/data/saves/empty.srm' : 'Empty.state'
      const entry = kind === 'game' ? { ...file(key), bytes: new Uint8Array(0) } : { key, bytes: new Uint8Array(0) }
      const result = await restoreBackup(backup(kind, [entry]), false)
      assert(result.restored === 1, 'Empty file not counted as a save')
      assert((await listSaves(kind)).find(e => e.key === key)?.bytes?.length === 0, 'Empty save was lost')
      await deleteSave(kind, key)
      assert(!(await listSaves(kind)).some(e => e.key === key), 'Empty save deletion failed')
    }
  })
  await test('Deleting a folder is rejected without losing nested progress', async () => {
    const before = encodeBackup('game', await listSaves('game'))
    let rejected = false
    try { await deleteSave('game', '/data/saves/nested') } catch { rejected = true }
    assert(rejected, 'Directory deletion was allowed')
    assert(encodeBackup('game', await listSaves('game')) === before, 'Rejected deletion changed progress')
  })
  await test('Unreadable save storage keeps navigation and Refresh available', async () => {
    const { renderSaves, navigationRoots } = await import('/view.js')
    const root = document.createElement('div')
    document.body.append(root)
    const open = indexedDB.open
    try {
      indexedDB.open = () => { throw new Error('Fixture access denied') }
      await renderSaves(root)
      assert(navigationRoots.has(root), 'Error view lost its navigation binding')
      assert(!root.querySelector('#ro-save-refresh').disabled, 'Refresh unavailable after read failure')
      assert(root.querySelector('#ro-save-backup').disabled, 'Backup enabled after failed read')
      assert(root.querySelector('#ro-save-status').textContent === 'Fixture access denied', 'Read error was not shown')
    } finally { indexedDB.open = open; root.remove() }
  })
  // Only this fixture origin's databases, which were confirmed absent at startup.
  for (const name of ['/data/saves', 'EmulatorJS-states']) {
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name)
      request.onsuccess = resolve
      request.onerror = () => reject(request.error)
    })
  }
  results.textContent = `${lines.join('\n')}\n\nAll ${lines.length} tests passed. Fixture data removed.`
} catch (error) {
  results.textContent = `${lines.join('\n')}\nFAIL ${error.stack ?? error}`
}

}
void runTests()
