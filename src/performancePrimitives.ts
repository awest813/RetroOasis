/**
 * performancePrimitives.ts — Object pools, spatial grids, frame budgets, and
 * asset loaders used by unit tests and future engine/UI subsystems.
 *
 * Kept out of the main bundle: production code imports `performance.ts` only.
 */

// ── Object pool ───────────────────────────────────────────────────────────────

/**
 * Generic object pool that eliminates per-frame heap allocations for
 * frequently-created short-lived objects (vectors, draw commands, events, etc.).
 *
 * The pool pre-allocates up to `maxSize` instances via a factory function.
 * `acquire()` returns a recycled instance (resetting it with the optional
 * `reset` callback) or creates a new one when the pool is empty.
 * `release()` returns an instance back to the pool; it is silently dropped
 * when the pool is already full to prevent unbounded memory growth.
 *
 * Zero GC pressure during normal gameplay: no Array.push/pop allocations, no
 * garbage generated while the pool is neither empty nor overflowed.
 *
 * Usage:
 * ```typescript
 * interface Vec2 { x: number; y: number }
 * const pool = new ObjectPool<Vec2>(
 *   () => ({ x: 0, y: 0 }),                    // factory
 *   (v, x, y) => { v.x = x; v.y = y; },       // reset
 *   256,                                        // maxSize
 * );
 * const v = pool.acquire(3, 4);
 * // … use v …
 * pool.release(v);
 * ```
 */
export class ObjectPool<T, A extends unknown[] = []> {
  private readonly _pool: T[] = [];
  private readonly _factory: () => T;
  private readonly _reset?: (obj: T, ...args: A) => void;
  private readonly _maxSize: number;

  /** Total number of objects currently held in the pool. */
  get size(): number { return this._pool.length; }

  /**
   * @param factory  Creates a new instance when the pool is empty.
   * @param reset    Optional function called on recycled instances before
   *                 they are returned from `acquire()`.
   * @param maxSize  Maximum pool capacity (excess releases are discarded).
   *                 Default: 128.
   */
  constructor(factory: () => T, reset?: (obj: T, ...args: A) => void, maxSize = 128) {
    this._factory = factory;
    this._reset   = reset;
    this._maxSize = maxSize;
  }

  /**
   * Acquire an object from the pool, or create a fresh one when empty.
   *
   * @param args  Passed directly to the `reset` callback so callers can
   *              initialise the recycled object in a single call.
   */
  acquire(...args: A): T {
    const obj = this._pool.length > 0
      ? this._pool.pop()!
      : this._factory();
    this._reset?.(obj, ...args);
    return obj;
  }

  /**
   * Return an object to the pool for future reuse.
   * Objects are silently discarded when the pool is at capacity.
   */
  release(obj: T): void {
    if (this._pool.length < this._maxSize) {
      this._pool.push(obj);
    }
  }

  /** Pre-fill the pool with `count` fresh instances (optional warm-up). */
  prewarm(count: number): void {
    const needed = Math.min(count, this._maxSize) - this._pool.length;
    for (let i = 0; i < needed; i++) {
      this._pool.push(this._factory());
    }
  }

  /** Drain all pooled objects (e.g. on scene teardown). */
  clear(): void {
    this._pool.length = 0;
  }
}

// ── Spatial grid ──────────────────────────────────────────────────────────────

/**
 * Fixed-cell uniform spatial grid for O(1) insertion/removal and
 * O(k) nearest-cell queries, where k is the average objects-per-cell.
 *
 * Intended for entity/physics broad-phase: instead of checking every
 * entity against every other entity (O(n²)), only entities in
 * neighbouring cells are compared (typically O(1)–O(n) in practice).
 *
 * The grid covers [0, worldWidth) × [0, worldHeight) in world-space units.
 * Objects outside this range are clamped to the boundary cell.
 *
 * Usage:
 * ```typescript
 * const grid = new SpatialGrid<Entity>(1000, 1000, 64); // 64×64 cells
 * grid.insert(entity, entity.x, entity.y);
 * const nearby = grid.query(x - 64, y - 64, x + 64, y + 64);
 * grid.remove(entity, entity.x, entity.y);
 * ```
 */
