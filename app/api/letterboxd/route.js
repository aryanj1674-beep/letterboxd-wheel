import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { kv } from '@vercel/kv';

export async function GET() {
    try {
        const dataDir = path.join(process.cwd(), 'data');
        
        const readCSV = (fileName) => {
            const filePath = path.join(dataDir, fileName);
            
            // Check if file exists to prevent crashing
            if (!fs.existsSync(filePath)) {
                console.warn(`⚠️ File not found: ${fileName}`);
                return [];
            }
            
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const parsed = Papa.parse(fileContent, { 
                header: true, 
                skipEmptyLines: true 
            });
            
            // Map Letterboxd headers: "Name" and "Letterboxd URI"
            return parsed.data.map(row => {
                // Trim any hidden spaces from keys (very common in CSVs)
                const cleanRow = {};
                Object.keys(row).forEach(key => {
                    cleanRow[key.trim()] = row[key];
                });

                const title = cleanRow['Name'] || cleanRow['Title'] || "Unknown Movie";
                const uri = cleanRow['Letterboxd URI'] || cleanRow['URL'] || "";
                
                // Extract slug: If it's a full letterboxd URL, pop it. 
                // If it's a boxd.it shortlink, we must guess the slug from the title using exact Letterboxd formatting rules
                let slug = '';
                if (uri && uri.includes('letterboxd.com/film/')) {
                    slug = uri.split('/').filter(Boolean).pop();
                } else {
                    slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                }

                return { title, slug };
            });
        };

        const watchlist = readCSV('watchlist.csv');
        const watched = readCSV('watched.csv');
        const top500 = readCSV('top500.csv');

        // Dynamically fetch user-submitted 'watched' movies from Vercel KV Storage
        let dynamicWatched = [];
        try {
            // Only try if the Vercel KV env vars are roughly present (prevents local crashes)
            if (process.env.KV_REST_API_URL || process.env.KV_URL) {
                const kvData = await kv.get('global_watched_slugs');
                if (Array.isArray(kvData)) {
                    dynamicWatched = kvData;
                }
            }
        } catch (e) {
            console.warn("⚠️ Vercel KV gracefully skipped:", e.message);
        }

        const allWatched = [...watched, ...dynamicWatched];

        console.log(`✅ Loaded: ${watchlist.length} watchlist, ${allWatched.length} watched, ${top500.length} top500`);

        return NextResponse.json({ watchlist, watched: allWatched, top500 });
    } catch (error) {
        console.error("CSV API Error:", error);
        return NextResponse.json({ error: "Failed to read CSV files" }, { status: 500 });
    }
}