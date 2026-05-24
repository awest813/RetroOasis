import fs from 'fs';
import * as fflate from 'fflate';

const zipBuffer = fs.readFileSync('C:/Users/allen/Downloads/New folder/Banjo-Kazooie (USA) (Rev 1).zip');
const unzipped = fflate.unzipSync(new Uint8Array(zipBuffer));

let romBytes = null;
for (const [name, bytes] of Object.entries(unzipped)) {
  if (name.endsWith('.z64')) {
    romBytes = bytes;
    console.log(`Extracted ${name}, size: ${bytes.length}`);
    break;
  }
}

if (!romBytes) {
  console.error("No .z64 found in the zip.");
  process.exit(1);
}

// Compare with a standard unzip
const crypto = require('crypto');
const hash = crypto.createHash('sha256').update(romBytes).digest('hex');
console.log(`SHA256 of extracted ROM: ${hash}`);