export class SpatialGrid<T> {
  private readonly _cols: number;
  private readonly _rows: number;
  private readonly _cellSize: number;
  private readonly _cells: Set<T>[];

  /** Number of columns in the grid. */
  get cols(): number { return this._cols; }
  /** Number of rows in the grid. */
  get rows(): number { return this._rows; }
  /** Cell size in world-space units. */
  get cellSize(): number { return this._cellSize; }

  /**
   * @param worldWidth   Total width of the simulated world in world-space units.
   * @param worldHeight  Total height of the simulated world in world-space units.
   * @param cellSize     Width/height of each cell in world-space units.
   *                     Smaller cells = fewer candidates per query, but more
   *                     memory. A good starting point is ~2× the largest entity.
   */
  constructor(worldWidth: number, worldHeight: number, cellSize: number) {
    if (cellSize <= 0) throw new RangeError("SpatialGrid: cellSize must be > 0");
    this._cellSize = cellSize;
    this._cols = Math.max(1, Math.ceil(worldWidth  / cellSize));
    this._rows = Math.max(1, Math.ceil(worldHeight / cellSize));
    this._cells = Array.from({ length: this._cols * this._rows }, () => new Set<T>());
  }

  private _cellIndex(x: number, y: number): number {
    const col = Math.min(Math.max(0, Math.floor(x / this._cellSize)), this._cols - 1);
    const row = Math.min(Math.max(0, Math.floor(y / this._cellSize)), this._rows - 1);
    return row * this._cols + col;
  }

  /** Insert an object at the given world-space position. */
  insert(obj: T, x: number, y: number): void {
    this._cells[this._cellIndex(x, y)]!.add(obj);
  }

  /**
   * Remove an object from the cell it was inserted into.
   *
   * The caller must supply the same (x, y) used during `insert`.
   * If the object has moved, call `move()` instead.
   */
  remove(obj: T, x: number, y: number): void {
    this._cells[this._cellIndex(x, y)]!.delete(obj);
  }

  /**
   * Move an object from its old position to a new one in a single call.
   * Equivalent to `remove(obj, oldX, oldY); insert(obj, newX, newY)` but
   * skips the Set operations when the cell has not changed (common case for
   * slowly-moving entities in a coarse grid).
   */
  move(obj: T, oldX: number, oldY: number, newX: number, newY: number): void {
    const oldIdx = this._cellIndex(oldX, oldY);
    const newIdx = this._cellIndex(newX, newY);
    if (oldIdx !== newIdx) {
      this._cells[oldIdx]!.delete(obj);
      this._cells[newIdx]!.add(obj);
    }
  }

  /**
   * Return all objects whose insertion point falls within the axis-aligned
   * bounding box [minX, maxX] × [minY, maxY].
   *
   * Returns a new `Set<T>` containing the candidates. The set may include
   * objects that are slightly outside the query box when they lie in a
   * partially-overlapping cell — callers should perform a precise AABB check
   * on the returned candidates if exact containment is required.
   */
  query(minX: number, minY: number, maxX: number, maxY: number): Set<T> {
    const result = new Set<T>();
    const colMin = Math.min(Math.max(0, Math.floor(minX / this._cellSize)), this._cols - 1);
    const colMax = Math.min(Math.max(0, Math.floor(maxX / this._cellSize)), this._cols - 1);
    const rowMin = Math.min(Math.max(0, Math.floor(minY / this._cellSize)), this._rows - 1);
    const rowMax = Math.min(Math.max(0, Math.floor(maxY / this._cellSize)), this._rows - 1);
    for (let r = rowMin; r <= rowMax; r++) {
      for (let c = colMin; c <= colMax; c++) {
        for (const obj of this._cells[r * this._cols + c]!) {
          result.add(obj);
        }
      }
    }
    return result;
  }

  /** Remove all objects from every cell. */
  clear(): void {
    for (const cell of this._cells) cell.clear();
  }
}

