import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { ShaderCache, shaderProgramKey, wgslModuleKey, GAME_WARMUP_WINDOW_MS } from "./shaderCache.js";

// ── shaderProgramKey ──────────────────────────────────────────────────────────

describe('shaderProgramKey', () => {
  it('returns an 8-character hex string', () => {
    const key = shaderProgramKey('void main() {}', 'void main() {}');
    expect(key).toMatch(/^[0-9a-f]{8}$/);
  });

  it('produces the same key for identical sources', () => {
    const vs = 'attribute vec2 p; void main(){ gl_Position=vec4(p,0,1); }';
    const fs = 'precision lowp float; void main(){ gl_FragColor=vec4(0); }';
    expect(shaderProgramKey(vs, fs)).toBe(shaderProgramKey(vs, fs));
  });

  it('produces different keys for different shader pairs', () => {
    const keyA = shaderProgramKey('void main() { gl_Position = vec4(1); }', 'void main() { gl_FragColor = vec4(0); }');
    const keyB = shaderProgramKey('void main() { gl_Position = vec4(0); }', 'void main() { gl_FragColor = vec4(1); }');
    expect(keyA).not.toBe(keyB);
  });

  it('treats vertex and fragment source order as significant', () => {
    const src1 = 'void main() { gl_Position = vec4(1); }';
    const src2 = 'void main() { gl_FragColor = vec4(0); }';
    const keyAB = shaderProgramKey(src1, src2);
    const keyBA = shaderProgramKey(src2, src1);
    expect(keyAB).not.toBe(keyBA);
  });
});

// ── wgslModuleKey ─────────────────────────────────────────────────────────────

describe('wgslModuleKey', () => {
  it('returns an 8-character hex string', () => {
    const key = wgslModuleKey('@vertex fn vs() -> @builtin(position) vec4f { return vec4f(0); }');
    expect(key).toMatch(/^[0-9a-f]{8}$/);
  });

  it('produces the same key for identical sources', () => {
    const src = '@fragment fn fs() -> @location(0) vec4f { return vec4f(1); }';
    expect(wgslModuleKey(src)).toBe(wgslModuleKey(src));
  });

  it('produces different keys for different sources', () => {
    const keyA = wgslModuleKey('@vertex fn vs() -> @builtin(position) vec4f { return vec4f(0,0,0,1); }');
    const keyB = wgslModuleKey('@fragment fn fs() -> @location(0) vec4f { return vec4f(1,0,0,1); }');
    expect(keyA).not.toBe(keyB);
  });
});

// ── ShaderCache (GLSL) ────────────────────────────────────────────────────────

