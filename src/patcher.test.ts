import { describe, it, expect } from 'vitest';
import {
  detectPatchFormat,
  applyIPS,
  applyBPS,
  applyUPS,
  applyPatch,
  PATCH_EXTENSIONS,
  type PatchFormat,
} from './patcher';

// ── CRC32 (mirrors the implementation in patcher.ts) ─────────────────────────

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (CRC32_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ── BPS VLQ encoder (reverses the decoder in patcher.ts) ─────────────────────

function encodeBpsVLQ(v: number): number[] {
  const bytes: number[] = [];
  while (true) {
    if (v < 128) {
      bytes.push((v & 0x7f) | 0x80); // terminal byte (bit 7 set)
      break;
    }
    bytes.push(v & 0x7f);            // continuation byte (bit 7 clear)
    v = (v >> 7) - 1;
  }
  return bytes;
}

// ── UPS VLQ encoder (reverses the decoder in patcher.ts) ─────────────────────

function encodeUpsVLQ(v: number): number[] {
  const result: number[] = [];
  while (v >= 128) {
    result.push(v & 0x7f);   // non-terminal byte, bit 7 = 0
    v = (v - 128) >> 7;
  }
  result.push(v | 0x80);     // terminal byte, bit 7 = 1
  return result;
}

// ── Byte-level helpers ────────────────────────────────────────────────────────

function ascii(s: string): number[] {
  return [...s].map(c => c.charCodeAt(0));
}

function uint32LE(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

function uint24BE(v: number): number[] {
  return [(v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
}

function uint16BE(v: number): number[] {
  return [(v >>> 8) & 0xff, v & 0xff];
}

function makeBuffer(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

// ── IPS patch builder ─────────────────────────────────────────────────────────

interface IpsRecord {
  offset: number;
  data?: number[];   // standard record; if absent, RLE record is used
  rleSize?: number;
  rleByte?: number;
}

function buildIPS(records: IpsRecord[], truncLength?: number): ArrayBuffer {
  const bytes: number[] = ascii('PATCH');

  for (const rec of records) {
    bytes.push(...uint24BE(rec.offset));
    if (rec.data !== undefined) {
      // Standard record
      bytes.push(...uint16BE(rec.data.length));
      bytes.push(...rec.data);
    } else {
      // RLE record: size = 0, then rleSize (2 BE) + rleByte (1)
      bytes.push(...uint16BE(0));
      bytes.push(...uint16BE(rec.rleSize!));
      bytes.push(rec.rleByte!);
    }
  }

  bytes.push(...ascii('EOF'));

  if (truncLength !== undefined) {
    bytes.push(...uint24BE(truncLength));
  }

  return makeBuffer(bytes);
}

// ── BPS patch builder ─────────────────────────────────────────────────────────

/**
 * Build a valid BPS patch that applies TargetRead actions to produce `target`
 * from `source` (no delta — writes all target bytes as literals).
 */
function buildBpsTargetRead(source: Uint8Array, target: Uint8Array): ArrayBuffer {
  const bytes: number[] = ascii('BPS1');
  bytes.push(...encodeBpsVLQ(source.length));    // source_size
  bytes.push(...encodeBpsVLQ(target.length));    // target_size
  bytes.push(...encodeBpsVLQ(0));                // metadata_length = 0

  // TargetRead action: action 1, length = target.length
  const actionData = ((target.length - 1) << 2) | 1;
  bytes.push(...encodeBpsVLQ(actionData));
  bytes.push(...target);

  const sourceCRC = crc32(source.slice(0, source.length));
  const targetCRC = crc32(target);

  bytes.push(...uint32LE(sourceCRC));
  bytes.push(...uint32LE(targetCRC));

  // Patch CRC covers everything except itself (the last 4 bytes)
  const patchCRC = crc32(new Uint8Array(bytes));
  bytes.push(...uint32LE(patchCRC));

  return makeBuffer(bytes);
}

// ── UPS patch builder ─────────────────────────────────────────────────────────

/**
 * Build a valid UPS patch that XORs specific positions in `source` to produce `target`.
 * `source` and `target` must have the same length.
 */
function buildUPS(source: Uint8Array, target: Uint8Array): ArrayBuffer {
  if (source.length !== target.length) throw new Error('UPS builder: source and target must be same length');

  const bytes: number[] = ascii('UPS1');
  bytes.push(...encodeUpsVLQ(source.length));  // source_size
  bytes.push(...encodeUpsVLQ(target.length));  // target_size

  // Build XOR hunks: find runs where source and target differ
  let filePos = 0;
  let i = 0;
  while (i < source.length) {
    if (source[i] === target[i]) { i++; continue; }
    // Start of a differing run
    const relOffset = i - filePos;
    bytes.push(...encodeUpsVLQ(relOffset));
    while (i < source.length && source[i] !== target[i]) {
      bytes.push((source[i]! ^ target[i]!) & 0xff);
      i++;
    }
    bytes.push(0); // NUL terminator for the hunk
    filePos = i + 1; // +1 because NUL also advances filePos
  }

  const patchData = new Uint8Array(bytes);

  const sourceCRC = crc32(source);
  const targetCRC = crc32(target);
  const patchCRC  = crc32(patchData);

  bytes.push(...uint32LE(sourceCRC));
  bytes.push(...uint32LE(targetCRC));
  bytes.push(...uint32LE(patchCRC));

  return makeBuffer(bytes);
}

// ── detectPatchFormat ─────────────────────────────────────────────────────────

describe('detectPatchFormat', () => {
  it('detects IPS patches', () => {
    const buf = makeBuffer([...ascii('PATCH'), 0x00, 0x00, 0x00]);
    expect(detectPatchFormat(buf)).toBe<PatchFormat>('ips');
  });

  it('detects BPS patches', () => {
    const buf = makeBuffer([...ascii('BPS1'), 0x00, 0x00, 0x00]);
    expect(detectPatchFormat(buf)).toBe<PatchFormat>('bps');
  });

  it('detects UPS patches', () => {
    const buf = makeBuffer([...ascii('UPS1'), 0x00, 0x00, 0x00]);
    expect(detectPatchFormat(buf)).toBe<PatchFormat>('ups');
  });

  it('returns null for unrecognised magic', () => {
    const buf = makeBuffer([0xde, 0xad, 0xbe, 0xef, 0x00]);
    expect(detectPatchFormat(buf)).toBeNull();
  });

  it('returns null for a buffer that is too small', () => {
    const buf = makeBuffer([0x50, 0x41]);
    expect(detectPatchFormat(buf)).toBeNull();
  });

  it('handles exactly 4-byte buffers correctly', () => {
    const bps = makeBuffer([...ascii('BPS1')]);
    expect(detectPatchFormat(bps)).toBe<PatchFormat>('bps');

    const ups = makeBuffer([...ascii('UPS1')]);
    expect(detectPatchFormat(ups)).toBe<PatchFormat>('ups');

    const unk = makeBuffer([0xde, 0xad, 0xbe, 0xef]);
    expect(detectPatchFormat(unk)).toBeNull();
  });

  it('handles exactly 5-byte buffers (IPS) correctly', () => {
    const ips = makeBuffer([...ascii('PATCH')]);
    expect(detectPatchFormat(ips)).toBe<PatchFormat>('ips');
  });
});

// ── PATCH_EXTENSIONS ──────────────────────────────────────────────────────────

describe('PATCH_EXTENSIONS', () => {
  it('contains "ips", "bps", "ups"', () => {
    expect(PATCH_EXTENSIONS.has('ips')).toBe(true);
    expect(PATCH_EXTENSIONS.has('bps')).toBe(true);
    expect(PATCH_EXTENSIONS.has('ups')).toBe(true);
  });

  it('does not contain ROM extensions', () => {
    expect(PATCH_EXTENSIONS.has('nes')).toBe(false);
    expect(PATCH_EXTENSIONS.has('zip')).toBe(false);
  });
});

// ── applyIPS ─────────────────────────────────────────────────────────────────

describe('applyIPS', () => {
  it('applies a standard record, replacing bytes at the given offset', () => {
    const rom   = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
    const patch = buildIPS([{ offset: 2, data: [0xAA, 0xBB, 0xCC] }]);

    const result = new Uint8Array(applyIPS(rom.buffer, patch));
    expect(result[0]).toBe(0x00);
    expect(result[1]).toBe(0x01);
    expect(result[2]).toBe(0xAA);
    expect(result[3]).toBe(0xBB);
    expect(result[4]).toBe(0xCC);
    expect(result[5]).toBe(0x05);
  });

  it('applies multiple records in order', () => {
    const rom   = new Uint8Array(8);
    const patch = buildIPS([
      { offset: 0, data: [0x01] },
      { offset: 4, data: [0x02, 0x03] },
    ]);

    const result = new Uint8Array(applyIPS(rom.buffer, patch));
    expect(result[0]).toBe(0x01);
    expect(result[4]).toBe(0x02);
    expect(result[5]).toBe(0x03);
  });

  it('applies an RLE record, filling a range with one byte', () => {
    const rom   = new Uint8Array(10);
    const patch = buildIPS([{ offset: 2, rleSize: 5, rleByte: 0xff }]);

    const result = new Uint8Array(applyIPS(rom.buffer, patch));
    expect(result[1]).toBe(0x00);
    for (let i = 2; i < 7; i++) expect(result[i]).toBe(0xff);
    expect(result[7]).toBe(0x00);
  });

  it('can grow the ROM when patching beyond its original length', () => {
    const rom   = new Uint8Array([0x00, 0x01]);
    const patch = buildIPS([{ offset: 4, data: [0xDE, 0xAD] }]);

    const result = new Uint8Array(applyIPS(rom.buffer, patch));
    expect(result.length).toBe(6);
    expect(result[4]).toBe(0xDE);
    expect(result[5]).toBe(0xAD);
  });

  it('respects the optional post-EOF truncation length', () => {
    const rom   = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
    const patch = buildIPS([{ offset: 0, data: [0xFF] }], 3);

    const result = new Uint8Array(applyIPS(rom.buffer, patch));
    expect(result.length).toBe(3);
  });

  it('ignores truncation when truncLen >= ROM length', () => {
    const rom   = new Uint8Array([0x00, 0x01, 0x02]);
    const patch = buildIPS([{ offset: 0, data: [0xFF] }], 10);

    const result = new Uint8Array(applyIPS(rom.buffer, patch));
    expect(result.length).toBe(3);
  });

  it('throws on a missing PATCH header', () => {
    const bad = makeBuffer([...ascii('BADDD'), 0x45, 0x4f, 0x46]);
    expect(() => applyIPS(new ArrayBuffer(4), bad)).toThrow('Invalid IPS patch');
  });

  it('throws when an IPS record is truncated before its size field', () => {
    const bad = makeBuffer([
      ...ascii('PATCH'),
      0x00, 0x00, 0x01, // record offset
      0x00,             // truncated size field (needs 2 bytes)
    ]);
    expect(() => applyIPS(new ArrayBuffer(4), bad)).toThrow('truncated record size');
  });

  it('throws when an IPS record data payload is truncated', () => {
    const bad = makeBuffer([
      ...ascii('PATCH'),
      0x00, 0x00, 0x00, // record offset
      0x00, 0x02,       // record size = 2 bytes
      0xAA,             // only one data byte present
    ]);
    expect(() => applyIPS(new ArrayBuffer(4), bad)).toThrow('truncated record data');
  });

  it('throws when an IPS RLE record is truncated', () => {
    const bad = makeBuffer([
      ...ascii('PATCH'),
      0x00, 0x00, 0x00, // record offset
      0x00, 0x00,       // record size = 0 (RLE)
      0x00, 0x01,       // RLE size, but missing RLE byte
    ]);
    expect(() => applyIPS(new ArrayBuffer(4), bad)).toThrow('truncated RLE record');
  });

  it('throws when an IPS patch is missing the EOF marker', () => {
    const bad = makeBuffer([
      ...ascii('PATCH'),
      0x00, 0x00, 0x00,
      0x00, 0x01,
      0xAA,
      // EOF intentionally omitted
    ]);
    expect(() => applyIPS(new ArrayBuffer(4), bad)).toThrow('missing EOF marker');
  });

  it('leaves bytes outside the patched region unchanged', () => {
    const rom   = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
    const patch = buildIPS([{ offset: 2, data: [0xFF] }]);

    const result = new Uint8Array(applyIPS(rom.buffer, patch));
    expect(result[0]).toBe(0x00);
    expect(result[1]).toBe(0x01);
    expect(result[2]).toBe(0xFF);
    expect(result[3]).toBe(0x03);
    expect(result[4]).toBe(0x04);
  });
});

// ── applyBPS ─────────────────────────────────────────────────────────────────

describe('applyBPS', () => {
  it('applies a simple patch using TargetRead, replacing all bytes', () => {
    const source = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    const target = new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD]);
    const patch  = buildBpsTargetRead(source, target);

    const result = new Uint8Array(applyBPS(source.buffer, patch));
    expect(result).toEqual(target);
  });

  it('produces correct output length from target_size', () => {
    const source = new Uint8Array(8);
    const target = new Uint8Array([0x01, 0x02, 0x03]);
    const patch  = buildBpsTargetRead(source, target);

    const result = new Uint8Array(applyBPS(source.buffer, patch));
    expect(result.length).toBe(3);
  });

  it('handles BPS SourceRead, SourceCopy, and TargetCopy actions correctly', () => {
    // We will build a manual BPS patch that uses all 4 action types.
    // source: "HELLO"
    // target: "HELLO W OR LO W "
    // Let's just use byte arrays.
    const source = new Uint8Array([0x10, 0x20, 0x30, 0x40, 0x50]); // 5 bytes

    // actions:
    // SourceRead 2 bytes -> 0x10, 0x20. (outputPos=2)
    // TargetRead 1 byte -> 0x99. (outputPos=3)
    // SourceCopy 2 bytes, offset +2 -> from source pos 2: 0x30, 0x40. (outputPos=5)
    // TargetCopy 2 bytes, offset -3 -> from target pos 2: 0x99, 0x30. (outputPos=7)
    // target = [0x10, 0x20, 0x99, 0x30, 0x40, 0x99, 0x30]
    const target = new Uint8Array([0x10, 0x20, 0x99, 0x30, 0x40, 0x99, 0x30]);

    const bytes: number[] = ascii('BPS1');
    bytes.push(...encodeBpsVLQ(source.length));
    bytes.push(...encodeBpsVLQ(target.length));
    bytes.push(...encodeBpsVLQ(0)); // meta length 0

    // SourceRead 2: action 0, length 2 -> (1 << 2) | 0 = 4
    bytes.push(...encodeBpsVLQ(4));

    // TargetRead 1: action 1, length 1 -> (0 << 2) | 1 = 1
    bytes.push(...encodeBpsVLQ(1));
    bytes.push(0x99); // literal byte

    // SourceCopy 2: action 2, length 2 -> (1 << 2) | 2 = 6
    bytes.push(...encodeBpsVLQ(6));
    // sourceRelPos was 0. we want to read from 2. So offset is +2.
    // raw offset for +2: 2 << 1 = 4. (positive is even, negative is odd)
    bytes.push(...encodeBpsVLQ(4));
    // after reading 2 bytes, sourceRelPos = 4

    // TargetCopy 2: action 3, length 2 -> (1 << 2) | 3 = 7
    bytes.push(...encodeBpsVLQ(7));
    // targetRelPos was 0. we want to read from outputPos 2. So offset +2.
    bytes.push(...encodeBpsVLQ(4));

    // Add CRCs
    bytes.push(...uint32LE(crc32(source)));
    bytes.push(...uint32LE(crc32(target)));
    const patchCRC = crc32(new Uint8Array(bytes));
    bytes.push(...uint32LE(patchCRC));

    const result = new Uint8Array(applyBPS(source.buffer, makeBuffer(bytes)));
    expect(result).toEqual(target);
  });

  it('throws when target CRC32 does not match', () => {
    const source = new Uint8Array([0x00]);
    const target = new Uint8Array([0x01]);
    const patch  = new Uint8Array(buildBpsTargetRead(source, target));
    // Corrupt the target CRC (last 8 bytes, first 4 of them)
    patch[patch.length - 8] ^= 0xff;
    // Corrupting target CRC invalidates the overall patch CRC, so we must fix patch CRC
    const patchCRC = crc32(patch.slice(0, patch.length - 4));
    const patchCrcBytes = uint32LE(patchCRC);
    patch[patch.length - 4] = patchCrcBytes[0]!;
    patch[patch.length - 3] = patchCrcBytes[1]!;
    patch[patch.length - 2] = patchCrcBytes[2]!;
    patch[patch.length - 1] = patchCrcBytes[3]!;
    expect(() => applyBPS(source.buffer, patch.buffer)).toThrow('target CRC32 mismatch');
  });

  it('throws on a missing BPS1 header', () => {
    const bad = makeBuffer([...ascii('BAD!'), 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(() => applyBPS(new ArrayBuffer(4), bad)).toThrow('Invalid BPS patch');
  });

  it('throws when the patch CRC32 does not match', () => {
    const source = new Uint8Array([0x00]);
    const target = new Uint8Array([0x01]);
    const patch  = new Uint8Array(buildBpsTargetRead(source, target));
    // Corrupt the patch CRC (last 4 bytes)
    patch[patch.length - 1] ^= 0xff;
    expect(() => applyBPS(source.buffer, patch.buffer)).toThrow('patch CRC32 mismatch');
  });

  it('throws when the source CRC32 does not match the provided ROM', () => {
    const source = new Uint8Array([0x00, 0x01]);
    const target = new Uint8Array([0xAA, 0xBB]);
    const patch  = buildBpsTargetRead(source, target);
    // Apply patch to a DIFFERENT source ROM (wrong CRC)
    const wrongSource = new Uint8Array([0xFF, 0xFF]);
    expect(() => applyBPS(wrongSource.buffer, patch)).toThrow('source CRC32 mismatch');
  });

  it('throws when the source ROM is smaller than expected', () => {
    const source = new Uint8Array([0x00, 0x01, 0x02]);
    const target = new Uint8Array([0xAA, 0xBB, 0xCC]);
    const patch  = buildBpsTargetRead(source, target);
    // Apply patch to a smaller ROM
    const smallerSource = new Uint8Array([0x00, 0x01]);
    expect(() => applyBPS(smallerSource.buffer, patch)).toThrow('BPS patch expects a source ROM of 3 bytes but got 2');
  });

  it('throws on a truncated patch where VLQ data is cut off', () => {
    // Build a valid patch, then truncate it so a VLQ read goes past the end
    const source = new Uint8Array([0x00, 0x01]);
    const target = new Uint8Array([0xAA, 0xBB]);
    const full   = new Uint8Array(buildBpsTargetRead(source, target));
    // Truncate after the header ("BPS1") so the first VLQ read fails
    const truncated = full.slice(0, 5).buffer;
    expect(() => applyBPS(source.buffer, truncated)).toThrow();
  });
});

// ── applyUPS ─────────────────────────────────────────────────────────────────

describe('applyUPS', () => {
  it('applies XOR hunks to produce the target ROM', () => {
    const source = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
    const target = new Uint8Array([0xFF, 0x01, 0xF0, 0x03, 0x04]);
    // Only positions 0 and 2 differ
    const patch  = buildUPS(source, target);

    const result = new Uint8Array(applyUPS(source.buffer, patch));
    expect(result).toEqual(target);
  });

  it('leaves identical bytes unchanged', () => {
    const source = new Uint8Array([0x10, 0x20, 0x30]);
    const target = new Uint8Array([0x10, 0x20, 0x30]); // identical
    const patch  = buildUPS(source, target);

    const result = new Uint8Array(applyUPS(source.buffer, patch));
    expect(result).toEqual(target);
  });

  it('throws on a missing UPS1 header', () => {
    const bad = makeBuffer([...ascii('NOPE'), 0x80, 0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(() => applyUPS(new ArrayBuffer(4), bad)).toThrow('Invalid UPS patch');
  });

  it('throws when the source CRC32 does not match the provided ROM', () => {
    const source = new Uint8Array([0x00, 0x01]);
    const target = new Uint8Array([0xFF, 0x01]);
    const patch  = buildUPS(source, target);
    const wrongSource = new Uint8Array([0xAA, 0xBB]);
    expect(() => applyUPS(wrongSource.buffer, patch)).toThrow('source CRC32 mismatch');
  });

  it('handles targetSize < source.length correctly', () => {
    // buildUPS generates XOR hunks matching differences between source and target.
    // If source is 3 bytes and target is 3 bytes, it writes size 3, 3.
    // Let's just change the target size in the patch to 2 and update CRCs.
    const source = new Uint8Array([0x00, 0x01, 0x02]);
    const paddedTarget = new Uint8Array([0xFF, 0x01, 0x02]);
    const patch = new Uint8Array(buildUPS(source, paddedTarget));

    // offset 0..3 = "UPS1"
    // offset 4 = source size (3)
    // offset 5 = target size (3). Change to 2.
    // In UPS VLQ, values < 128 are encoded as `v | 0x80`.
    // So 3 is 0x83. 2 is 0x82.
    patch[5] = 0x82;

    const outTarget = new Uint8Array([0xFF, 0x01]);
    const targetCRC = crc32(outTarget);

    // uint32LE returns a number[], we need to set it to Uint8Array
    const crcBytes = uint32LE(targetCRC);
    patch[patch.length - 8] = crcBytes[0]!;
    patch[patch.length - 7] = crcBytes[1]!;
    patch[patch.length - 6] = crcBytes[2]!;
    patch[patch.length - 5] = crcBytes[3]!;

    const patchCRC = crc32(patch.slice(0, patch.length - 4));
    const patchCrcBytes = uint32LE(patchCRC);
    patch[patch.length - 4] = patchCrcBytes[0]!;
    patch[patch.length - 3] = patchCrcBytes[1]!;
    patch[patch.length - 2] = patchCrcBytes[2]!;
    patch[patch.length - 1] = patchCrcBytes[3]!;

    const result = new Uint8Array(applyUPS(source.buffer, patch.buffer));
    expect(result.length).toBe(2);
    expect(result).toEqual(outTarget);
  });

  it('throws when target CRC32 mismatch occurs (corrupt output)', () => {
    const source = new Uint8Array([0x00, 0x01]);
    const target = new Uint8Array([0xFF, 0x01]);
    const patch  = new Uint8Array(buildUPS(source, target));
    // Corrupt the target CRC (last 8 bytes, first 4 of them)
    patch[patch.length - 8] ^= 0xff;
    expect(() => applyUPS(source.buffer, patch.buffer)).toThrow('target CRC32 mismatch');
  });

  it('throws on a truncated patch where VLQ data is cut off', () => {
    // Build a valid UPS patch, then truncate it so VLQ reading hits end-of-buffer
    const source = new Uint8Array([0x00, 0x01]);
    const target = new Uint8Array([0xFF, 0x01]);
    const full   = new Uint8Array(buildUPS(source, target));
    // Truncate after the header ("UPS1") so the first VLQ read fails
    const truncated = full.slice(0, 5).buffer;
    expect(() => applyUPS(source.buffer, truncated)).toThrow();
  });
});

// ── applyPatch ────────────────────────────────────────────────────────────────

describe('applyPatch', () => {
  it('dispatches to applyIPS for IPS patches', () => {
    const rom   = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    const patch = buildIPS([{ offset: 0, data: [0xAA] }]);

    const result = new Uint8Array(applyPatch(rom.buffer, patch));
    expect(result[0]).toBe(0xAA);
  });

  it('dispatches to applyBPS for BPS patches', () => {
    const source = new Uint8Array([0x00, 0x01]);
    const target = new Uint8Array([0xBB, 0xCC]);
    const patch  = buildBpsTargetRead(source, target);

    const result = new Uint8Array(applyPatch(source.buffer, patch));
    expect(result).toEqual(target);
  });

  it('dispatches to applyUPS for UPS patches', () => {
    const source = new Uint8Array([0x00, 0xFF]);
    const target = new Uint8Array([0xFF, 0x00]);
    const patch  = buildUPS(source, target);

    const result = new Uint8Array(applyPatch(source.buffer, patch));
    expect(result).toEqual(target);
  });

  it('throws for an unrecognised patch format', () => {
    const junk = makeBuffer([0xde, 0xad, 0xbe, 0xef, 0x00]);
    expect(() => applyPatch(new ArrayBuffer(4), junk)).toThrow('Unrecognised patch format');
  });
});

// ── VLQ round-trip sanity checks ──────────────────────────────────────────────

describe('BPS VLQ encoder round-trip', () => {
  const cases = [0, 1, 127, 128, 255, 256, 1000, 16383];
  for (const v of cases) {
    it(`encodes and decodes ${v} correctly via a BPS patch`, () => {
      // Verify indirectly by creating a BPS patch whose target length equals v+1
      // and checking the decoded size matches
      if (v === 0) {
        // Special: target of length 1 → TargetRead 1 byte
        const source = new Uint8Array(1);
        const target = new Uint8Array([0xAA]);
        const patch  = buildBpsTargetRead(source, target);
        const result = new Uint8Array(applyBPS(source.buffer, patch));
        expect(result.length).toBe(1);
      } else {
        const source = new Uint8Array(v);
        const target = new Uint8Array(v).fill(0xAB);
        const patch  = buildBpsTargetRead(source, target);
        const result = new Uint8Array(applyBPS(source.buffer, patch));
        expect(result.length).toBe(v);
        expect(result[0]).toBe(0xAB);
      }
    });
  }
});

describe('UPS VLQ encoder round-trip', () => {
  const cases = [0, 1, 127, 128, 255, 256];
  for (const offset of cases) {
    it(`encodes relative offset ${offset} correctly via a UPS patch`, () => {
      // Build a source+target pair where only a single byte at `offset` differs
      const len    = offset + 1;
      const source = new Uint8Array(len).fill(0x00);
      const target = new Uint8Array(source);
      target[offset] = 0xFF;

      const patch  = buildUPS(source, target);
      const result = new Uint8Array(applyUPS(source.buffer, patch));
      expect(result[offset]).toBe(0xFF);
      for (let i = 0; i < offset; i++) expect(result[i]).toBe(0x00);
    });
  }
});
