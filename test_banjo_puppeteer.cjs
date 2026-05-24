import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  
  await page.goto('http://localhost:5173');
  
  // Wait for the app to load
  await page.waitForSelector('input[type=file]', { timeout: 10000 });
  
  // Upload Banjo ZIP
  console.log('Uploading Banjo ZIP...');
  const fileInput = await page.$('input[type=file]');
  await fileInput.uploadFile('C:/Users/allen/Downloads/New folder/Banjo-Kazooie (USA) (Rev 1).zip');
  await page.evaluate(() => {
    const el = document.querySelector('input[type=file]');
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  
  // Wait for 30 seconds to observe the boot process
  console.log('Waiting for boot...');
  await new Promise(r => setTimeout(r, 30000));
  
  console.log('Taking screenshot...');
  await page.screenshot({ path: 'banjo_boot.png' });
  
  await browser.close();
})();
