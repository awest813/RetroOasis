import puppeteer from 'puppeteer';
import { setTimeout } from 'timers/promises';

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  await page.goto('http://localhost:4173/');

  const fileInput = await page.$('input[type=file]');
  await fileInput.uploadFile('C:/Users/allen/Downloads/New folder/Final Fantasy VII (USA) (Disc 1).7z');

  for (let i = 0; i < 6; i++) {
    await setTimeout(5000);
    await page.screenshot({ path: `screenshot_${i}.png` });
    console.log(`Saved screenshot_${i}.png`);
  }

  await browser.close();
})();
