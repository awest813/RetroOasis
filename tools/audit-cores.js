#!/usr/bin/env node
/**
 * audit-cores.js — Verify local core bundles and CDN reachability.
 *
 * Usage:
 *   node tools/audit-cores.js          # local + CDN HEAD probes
 *   node tools/audit-cores.js --local  # skip network
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const PASS = '✅';
const FAIL = '❌';
const WARN = '⚠️';

const EJS_CDN_BASE = 'https://cdn.emulatorjs.org/stable/data/';
const EJS_NIGHTLY_CDN_BASE = 'https://cdn.emulatorjs.org/nightly/data/';
const FLYCAST_PATH = 'public/cores/flycast-wasm.data';
const MIN_FLYCAST_BYTES = 1_000_000;

const localOnly = process.argv.includes('--local');

function parsePrefetchMap(source) {
  const match = source.match(/const CORE_PREFETCH_MAP[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!match) throw new Error('Could not parse CORE_PREFETCH_MAP from src/coreCdn.ts');
  const entries = {};
  for (const line of match[1].split('\n')) {
    const m = /^\s*(?:"([^"]+)"|([a-zA-Z0-9_]+)):\s*"([^"]+)"/.exec(line);
    if (m) entries[m[1] ?? m[2]] = m[3];
  }
  return entries;
}

function parseNightlyOverrides(source) {
  const match = source.match(/const CORE_CDN_BASE_OVERRIDES[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!match) throw new Error('Could not parse CORE_CDN_BASE_OVERRIDES from src/coreCdn.ts');
  const overrides = {};
  for (const line of match[1].split('\n')) {
    const m = /^\s*([a-zA-Z0-9_]+):\s*EJS_NIGHTLY_CDN_BASE/.exec(line);
    if (m) overrides[m[1]] = EJS_NIGHTLY_CDN_BASE;
  }
  return overrides;
}

function parseSystemIds(source) {
  const ids = [];
  for (const m of source.matchAll(/^\s+id:\s*"([^"]+)"/gm)) {
    ids.push(m[1]);
  }
  return ids;
}

function parseExternalCorePaths(source) {
  const paths = new Map();
  const blocks = source.split(/\n  \{/);
  for (const block of blocks) {
    const idMatch = /id:\s*"([^"]+)"/.exec(block);
    const pathMatch = /corePath:\s*"([^"]+)"/.exec(block);
    if (idMatch && pathMatch) paths.set(idMatch[1], pathMatch[1]);
  }
  return paths;
}

function coreNameFromPrefetchPath(relPath) {
  const fileName = relPath.split('/').pop() ?? '';
  return fileName.replace(/(?:-thread)?(?:-legacy)?-wasm\.data$/, '');
}

function cdnBaseForCore(coreName, overrides) {
  return overrides[coreName] ?? EJS_CDN_BASE;
}

async function probeUrl(url, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { Range: 'bytes=0-0' },
      });
    }
    return { ok: res.ok, status: res.status, url };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, url, error: message };
  } finally {
    clearTimeout(timer);
  }
}

function report(status, label, detail) {
  console.log(`${status} ${label}`);
  console.log(`   ${detail}`);
}

let failures = 0;

console.log('RetroOasis core audit\n');

// ── Flycast bundle ───────────────────────────────────────────────────────────
if (!existsSync(FLYCAST_PATH)) {
  failures += 1;
  report(FAIL, 'Flycast bundle present', `Missing ${FLYCAST_PATH}`);
} else {
  const bytes = statSync(FLYCAST_PATH).size;
  if (bytes < MIN_FLYCAST_BYTES) {
    failures += 1;
    report(FAIL, 'Flycast bundle size', `${FLYCAST_PATH} is only ${bytes} bytes (expected ≥ ${MIN_FLYCAST_BYTES})`);
  } else {
    report(PASS, 'Flycast bundle present', `${FLYCAST_PATH} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
  }
}

// ── Prefetch map ↔ systems table ─────────────────────────────────────────────
const coreCdnSource = readFileSync('src/coreCdn.ts', 'utf8');
const systemsSource = readFileSync('src/systems.ts', 'utf8');
const prefetchMap = parsePrefetchMap(coreCdnSource);
const nightlyOverrides = parseNightlyOverrides(coreCdnSource);
const systemIds = parseSystemIds(systemsSource);
const externalPaths = parseExternalCorePaths(systemsSource);

const missingPrefetch = [];
const orphanPrefetch = [];
const badExternalInMap = [];

for (const id of systemIds) {
  if (externalPaths.has(id)) {
    if (prefetchMap[id]) badExternalInMap.push(id);
    continue;
  }
  if (!prefetchMap[id]) missingPrefetch.push(id);
}

for (const id of Object.keys(prefetchMap)) {
  if (!systemIds.includes(id)) orphanPrefetch.push(id);
}

if (missingPrefetch.length || orphanPrefetch.length || badExternalInMap.length) {
  failures += 1;
  const parts = [];
  if (missingPrefetch.length) parts.push(`missing prefetch entries: ${missingPrefetch.join(', ')}`);
  if (orphanPrefetch.length) parts.push(`orphan prefetch keys: ${orphanPrefetch.join(', ')}`);
  if (badExternalInMap.length) parts.push(`external systems should not be in map: ${badExternalInMap.join(', ')}`);
  report(FAIL, 'Prefetch map consistency', parts.join('; '));
} else {
  report(
    PASS,
    'Prefetch map consistency',
    `${Object.keys(prefetchMap).length} CDN systems + ${externalPaths.size} external bundle(s) align with ${systemIds.length} systems`,
  );
}

for (const [id, relPath] of externalPaths) {
  const abs = resolve('public', relPath.replace(/^\.\//, ''));
  if (!existsSync(abs)) {
    failures += 1;
    report(FAIL, `External core for ${id}`, `Missing ${relPath} (resolved ${abs})`);
  }
}

// ── CDN probes ───────────────────────────────────────────────────────────────
if (localOnly) {
  report(WARN, 'CDN probes', 'Skipped (--local)');
} else {
  console.log('');
  console.log('CDN reachability (core report JSON):');

  const results = await Promise.all(
    Object.entries(prefetchMap).map(async ([systemId, relPath]) => {
      const coreName = coreNameFromPrefetchPath(relPath);
      const base = cdnBaseForCore(coreName, nightlyOverrides);
      const url = `${base}cores/reports/${coreName}.json`;
      const result = await probeUrl(url);
      return { systemId, coreName, channel: base.includes('nightly') ? 'nightly' : 'stable', ...result };
    }),
  );

  for (const row of results) {
    if (row.ok) {
      report(PASS, `${row.systemId} (${row.coreName}, ${row.channel})`, `HTTP ${row.status} — ${row.url}`);
    } else {
      failures += 1;
      const detail = row.error ? `${row.error} — ${row.url}` : `HTTP ${row.status} — ${row.url}`;
      report(FAIL, `${row.systemId} (${row.coreName}, ${row.channel})`, detail);
    }
  }
}

console.log('');
if (failures) {
  console.log(`${FAIL} ${failures} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(`${PASS} All core audit checks passed.`);
}
