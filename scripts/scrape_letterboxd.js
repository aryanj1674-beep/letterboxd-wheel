#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 1000;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
    });
  });
}

async function scrapeList(browser, url) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36');
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

  // Try to load more content by scrolling and clicking any "Load more" links/buttons
  try {
    // Do a few rounds of scroll+wait to trigger lazy loading
    for (let i = 0; i < 8; i++) {
      await autoScroll(page);
      await page.waitForTimeout(800);
      // click potential load more buttons
      const loadMore = await page.$x("//a[contains(text(),'Load more') or contains(text(),'more') or contains(@class,'load-more')]");
      if (loadMore && loadMore.length) {
        try { await loadMore[0].click(); await page.waitForTimeout(800); } catch(e) {}
      }
    }
  } catch (e) {
    // ignore scrolling errors
  }

  // Find all anchors that look like film links
  const items = await page.$$eval('a[href*="/film/"]', anchors => {
    // Map to { title, url }
    const seen = new Set();
    return anchors.map(a => {
      const href = a.href || '';
      // try to obtain a human-friendly title
      let title = a.getAttribute('title') || '';
      if (!title) {
        const img = a.querySelector('img');
        if (img && img.alt) title = img.alt;
      }
      title = title.trim();
      return { title, url: href };
    }).filter(i => i.url && !i.url.includes('/list/') && i.title).filter(i => {
      // dedupe by url
      if (seen.has(i.url)) return false;
      seen.add(i.url);
      return true;
    });
  });

  await page.close();
  return items;
}

function toCSV(rows) {
  return Papa.unparse(rows, { header: true });
}

async function main() {
  const args = process.argv.slice(2);
  if (!args[0]) {
    console.error('Usage: node scripts/scrape_letterboxd.js <username> [--headless=false]');
    process.exit(1);
  }

  const username = args[0].replace(/^@/, '');
  const headlessArg = args.find(a => a.startsWith('--headless='));
  const headless = headlessArg ? headlessArg.split('=')[1] !== 'false' : true;

  const outDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({ headless, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const base = `https://letterboxd.com/${encodeURIComponent(username)}`;
    const watchlistUrl = `${base}/watchlist/`;
    const filmsUrl = `${base}/films/`;

    console.log(`Scraping watchlist from ${watchlistUrl}`);
    const watchlist = await scrapeList(browser, watchlistUrl);
    console.log(`Found ${watchlist.length} watchlist items`);

    console.log(`Scraping watched/films from ${filmsUrl}`);
    const watched = await scrapeList(browser, filmsUrl);
    console.log(`Found ${watched.length} watched items`);

    // Normalize rows to { Name, "Letterboxd URI" }
    const watchlistRows = watchlist.map(i => ({ Name: i.title, 'Letterboxd URI': i.url }));
    const watchedRows = watched.map(i => ({ Name: i.title, 'Letterboxd URI': i.url }));

    fs.writeFileSync(path.join(outDir, 'watchlist.csv'), toCSV(watchlistRows), 'utf8');
    fs.writeFileSync(path.join(outDir, 'watched.csv'), toCSV(watchedRows), 'utf8');

    console.log('Saved CSVs to data/watchlist.csv and data/watched.csv');
  } catch (e) {
    console.error('Scrape failed:', e);
  } finally {
    await browser.close();
  }
}

main();
