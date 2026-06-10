#!/usr/bin/env node
/**
 * Compare dist/ asset sizes against perf-budget.json.
 * Run after `npm run build`. Exits 1 when any budget is exceeded.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const DIST = resolve(ROOT, "dist");
const BUDGET_PATH = resolve(ROOT, "perf-budget.json");

const PASS = "✅";
const FAIL = "❌";

function kb(bytes) {
  return bytes / 1024;
}

function gzipSize(filePath) {
  return gzipSync(readFileSync(filePath)).length;
}

function findAsset(prefix, ext) {
  const assetsDir = resolve(DIST, "assets");
  if (!existsSync(assetsDir)) return null;
  const matches = readdirSync(assetsDir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(ext))
    .map((f) => ({ name: f, path: join(assetsDir, f) }));
  if (!matches.length) return null;
  // Hashed filenames — pick the largest match (main bundle is typically biggest index-*.js)
  return matches.sort((a, b) => statSync(b.path).size - statSync(a.path).size)[0];
}

function findChunk(prefix) {
  const assetsDir = resolve(DIST, "assets");
  if (!existsSync(assetsDir)) return null;
  const match = readdirSync(assetsDir).find((f) => f.startsWith(`${prefix}-`) && f.endsWith(".js"));
  return match ? join(assetsDir, match) : null;
}

function precacheTotalBytes() {
  const manifestPath = resolve(DIST, "pwa-precache.json");
  if (!existsSync(manifestPath)) return { total: 0, shell: 0, missing: [] };

  const urls = JSON.parse(readFileSync(manifestPath, "utf-8"));
  let total = 0;
  let shell = 0;
  const missing = [];

  for (const url of urls) {
    const rel = url.replace(/^\.\//, "");
    const filePath = resolve(DIST, rel);
    if (!existsSync(filePath)) {
      missing.push(rel);
      continue;
    }
    const size = statSync(filePath).size;
    total += size;
    const isShell =
      rel === "index.html" ||
      rel === "manifest.json" ||
      rel === "audio-processor.js" ||
      (rel.startsWith("assets/index-") && (rel.endsWith(".js") || rel.endsWith(".css")));
    if (isShell) shell += size;
  }

  return { total, shell, missing };
}

function checkLimit(label, actualKb, limitKb) {
  const ok = actualKb <= limitKb;
  const icon = ok ? PASS : FAIL;
  console.log(
    `${icon} ${label}: ${actualKb.toFixed(1)} KB ${ok ? "≤" : ">"} ${limitKb} KB budget`
  );
  return ok;
}

if (!existsSync(DIST)) {
  console.error(`${FAIL} dist/ not found. Run \`npm run build\` first.`);
  process.exit(1);
}

if (!existsSync(BUDGET_PATH)) {
  console.error(`${FAIL} perf-budget.json not found.`);
  process.exit(1);
}

const budget = JSON.parse(readFileSync(BUDGET_PATH, "utf-8"));
let allOk = true;

console.log("RetroOasis performance budget check\n");

const mainJs = findAsset("index-", ".js");
const mainCss = findAsset("index-", ".css");
const indexHtml = resolve(DIST, "index.html");

if (!mainJs) {
  console.error(`${FAIL} Main JS chunk (index-*.js) not found in dist/assets/`);
  process.exit(1);
}

allOk = checkLimit("Main JS (gzip)", kb(gzipSize(mainJs.path)), budget.criticalPath.mainJsGzipKb) && allOk;

if (mainCss) {
  allOk =
    checkLimit("Main CSS (gzip)", kb(gzipSize(mainCss.path)), budget.criticalPath.mainCssGzipKb) && allOk;
} else {
  console.log(`⚠️  Main CSS chunk not found — skipping CSS budget`);
}

if (existsSync(indexHtml)) {
  allOk =
    checkLimit("index.html (raw)", kb(statSync(indexHtml).size), budget.criticalPath.indexHtmlKb) && allOk;
}

const lazyChecks = [
  ["modals", budget.lazyChunks.modalsGzipKb],
  ["saves", budget.lazyChunks.savesGzipKb],
  ["tools", budget.lazyChunks.toolsGzipKb],
  ["multiplayer", budget.lazyChunks.multiplayerGzipKb],
];

console.log("");
for (const [prefix, limitKb] of lazyChecks) {
  const chunkPath = findChunk(prefix);
  if (!chunkPath) continue;
  allOk = checkLimit(`Lazy chunk ${prefix} (gzip)`, kb(gzipSize(chunkPath)), limitKb) && allOk;
}

const precache = precacheTotalBytes();
console.log("");
allOk =
  checkLimit("PWA precache (raw total)", kb(precache.total), budget.precache.maxTotalKb) && allOk;
allOk =
  checkLimit("PWA precache shell (raw)", kb(precache.shell), budget.precache.maxShellKb) && allOk;

if (precache.missing.length) {
  console.log(`⚠️  ${precache.missing.length} precache URL(s) missing on disk (non-fatal)`);
}

if (budget.stretch) {
  console.log("\nStretch goals (informational):");
  if (mainJs && budget.stretch.mainJsGzipKb) {
    const gzipKb = kb(gzipSize(mainJs.path));
    if (gzipKb > budget.stretch.mainJsGzipKb) {
      console.log(
        `   ⚠️  Main JS ${gzipKb.toFixed(1)} KB > stretch ${budget.stretch.mainJsGzipKb} KB`
      );
    }
  }
  if (mainCss && budget.stretch.mainCssGzipKb) {
    const gzipKb = kb(gzipSize(mainCss.path));
    if (gzipKb > budget.stretch.mainCssGzipKb) {
      console.log(
        `   ⚠️  Main CSS ${gzipKb.toFixed(1)} KB > stretch ${budget.stretch.mainCssGzipKb} KB`
      );
    }
  }
  if (budget.stretch.precacheTotalKb && kb(precache.total) > budget.stretch.precacheTotalKb) {
    console.log(
      `   ⚠️  PWA precache ${kb(precache.total).toFixed(1)} KB > stretch ${budget.stretch.precacheTotalKb} KB`
    );
  }
  if (budget.stretch.precacheShellKb && kb(precache.shell) > budget.stretch.precacheShellKb) {
    console.log(
      `   ⚠️  PWA shell ${kb(precache.shell).toFixed(1)} KB > stretch ${budget.stretch.precacheShellKb} KB`
    );
  }
}

console.log("");
if (allOk) {
  console.log("All performance budgets passed.");
} else {
  console.log("One or more performance budgets were exceeded.");
  process.exit(1);
}
