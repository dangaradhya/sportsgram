// app/reels/page.tsx

// This is the main page for the Reels section of the dashboard. 
// It fetches and displays YouTube Shorts in a vertical scrollable format with 
// snap scrolling. The page includes a top navigation bar to switch between Posts 
// and Reels, and it handles loading states and pagination for fetching more reels.
"use client";

// 1. IMPORTS
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function Reels() {
  // 2. STATE MANAGEMENT
  // We maintain state for the list of reels, loading status, current page for pagination,
  const [reels, setReels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  
  // 3. DATA FETCHING FUNCTION
  // This function fetches reels from the backend API based on the current page number.
  const fetchReels = async (pageNum: number) => {
    try {
      // Fetch 3 reels at a time (iframes are heavy on memory!)
      const res = await fetch(`http://localhost:3000/api/reels?page=${pageNum}&limit=3`);
      const data = await res.json();
      
      // If no more reels are returned, we set hasMore to false to stop further loading.
      if (data.length === 0) {
        setHasMore(false);
      } else {
        // We append new reels to the existing list, ensuring no duplicates.
        // We use a quick check to see if the new reel already exists in the current state before adding it.
        setReels(prevReels => {
          const newReels = [...prevReels];
          data.forEach((newReel: any) => {
            if (!newReels.find(r => r.id === newReel.id)) {
              newReels.push(newReel);
            }
          });
          return newReels;
        });
      }
      setLoading(false);
      setLoadingMore(false);
    } catch (err) {
      console.error("Error fetching reels:", err);
      setLoading(false);
      setLoadingMore(false);
    }
  };
  
  // This runs on component mount and whenever the page number changes, triggering a new fetch for reels.
  useEffect(() => {
    fetchReels(page);
  }, [page]);

  return (
    <main className="bg-black text-white h-screen overflow-hidden flex flex-col">
      
      {/* Top Navigation Bar */}
      <div className="absolute top-0 w-full z-50 p-6 flex justify-center space-x-8 bg-gradient-to-b from-black/80 to-transparent">
        <Link href="/" className="text-gray-400 font-bold text-lg hover:text-white transition-colors drop-shadow-md">
          Posts
        </Link>
        <span className="text-white font-bold text-lg border-b-2 border-white pb-1 drop-shadow-md">
          Reels
        </span>
      </div>

      {loading && page === 1 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 animate-pulse font-medium">Tuning into the broadcast...</p>
        </div>
      ) : reels.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400">No reels found. Run the scraper!</p>
        </div>
      ) : (
        /* The Scroll Snapping Container */
        <div className="flex-1 overflow-y-scroll snap-y snap-mandatory scrollbar-hide pb-20">
          {reels.map((reel) => (
            <div 
              key={reel.id} 
              className="h-screen w-full flex flex-col items-center justify-center snap-center relative"
            >
              {/* Video Container */}
              <div className="w-full max-w-md h-[70vh] bg-gray-900 rounded-xl overflow-hidden shadow-2xl relative border border-gray-800">
                
                {/* YouTube iFrame Embed */}
                <iframe
                  className="w-full h-full"
                  src={`https://www.youtube.com/embed/${reel.video_id}?autoplay=0&rel=0&modestbranding=1`}
                  title={reel.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>

                {/* Video Metadata Overlay */}
                <div className="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none">
                  <h3 className="text-lg font-bold text-white leading-snug drop-shadow-lg">{reel.title}</h3>
                  <p className="text-sm text-gray-300 mt-1 font-medium bg-black/40 inline-block px-2 py-0.5 rounded">@{reel.channel_name}</p>
                </div>
              </div>
            </div>
          ))}

          {/* Load More Trigger Area */}
          {hasMore && (
            <div className="h-[20vh] w-full flex items-center justify-center snap-center">
              <button
                onClick={() => {
                  setLoadingMore(true);
                  setPage(p => p + 1);
                }}
                disabled={loadingMore}
                className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold rounded-full border border-gray-700 transition-all disabled:opacity-50"
              >
                {loadingMore ? 'Loading...' : 'Swipe down to load more 👇'}
              </button>
            </div>
          )}
          {!hasMore && (
             <div className="h-[20vh] w-full flex items-center justify-center snap-center">
                <p className="text-gray-500 font-medium">You've caught up on all the highlights!</p>
             </div>
          )}
        </div>
      )}
    </main>
  );
}