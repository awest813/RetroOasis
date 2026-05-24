import { readFileSync } from 'fs';
import { detectArchiveFormat, extractFromArchive } from './src/archive.js';

async function testExtraction(filePath) {
  try {
    console.log(`\nTesting ${filePath}...`);
    const buffer = readFileSync(filePath);
    const blob = new Blob([buffer]);
    console.log(`Size: ${blob.size}`);
    
    const format = await detectArchiveFormat(blob);
    console.log(`Format detected: ${format}`);
    
    const result = await extractFromArchive(blob, {
      onProgress: (p) => console.log(`Progress: ${p.message} ${p.percent || ''}`)
    });
    
    if (result) {
      console.log(`Success! Extracted: ${result.name} (${result.blob.size} bytes)`);
    } else {
      console.log('Result was null (no ROM found).');
    }
  } catch (err) {
    console.error(`Error during extraction:`, err.message);
  }
}

async function run() {
  await testExtraction('C:/Users/allen/Downloads/New folder/Banjo-Kazooie (USA) (Rev 1).zip');
  await testExtraction('C:/Users/allen/Downloads/New folder/Final Fantasy VII (USA) (Disc 1).7z');
}

run();
