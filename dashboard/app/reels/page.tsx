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

  // State to track which video is on screen and if it is paused
  const [activeReelId, setActiveReelId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  
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

  // The Intersection Observer (The Tracker)
  // This watches the screen. When a video container takes up at least 60% of the screen,
  // it sets that video's ID as the "active" reel.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // We loop through all observed entries (video containers) and check if they are intersecting with the viewport.
        entries.forEach((entry) => {
          // If the entry is intersecting (i.e., it's in view), we get its data-id attribute, which corresponds 
          // to the reel's ID, and set it as the active reel. We also set isPlaying to true to indicate 
          // that we want this video to play.
          if (entry.isIntersecting) {
            const id = Number(entry.target.getAttribute('data-id'));
            setActiveReelId(id);
            setIsPlaying(true); // Automatically try to play when it snaps into view
          }
        });
      },
      { threshold: 0.6 } 
    );

    // Attach the observer to every element with the 'reel-container' class
    // `data-id` is used to identify which reel is currently in view.
    // We use a class selector to find all reel containers and observe them with the Intersection Observer.
    // This allows us to track which video is currently in view and control playback accordingly.
    const elements = document.querySelectorAll('.reel-container');
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [reels]);

  // The YouTube API Controller
  // Whenever the active reel or the play state changes, we send a message to the iframes.
  useEffect(() => {
    // We loop through all the reels and get their corresponding iframes by ID. If the iframe 
    // exists and has a contentWindow, we check if this reel is the active one and if it should be playing. 
    // If it is the active reel and should be playing, we send a postMessage to the iframe to play the video. 
    // For all other reels (or if the user has manually paused), we send a postMessage to pause the video. 
    // This ensures that only the video currently in view plays, while all others are paused, creating a 
    // seamless viewing experience as the user scrolls through the reels.
    reels.forEach((reel) => {
      const iframe = document.getElementById(`Youtubeer-${reel.id}`) as HTMLIFrameElement;
      
      if (iframe && iframe.contentWindow) {
        if (reel.id === activeReelId && isPlaying) {
          // Send PLAY command to the active video
          iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo' }), '*');
        } else {
          // Send PAUSE command to ALL OTHER videos, or if the user manually paused
          iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo' }), '*');
        }
      }
    });
  }, [activeReelId, isPlaying, reels]);

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
              data-id={reel.id} // Used by the Intersection Observer
              className="reel-container h-screen w-full flex flex-col items-center justify-center snap-center relative"
            >
              {/* Video Container */}
              <div className="w-full max-w-md h-[75vh] bg-gray-900 rounded-xl overflow-hidden shadow-2xl relative border border-gray-800">
                
                {/* YouTube iFrame Embed
                  We added 'enablejsapi=1' so we can control it via postMessage.
                  We added 'controls=0' to hide the YouTube progress bar and make it look like a native app.
                */}
                <iframe
                  id={`Youtubeer-${reel.id}`}
                  className="w-full h-full pointer-events-none" // pointer-events-none prevents YouTube from stealing our clicks!
                  src={`https://www.youtube.com/embed/${reel.video_id}?enablejsapi=1&autoplay=0&controls=0&rel=0&modestbranding=1&loop=1&playlist=${reel.video_id}`}
                  title={reel.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>

                {/* The Transparent Overlay (The Click Catcher) */}
                <div 
                  className="absolute inset-0 z-10 cursor-pointer"
                  onClick={() => {
                    // Only allow pausing/playing if this is the active video
                    if (activeReelId === reel.id) {
                      setIsPlaying(!isPlaying);
                    }
                  }}
                >
                  {/* Big Play Button Icon that shows up when paused */}
                  {!isPlaying && activeReelId === reel.id && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 text-white opacity-80" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>

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