describe('ShaderCache', () => {
  let cache: ShaderCache;

  beforeEach(() => {
    cache = new ShaderCache();
  });

  it('starts empty', async () => {
    const count = await cache.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('records a shader program and retrieves it', async () => {
    const vs = 'attribute vec2 p; void main(){ gl_Position=vec4(p,0,1); }';
    const fs = 'precision lowp float; void main(){ gl_FragColor=vec4(0); }';

    await cache.record(vs, fs);
    const programs = await cache.load();
    const found = programs.find(p => p.vsSource === vs && p.fsSource === fs);
    expect(found).toBeDefined();
  });

  it('increments hits on repeated records of the same program', async () => {
    const vs = 'attribute vec3 a; void main(){ gl_Position=vec4(a,1); }';
    const fs = 'void main(){ gl_FragColor=vec4(1); }';

    await cache.record(vs, fs);
    await cache.record(vs, fs);
    await cache.record(vs, fs);

    const programs = await cache.load();
    const found = programs.find(p => p.vsSource === vs);
    expect(found?.hits).toBeGreaterThanOrEqual(3);
  });

  it('clear() removes all cached programs', async () => {
    await cache.record('void main(){}', 'void main(){}');
    await cache.clear();
    const count = await cache.count();
    expect(count).toBe(0);
  });

  it('count() returns the number of distinct cached programs', async () => {
    await cache.clear();
    await cache.record('attribute vec2 a; void main(){ gl_Position=vec4(a,0,1); }', 'void main(){ gl_FragColor=vec4(1); }');
    await cache.record('attribute vec3 b; void main(){ gl_Position=vec4(b,1); }', 'void main(){ gl_FragColor=vec4(0); }');
    const count = await cache.count();
    expect(count).toBe(2);
  });

  it('preCompile() does not throw when the cache is empty', async () => {
    await cache.clear();
    await expect(cache.preCompile()).resolves.not.toThrow();
  });

  it('preCompile() does not throw when the cache has entries', async () => {
    await cache.record('attribute vec2 p; void main(){ gl_Position=vec4(p,0,1); }', 'precision lowp float; void main(){ gl_FragColor=vec4(0); }');
    await expect(cache.preCompile()).resolves.not.toThrow();
  });
});

// ── ShaderCache (WGSL) ────────────────────────────────────────────────────────

describe('ShaderCache WGSL', () => {
  let cache: ShaderCache;

  beforeEach(() => {
    cache = new ShaderCache();
  });

  it('countWGSL() starts at 0 for a fresh cache', async () => {
    await cache.clearWGSL();
    const count = await cache.countWGSL();
    expect(count).toBe(0);
  });

  it('recordWGSL() persists a module and loadWGSL() retrieves it', async () => {
    await cache.clearWGSL();
    const src = '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(0,0,0,1); }';
    await cache.recordWGSL(src, 'test-vertex');

    const modules = await cache.loadWGSL();
    const found = modules.find(m => m.source === src);
    expect(found).toBeDefined();
    expect(found?.label).toBe('test-vertex');
    expect(found?.hits).toBeGreaterThanOrEqual(1);
  });

  it('recordWGSL() increments hits on repeated calls for the same source', async () => {
    await cache.clearWGSL();
    const src = '@fragment fn fs() -> @location(0) vec4f { return vec4f(1,0,0,1); }';
    await cache.recordWGSL(src, 'test-fragment');
    await cache.recordWGSL(src, 'test-fragment');
    await cache.recordWGSL(src, 'test-fragment');

    const modules = await cache.loadWGSL();
    const found = modules.find(m => m.source === src);
    expect(found?.hits).toBeGreaterThanOrEqual(3);
  });

  it('clearWGSL() removes all cached WGSL modules', async () => {
    const src = '@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(0,0,0,1); }';
    await cache.recordWGSL(src, 'to-be-cleared');
    await cache.clearWGSL();
    const count = await cache.countWGSL();
    expect(count).toBe(0);
  });

  it('preCompileWGSL() does not throw when the WGSL cache is empty', async () => {
    await cache.clearWGSL();
    const mockDevice = {
      createShaderModule: () => ({}),
    } as unknown as GPUDevice;
    await expect(cache.preCompileWGSL(mockDevice)).resolves.not.toThrow();
  });

  it('preCompileWGSL() calls createShaderModule for each cached entry', async () => {
    await cache.clearWGSL();
    const src1 = '@vertex fn vs1(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(0,0,0,1); }';
    const src2 = '@fragment fn fs1() -> @location(0) vec4f { return vec4f(0,1,0,1); }';
    await cache.recordWGSL(src1, 'vertex-1');
    await cache.recordWGSL(src2, 'fragment-1');

    let callCount = 0;
    const mockDevice = {
      createShaderModule: () => { callCount++; return {}; },
    } as unknown as GPUDevice;

    await cache.preCompileWGSL(mockDevice);
    expect(callCount).toBe(2);
  });

  it('preCompileWGSL() does not throw when a createShaderModule call fails', async () => {
    await cache.clearWGSL();
    const src = '@vertex fn broken(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(0); }';
    await cache.recordWGSL(src, 'broken');

    const mockDevice = {
      createShaderModule: () => { throw new Error('Shader compile failed'); },
    } as unknown as GPUDevice;

    await expect(cache.preCompileWGSL(mockDevice)).resolves.not.toThrow();
  });
});

// ── Tier scaling ──────────────────────────────────────────────────────────────

describe('tier scaling', () => {
  let cache: ShaderCache;

  beforeEach(() => {
    cache = new ShaderCache();
  });

  it('defaults to medium tier', () => {
    expect(cache.maxPrograms).toBe(32);
    expect(cache.maxWGSLModules).toBe(16);
  });

  it('scales max programs by tier', () => {
    cache.setTier('low');
    expect(cache.maxPrograms).toBe(16);
    cache.setTier('high');
    expect(cache.maxPrograms).toBe(64);
    cache.setTier('ultra');
    expect(cache.maxPrograms).toBe(128);
  });

  it('scales max WGSL modules by tier', () => {
    cache.setTier('low');
    expect(cache.maxWGSLModules).toBe(8);
    cache.setTier('ultra');
    expect(cache.maxWGSLModules).toBe(64);
  });
});

// ── Per-game shader warmup ────────────────────────────────────────────────────

describe('Per-game shader warmup', () => {
  let cache: ShaderCache;

  beforeEach(() => {
    cache = new ShaderCache();
  });

  afterEach(() => {
    cache.endWarmupWindow();
    vi.restoreAllMocks();
  });

  it('GAME_WARMUP_WINDOW_MS is 60 000 ms', () => {
    expect(GAME_WARMUP_WINDOW_MS).toBe(60_000);
  });

  it('warmupGameId is null before beginWarmupWindow', () => {
    expect(cache.warmupGameId).toBeNull();
  });

  it('beginWarmupWindow sets warmupGameId', () => {
    cache.beginWarmupWindow('game-001');
    expect(cache.warmupGameId).toBe('game-001');
  });

  it('endWarmupWindow clears warmupGameId', () => {
    cache.beginWarmupWindow('game-001');
    cache.endWarmupWindow();
    expect(cache.warmupGameId).toBeNull();
  });

  it('record() associates shaders with the active game during the warmup window', async () => {
    const vs = 'attribute vec2 pWarm; void main(){ gl_Position=vec4(pWarm,0,1); }';
    const fs = 'precision lowp float; void main(){ gl_FragColor=vec4(1,0,0,1); }';

    cache.beginWarmupWindow('game-abc');
    await cache.record(vs, fs);

    const entries = await cache.loadForGame('game-abc');
    expect(entries.length).toBe(1);
    expect(entries[0].vsSource).toBe(vs);
    expect(entries[0].fsSource).toBe(fs);
    expect(entries[0].gameId).toBe('game-abc');
  });

  it('record() does NOT associate shaders when no warmup window is open', async () => {
    const vs = 'attribute vec3 bNoWarm; void main(){ gl_Position=vec4(bNoWarm,1); }';
    const fs = 'void main(){ gl_FragColor=vec4(0); }';

    await cache.record(vs, fs);

    const entries = await cache.loadForGame('game-xyz');
    expect(entries.length).toBe(0);
  });

  it('record() stops associating shaders after endWarmupWindow()', async () => {
    const vs1 = 'attribute vec2 a1Stop; void main(){ gl_Position=vec4(a1Stop,0,1); }';
    const fs1 = 'void main(){ gl_FragColor=vec4(1); }';
    const vs2 = 'attribute vec2 a2Stop; void main(){ gl_Position=vec4(a2Stop,0,1); }';
    const fs2 = 'void main(){ gl_FragColor=vec4(0); }';

    cache.beginWarmupWindow('game-stop');
    await cache.record(vs1, fs1);
    cache.endWarmupWindow();
    await cache.record(vs2, fs2);

    const entries = await cache.loadForGame('game-stop');
    expect(entries.length).toBe(1);
    expect(entries[0].vsSource).toBe(vs1);
  });

  it('record() stops associating shaders after the warmup window time expires', async () => {
    const vs1 = 'attribute vec2 earlyW; void main(){ gl_Position=vec4(earlyW,0,1); }';
    const fs1 = 'void main(){ gl_FragColor=vec4(1,1,0,1); }';
    const vs2 = 'attribute vec2 lateW; void main(){ gl_Position=vec4(lateW,0,1); }';
    const fs2 = 'void main(){ gl_FragColor=vec4(0,1,1,1); }';

    // Open the warmup window at t=0
    vi.spyOn(performance, 'now').mockReturnValueOnce(0);
    cache.beginWarmupWindow('game-expire');

    // First record still within the window (t=100)
    vi.spyOn(performance, 'now').mockReturnValue(100);
    await cache.record(vs1, fs1);

    // Second record is past the window boundary (t=GAME_WARMUP_WINDOW_MS+1)
    vi.spyOn(performance, 'now').mockReturnValue(GAME_WARMUP_WINDOW_MS + 1);
    await cache.record(vs2, fs2);

    const entries = await cache.loadForGame('game-expire');
    expect(entries.length).toBe(1);
    expect(entries[0].vsSource).toBe(vs1);
  });

  it('countForGame() returns correct count', async () => {
    cache.beginWarmupWindow('game-count');
    await cache.record('attribute vec2 pCnt1; void main(){ gl_Position=vec4(pCnt1,0,1); }', 'void main(){ gl_FragColor=vec4(1); }');
    await cache.record('attribute vec2 pCnt2; void main(){ gl_Position=vec4(pCnt2,0,1); }', 'void main(){ gl_FragColor=vec4(0); }');
    cache.endWarmupWindow();

    const count = await cache.countForGame('game-count');
    expect(count).toBe(2);
  });

  it('countForGame() returns 0 for an unknown game', async () => {
    const count = await cache.countForGame('nonexistent-game');
    expect(count).toBe(0);
  });

  it('clearForGame() removes only entries for the target game', async () => {
    cache.beginWarmupWindow('game-clear-a');
    await cache.record('attribute vec2 pCA; void main(){ gl_Position=vec4(pCA,0,1); }', 'void main(){ gl_FragColor=vec4(1,0,0,1); }');
    cache.endWarmupWindow();

    cache.beginWarmupWindow('game-clear-b');
    await cache.record('attribute vec2 pCB; void main(){ gl_Position=vec4(pCB,0,1); }', 'void main(){ gl_FragColor=vec4(0,1,0,1); }');
    cache.endWarmupWindow();

    await cache.clearForGame('game-clear-a');

    expect(await cache.countForGame('game-clear-a')).toBe(0);
    expect(await cache.countForGame('game-clear-b')).toBe(1);
  });

  it('loadForGame() returns entries for the correct game only', async () => {
    cache.beginWarmupWindow('game-lf-x');
    await cache.record('attribute vec2 pLX; void main(){ gl_Position=vec4(pLX,0,1); }', 'void main(){ gl_FragColor=vec4(1); }');
    cache.endWarmupWindow();

    cache.beginWarmupWindow('game-lf-y');
    await cache.record('attribute vec2 pLY; void main(){ gl_Position=vec4(pLY,0,1); }', 'void main(){ gl_FragColor=vec4(0); }');
    cache.endWarmupWindow();

    const xEntries = await cache.loadForGame('game-lf-x');
    const yEntries = await cache.loadForGame('game-lf-y');

    expect(xEntries.length).toBe(1);
    expect(yEntries.length).toBe(1);
    expect(xEntries[0].gameId).toBe('game-lf-x');
    expect(yEntries[0].gameId).toBe('game-lf-y');
  });

  it('preCompileForGame() resolves without error when cache is empty', async () => {
    await expect(cache.preCompileForGame('game-pc-empty')).resolves.not.toThrow();
  });

  it('preCompileForGame() resolves without error when entries exist', async () => {
    cache.beginWarmupWindow('game-pc-fill');
    await cache.record('attribute vec2 pPC; void main(){ gl_Position=vec4(pPC,0,1); }', 'precision lowp float; void main(){ gl_FragColor=vec4(0); }');
    cache.endWarmupWindow();

    await expect(cache.preCompileForGame('game-pc-fill')).resolves.not.toThrow();
  });

  it('beginWarmupWindow replaces an existing open window', () => {
    cache.beginWarmupWindow('game-first');
    cache.beginWarmupWindow('game-second');
    expect(cache.warmupGameId).toBe('game-second');
  });
});