// ── Frame budget ──────────────────────────────────────────────────────────────

/**
 * Frame-time budget tracker for real-time engines.
 *
 * Divides each frame into a fixed time quota (default: 16 ms for 60 fps).
 * Work items queued with `enqueue()` are executed sequentially in FIFO order
 * during `flush()`. `flush()` stops consuming items the moment the elapsed
 * time since `beginFrame()` exceeds the budget, deferring remaining work to
 * the next frame. This prevents frame spikes caused by bursty workloads
 * (e.g. streaming asset decoding, pathfinding updates, AI evaluation).
 *
 * Usage:
 * ```typescript
 * const budget = new FrameBudget(14); // 14 ms budget per frame
 *
 * // Each rAF tick:
 * budget.beginFrame();
 * budget.enqueue(() => updateAI());
 * budget.enqueue(() => processPhysics());
 * budget.flush();  // stops at 14 ms; leftover work runs next frame
 * ```
 */
export class FrameBudget {
  private _queue: (() => void)[] = [];
  private _frameStart = 0;
  private readonly _budgetMs: number;

  /** Number of work items currently waiting in the queue. */
  get pendingCount(): number { return this._queue.length; }

  /**
   * @param budgetMs  Maximum milliseconds of deferred work to execute per
   *                  frame. Default: 16 ms (one 60 fps frame).
   */
  constructor(budgetMs = 16) {
    this._budgetMs = budgetMs;
  }

  /**
   * Mark the start of a new frame.
   *
   * Call this once at the beginning of each `requestAnimationFrame` callback,
   * before enqueuing or flushing work items.
   */
  beginFrame(): void {
    this._frameStart = performance.now();
  }

  /**
   * Elapsed milliseconds since `beginFrame()` was last called.
   * Returns 0 when `beginFrame()` has not yet been called.
   */
  elapsed(): number {
    return this._frameStart === 0 ? 0 : performance.now() - this._frameStart;
  }

  /** Returns true when the per-frame budget has been consumed. */
  isOverBudget(): boolean {
    return this.elapsed() >= this._budgetMs;
  }

  /**
   * Enqueue a unit of deferred work to be executed during `flush()`.
   *
   * @param task  A zero-argument function to run within the frame budget.
   */
  enqueue(task: () => void): void {
    this._queue.push(task);
  }

  /**
   * Execute queued tasks until the frame budget is exhausted or the queue
   * is empty. Remaining tasks are carried over to the next frame.
   *
   * Uses an index cursor instead of `shift()` so the underlying array is
   * only spliced once at the end, making the inner loop O(1) per task
   * rather than O(n).
   *
   * @returns The number of tasks executed this call.
   */
  flush(): number {
    let i = 0;
    while (i < this._queue.length && !this.isOverBudget()) {
      this._queue[i++]!();
    }
    if (i > 0) {
      this._queue.splice(0, i);
    }
    return i;
  }

  /** Discard all queued tasks (e.g. on scene change or teardown). */
  clear(): void {
    this._queue.length = 0;
  }
}

// ── Draw call batcher ─────────────────────────────────────────────────────────

/**
 * Describes a single WebGL draw call to be batched.
 */
export interface DrawCommand {
  /** WebGL draw mode (e.g. `gl.TRIANGLES`). */
  mode: number;
  /** Number of vertices to draw. */
  count: number;
  /** Byte offset into the index buffer, or 0 for non-indexed draws. */
  offset: number;
  /** Texture unit index to bind before drawing (0–15). */
  textureUnit: number;
  /**
   * Opaque handle identifying the shader program. Commands with the same
   * `programId` are grouped together to minimise program switches.
   */
  programId: number;
}

