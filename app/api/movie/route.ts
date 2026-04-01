import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');

  if (!slug) {
    return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
  }

  try {
    const url = `https://letterboxd.com/film/${slug}/`;
    // We add a generic User-Agent so Cloudflare doesn't immediately block us. Note that heavy scraping might still get blocked.
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(res.data);
    
    // Scrape poster parsing Letterboxd's LD+JSON
    let posterUrl = '';
    const scriptContent = $('script[type="application/ld+json"]').html();
    if (scriptContent) {
      // Strip out the CDATA comments so we can parse it
      const cleanJson = scriptContent.replace(/\/\* <!\[CDATA\[ \*\//g, '').replace(/\/\* \]\]> \*\//g, '').trim();
      try {
        const data = JSON.parse(cleanJson);
        if (data && data.image) {
          posterUrl = data.image; // this gets the perfect portrait poster
        }
      } catch (e) {
        console.error("Failed to parse LD+JSON:", e);
      }
    }
    
    // Fallback if LD+JSON fails
    if (!posterUrl) {
      posterUrl = $('meta[property="og:image"]').attr('content') || '';
    }

    // Scrape rating from the meta tags (e.g. "4.18 out of 5")
    let rating = 'N/A';
    const rawRating = $('meta[name="twitter:data2"]').attr('content');
    if (rawRating) {
      rating = rawRating.split(' ')[0] + ' ⭐'; // "4.18 ⭐"
    }

    return NextResponse.json({
      slug,
      posterUrl,
      rating
    });
  } catch (err: any) {
    console.error("Error fetching movie data:", err.message);
    return NextResponse.json({ error: 'Failed to fetch movie' }, { status: 500 });
  }
}
