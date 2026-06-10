#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { versions } from 'node:process';

const require = createRequire(import.meta.url);

const checks = [];

const PASS = '✅';
const WARN = '⚠️';
const FAIL = '❌';

function addCheck(name, fn) {
  checks.push({ name, fn });
}

function majorVersion(versionString) {
  const match = /^v?(\d+)/.exec(versionString ?? '');
  return match ? Number(match[1]) : NaN;
}

addCheck('Node.js version (18+ required, 20+ recommended)', () => {
  const major = majorVersion(versions.node);
  if (Number.isNaN(major)) {
    return { status: FAIL, message: `Could not parse Node version: ${versions.node}` };
  }
  if (major < 18) {
    return { status: FAIL, message: `Detected Node ${versions.node}. Please install Node 18 or newer.` };
  }
  if (major < 20) {
    return { status: WARN, message: `Detected Node ${versions.node}. Node 20+ is recommended.` };
  }
  return { status: PASS, message: `Detected Node ${versions.node}.` };
});

addCheck('Required project files', () => {
  const required = ['index.html', 'vite.config.ts', 'src/main.ts', 'public/manifest.json'];
  const missing = required.filter((file) => !existsSync(file));
  if (missing.length) {
    return { status: FAIL, message: `Missing required file(s): ${missing.join(', ')}` };
  }
  return { status: PASS, message: `All required files are present (${required.length}).` };
});

addCheck('Core developer dependencies are installed', () => {
  const expected = ['vite', 'vitest', 'typescript'];
  const missing = [];

  for (const pkg of expected) {
    try {
      require.resolve(pkg);
    } catch {
      missing.push(pkg);
    }
  }

  if (missing.length) {
    return {
      status: FAIL,
      message: `Missing dependency resolution for: ${missing.join(', ')}. Run npm install.`
    };
  }

  return { status: PASS, message: `Dependencies resolve correctly (${expected.join(', ')}).` };
});

addCheck('Cross-origin isolation helper present for static hosts', () => {
  const swPath = 'public/coi-serviceworker.js';
  if (!existsSync(swPath)) {
    return {
      status: FAIL,
      message: `Expected ${swPath} but it was not found. PSP cores may fail without it.`
    };
  }
  return { status: PASS, message: `${swPath} is present.` };
});

addCheck('Emulator core runtime wiring', () => {
  const loaderPath = 'data/loader.js';
  const runtimePath = 'data/src/emulator.js';
  if (!existsSync(loaderPath) || !existsSync(runtimePath)) {
    return {
      status: FAIL,
      message: `Missing bundled EmulatorJS file(s): ${loaderPath}, ${runtimePath}.`
    };
  }

  const loader = readFileSync(loaderPath, 'utf8');
  const runtime = readFileSync(runtimePath, 'utf8');
  const missing = [];
  if (!loader.includes('config.corePath = window.EJS_corePath')) {
    missing.push('loader corePath passthrough');
  }
  if (!runtime.includes('"segaDC": ["flycast"]')) {
    missing.push('Dreamcast Flycast registration');
  }
  if (!runtime.includes('"3ds": ["azahar"]')) {
    missing.push('Azahar 3DS registration');
  }
  if (!runtime.includes('const requiresThreads = ["ppsspp", "dosbox_pure", "azahar"]')) {
    missing.push('Azahar/DOSBox threaded core guard');
  }
  if (!runtime.includes('const requiresWebGL2 = ["ppsspp", "flycast", "azahar"]')) {
    missing.push('Flycast WebGL2 guard');
  }
  if (!runtime.includes('[EJS Core] Downloading external core:')) {
    missing.push('external core download path');
  }
  if (!runtime.includes('const filePathKey = path.split("/").pop().split("?")[0].split("#")[0];')) {
    missing.push('core report EJS_paths query stripping');
  }

  if (missing.length) {
    return {
      status: FAIL,
      message: `Core runtime patch missing: ${missing.join(', ')}.`
    };
  }

  return { status: PASS, message: 'Bundled runtime can pass and load external Flycast core bundles.' };
});

addCheck('Performance audit tooling', () => {
  const required = [
    'perf-budget.json',
    'tools/perf-audit/check-budget.js',
    'tools/perf-audit/collect-baseline.js',
    'docs/PERF_AUDIT.md',
  ];
  const missing = required.filter((file) => !existsSync(file));
  if (missing.length) {
    return {
      status: FAIL,
      message: `Missing performance audit file(s): ${missing.join(', ')}.`,
    };
  }
  return {
    status: PASS,
    message: 'perf-budget.json and perf-audit scripts are present (run `npm run perf:audit` after build).',
  };
});

