import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

export async function POST(req: Request) {
  try {
    const { movies } = await req.json(); // Array of { slug, title, year }
    const apiKey = process.env.TMDB_API_KEY;

    if (!movies || !Array.isArray(movies)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // 1. Check Global Cache completely invisibly to avoid re-fetching
    const CACHE_KEY = 'tmdb_runtimes_map';
    const cachedRuntimes: Record<string, number> = (await kv.hgetall(CACHE_KEY)) || {};

    const missingMovies = movies.filter(m => cachedRuntimes[m.slug] === undefined);
    
    // We already have all the runtimes! Return instantly.
    if (missingMovies.length === 0) {
      return NextResponse.json(movies.reduce((acc, m) => ({ ...acc, [m.slug]: cachedRuntimes[m.slug] }), {}));
    }

    if (!apiKey) {
      console.warn("Missing TMDB_API_KEY but cache miss occurred. Please set TMDB_API_KEY.");
      // Fallback: return what we have in cache, others default to 0 (unfiltered)
      return NextResponse.json(movies.reduce((acc, m) => ({ ...acc, [m.slug]: cachedRuntimes[m.slug] || 0 }), {}));
    }

    // 2. We have missing movies. Throttle TMDB Fetches to avoid 50 req/sec ban
    // TMDB requires 2 calls per movie: 1 for search ID, 1 for runtime
    const newRuntimes: Record<string, number> = {};

    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

    // TMDB Chunking Logic: Fetch 10 movies at a time
    const CHUNK_SIZE = 10;
    for (let i = 0; i < missingMovies.length; i += CHUNK_SIZE) {
      const chunk = missingMovies.slice(i, i + CHUNK_SIZE);
      
      const fetchPromises = chunk.map(async (movie) => {
        try {
          const cleanTitle = encodeURIComponent(movie.title.split('(')[0].trim());
          const searchUrl = `https://api.themoviedb.org/3/search/movie?query=${cleanTitle}&year=${movie.year || ''}&api_key=${apiKey}`;
          
          const searchResponse = await fetch(searchUrl);
          const searchData = await searchResponse.json();

          if (searchData.results && searchData.results.length > 0) {
            const tmdbId = searchData.results[0].id;
            const detailsUrl = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}`;
            const detailsResponse = await fetch(detailsUrl);
            const detailsData = await detailsResponse.json();

            // Store successful runtime (or -1 if TMDB doesn't legally have a runtime)
            newRuntimes[movie.slug] = detailsData.runtime || -1;
          } else {
            // Movie strictly does not exist on TMDB
            newRuntimes[movie.slug] = -1;
          }
        } catch (e) {
          console.error(`TMDB fetch failed for ${movie.slug}`, e);
          newRuntimes[movie.slug] = -1; // Fallback to unknown
        }
      });

      await Promise.all(fetchPromises);
      // Wait 300ms between chunks to strictly respect TMDB's generous rate limit
      if (i + CHUNK_SIZE < missingMovies.length) await delay(300);
    }

    // 3. Cache the newly discovered runtimes physically into the KV database forever
    if (Object.keys(newRuntimes).length > 0) {
      await kv.hset(CACHE_KEY, newRuntimes);
    }

    // Combine old cached runtimes with the newly generated ones
    const finalMap = { ...cachedRuntimes, ...newRuntimes };

    // Return strictly the requested slugs
    const responseMap = movies.reduce((acc, m) => ({ ...acc, [m.slug]: finalMap[m.slug] }), {});
    return NextResponse.json(responseMap);

  } catch (error: any) {
    console.error('Runtime API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
