import { readFileSync } from 'node:fs';

try {
  const data = readFileSync('public/cores/flycast-wasm.data');
  console.log('Read flycast-wasm.data, size:', data.length, 'bytes');
  
  const hex = Array.from(data.slice(0, 32))
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
  const ascii = Array.from(data.slice(0, 32))
    .map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.')
    .join('');
    
  console.log('First 32 bytes (Hex):', hex);
  console.log('First 32 bytes (ASCII):', ascii);
} catch (err) {
  console.error('Error:', err);
}