addCheck('4.3-pre core routing', () => {
  const coreCdnPath = 'src/coreCdn.ts';
  const wrapperPath = 'src/emulator.ts';
  const systemsPath = 'src/systems.ts';
  if (!existsSync(coreCdnPath)) {
    return {
      status: FAIL,
      message: `Missing ${coreCdnPath}; cannot verify nightly core channel overrides.`
    };
  }
  if (!existsSync(wrapperPath)) {
    return {
      status: FAIL,
      message: `Missing ${wrapperPath}; cannot verify launch wiring.`
    };
  }
  if (!existsSync(systemsPath)) {
    return {
      status: FAIL,
      message: `Missing ${systemsPath}; cannot verify PSP hardware-rendering options.`
    };
  }

  const coreCdn = readFileSync(coreCdnPath, 'utf8');
  const wrapper = readFileSync(wrapperPath, 'utf8');
  const systems = readFileSync(systemsPath, 'utf8');
  const required = [
    'EJS_NIGHTLY_CDN_BASE',
    'ppsspp: EJS_NIGHTLY_CDN_BASE',
    'azahar: EJS_NIGHTLY_CDN_BASE',
    'bsnes: EJS_NIGHTLY_CDN_BASE',
    'dosbox_pure: EJS_NIGHTLY_CDN_BASE',
    'freeintv: EJS_NIGHTLY_CDN_BASE',
    'genesis_plus_gx_wide: EJS_NIGHTLY_CDN_BASE',
    'buildEjsCorePaths',
    'EJS_disableAutoUnload = true',
    'EJS_askBeforeExit = true'
  ];
  const missing = required.filter((needle) => {
    if (needle.startsWith('EJS_') || needle.startsWith('buildEjs')) {
      return !wrapper.includes(needle);
    }
    return !coreCdn.includes(needle);
  });
  if (!systems.includes('ppsspp_rendering_mode: "OpenGL"')) {
    missing.push('PSP OpenGL hardware-rendering backend');
  }

  if (missing.length) {
    return {
      status: FAIL,
      message: `4.3-pre compatibility wiring missing: ${missing.join(', ')}.`
    };
  }

  return { status: PASS, message: '4.3-pre-only core bundles are routed to the EmulatorJS nightly channel.' };
});

addCheck('Flycast Dreamcast core bundle', () => {
  const flycastPath = 'public/cores/flycast-wasm.data';
  if (!existsSync(flycastPath)) {
    return {
      status: FAIL,
      message: `Missing ${flycastPath}. Dreamcast launches require this bundled core.`
    };
  }
  const bytes = statSync(flycastPath).size;
  const minBytes = 1_000_000;
  if (bytes < minBytes) {
    return {
      status: FAIL,
      message: `${flycastPath} is only ${bytes} bytes (expected at least ${minBytes}).`
    };
  }
  return {
    status: PASS,
    message: `${flycastPath} present (${(bytes / 1024 / 1024).toFixed(2)} MB).`
  };
});

addCheck('Core prefetch map matches systems table', () => {
  const coreCdnPath = 'src/coreCdn.ts';
  const systemsPath = 'src/systems.ts';
  if (!existsSync(coreCdnPath) || !existsSync(systemsPath)) {
    return {
      status: FAIL,
      message: `Missing ${coreCdnPath} or ${systemsPath}.`
    };
  }

  const coreCdn = readFileSync(coreCdnPath, 'utf8');
  const systems = readFileSync(systemsPath, 'utf8');

  const prefetchMatch = coreCdn.match(/const CORE_PREFETCH_MAP[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!prefetchMatch) {
    return { status: FAIL, message: 'Could not parse CORE_PREFETCH_MAP in src/coreCdn.ts.' };
  }
  const prefetchIds = [];
  for (const line of prefetchMatch[1].split('\n')) {
    const m = /^\s*(?:"([^"]+)"|([a-zA-Z0-9_]+)):/.exec(line);
    if (m) prefetchIds.push(m[1] ?? m[2]);
  }

  const systemIds = [];
  for (const m of systems.matchAll(/^\s+id:\s*"([^"]+)"/gm)) {
    systemIds.push(m[1]);
  }

  const externalIds = [];
  for (const block of systems.split(/\n  \{/)) {
    const idMatch = /id:\s*"([^"]+)"/.exec(block);
    const pathMatch = /corePath:\s*"([^"]+)"/.exec(block);
    if (idMatch && pathMatch) externalIds.push(idMatch[1]);
  }

  const missing = systemIds.filter((id) => !externalIds.includes(id) && !prefetchIds.includes(id));
  const orphan = prefetchIds.filter((id) => !systemIds.includes(id));
  const externalInMap = externalIds.filter((id) => prefetchIds.includes(id));

  if (missing.length || orphan.length || externalInMap.length) {
    const parts = [];
    if (missing.length) parts.push(`missing prefetch: ${missing.join(', ')}`);
    if (orphan.length) parts.push(`orphan keys: ${orphan.join(', ')}`);
    if (externalInMap.length) parts.push(`external systems in map: ${externalInMap.join(', ')}`);
    return { status: FAIL, message: parts.join('; ') };
  }

  return {
    status: PASS,
    message: `${prefetchIds.length} CDN prefetch entries and ${externalIds.length} external bundle(s) cover all ${systemIds.length} systems.`
  };
});

addCheck('Core audit tooling', () => {
  const auditPath = 'tools/audit-cores.js';
  if (!existsSync(auditPath)) {
    return { status: WARN, message: `${auditPath} not found; run npm run audit:cores after adding it.` };
  }
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  if (!pkg.scripts?.['audit:cores']) {
    return { status: WARN, message: 'package.json is missing an audit:cores script.' };
  }
  return { status: PASS, message: 'audit:cores script and tools/audit-cores.js are present.' };
});

console.log('RetroOasis environment doctor\n');

let hasFailures = false;

for (const check of checks) {
  const result = check.fn();
  if (result.status === FAIL) {
    hasFailures = true;
  }
  console.log(`${result.status} ${check.name}`);
  console.log(`   ${result.message}`);
}

console.log('');

if (hasFailures) {
  console.log('One or more checks failed. Fix the issues above and rerun `npm run doctor`.');
  process.exitCode = 1;
} else {
  console.log('No blocking issues detected. You are ready to run RetroOasis.');
}