/**
 * Lightweight CPU-side draw call batcher.
 *
 * Accumulates `DrawCommand` descriptors during a frame and sorts them before
 * dispatch to minimise expensive GPU state changes:
 *   1. By `programId` — avoids shader program switches (most expensive).
 *   2. By `textureUnit` — reduces texture-bind overhead.
 *   3. By `offset` — improves index-buffer locality.
 *
 * Commands are stored in a pre-allocated ring buffer (`maxCommands`) to
 * avoid per-frame heap allocations. `ObjectPool` is used internally to
 * recycle `DrawCommand` objects.
 *
 * Usage:
 * ```typescript
 * const batcher = new DrawCallBatcher(1024);
 * // During scene traversal:
 * batcher.add(gl.TRIANGLES, 36, 0, 0, shaderA.id);
 * batcher.add(gl.TRIANGLES, 12, 36, 1, shaderB.id);
 * // At the end of the frame:
 * for (const cmd of batcher.flush()) {
 *   gl.useProgram(programs[cmd.programId]);
 *   gl.bindTexture(gl.TEXTURE_2D, textures[cmd.textureUnit]);
 *   gl.drawElements(cmd.mode, cmd.count, gl.UNSIGNED_SHORT, cmd.offset);
 * }
 * ```
 */
export class DrawCallBatcher {
  private readonly _pool: ObjectPool<DrawCommand, [number, number, number, number, number]>;
  private _pending: DrawCommand[] = [];
  /**
   * Commands returned by the previous `flush()` that are safe to recycle
   * once the caller has had a full frame to consume them. Recycling is
   * deferred to the *start* of the next `flush()` call so that callers can
   * safely iterate the returned array without risking pool reuse corruption.
   */
  private _toRecycle: DrawCommand[] = [];
  private readonly _maxCommands: number;

  /** Number of draw commands accumulated since the last `flush()`. */
  get pendingCount(): number { return this._pending.length; }

  /**
   * @param maxCommands  Maximum draw commands per frame before older ones are
   *                     silently dropped. Default: 1024.
   */
  constructor(maxCommands = 1024) {
    this._maxCommands = maxCommands;
    this._pool = new ObjectPool<DrawCommand, [number, number, number, number, number]>(
      () => ({ mode: 0, count: 0, offset: 0, textureUnit: 0, programId: 0 }),
      (cmd, mode, count, offset, textureUnit, programId) => {
        cmd.mode        = mode;
        cmd.count       = count;
        cmd.offset      = offset;
        cmd.textureUnit = textureUnit;
        cmd.programId   = programId;
      },
      maxCommands,
    );
  }

  /**
   * Record a draw command to be dispatched during the next `flush()`.
   *
   * @param mode        WebGL primitive mode (e.g. `gl.TRIANGLES = 4`).
   * @param count       Number of vertices/indices to draw.
   * @param offset      Byte offset into the index/vertex buffer.
   * @param textureUnit Texture unit index (0–15).
   * @param programId   Opaque shader program identifier for state sorting.
   */
  add(mode: number, count: number, offset: number, textureUnit: number, programId: number): void {
    if (this._pending.length >= this._maxCommands) return;
    this._pending.push(this._pool.acquire(mode, count, offset, textureUnit, programId));
  }

  /**
   * Sort pending commands to minimise GPU state changes and return them.
   *
   * Command objects from the *previous* `flush()` are recycled at the start
   * of this call, after the caller has had a full frame to consume them.
   * This means callers may safely iterate the returned array until the next
   * `flush()` without risk of pool-reuse corruption.
   *
   * Sort order: programId → textureUnit → offset.
   *
   * @returns The sorted array of pending draw commands.
   */
  flush(): DrawCommand[] {
    // Recycle commands dispatched in the previous frame now that the caller
    // has had a full frame cycle to consume them.
    for (const cmd of this._toRecycle) {
      this._pool.release(cmd);
    }
    this._pending.sort((a, b) =>
      a.programId   !== b.programId   ? a.programId   - b.programId   :
      a.textureUnit !== b.textureUnit ? a.textureUnit - b.textureUnit :
      a.offset      - b.offset
    );
    this._toRecycle = this._pending;
    this._pending = [];
    return this._toRecycle;
  }

  /** Discard all pending commands without executing them. */
  clear(): void {
    for (const cmd of this._toRecycle) {
      this._pool.release(cmd);
    }
    this._toRecycle = [];
    for (const cmd of this._pending) {
      this._pool.release(cmd);
    }
    this._pending = [];
  }
}
// ── Asset loader ──────────────────────────────────────────────────────────────

