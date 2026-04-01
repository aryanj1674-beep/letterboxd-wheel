"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import confetti from "canvas-confetti";

const Wheel = dynamic(
  () => import("react-custom-roulette").then((mod) => mod.Wheel),
  { ssr: false }
);

interface Movie {
  title: string;
  slug: string;
}

export default function Home() {
  const [includeWatched, setIncludeWatched] = useState(false);
  const [onlyWatchlist, setOnlyWatchlist] = useState(false);
  
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

  const handleFetch = async () => {
    setLoading(true);
    setError("");
    setWheelData([]);
    setWinner(null);

    try {
      const res = await fetch(`/api/letterboxd`);
      if (!res.ok) throw new Error("Could not find CSV files in /data folder");
      
      const data = await res.json(); 
      const { watchlist, watched, top500 } = data;

      let baseList: Movie[] = [];
      
      if (onlyWatchlist) {
        baseList = [...watchlist];
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

      // Filter out watched
      if (!includeWatched) {
        const watchedSlugs = new Set(watched.map((m: any) => m.slug));
        baseList = baseList.filter(m => !watchedSlugs.has(m.slug));
      }

      if (baseList.length === 0) {
        throw new Error("No movies found! Ensure your CSVs have data and 'Name' columns.");
      }

      const toSpin = getRandomSelection(baseList, Math.min(20, baseList.length));
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
    setWinner(chosenMovies[prizeNumber]);
    setShowModal(true);
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#00E054', '#40BCF4', '#FF8000']
    });
  };

  return (
    <div className="min-h-screen bg-[#14181c] text-[#8aa8c1] font-sans pb-20">
      <header className="bg-[#1c2228] py-6 border-b border-[#2c3440]">
        <div className="max-w-5xl mx-auto px-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white tracking-tighter">LETTERBIN 🍿</h1>
          <span className="text-xs uppercase tracking-widest text-[#64788c]">Local CSV Mode</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="space-y-6">
          <div className="bg-[#1c2228] p-6 rounded border border-[#2c3440] shadow-xl">
            <h2 className="text-white font-bold mb-4 uppercase text-sm tracking-widest">Controls</h2>
            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" checked={includeWatched} onChange={(e) => setIncludeWatched(e.target.checked)} className="accent-[#00e054] w-4 h-4"/>
                <span className="text-sm group-hover:text-white transition-colors">Include Watched</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" checked={onlyWatchlist} onChange={(e) => setOnlyWatchlist(e.target.checked)} className="accent-[#00e054] w-4 h-4"/>
                <span className="text-sm group-hover:text-white transition-colors">Only Watchlist</span>
              </label>
              <button onClick={handleFetch} disabled={loading} className="w-full bg-[#00e054] hover:bg-[#00c04b] text-[#14181c] font-black py-3 rounded transition-all uppercase text-xs tracking-widest">
                {loading ? "Loading CSV..." : "Sync Movies"}
              </button>
              {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
            </div>
          </div>
        </div>

        <div className="md:col-span-2 flex flex-col items-center">
          {wheelData.length > 0 ? (
            <>
              <div className="mb-8 border-8 border-[#1c2228] rounded-full shadow-2xl">
                <Wheel
                  mustStartSpinning={mustSpin}
                  prizeNumber={prizeNumber}
                  data={wheelData}
                  onStopSpinning={handleStopSpinning}
                  backgroundColors={['#1c2228', '#2c3440', '#445566']}
                  textColors={['#ffffff']}
                  outerBorderColor="#14181c"
                  outerBorderWidth={5}
                  fontSize={14}
                  textDistance={60}
                />
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
      </main>

      {showModal && winner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
          <div className="bg-[#1c2228] border border-[#2c3440] rounded p-10 text-center max-w-sm w-full">
            <h3 className="text-[#00e054] uppercase text-xs font-bold tracking-[0.2em] mb-4">You're Watching</h3>
            <h2 className="text-3xl font-black text-white mb-8">{winner.title}</h2>
            <button onClick={() => setShowModal(false)} className="w-full border border-[#445566] text-white py-3 rounded hover:bg-white/5 transition-colors uppercase text-xs font-bold">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}