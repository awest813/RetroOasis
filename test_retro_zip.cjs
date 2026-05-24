import fs from 'fs';
import * as fflate from 'fflate';

function readUint16LE(view, offset) {
  return view.getUint16(offset, true);
}
function readUint32LE(view, offset) {
  return view.getUint32(offset, true);
}

const buffer = fs.readFileSync('C:/Users/allen/Downloads/New folder/Banjo-Kazooie (USA) (Rev 1).zip').buffer;
const bytes = new Uint8Array(buffer);
const view = new DataView(buffer);

// Find EOCD
let eocdOffset = -1;
for (let i = bytes.length - 22; i >= 0; i--) {
  if (readUint32LE(view, i) === 0x06054b50) {
    eocdOffset = i;
    break;
  }
}

let centralDirSize = readUint32LE(view, eocdOffset + 12);
let centralDirOffset = readUint32LE(view, eocdOffset + 16);

// Find Central Dir entries
let offset = centralDirOffset;
let romEntry = null;

for (let i = 0; offset < centralDirOffset + centralDirSize; i++) {
  if (readUint32LE(view, offset) !== 0x02014b50) break;
  
  const compressionMethod = readUint16LE(view, offset + 10);
  const compressedSize = readUint32LE(view, offset + 20);
  const uncompressedSize = readUint32LE(view, offset + 24);
  const nameLen = readUint16LE(view, offset + 28);
  const extraLen = readUint16LE(view, offset + 30);
  const commentLen = readUint16LE(view, offset + 32);
  const localHeaderOffset = readUint32LE(view, offset + 42);
  
  const nameBytes = new Uint8Array(buffer, offset + 46, nameLen);
  const name = new TextDecoder().decode(nameBytes);
  
  if (name.endsWith('.z64')) {
    romEntry = { compressionMethod, compressedSize, uncompressedSize, localHeaderOffset, name };
    break;
  }
  offset += 46 + nameLen + extraLen + commentLen;
}

if (!romEntry) {
  console.log("No .z64 found");
  process.exit(1);
}

const fileOffset = romEntry.localHeaderOffset;
const lhNameLen = readUint16LE(view, fileOffset + 26);
const lhExtraLen = readUint16LE(view, fileOffset + 28);
const dataOffset = fileOffset + 30 + lhNameLen + lhExtraLen;

const compressedData = bytes.subarray(dataOffset, dataOffset + romEntry.compressedSize);
let decompressed;

if (romEntry.compressionMethod === 0) {
  decompressed = new Uint8Array(compressedData);
} else if (romEntry.compressionMethod === 8) {
  decompressed = fflate.inflateSync(compressedData);
}

const crypto = require('crypto');
const hash = crypto.createHash('sha256').update(decompressed).digest('hex');
console.log(`Extracted size: ${decompressed.length}`);
console.log(`Expected size: ${romEntry.uncompressedSize}`);
console.log(`SHA256: ${hash}`);
