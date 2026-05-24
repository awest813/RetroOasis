import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));
  page.on('requestfailed', request => {
    console.log('BROWSER NETWORK FAIL:', request.url(), request.failure().errorText);
  });

  await page.goto('http://localhost:4173/test_browser.html');
  await browser.close();
})();
