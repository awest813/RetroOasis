import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  // Navigate to blank page
  await page.goto('about:blank');

  // Inject the implementation of _checkWebGL2
  await page.evaluate(() => {
    window.baselineCheckWebGL2 = function() {
      const canvas = document.createElement("canvas");
      if (canvas.getContext("webgl2")) return true;
      return false;
    };

    // Cached version
    let cachedWebGL2Result = null;
    window.optimizedCheckWebGL2 = function() {
      if (cachedWebGL2Result !== null) return cachedWebGL2Result;
      const canvas = document.createElement("canvas");
      cachedWebGL2Result = !!canvas.getContext("webgl2");
      return cachedWebGL2Result;
    };
  });

  // Measure baseline
  const baselineStats = await page.evaluate(() => {
    const ITERATIONS = 100;
    const times = [];

    for (let j = 0; j < 5; j++) { // warmup
      window.baselineCheckWebGL2();
    }

    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      window.baselineCheckWebGL2();
      times.push(performance.now() - start);
    }

    const sum = times.reduce((a, b) => a + b, 0);
    return {
      avg: sum / ITERATIONS,
      min: Math.min(...times),
      max: Math.max(...times),
      total: sum
    };
  });

  // Measure optimized
  const optimizedStats = await page.evaluate(() => {
    const ITERATIONS = 100;
    const times = [];

    for (let j = 0; j < 5; j++) { // warmup
      window.optimizedCheckWebGL2();
    }

    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      window.optimizedCheckWebGL2();
      times.push(performance.now() - start);
    }

    const sum = times.reduce((a, b) => a + b, 0);
    return {
      avg: sum / ITERATIONS,
      min: Math.min(...times),
      max: Math.max(...times),
      total: sum
    };
  });

  console.log("=== Baseline ===");
  console.log(`Average time: ${baselineStats.avg.toFixed(3)} ms`);
  console.log(`Min time: ${baselineStats.min.toFixed(3)} ms`);
  console.log(`Max time: ${baselineStats.max.toFixed(3)} ms`);
  console.log(`Total time (100 runs): ${baselineStats.total.toFixed(3)} ms`);

  console.log("\n=== Optimized (Cached) ===");
  console.log(`Average time: ${optimizedStats.avg.toFixed(3)} ms`);
  console.log(`Min time: ${optimizedStats.min.toFixed(3)} ms`);
  console.log(`Max time: ${optimizedStats.max.toFixed(3)} ms`);
  console.log(`Total time (100 runs): ${optimizedStats.total.toFixed(3)} ms`);

  console.log(`\nImprovement: ${((baselineStats.avg - optimizedStats.avg) / baselineStats.avg * 100).toFixed(2)}% faster`);

  await browser.close();
})();
