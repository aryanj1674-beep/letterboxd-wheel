const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function run() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('https://letterboxd.com/requim_dreamer/films/', { waitUntil: 'domcontentloaded' });
  
  const posterHTML = await page.evaluate(() => {
     return document.querySelector('.poster-container').outerHTML;
  });
  console.log(posterHTML);
  await browser.close();
}
run();
