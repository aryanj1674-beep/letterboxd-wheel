const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// Politeness delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function scrapeAllPages(browser, baseUrl) {
    let allMovies = [];
    let currentPage = 1;
    let keepScraping = true;
    
    // Open a new tab in the invisible browser
    const page = await browser.newPage();

    // OPTIMIZATION: Block images, fonts, and CSS to make scraping super fast
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (req.resourceType() === 'image' || req.resourceType() === 'stylesheet' || req.resourceType() === 'font') {
            req.abort();
        } else {
            req.continue();
        }
    });

    // Set a realistic User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');

    while (keepScraping) {
        const currentUrl = `${baseUrl}page/${currentPage}/`;
        console.log(`Scraping: ${currentUrl}`);

        try {
            // Navigate to the page
            const response = await page.goto(currentUrl, { waitUntil: 'domcontentloaded' });

            // If Letterboxd returns a 404 (Page Not Found), it means we went past the last page
            if (response.status() === 404) {
                keepScraping = false;
                break;
            }

            // Tell the browser to read the HTML and find the movies
            const moviesOnPage = await page.evaluate(() => {
                const movieElements = document.querySelectorAll('.poster-container');
                const extracted = [];
                
                movieElements.forEach(el => {
                    const filmDiv = el.querySelector('div[data-film-slug]');
                    if (filmDiv) {
                        const title = filmDiv.getAttribute('data-film-name');
                        const slug = filmDiv.getAttribute('data-film-slug');
                        if (title) extracted.push({ title, slug });
                    }
                });
                return extracted;
            });

            if (moviesOnPage.length > 0) {
                allMovies = allMovies.concat(moviesOnPage);
                currentPage++;
                await delay(1500); // Wait 1.5 seconds between pages
            } else {
                keepScraping = false; // Empty page, end of list
            }
        } catch (err) {
            console.error(`Failed on ${currentUrl}:`, err.message);
            keepScraping = false; // Stop if something breaks
        }
    }
    
    // Close the tab
   // await page.close();
    return allMovies;
}

// Main Execution
async function getUserLetterboxdData(username) {
    console.log(`\n--- Starting data fetch for: ${username} ---`);
    console.log(`Spinning up the invisible browser (this takes a second)...`);

    // Launch the hidden browser (set headless: false if you actually want to watch it work!)
    const browser = await puppeteer.launch({ headless: false });

    const watchlistBaseUrl = `https://letterboxd.com/${username}/watchlist/`;
    const watchedBaseUrl = `https://letterboxd.com/${username}/films/`;

    console.log(`\nFetching Watchlist...`);
    const watchlist = await scrapeAllPages(browser, watchlistBaseUrl);

    console.log(`\nFetching Watched Films...`);
    const watched = await scrapeAllPages(browser, watchedBaseUrl);

    // Close the browser when done
    //await browser.close();

    console.log(`\n--- Done! ---`);
    console.log(`Total Watchlist: ${watchlist.length} movies`);
    console.log(`Total Watched: ${watched.length} movies`);

    return { username, watchlist, watched };
}

// Let's test your account!
getUserLetterboxdData('requim_dreamer').then(data => {
    console.log("\nSample Watchlist:", data.watchlist.slice(0, 3));
    console.log("Sample Watched:", data.watched.slice(0, 3));
});