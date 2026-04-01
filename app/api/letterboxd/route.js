import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

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
                
                // Extract slug from the end of the URL
                const slug = uri ? uri.split('/').filter(Boolean).pop() : title.toLowerCase().replace(/ /g, '-');

                return { title, slug };
            });
        };

        const watchlist = readCSV('watchlist.csv');
        const watched = readCSV('watched.csv');
        const top500 = readCSV('top500.csv');

        console.log(`✅ Loaded: ${watchlist.length} watchlist, ${watched.length} watched, ${top500.length} top500`);

        return NextResponse.json({ watchlist, watched, top500 });
    } catch (error) {
        console.error("CSV API Error:", error);
        return NextResponse.json({ error: "Failed to read CSV files" }, { status: 500 });
    }
}