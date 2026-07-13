#!/usr/bin/env node
/**
 * css-budget.js — regression guard for the premium UI overhaul.
 *
 * design-system.css is the single source of truth for colour and light, so it
 * is EXEMPT: raw hex/rgba belong there. Everywhere else, component CSS should
 * reference tokens (var(--c-*)) and avoid !important. This script counts the
 * two headline debts in the component stylesheet(s) and fails if they grow.
 *
 * The budgets are a ratchet: they only ever move DOWN. When a phase reduces
 * the numbers, lower the budgets to match so the win can't be undone. The
 * END-GOAL targets from docs/PREMIUM_UI_OVERHAUL.md are shown for reference.
 *
 * Usage:  node tools/css-budget.js        (via `npm run lint:css`)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Files that are gated. design-system.css is intentionally NOT here.
const FILES = ["src/style.css"];

// Ratchet budgets — lower these as phases land. Never raise them.
const BUDGET = {
  important: 928, // Phase 3 target: < 20 (each justified)
  colors: 825, //    Phase 3 target: 0 (tokens only) — ratcheted from 887 after
  //                 deleting the legacy Gran Turismo gold pass (-42 literals).
};
// End-goal targets, for the report only.
const TARGET = { important: 20, colors: 0 };

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const RGB = /\brgba?\(/g;
const IMPORTANT = /!important/g;

function count(str, re) {
  const m = str.match(re);
  return m ? m.length : 0;
}

let important = 0;
let colors = 0;
for (const rel of FILES) {
  const css = readFileSync(join(root, rel), "utf8");
  important += count(css, IMPORTANT);
  colors += count(css, HEX) + count(css, RGB);
}

const rows = [
  ["!important", important, BUDGET.important, TARGET.important],
  ["hardcoded colors", colors, BUDGET.colors, TARGET.colors],
];

let failed = false;
console.log(`\n  CSS budget — gated: ${FILES.join(", ")}  (design-system.css exempt)\n`);
console.log(`  ${"metric".padEnd(20)}${"now".padStart(7)}${"budget".padStart(9)}${"goal".padStart(7)}   status`);
for (const [name, now, budget, target] of rows) {
  const ok = now <= budget;
  failed = failed || !ok;
  const status = ok ? (now < budget ? "✓ under" : "✓ at cap") : "✗ OVER";
  console.log(
    `  ${name.padEnd(20)}${String(now).padStart(7)}${String(budget).padStart(9)}${String(target).padStart(7)}   ${status}`,
  );
}

if (failed) {
  console.error(
    "\n  ✗ CSS budget exceeded. Move component styles onto design-system.css\n" +
      "    tokens (var(--c-*)) instead of raw colours / !important, or justify\n" +
      "    the change and this will pass again.\n",
  );
  process.exit(1);
}
console.log("\n  ✓ within budget — the debt is not growing.\n");
