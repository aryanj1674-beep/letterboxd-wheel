#!/usr/bin/env ts-node
import fs from 'fs/promises';
import path from 'path';
import Papa from 'papaparse';

// Use require for puppeteer-extra to avoid ESM pitfalls in some setups
const puppeteer: any = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

type ScrapeResult = { title: string; url: string; slug: string };

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

function slugifyTitle(title: string) {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function canonicalizeUrl(u: string) {
  try {
    const url = new URL(u);
    url.search = '';
    url.hash = '';
    let p = url.pathname.replace(/\/+$|^\/+/, '');
    return `${url.protocol}//${url.host}/${p}`.replace(/\/+$/, '');
  } catch (e) {
    return u;
  }
}

async function extractFilmsFromPage(page: any) {
  // Run multiple strategies to be resilient to markup changes
  const items: ScrapeResult[] = await page.evaluate(() => {
    const results: { title: string; url: string }[] = [];
    const seen = new Set<string>();

    function pushIfValid(title: string, url: string) {
      if (!url || !title) return;
      url = url.split('?')[0].split('#')[0];
      if (seen.has(url)) return;
      seen.add(url);
      results.push({ title: title.trim(), url });
    }

    // Strategy A: common poster/list item anchors
    const selectors = [
      'li.poster a',
      'article .poster a',
      'a[class*="poster"]',
      'a[href*="/film/"]'
    ];

    for (const sel of selectors) {
      try {
        const anchors = Array.from(document.querySelectorAll(sel));
        for (const a of anchors as Element[]) {
          const href = (a as HTMLAnchorElement).href || (a as any).getAttribute('href') || '';
          let title = (a as HTMLAnchorElement).getAttribute('title') || '';
          if (!title) {
            const img = a.querySelector('img');
            if (img && (img as HTMLImageElement).alt) title = (img as HTMLImageElement).alt;
          }
          // fallback: look for caption text nearby
          if (!title) {
            const caption = a.querySelector('.film-title') || a.querySelector('.name');
            if (caption && caption.textContent) title = caption.textContent;
          }
          if (!title) {
            // try sibling text nodes
            const txt = a.textContent || '';
            if (txt && txt.length < 80) title = txt;
          }

          if (href && title) pushIfValid(title, href);
        }
      } catch (e) {
        // continue
      }
    }

    // As a last resort, try to find images linking to films
    try {
      const imgs = Array.from(document.querySelectorAll('img'));
      for (const img of imgs as HTMLImageElement[]) {
        const parent = img.closest('a');
        if (!parent) continue;
        const href = (parent as HTMLAnchorElement).href || '';
        const alt = img.alt || '';
        if (href.includes('/film/') && alt) pushIfValid(alt, href);
      }
    } catch (e) {}

    return results;
  });

  // Normalize and dedupe
  const out: ScrapeResult[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const url = (it.url || '').replace(/\?.*$/, '').replace(/#.*$/, '').replace(/\/+$/, '');
    if (!url || seen.has(url)) continue;
    seen.add(url);
    let slug = '';
    try {
      if (url.includes('/film/')) {
        const parts = url.split('/').filter(Boolean);
        slug = parts[parts.indexOf('film') + 1] || '';
      }
    } catch (e) {}
    if (!slug) slug = slugifyTitle(it.title || '');
    out.push({ title: it.title, url, slug });
  }

  return out;
}

interface CLIOptions {
  headless: boolean;
  dryRun: boolean;
  concurrency: number;
  throttle: number;
}

async function scrapeUser(browser: any, username: string, opts: CLIOptions) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36');
  const base = `https://letterboxd.com/${encodeURIComponent(username)}`;
  const watchlistUrl = `${base}/watchlist/`;
  const filmsUrl = `${base}/films/`;

  const results: { watchlist: ScrapeResult[]; watched: ScrapeResult[] } = { watchlist: [], watched: [] };

  try {
    // Visit watchlist
    await page.goto(watchlistUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    // Scroll and wait with throttle
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await sleep(opts.throttle);
    }
    results.watchlist = await extractFilmsFromPage(page);

    // Visit films (watched)
    await page.goto(filmsUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await sleep(opts.throttle);
    }
    results.watched = await extractFilmsFromPage(page);
  } catch (e) {
    console.warn(`Failed to scrape ${username}:`, e.message || e);
  } finally {
    try { await page.close(); } catch (e) {}
  }

  return results;
}

async function run(usernames: string[], opts: CLIOptions) {
  const outDir = path.join(process.cwd(), 'data');
  await fs.mkdir(outDir, { recursive: true });

  const browser = await puppeteer.launch({ headless: opts.headless, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const resultsByUser: Record<string, { watchlist: ScrapeResult[]; watched: ScrapeResult[] }> = {};

    // Simple concurrency queue
    const queue = [...usernames];
    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.max(1, opts.concurrency); i++) {
      const worker = (async () => {
        while (queue.length > 0) {
          const u = queue.shift();
          if (!u) break;
          console.log(`Scraping user: ${u}`);
          const res = await scrapeUser(browser, u, opts);
          resultsByUser[u] = res;
          console.log(` -> ${u}: watchlist=${res.watchlist.length}, watched=${res.watched.length}`);
          await sleep(opts.throttle);
        }
      })();
      workers.push(worker);
    }

    await Promise.all(workers);

    // Output results per user
    for (const u of Object.keys(resultsByUser)) {
      const res = resultsByUser[u];
      if (opts.dryRun) {
        console.log(`\n-- Dry Run: ${u} --`);
        console.log('Watchlist:');
        res.watchlist.slice(0, 200).forEach(i => console.log(`* ${i.title} -> ${i.url}`));
        console.log('Watched:');
        res.watched.slice(0, 200).forEach(i => console.log(`* ${i.title} -> ${i.url}`));
      } else {
        // Write CSVs
        const watchlistCsv = Papa.unparse(res.watchlist.map(r => ({ Name: r.title, 'Letterboxd URI': r.url })), { header: true });
        const watchedCsv = Papa.unparse(res.watched.map(r => ({ Name: r.title, 'Letterboxd URI': r.url })), { header: true });
        await fs.writeFile(path.join(outDir, `${u}_watchlist.csv`), watchlistCsv, 'utf8');
        await fs.writeFile(path.join(outDir, `${u}_watched.csv`), watchedCsv, 'utf8');
        // Also write canonical filenames expected by the app for convenience (overwrites)
        await fs.writeFile(path.join(outDir, `watchlist.csv`), watchlistCsv, 'utf8');
        await fs.writeFile(path.join(outDir, `watched.csv`), watchedCsv, 'utf8');
        console.log(`Saved CSVs for ${u} -> data/${u}_watchlist.csv, data/${u}_watched.csv`);
      }
    }
  } finally {
    try { await browser.close(); } catch (e) {}
  }
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const opts: CLIOptions = { headless: true, dryRun: false, concurrency: 1, throttle: 500 };
  const users: string[] = [];

  for (const a of args) {
    if (a.startsWith('--headless=')) opts.headless = a.split('=')[1] !== 'false';
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a.startsWith('--concurrency=')) opts.concurrency = Math.max(1, Number(a.split('=')[1]) || 1);
    else if (a.startsWith('--throttle=')) opts.throttle = Number(a.split('=')[1]) || 500;
    else if (a.startsWith('--users=')) users.push(...a.split('=')[1].split(','));
    else users.push(a);
  }

  return { users, opts };
}

(async () => {
  const { users, opts } = parseArgs(process.argv);
  if (users.length === 0) {
    console.log('Usage: ts-node scripts/scrape_letterboxd.ts <username1> [username2 ...] [--dry-run] [--headless=false] [--concurrency=2] [--throttle=500]');
    process.exit(1);
  }
  try {
    await run(users, opts);
    console.log('Done.');
  } catch (e) {
    console.error('Fatal:', e);
    process.exit(2);
  }
})();
