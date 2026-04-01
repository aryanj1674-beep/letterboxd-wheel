import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { slug, title, password } = body;

        // Verify Admin Password
        if (password !== process.env.ADMIN_PASSWORD) {
            return NextResponse.json({ error: "Unauthorized. Incorrect password." }, { status: 401 });
        }

        if (!slug || !title) {
            return NextResponse.json({ error: "Missing movie properties" }, { status: 400 });
        }

        // Retrieve the current watched list
        let currentWatched: any[] = await kv.get('global_watched_slugs') || [];
        if (!Array.isArray(currentWatched)) currentWatched = [];

        // Check for duplicates
        if (!currentWatched.some(item => item.slug === slug)) {
            currentWatched.push({ slug, title });
            // Save the updated list back to the cloud
            await kv.set('global_watched_slugs', currentWatched);
        }

        return NextResponse.json({ success: true, count: currentWatched.length });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || "Unknown database error" }, { status: 500 });
    }
}
