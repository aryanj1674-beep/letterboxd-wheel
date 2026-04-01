"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import confetti from "canvas-confetti";
import Papa from "papaparse";

const Wheel = dynamic(
  () => import("react-custom-roulette").then((mod) => mod.Wheel),
  { ssr: false }
);

interface Movie {
  title: string;
  slug: string;
}

function MovieRosterItem({ movie }: { movie: Movie }) {
  const [data, setData] = useState<{ posterUrl: string, rating: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (isHovered && !data && !loading) {
      setLoading(true);
      fetch(`/api/movie?slug=${movie.slug}`)
        .then(r => r.json())
        .then(json => {
          if (!json.error) {
            setData({ posterUrl: json.posterUrl, rating: json.rating });
          }
        })
        .finally(() => setLoading(false));
    }
  }, [isHovered, movie.slug, data, loading]);

  return (
    <div
      className="relative p-3 border-b border-[#2c3440] hover:bg-[#2c3440] transition-colors cursor-pointer group flex items-center justify-between"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="truncate text-xs font-bold text-[#8aa8c1] group-hover:text-[#00e054] transition-colors uppercase tracking-wider">
        {movie.title}
      </div>

      {isHovered && (
        <div className="absolute right-[105%] top-1/2 -translate-y-1/2 z-[150] w-56 bg-[#1c2228] border border-[#00e054] p-4 rounded-xl shadow-[0_0_40px_rgba(0,224,84,0.3)] pointer-events-none flex flex-col items-center transform transition-all">
          {loading || !data ? (
            <div className="w-[140px] h-[210px] bg-[#2c3440] animate-pulse rounded mb-4 flex items-center justify-center border border-[#445566]">
              <span className="text-xs text-[#64788c] uppercase tracking-widest font-bold">Scanning...</span>
            </div>
          ) : (
            <>
              <img
                src={data.posterUrl || `https://placehold.co/140x210/14181c/8aa8c1?text=${encodeURIComponent(movie.title.substring(0, 20))}`}
                alt="Poster"
                className="w-[140px] h-[210px] object-cover rounded shadow-lg mb-4 border border-[#445566]"
              />
              <div className="text-white font-black text-center text-sm w-full leading-tight">{movie.title}</div>
              <div className="bg-[#14181c] px-3 py-1 rounded-full text-[#ff8000] text-xs font-black tracking-widest mt-3 border border-[#2c3440]">
                {data.rating && data.rating !== 'N/A' ? data.rating : 'UNRATED'}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FloatingWheelTooltip({ movie }: { movie: Movie }) {
  const [data, setData] = useState<{ posterUrl: string, rating: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setData(null);
    setLoading(false);

    const timer = setTimeout(() => {
      if (active) {
        setLoading(true);
        fetch(`/api/movie?slug=${movie.slug}`)
          .then(r => r.json())
          .then(json => {
            if (!json.error && active) {
              setData({ posterUrl: json.posterUrl, rating: json.rating });
            }
          })
          .finally(() => {
            if (active) setLoading(false);
          });
      }
    }, 400); // 400ms Debounce to prevent Cloudflare ban on quick swipes

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [movie.slug]);

  return (
    <div className="absolute top-1/2 left-[105%] -translate-y-1/2 z-[200] w-56 bg-[#1c2228] border border-[#ff8000] p-4 rounded-xl shadow-[0_0_50px_rgba(255,128,0,0.5)] flex flex-col items-center pointer-events-none transform transition-all">
      {loading || !data ? (
        <div className="w-[140px] h-[210px] bg-[#2c3440] animate-pulse rounded mb-4 flex items-center justify-center border border-[#445566]">
          <span className="text-xs text-[#ff8000] uppercase tracking-widest font-bold">Scanning...</span>
        </div>
      ) : (
        <>
          <img src={data.posterUrl || `https://placehold.co/140x210/14181c/8aa8c1?text=${encodeURIComponent(movie.title.substring(0, 20))}`} alt="Poster" className="w-[140px] h-[210px] object-cover rounded shadow-lg mb-4 border border-[#445566]" />
          <div className="text-white font-black text-center text-sm w-full leading-tight">{movie.title}</div>
          <div className="bg-[#14181c] px-3 py-1 rounded-full text-[#ff8000] text-xs font-black tracking-widest mt-3 border border-[#2c3440]">
            {data.rating && data.rating !== 'N/A' ? data.rating : 'UNRATED'}
          </div>
        </>
      )}
    </div>
  );
}

export default function Home() {
  const [includeWatched, setIncludeWatched] = useState(false);
  const [poolType, setPoolType] = useState<'both' | 'watchlist' | 'top500'>('both');
  const [hoveredWheelIndex, setHoveredWheelIndex] = useState<number | null>(null);
  const [winnerData, setWinnerData] = useState<{ posterUrl: string, rating: string } | null>(null);
  const [loadingWinner, setLoadingWinner] = useState(false);

  const [localWatched, setLocalWatched] = useState<string[]>([]);

  const [isAdmin, setIsAdmin] = useState(false);
  const [markingGlobal, setMarkingGlobal] = useState(false);

  const [isGuestMode, setIsGuestMode] = useState(false);
  const [showGuestMenu, setShowGuestMenu] = useState(false);
  const [guestWatchlist, setGuestWatchlist] = useState<Movie[]>([]);
  const [guestWatched, setGuestWatched] = useState<Movie[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("dxobrettel_watched");
    if (stored) {
      try {
        setLocalWatched(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse localWatched", e);
      }
    }
    if (sessionStorage.getItem("admin_password")) setIsAdmin(true);
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [chosenMovies, setChosenMovies] = useState<Movie[]>([]);
  const [wheelData, setWheelData] = useState<{ option: string }[]>([]);

  const [mustSpin, setMustSpin] = useState(false);
  const [prizeNumber, setPrizeNumber] = useState(0);
  const [winner, setWinner] = useState<Movie | null>(null);
  const [showModal, setShowModal] = useState(false);

  const getRandomSelection = (movies: Movie[], count: number) => {
    const shuffled = [...movies].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  };

  const parseCSVFile = (file: File, callback: (parsedMovies: Movie[]) => void) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: any) => {
        const movies = results.data.map((row: any) => {
          const cleanRow: any = {};
          Object.keys(row).forEach(key => cleanRow[key.trim()] = row[key]);
          const title = cleanRow['Name'] || cleanRow['Title'] || "Unknown Movie";
          const uri = cleanRow['Letterboxd URI'] || cleanRow['URL'] || "";
          
          let slug = '';
          if (uri && uri.includes('letterboxd.com/film/')) {
              slug = uri.split('/').filter(Boolean).pop();
          } else {
              slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          }
          
          return { title, slug };
        });
        callback(movies);
      }
    });
  };

  const handleWatchlistUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      parseCSVFile(file, (movies) => {
        setGuestWatchlist(movies);
        setIsGuestMode(true);
      });
    }
  };

  const handleWatchedUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      parseCSVFile(file, (movies) => {
        setGuestWatched(movies);
        setIsGuestMode(true);
      });
    }
  };

  const handleFetch = async () => {
    setLoading(true);
    setError("");
    setWheelData([]);
    setWinner(null);

    try {
      let serverData = { watchlist: [], watched: [], top500: [] };
      try {
        const res = await fetch(`/api/letterboxd`);
        if (res.ok) serverData = await res.json();
      } catch (e) {
        console.warn("Failed to reach server DB, using local only");
      }

      const watchlist = (isGuestMode && guestWatchlist.length > 0) ? guestWatchlist : serverData.watchlist;
      const watched = isGuestMode ? guestWatched : serverData.watched;
      const top500 = serverData.top500 || [];

      let baseList: Movie[] = [];

      if (poolType === 'watchlist') {
        baseList = [...watchlist];
      } else if (poolType === 'top500') {
        baseList = [...top500];
      } else {
        baseList = [...top500, ...watchlist];
      }

      // Deduplicate
      const uniqueSlugs = new Set();
      baseList = baseList.filter(m => {
        if (!m.slug || uniqueSlugs.has(m.slug)) return false;
        uniqueSlugs.add(m.slug);
        return true;
      });

      if (!includeWatched) {
        const watchedSlugs = new Set(watched.map((m: any) => m.slug));
        const watchedTitles = new Set(watched.map((m: any) => m.title.toLowerCase().trim()));
        baseList = baseList.filter(m => !watchedSlugs.has(m.slug) && !watchedTitles.has(m.title.toLowerCase().trim()));
      }

      // Filter out manually marked as watched (localWatched)
      if (localWatched.length > 0) {
        const localWatchedSet = new Set(localWatched);
        baseList = baseList.filter(m => !localWatchedSet.has(m.slug));
      }

      if (baseList.length === 0) {
        throw new Error("No movies found! Ensure your CSVs have data and 'Name' columns.");
      }

      const toSpin = getRandomSelection(baseList, Math.min(100, baseList.length));
      setChosenMovies(toSpin);
      setWheelData(toSpin.map((m) => ({
        option: m.title.length > 22 ? m.title.substring(0, 20) + "..." : m.title
      })));

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSpinClick = () => {
    if (wheelData.length === 0 || mustSpin) return;
    const newPrizeNumber = Math.floor(Math.random() * wheelData.length);
    setPrizeNumber(newPrizeNumber);
    setMustSpin(true);
    setShowModal(false);
  };

  const handleStopSpinning = () => {
    setMustSpin(false);
    const won = chosenMovies[prizeNumber];
    setWinner(won);

    if (won) {
      setLoadingWinner(true);
      fetch(`/api/movie?slug=${won.slug}`)
        .then(r => r.json())
        .then(data => {
          if (!data.error) setWinnerData({ posterUrl: data.posterUrl, rating: data.rating });
        })
        .finally(() => setLoadingWinner(false));
    }

    setShowModal(true);
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#00E054', '#40BCF4', '#FF8000']
    });
  };

  const handleWatched = async () => {
    if (!winner) return;
    const updated = [...localWatched, winner.slug];
    setLocalWatched(updated);
    localStorage.setItem("dxobrettel_watched", JSON.stringify(updated));

    const adminPwd = sessionStorage.getItem("admin_password");
    if (adminPwd && !isGuestMode) {
      setMarkingGlobal(true);
      try {
        const res = await fetch('/api/mark-watched', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: winner.slug, title: winner.title, password: adminPwd })
        });
        const data = await res.json();
        if (data.error) alert("Database Error: " + data.error);
      } catch (e) {
        console.error(e);
      }
      setMarkingGlobal(false);
    }

    setShowModal(false);
    setWheelData(prev => prev.filter(item => item.option !== (winner.title.length > 22 ? winner.title.substring(0, 20) + "..." : winner.title)));
  };

  const handleAdminLogin = () => {
    if (isAdmin) {
      sessionStorage.removeItem("admin_password");
      setIsAdmin(false);
      return;
    }
    const pwd = prompt("Enter Admin Password to enable Global Cloud Syncing:");
    if (pwd) {
      sessionStorage.setItem("admin_password", pwd);
      setIsAdmin(true);
      alert("Admin Mode Unlocked!");
    }
  };

  const handleWheelMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (mustSpin || wheelData.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;

    // Scan all inner elements to find the exact CSS rotation the library currently applies
    let wheelRotation = 0;
    const elements = e.currentTarget.querySelectorAll('*');
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i] as HTMLElement;
      if (el.className && typeof el.className === 'string' && el.className.includes('group-hover')) continue;

      const style = window.getComputedStyle(el);
      const transform = style.transform || style.webkitTransform;
      if (transform && transform !== 'none' && transform.startsWith('matrix')) {
        const values = transform.split('(')[1].split(')')[0].split(',');
        const a = parseFloat(values[0]);
        const b = parseFloat(values[1]);
        // If it looks like a rotation matrix via trig identity
        if (Math.abs(a * a + b * b - 1) < 0.1) {
          wheelRotation = Math.atan2(b, a) * (180 / Math.PI);
          // Keep iterating to get the innermost rotated element
        }
      }
    }

    let angle = Math.atan2(y, x) * (180 / Math.PI);
    angle = angle - wheelRotation;

    // Shift by 90 because react-custom-roulette starts drawing slice 0 at -90deg (Top)
    angle = (angle + 90) % 360;
    if (angle < 0) angle += 360;

    // react-custom-roulette actually renders slices COUNTER-CLOCKWISE!
    // So if angle is 300 CW, it's actually 60 in their CCW index space.
    let reversedAngle = angle % 360;

    const sliceAngle = 360 / wheelData.length;
    let index = Math.floor(reversedAngle / sliceAngle);

    if (index < 0) index = (index % wheelData.length) + wheelData.length;
    if (index >= wheelData.length) index %= wheelData.length;

    // --- HOVER MAPPING CALIBRATION OFFSETS ---
    // You can adjust these numbers to perfectly align the tooltip for each specific pool!
    let offset = 23; 
    
    if (poolType === 'watchlist') {
      offset = 23*wheelData.length/100;   // <--- CHANGE THIS NUMBER for Watchlist (e.g. 1, 2, 5, etc)
    } else if (poolType === 'top500') {
      offset = 23;  // <--- CHANGE THIS NUMBER for Top 500
    } else if (poolType === 'both') {
      offset = 23;  // <--- CHANGE THIS NUMBER for Both
    }
    
    // Applying the calibration
    index = index - offset;
    
    // Safety check just in case the offset makes the index go below 0
    if (index < 0) index = (index % wheelData.length) + wheelData.length;

    setHoveredWheelIndex(index);
  };

  const handleWheelMouseLeave = () => {
    setHoveredWheelIndex(null);
  };

  return (
    <div className="min-h-screen bg-[#14181c] text-[#8aa8c1] font-sans pb-20">
      <header className="bg-[#1c2228] py-6 border-b border-[#2c3440]">
        <div className="max-w-5xl mx-auto px-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white tracking-tighter">dxobrettel 🍿</h1>
          <span
            onClick={handleAdminLogin}
            className={`text-xs uppercase tracking-widest cursor-pointer transition-colors px-2 py-1 rounded ${isAdmin ? "text-[#00e054] hover:bg-[#00e054]/10" : "text-[#64788c] hover:text-white"}`}
            title="Click to toggle Admin Mode"
          >
            {isAdmin ? "Admin Connected" : "Local CSV Mode"}
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 mt-12 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="space-y-6 md:col-span-1">
          <div className="bg-[#1c2228] p-6 rounded border border-[#2c3440] shadow-xl">
            <h2 className="text-white font-bold mb-4 uppercase text-sm tracking-widest">Controls</h2>
            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" checked={includeWatched} onChange={(e) => setIncludeWatched(e.target.checked)} className="accent-[#00e054] w-4 h-4" />
                <span className="text-sm group-hover:text-white transition-colors">Include Watched</span>
              </label>
              <div className="flex flex-col gap-2 mt-2">
                <label className="text-xs text-[#64788c] uppercase font-bold tracking-widest mb-1">Movie Pool Mode</label>
                <select
                  value={poolType}
                  onChange={(e) => setPoolType(e.target.value as any)}
                  className="bg-[#2c3440] text-sm text-white p-2.5 rounded border border-[#445566] focus:border-[#00e054] outline-none shadow-inner"
                >
                  <option value="both">Both (Watchlist + Top 500)</option>
                  <option value="watchlist">Watchlist Only</option>
                  <option value="top500">Top 500 Only</option>
                </select>
              </div>
              <button onClick={handleFetch} disabled={loading} className="w-full bg-[#00e054] hover:bg-[#00c04b] text-[#14181c] font-black py-3 rounded transition-all uppercase text-xs tracking-widest mt-2">
                {loading ? "Loading CSV..." : "Sync Movies"}
              </button>

              <button
                onClick={() => setShowGuestMenu(!showGuestMenu)}
                className="w-full text-[#64788c] text-xs uppercase font-bold hover:text-white transition-colors py-2 flex items-center justify-center gap-2"
              >
                {showGuestMenu ? "Hide Guest Panel" : "📁 Upload Custom CSV (Guest Mode)"}
              </button>

              {showGuestMenu && (
                <div className="bg-[#14181c] p-4 rounded border border-[#00e054]/30 flex flex-col gap-4 shadow-inner">
                  {isGuestMode && <div className="text-xs text-[#00e054] font-black uppercase tracking-widest text-center animate-pulse">Guest Profile Active</div>}
                  <div>
                    <label className="text-xs text-[#8aa8c1] block mb-2 font-bold uppercase tracking-wider">1. Watchlist CSV:</label>
                    <input type="file" accept=".csv" onChange={handleWatchlistUpload} className="text-xs text-[#64788c] file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[#2c3440] file:text-white hover:file:bg-[#445566]" />
                  </div>
                  <div>
                    <label className="text-xs text-[#8aa8c1] block mb-2 font-bold uppercase tracking-wider">2. Watched CSV (Opt):</label>
                    <input type="file" accept=".csv" onChange={handleWatchedUpload} className="text-xs text-[#64788c] file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[#2c3440] file:text-white hover:file:bg-[#445566]" />
                  </div>
                  {isGuestMode && (
                    <button onClick={() => { setIsGuestMode(false); setGuestWatchlist([]); setGuestWatched([]); }} className="text-xs text-red-500 hover:text-red-400 font-bold uppercase tracking-widest text-center mt-2 p-2 border border-red-500/20 rounded">Exit Guest Mode</button>
                  )}
                </div>
              )}

              {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
            </div>
          </div>
        </div>

        <div className="md:col-span-2 flex flex-col items-center">
          {wheelData.length > 0 ? (
            <>
              <div
                className="mb-8 border-8 border-[#1c2228] rounded-full shadow-2xl group w-full max-w-[400px] relative"
                onMouseMove={handleWheelMouseMove}
                onMouseLeave={handleWheelMouseLeave}
              >
                <div className="transform transition-transform duration-500 origin-center group-hover:scale-[1.8] group-hover:z-50 will-change-transform z-10 relative cursor-crosshair">
                  <Wheel
                    mustStartSpinning={mustSpin}
                    prizeNumber={prizeNumber}
                    data={wheelData}
                    onStopSpinning={handleStopSpinning}
                    backgroundColors={['#1c2228', '#2c3440', '#445566', '#00e054', '#40bcf4', '#ff8000']}
                    textColors={['#ffffff']}
                    outerBorderColor="#14181c"
                    outerBorderWidth={5}
                    fontSize={10}
                    textDistance={88}
                  />
                  {hoveredWheelIndex !== null && chosenMovies[hoveredWheelIndex] && !mustSpin && (
                    <FloatingWheelTooltip movie={chosenMovies[hoveredWheelIndex]} />
                  )}
                </div>
              </div>
              <button onClick={handleSpinClick} disabled={mustSpin} className="bg-[#40bcf4] hover:bg-[#35a0ce] text-white font-black py-4 px-16 rounded-full text-xl shadow-lg transition-transform active:scale-95">
                SPIN
              </button>
            </>
          ) : (
            <div className="w-full h-64 border-2 border-dashed border-[#2c3440] rounded flex items-center justify-center text-[#64788c]">
              Click Sync Movies to begin
            </div>
          )}
        </div>

        {/* The Movie Roster Sidebar */}
        <div className="md:col-span-1 bg-[#1c2228] rounded border border-[#2c3440] shadow-xl flex flex-col h-[600px] overflow-hidden">
          <div className="bg-[#2c3440] py-4 px-4 border-b border-[#445566]">
            <h2 className="text-white font-bold uppercase text-xs tracking-[0.2em] text-center">Current Pool</h2>
            <div className="text-center text-[#8aa8c1] text-[10px] uppercase mt-1">Hover for Details</div>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-visible custom-scrollbar">
            {chosenMovies.length > 0 ? (
              chosenMovies.map((m, idx) => (
                <MovieRosterItem key={`${m.slug}-${idx}`} movie={m} />
              ))
            ) : (
              <div className="p-8 text-center text-[#64788c] text-xs uppercase tracking-widest mt-10">
                Empty Pool
              </div>
            )}
          </div>
        </div>
      </main>

      {showModal && winner && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm fade-in">
          <div className="bg-[#1c2228] border border-[#00e054] rounded-2xl p-8 text-center max-w-sm w-full shadow-[0_0_80px_rgba(0,224,84,0.3)]">
            <h3 className="text-[#00e054] uppercase text-xs font-black tracking-[0.2em] mb-4">Tonight's Feature</h3>

            <div className="mb-6 flex justify-center relative group">
              {loadingWinner || !winnerData ? (
                <div className="w-[180px] h-[270px] bg-[#2c3440] animate-pulse rounded flex items-center justify-center border border-[#445566]">
                  <span className="text-xs text-[#64788c] uppercase font-bold tracking-widest">Loading...</span>
                </div>
              ) : (
                <>
                  <img
                    src={winnerData.posterUrl || `https://placehold.co/180x270/14181c/8aa8c1?text=${encodeURIComponent(winner.title.substring(0, 30))}`}
                    alt={`${winner.title} Poster`}
                    className="w-[180px] h-[270px] object-cover rounded shadow-2xl border border-[#2c3440]"
                  />
                  <div className="absolute top-2 right-[50%] translate-x-[90px] bg-[#14181c] px-3 py-1 rounded-full text-[#ff8000] text-lg font-black tracking-widest border border-[#2c3440] shadow-xl">
                    {winnerData.rating && winnerData.rating !== 'N/A' ? winnerData.rating : 'UNRATED'}
                  </div>
                </>
              )}
            </div>

            <h2 className="text-3xl font-black text-white mb-6 leading-tight max-h-[100px] overflow-y-auto">{winner.title}</h2>

            <div className="flex flex-col gap-3">
              <a
                href={`https://letterboxd.com/film/${winner.slug}`}
                target="_blank"
                rel="noreferrer"
                className="w-full bg-[#00e054] text-[#14181c] py-4 rounded hover:bg-[#00c04b] transition-colors uppercase text-sm font-black tracking-widest flex items-center justify-center gap-2 shadow-lg hover:rounded-xl"
              >
                View on Letterboxd
              </a>
              <button
                onClick={handleWatched}
                disabled={markingGlobal}
                className="w-full bg-[#2c3440] text-white py-3 rounded hover:bg-[#ff8000] hover:text-[#14181c] transition-colors uppercase text-xs font-bold tracking-widest disabled:opacity-50"
              >
                {markingGlobal ? "Syncing to Cloud..." : (isAdmin && !isGuestMode) ? "Save to Global Cloud DB" : "I have watched & reviewed this!"}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="w-full text-[#64788c] py-2 hover:text-white transition-colors uppercase text-xs font-bold mt-2"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}