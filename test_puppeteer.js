import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));
  page.on('requestfailed', req => console.log('NETWORK FAIL:', req.url()));

  await page.goto('http://localhost:4173/');

  const fileInput = await page.$('input[type=file]');
  console.log('Uploading 7z file...');
  await fileInput.uploadFile('C:/Users/allen/Downloads/New folder/Final Fantasy VII (USA) (Disc 1).7z');

  console.log('Waiting for extraction... (up to 30s)');
  // Wait until we see an error toast or something in the UI
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const html = await page.content();
    if (html.includes('toast-error') || html.includes('Archive entry') || html.includes('Worker')) {
      console.log('Found error in HTML!');
      // Extract the error text
      const errorText = await page.evaluate(() => {
        const errToast = document.querySelector('.toast-error, .toast-message');
        return errToast ? errToast.textContent : null;
      });
      if (errorText) console.log('ERROR TOAST:', errorText);
      break;
    }
  }

  await browser.close();
})();
