#!/usr/bin/env node
/**
 * Emit docs/PERF_BASELINE.md from the current dist/ build output.
 * Run: npm run build && node tools/perf-audit/collect-baseline.js
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const DIST = resolve(ROOT, "dist");
const OUT = resolve(ROOT, "docs/PERF_BASELINE.md");

function fmtKb(bytes) {
  return (bytes / 1024).toFixed(1);
}

function assetRows() {
  const assetsDir = resolve(DIST, "assets");
  if (!existsSync(assetsDir)) return [];

  return readdirSync(assetsDir)
    .map((name) => {
      const path = join(assetsDir, name);
      const raw = statSync(path).size;
      const isText = /\.(js|css|json|wasm)$/.test(name);
      const gzip = isText ? gzipSync(readFileSync(path)).length : null;
      return { name, raw, gzip };
    })
    .sort((a, b) => b.raw - a.raw);
}

function precacheSummary() {
  const manifestPath = resolve(DIST, "pwa-precache.json");
  if (!existsSync(manifestPath)) return { count: 0, totalRaw: 0 };

  const urls = JSON.parse(readFileSync(manifestPath, "utf-8"));
  let totalRaw = 0;
  for (const url of urls) {
    const rel = url.replace(/^\.\//, "");
    const filePath = resolve(DIST, rel);
    if (existsSync(filePath)) totalRaw += statSync(filePath).size;
  }
  return { count: urls.length, totalRaw };
}

if (!existsSync(DIST)) {
  console.error("dist/ not found. Run `npm run build` first.");
  process.exit(1);
}

const rows = assetRows();
const precache = precacheSummary();
const generated = new Date().toISOString().slice(0, 10);

const mainJs = rows.find((r) => r.name.startsWith("index-") && r.name.endsWith(".js"));
const mainCss = rows.find((r) => r.name.startsWith("index-") && r.name.endsWith(".css"));

const lines = [
  "# RetroOasis — Performance Baseline",
  "",
  `> Auto-generated on ${generated} by \`tools/perf-audit/collect-baseline.js\`.`,
  "> Re-run after intentional bundle changes: `npm run build && npm run perf:baseline`",
  "",
  "## Critical Path",
  "",
  "| Asset | Raw | Gzip |",
  "|---|---:|---:|",
];

if (mainJs) {
  lines.push(`| Main JS (\`${mainJs.name}\`) | ${fmtKb(mainJs.raw)} KB | ${fmtKb(mainJs.gzip ?? 0)} KB |`);
}
if (mainCss) {
  lines.push(`| Main CSS (\`${mainCss.name}\`) | ${fmtKb(mainCss.raw)} KB | ${fmtKb(mainCss.gzip ?? 0)} KB |`);
}

const indexHtml = resolve(DIST, "index.html");
if (existsSync(indexHtml)) {
  lines.push(`| index.html | ${fmtKb(statSync(indexHtml).size)} KB | — |`);
}

lines.push(
  "",
  "## All Bundled Assets",
  "",
  "| File | Raw | Gzip |",
  "|---|---:|---:|"
);

for (const row of rows) {
  const gzipCol = row.gzip != null ? `${fmtKb(row.gzip)} KB` : "—";
  lines.push(`| \`${row.name}\` | ${fmtKb(row.raw)} KB | ${gzipCol} |`);
}

lines.push(
  "",
  "## PWA Precache",
  "",
  `- **URLs:** ${precache.count}`,
  `- **Total size (raw):** ${fmtKb(precache.totalRaw)} KB`,
  "",
  "## Budget Reference",
  "",
  "See `perf-budget.json` and run `npm run perf:audit` after every build.",
  ""
);

writeFileSync(OUT, lines.join("\n"), "utf-8");
console.log(`Wrote ${OUT}`);
