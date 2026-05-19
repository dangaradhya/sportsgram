// app/reels/page.tsx

// This is the main page for the Reels section of the dashboard. 
// It fetches and displays YouTube Shorts in a vertical scrollable format with 
// snap scrolling. The page includes a top navigation bar to switch between Posts 
// and Reels, and it handles loading states and fetching more randomized reels.
"use client";

// 1. IMPORTS
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';

export default function Reels() {
  // 2. STATE MANAGEMENT
  // We maintain state for the list of reels, loading status, 
  // whether there are more reels to load, and whether we are currently loading more reels.
  const [reels, setReels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // State to track which video is on screen and if it is paused
  const [activeReelId, setActiveReelId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  // Tracks the last video we restarted so we don't restart it again on unpause
  const lastPlayedIdRef = useRef<number | null>(null);
  
  // 3. DATA FETCHING FUNCTION
  const fetchReels = async () => {
    try {
      // Artificial half-second delay for infinite scroll feel
      if (reels.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Generate a string of all the video IDs currently sitting in React state
      const currentIds = reels.map(r => r.id).join(',');

      // Request 3 random reels, strictly excluding the ones we already have!
      const res = await fetch(`http://localhost:3000/api/reels?limit=3&exclude=${currentIds}`);
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
  
  // This runs on component mount, triggering a new fetch for reels.
  useEffect(() => {
    fetchReels();
    // We intentionally leave out dependencies here because we only want to fetch once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // The Infinite Scroll Observer
  useEffect(() => {
    if (!hasMore || loadingMore) return;
    
    // We create a new Intersection Observer that watches a sentinel element at 
    // the bottom of the list. When this sentinel comes into view, it means the 
    // user has scrolled to the bottom, and we can load more reels.
    const scrollObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setLoadingMore(true);
          fetchReels();
        }
      },
      { threshold: 0.1 }
    );

    // We observe the sentinel element, which is a div at the bottom of the reels list. 
    // When this element comes into view, it triggers the observer callback to load more reels.
    const sentinel = document.getElementById('reels-scroll-sentinel');
    if (sentinel) scrollObserver.observe(sentinel);

    return () => scrollObserver.disconnect();
  // Include reels in dependency array so the observer always has the latest list of IDs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loadingMore, reels]);

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
      const iframe = document.getElementById(`reel-player-${reel.id}`) as HTMLIFrameElement;
      
      if (iframe && iframe.contentWindow) {
        if (reel.id === activeReelId && isPlaying) {
          
          // Check if this is a NEW video snapping into view
          if (lastPlayedIdRef.current !== activeReelId) {
             // If it's new, reset it to the beginning by sending seekTo(0) to reset the video every time it comes into view, 
             // ensuring a consistent viewing experience.
             iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [0, true] }), '*');
             // Update our memory to remember we just restarted this one
             lastPlayedIdRef.current = activeReelId;
          }
          
          // Always send the play command when isPlaying is true
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
      <div className="absolute top-0 w-full z-50 p-6 flex justify-center space-x-8 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <Link href="/" className="text-gray-400 font-bold text-lg hover:text-white transition-colors drop-shadow-md pointer-events-auto">
          Posts
        </Link>
        <span className="text-white font-bold text-lg border-b-2 border-white pb-1 drop-shadow-md">
          Reels
        </span>
      </div>

      {/* Loading check updated from 'page === 1' to 'reels.length === 0' */}
      {loading && reels.length === 0 ? (
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
              {/* The Video Container 
                  We make sure it has 'overflow-hidden' and 'bg-black' to act as a frame.
              */}
              <div className="w-full max-w-md h-[75vh] bg-black rounded-xl overflow-hidden shadow-2xl relative border border-gray-800">
                
                {/* The Scale Trick Wrapper
                    Div reduced from 135% to 125%. We translate it perfectly to the center.
                    This pushes almost all the branding outside the frame while keeping the video fully visible and filling the container, 
                    // creating a more native and immersive feel.
                */}
                <div className="absolute top-1/2 left-1/2 w-[125%] h-[125%] -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                  {/* YouTube iFrame Embed
                      We added 'enablejsapi=1' so we can control it via postMessage.
                      We added 'controls=0' to hide the YouTube progress bar and make it look like a native app.
                  */}
                  <iframe
                    id={`reel-player-${reel.id}`}
                    className="w-full h-full pointer-events-none" // pointer-events-none prevents YouTube from stealing our clicks!
                    // Added playsinline=1, iv_load_policy=3, and disablekb=1 for maximum stealth
                    src={`https://www.youtube.com/embed/${reel.video_id}?enablejsapi=1&autoplay=0&controls=0&rel=0&modestbranding=1&loop=1&playlist=${reel.video_id}&playsinline=1&iv_load_policy=3&disablekb=1`}
                    title={reel.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  ></iframe>
                </div>

                {/* The Transparent Overlay (The Click Catcher) 
                    Made aggressive blur and high Z-index.
                    Clicks are intercepted here, and on pause, we aggressively blur the misleading elements behind it.
                */}
                <div 
                  className="absolute inset-0 z-20 cursor-pointer"
                  onClick={() => {
                    // Only allow pausing/playing if this is the active video
                    if (activeReelId === reel.id) {
                      setIsPlaying(!isPlaying);
                    }
                  }}
                >
                  {/* Big Play Button Icon that shows up when paused */}
                  {!isPlaying && activeReelId === reel.id && (
                    // We apply a heavy backdrop-blur and z-index to completely obscure YouTube's misleading elements while standardizing the experience with our own standard icon.
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-lg transition-all duration-300">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 text-white opacity-90 drop-shadow-2xl" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Video Metadata Overlay 
                    Correct z-index to cover bottom floating bars for standard data.
                */}
                <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-black via-black/60 to-transparent pointer-events-none z-30">
                  <h3 className="text-lg font-bold text-white leading-snug drop-shadow-lg">{reel.title}</h3>
                  <p className="text-sm text-gray-300 mt-2 font-medium bg-white/10 backdrop-blur-sm inline-block px-3 py-1 rounded-full shadow-sm">@{reel.channel_name}</p>
                </div>
              </div>
            </div>
          ))}

          {/* Infinite Scroll Sentinel replacing the Load More button */}
          {hasMore && (
            <div id="reels-scroll-sentinel" className="h-[20vh] w-full flex items-center justify-center snap-center">
              {loadingMore && (
                <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
              )}
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