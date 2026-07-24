import {
  applyLocalScan,
  countByPlatform,
  loadCatalog,
  platformAccentVar,
  type Platform,
} from '../lib/catalog'
import { coverMarkup, escapeHtml } from '../lib/dom'
import { bindGridFocus } from '../lib/focus'
import { pickLocalLibrary, supportsDirectoryPicker } from '../lib/localLibrary'
import { hrefFor } from '../lib/router'

export async function renderLibrary(root: HTMLElement): Promise<void> {
  const catalog = await loadCatalog()
  const counts = countByPlatform(catalog)
  const canPick = supportsDirectoryPicker()

  root.innerHTML = `
    <section class="ro-view">
      <div class="ro-section-head">
        <div>
          <p class="ro-kicker">Library</p>
          <h1 class="ro-title">Systems</h1>
          <p class="ro-lede">
            ${
              catalog.local
                ? `Linked folder <strong>${escapeHtml(catalog.local.folderName)}</strong> · ${catalog.local.count} local ROM${catalog.local.count === 1 ? '' : 's'}.`
                : 'Pick a cabinet, or link a local <code>roms/&lt;platform&gt;/</code> folder (Chrome / Edge).'
            }
          </p>
        </div>
        <div class="ro-btn-row">
          ${
            canPick
              ? `<button type="button" class="ro-btn" id="ro-link-folder" data-ro-focusable="true">Link folder</button>`
              : `<span class="ro-muted">Folder link needs Chromium FS Access</span>`
          }
          <a class="ro-btn ro-btn--ghost" href="${hrefFor('/settings')}" data-ro-focusable="true">Settings</a>
        </div>
      </div>
      <p class="ro-muted" id="ro-lib-status" hidden></p>
      <div class="ro-grid ro-grid--platforms" data-ro-grid>
        ${catalog.platforms.map((p) => platformTile(p, counts[p.id] ?? 0)).join('')}
      </div>
    </section>
  `

  const status = root.querySelector<HTMLElement>('#ro-lib-status')
  root.querySelector('#ro-link-folder')?.addEventListener('click', async () => {
    if (status) {
      status.hidden = false
      status.textContent = 'Scanning folder…'
    }
    try {
      const result = await pickLocalLibrary()
      await applyLocalScan(result)
      await renderLibrary(root)
    } catch (err) {
      if (status) {
        status.hidden = false
        status.textContent = err instanceof Error ? err.message : 'Folder link cancelled.'
      }
    }
  })

  const grid = root.querySelector<HTMLElement>('[data-ro-grid]')
  if (grid) bindGridFocus(grid)
}

function platformTile(platform: Platform, count: number): string {
  return `
    <a
      class="ro-tile"
      href="${hrefFor(`/library/${platform.id}`)}"
      data-ro-focusable="true"
    >
      ${coverMarkup(platform.shortName, platformAccentVar(platform.accent), null)}
      <div class="ro-tile__meta">
        <span class="ro-tile__title">${escapeHtml(platform.name)}</span>
        <span class="ro-tile__sub">${count} title${count === 1 ? '' : 's'}</span>
      </div>
    </a>
  `
}
