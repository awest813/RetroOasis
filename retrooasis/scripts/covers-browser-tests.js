import { coverMarkup, hydrateCovers, refreshCoverArt } from '/dom.js'
import { libretroBoxartUrl } from '/covers.js'

const results = document.querySelector('#results')
const root = document.querySelector('#fixture')
let passed = 0
function check(value, message) {
  if (!value) throw new Error(message)
  passed++
  results.textContent += `\nPASS: ${message}`
}
async function waitFor(predicate) {
  const deadline = performance.now() + 10000
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error('Timed out waiting for image state')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}
function paint(urls) {
  root.innerHTML = coverMarkup('Fixture <title>', 'cyan', urls)
  hydrateCovers(root)
  hydrateCovers(root)
  return root.querySelector('.ro-cover')
}

async function run() {
try {
  results.textContent = 'Running…'
  const before = await fetch('/counts').then(res => res.json())
  check(crossOriginIsolated, 'Thread isolation remains enabled')
  const urls = [`${imageOrigin}/missing.svg`, `${imageOrigin}/art.svg`]
  let cover = paint(urls)
  check(!cover.classList.contains('ro-cover--missing'), 'Keep placeholder during loading')
  await waitFor(() => cover.classList.contains('ro-cover--ready'))
  check(cover.querySelector('img').naturalWidth === 32, 'Cross-origin art loads under require-corp')
  check(!cover.classList.contains('ro-cover--missing'), 'Fallback succeeds without a missing state')
  const counts = await fetch('/counts').then(res => res.json())
  check(counts['/missing.svg'] - (before['/missing.svg'] ?? 0) === 1, 'Repeated hydration does not duplicate attempts')
  cover = paint(urls)
  check(cover.querySelector('img').getAttribute('src') === urls[1], 'Next view reuses successful match')
  await waitFor(() => cover.classList.contains('ro-cover--ready'))
  // Hydrate after the cached image completed, exercising the synchronous path.
  root.innerHTML = coverMarkup('Cached', 'cyan', `${imageOrigin}/art.svg`)
  const cached = root.querySelector('img')
  await waitFor(() => cached.complete && cached.naturalWidth > 0)
  hydrateCovers(root)
  check(cached.parentElement.classList.contains('ro-cover--ready'), 'Already cached image becomes ready')
  cover = paint([`${imageOrigin}/absent-one.svg`, `${imageOrigin}/absent-two.svg`])
  await waitFor(() => cover.classList.contains('ro-cover--missing'))
  check(cover.querySelector('img').style.display === 'none', 'All failures hide the broken image')
  check(cover.querySelector('.ro-cover__label').textContent === 'Fixture <title>', 'All failures retain escaped title')
  const failedCounts = await fetch('/counts').then(res => res.json())
  check(failedCounts['/absent-one.svg'] - (before['/absent-one.svg'] ?? 0) === 1 && failedCounts['/absent-two.svg'] - (before['/absent-two.svg'] ?? 0) === 1, 'Each failed candidate attempted once')
  cover = paint([`${imageOrigin}/bad-image.svg`, `${imageOrigin}/art.svg`])
  await waitFor(() => cover.classList.contains('ro-cover--ready'))
  check(cover.querySelector('img').getAttribute('src').endsWith('/art.svg'), 'A 200 response with corrupt art falls back')

  // A cached failure may already have completed when a view attaches listeners.
  root.innerHTML = coverMarkup('Failed cache', 'cyan', [`${imageOrigin}/early-missing.svg`, `${imageOrigin}/art.svg`])
  const earlyFailure = root.querySelector('img')
  await waitFor(() => earlyFailure.complete)
  hydrateCovers(root)
  await waitFor(() => earlyFailure.parentElement.classList.contains('ro-cover--ready'))
  check(earlyFailure.getAttribute('src').endsWith('/art.svg'), 'Failure before hydration still advances candidates')

  const runId = crypto.randomUUID()
  const recovery = [`${imageOrigin}/recovering.svg?run=${runId}`, `${imageOrigin}/flaky.svg?run=${runId}`]
  cover = paint(recovery)
  await waitFor(() => cover.classList.contains('ro-cover--ready'))
  check(cover.querySelector('img').getAttribute('src') === recovery[1], 'Remember initial successful fallback')
  root.innerHTML = coverMarkup('Expired match', 'cyan', recovery)
  const expired = root.querySelector('img')
  check(expired.getAttribute('src') === recovery[1], 'Retry the remembered image on next view')
  // Force a fresh failed request rather than the browser's decoded-image cache.
  expired.src = `${recovery[1]}&expired=1`
  cover = expired.parentElement
  hydrateCovers(root)
  await waitFor(() => cover.classList.contains('ro-cover--ready'))
  check(cover.querySelector('img').getAttribute('src') === recovery[0], 'Expired remembered art retries the original candidate')
  const recoveryCounts = await fetch('/counts').then(res => res.json())
  check(recoveryCounts[`/flaky.svg?run=${runId}`] === 1 && recoveryCounts[`/flaky.svg?run=${runId}&expired=1`] === 1 && recoveryCounts[`/recovering.svg?run=${runId}`] === 2, 'Recovery does not loop through candidates')

  cover = paint([`${imageOrigin}/slow-missing.svg`, `${imageOrigin}/detached-fallback.svg`])
  const detached = cover.querySelector('img')
  detached.remove()
  detached.dispatchEvent(new Event('error'))
  check(detached.getAttribute('src').endsWith('/slow-missing.svg'), 'Removed views stop launching fallback requests')
  // Simulate a zero-dimension load notification while a real request is pending.
  cover = paint([`${imageOrigin}/slow-missing.svg`, `${imageOrigin}/art.svg`])
  const zeroWidth = cover.querySelector('img')
  zeroWidth.dispatchEvent(new Event('load'))
  await waitFor(() => cover.classList.contains('ro-cover--ready'))
  check(zeroWidth.naturalWidth > 0 && zeroWidth.getAttribute('src').endsWith('/art.svg'), 'Zero-dimension load notifications do not become ready')
  cover = paint([])
  check(!cover.querySelector('img'), 'No art produces a placeholder without requests')
  if (new URL(location.href).searchParams.has('live')) {
    cover = paint([libretroBoxartUrl('nes', 'Super Mario Bros. (World)')])
    await waitFor(() => cover.classList.contains('ro-cover--ready') || cover.classList.contains('ro-cover--missing'))
    check(cover.classList.contains('ro-cover--ready'), 'Real Libretro art loads under isolation')
  }
  refreshCoverArt()
  root.innerHTML = coverMarkup('Refresh', 'cyan', urls)
  const refreshed = root.querySelector('img')
  check(new URL(refreshed.src).pathname.endsWith('/missing.svg'), 'Refresh resets remembered fallback order')
  check(new URL(refreshed.src).searchParams.has('_ro_cover_refresh'), 'Refresh requests a new image URL')
  // The fixture image server responds based on pathname for refreshed requests.
  hydrateCovers(root)
  await waitFor(() => refreshed.parentElement.classList.contains('ro-cover--ready'))
  check(new URL(refreshed.src).pathname.endsWith('/art.svg'), 'Refresh also applies to fallback requests')
  const firstRefresh = new URL(refreshed.src).searchParams.get('_ro_cover_refresh')
  refreshCoverArt()
  root.innerHTML = coverMarkup('Again', 'cyan', `${imageOrigin}/art.svg`)
  check(new URL(root.querySelector('img').src).searchParams.get('_ro_cover_refresh') !== firstRefresh, 'Repeated refresh gets a new request version')
  root.innerHTML = coverMarkup('Signed', 'cyan', `${imageOrigin}/art.svg?signature=keep`)
  check(root.querySelector('img').getAttribute('src') === `${imageOrigin}/art.svg?signature=keep`, 'Refresh preserves query-bearing custom URLs')
  root.innerHTML = coverMarkup('Local', 'cyan', 'blob:fixture')
  check(root.querySelector('img').getAttribute('src') === 'blob:fixture', 'Refresh preserves local blob URLs')
  const pendingUrls = [`${imageOrigin}/pending-missing.svg`, `${imageOrigin}/slow-art.svg`]
  cover = paint(pendingUrls)
  const pending = cover.querySelector('img')
  await waitFor(() => new URL(pending.src).pathname.endsWith('/slow-art.svg'))
  refreshCoverArt()
  await waitFor(() => cover.classList.contains('ro-cover--ready'))
  root.innerHTML = coverMarkup('New generation', 'cyan', pendingUrls)
  check(new URL(root.querySelector('img').src).pathname.endsWith('/pending-missing.svg'), 'In-flight old requests cannot undo refresh')
  root.innerHTML = coverMarkup('Late hydration', 'cyan', [`${imageOrigin}/slow-missing.svg`, `${imageOrigin}/art.svg`])
  const late = root.querySelector('img')
  refreshCoverArt()
  hydrateCovers(root)
  await waitFor(() => late.parentElement.classList.contains('ro-cover--missing'))
  check(new URL(late.src).pathname.endsWith('/slow-missing.svg'), 'Markup created before refresh cannot launch stale fallback requests')

  const raceUrls = [`${imageOrigin}/race-missing.svg`, `${imageOrigin}/refresh-race.svg`]
  const oldCover = paint(raceUrls)
  await waitFor(() => new URL(oldCover.querySelector('img').src).pathname.endsWith('/refresh-race.svg'))
  // Keep the old view connected while a newer generation learns the same key.
  const oldHost = document.createElement('div')
  oldHost.append(oldCover)
  document.body.append(oldHost)
  refreshCoverArt()
  cover = paint(raceUrls)
  await waitFor(() => cover.classList.contains('ro-cover--ready'))
  await waitFor(() => oldCover.classList.contains('ro-cover--missing'))
  root.innerHTML = coverMarkup('Remember new match', 'cyan', raceUrls)
  check(new URL(root.querySelector('img').src).pathname.endsWith('/refresh-race.svg'), 'An old failed request cannot erase a newly learned match')
  oldHost.remove()
  results.textContent += `\nPASS: ${passed} cover loading checks`
} catch (error) {
  results.textContent += `\nFAIL: ${error.message}`
  console.error(error)
}
}
void run()
