const fs = require('fs');

global.window = {}; // Polyfill for asm.js
global.postMessage = (msg) => console.log("POST MESSAGE:", msg);
global.close = () => console.log("WORKER CLOSED");
global.onmessage = undefined;

// Emulate Emscripten Worker Env
require('./data/compression/extract7z.js');

const testData = fs.readFileSync('C:/Users/allen/Downloads/New folder/Final Fantasy VII (USA) (Disc 1).7z');

console.log("SENDING DATA...");
if (global.onmessage) {
  global.onmessage({ data: new Uint8Array(testData) });
} else {
  console.log("No onmessage defined!");
}