/** Priority levels for {@link AssetLoader} requests. Lower number = higher priority. */
export type AssetPriority = 0 | 1 | 2 | 3;

/** A pending or in-flight asset load request. */
interface AssetRequest<T> {
  key: string;
  priority: AssetPriority;
  load: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

/**
 * Priority-queue asset loader that limits the number of concurrent loads to
 * prevent network/decode saturation on low-end devices.
 *
 * Assets are requested with a priority (0 = critical, 3 = background) and
 * the loader dispatches at most `concurrency` loads simultaneously. When a
 * slot opens, the highest-priority pending request is started next.
 *
 * Already-loaded assets are returned from an in-memory cache, eliminating
 * redundant decoding for assets used by multiple entities in the same scene.
 *
 * ### Techniques
 * - **Priority queue**: O(1) enqueue, O(n) dequeue (n is typically small).
 * - **In-memory cache**: duplicate requests complete instantly without
 *   touching the network or disk.
 * - **Concurrency cap**: prevents frame spikes caused by simultaneous
 *   large-asset decodes.
 *
 * ### Usage
 * ```typescript
 * const loader = new AssetLoader(4);
 * const tex = await loader.load('hero-sprite', 0, () => fetchTexture('hero.png'));
 * ```
 */
export class AssetLoader<T> {
  private readonly _cache   = new Map<string, T>();
  private readonly _pending: AssetRequest<T>[] = [];
  private _inFlight = 0;
  private readonly _concurrency: number;

  /** Number of assets currently loading. */
  get inFlight(): number { return this._inFlight; }
  /** Number of requests waiting to start. */
  get pendingCount(): number { return this._pending.length; }

  /**
   * @param concurrency  Maximum simultaneous in-flight loads. Default: 4.
   */
  constructor(concurrency = 4) {
    this._concurrency = Math.max(1, concurrency);
  }

  /**
   * Request an asset load.
   *
   * If the asset is already cached the promise resolves synchronously on the
   * next microtask. If an identical key is already loading, a second request
   * is queued normally — callers should deduplicate by checking `has()` first
   * if strict deduplication beyond the cache is needed.
   *
   * @param key       Unique identifier for the asset (used as cache key).
   * @param priority  Load priority. 0 = highest, 3 = lowest.
   * @param load      Async factory that fetches/decodes the asset.
   */
  load(key: string, priority: AssetPriority, load: () => Promise<T>): Promise<T> {
    const cached = this._cache.get(key);
    if (cached !== undefined) return Promise.resolve(cached);

    return new Promise<T>((resolve, reject) => {
      this._pending.push({ key, priority, load, resolve, reject });
      this._drain();
    });
  }

  /** Return `true` if the asset is already in the cache. */
  has(key: string): boolean {
    return this._cache.has(key);
  }

  /** Retrieve a cached asset synchronously, or `undefined` if not loaded. */
  get(key: string): T | undefined {
    return this._cache.get(key);
  }

  /** Evict a single asset from the cache. */
  evict(key: string): void {
    this._cache.delete(key);
  }

  /** Evict all cached assets (e.g. on scene teardown). */
  clearCache(): void {
    this._cache.clear();
  }

  private _drain(): void {
    while (this._inFlight < this._concurrency && this._pending.length > 0) {
      // Pop the highest-priority (lowest priority number) request.
      let bestIdx = 0;
      for (let i = 1; i < this._pending.length; i++) {
        if (this._pending[i]!.priority < this._pending[bestIdx]!.priority) {
          bestIdx = i;
        }
      }
      const req = this._pending.splice(bestIdx, 1)[0]!;
      this._inFlight++;
      req.load().then(
        (value) => {
          this._cache.set(req.key, value);
          req.resolve(value);
          this._inFlight--;
          this._drain();
        },
        (err) => {
          req.reject(err);
          this._inFlight--;
          this._drain();
        },
      );
    }
  }
}
