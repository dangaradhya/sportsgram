// app/live_updates/page.tsx
"use html";
"use client";

// IMPORTS
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import AuthButton from '@/components/AuthButton';

// TYPE DEFINITIONS
interface TweetCard {
  id: string;
  text: string;
  time: string;
  author: string;
  url: string;
  image_url?: string; 
}

// MAIN COMPONENT
export default function LiveUpdatesPage() {
  // STATE MANAGEMENT
  const [tweets, setTweets] = useState<TweetCard[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Refactored the data fetching logic into a reusable function that can be called on page load and on demand via the refresh button
  const loadTimelineData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    
    // Added error handling to catch issues with the backend connection or if the API returns an error message. 
    // This prevents the UI from breaking and provides feedback in the console.
    try {
      // Updated the fetch URL to point to the local backend proxy instead of directly hitting Twitter's API. 
      // This allows us to bypass CORS issues and also handle any necessary authentication or rate limiting on the server side.
      const fetchUrl = `http://localhost:3000/api/live-updates`;
      const res = await fetch(fetchUrl);
      if (!res.ok) throw new Error("Backend connection issue");
      
      // The backend is expected to return a JSON array of tweets or an error message. 
      // We check for both cases and update the state accordingly. If there's an error, we log it and keep the existing 
      // tweets until the next successful fetch.
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      // We also check if the returned data is an array and has content before updating the state. If the array is empty, 
      // we can choose to either clear the tweets or keep the existing ones until new data arrives. Here, we opt to clear 
      // it to reflect that there are currently no live matches.
      if (Array.isArray(data) && data.length > 0) {
        setTweets(data);
      } else if (tweets.length === 0) {
        setTweets([]); 
      }
    } catch (err) {
      console.warn("Backend proxy offline or rate wall hit.");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [tweets.length]);

  // On component mount, we load the timeline data and set up an interval to refresh it every 3 minutes. 
  // The interval is cleared when the component unmounts to prevent memory leaks.
  useEffect(() => {
    loadTimelineData(true);
    const intervalId = setInterval(() => loadTimelineData(false), 3 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, [loadTimelineData]);

  return (
    <main className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white p-4 md:p-8 relative transition-colors duration-300">
      <div className="max-w-3xl mx-auto">
        
        {/* Header Section */}
        <div className="flex items-center justify-between mb-4"> 
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
            Glide
          </h1>
          
          <div className="flex items-center space-x-4">
            <ThemeToggle />
            <AuthButton />
          </div>
        </div>

        {/* Navigation Section */}
        <div className="flex justify-center space-x-8 mb-8">
          <Link href="/" className="text-gray-500 dark:text-gray-400 font-bold text-lg hover:text-gray-900 dark:hover:text-white transition-colors">
            Posts
          </Link>
          <Link href="/reels" className="text-gray-500 dark:text-gray-400 font-bold text-lg hover:text-gray-900 dark:hover:text-white transition-colors">
            Reels
          </Link>
          <span className="text-gray-900 dark:text-white font-bold text-lg border-b-2 border-purple-500 pb-1 cursor-default">
            Live Scores
          </span>
        </div>

        {/* DASHBOARD CARD CONTAINER */}
        <div className="w-full flex flex-col bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-md dark:shadow-lg transition-all duration-300">
          
          {/* CARD HEADER */}
          <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-900">
            <div className="flex items-center space-x-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
              </span>
              <h2 className="text-md font-bold tracking-tight text-gray-900 dark:text-white">
                Live Match Tracking
              </h2>
            </div>
            
            {/* Changed the label from "Live API" to a dynamic "IN PLAY" indicator */}
            <div className="flex items-center space-x-3">
              <span className="flex items-center space-x-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 px-2.5 py-1 rounded-md">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse"></span>
                <span className="text-[10px] uppercase tracking-wider text-red-600 dark:text-red-400 font-bold">
                  In Play
                </span>
              </span>
              <button 
                onClick={() => loadTimelineData(true)}
                className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors group p-1"
                title="Refresh Scoreboard"
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className="h-4 w-4 group-active:rotate-180 transition-transform duration-300" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor" 
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>

          {/* CARD CONTENT AREA */}
          <div className="w-full h-auto min-h-[600px] overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-950/40 scrollbar-hide">
            {loading && tweets.length === 0 ? (
              <div className="py-20 flex items-center justify-center">
                <p className="text-xs text-gray-400 animate-pulse font-medium">Syncing live scores...</p>
              </div>
            ) : tweets.length === 0 ? (
              <div className="py-20 flex items-center justify-center text-center">
                <p className="text-sm text-gray-500">No live matches currently taking place.</p>
              </div>
            ) : (
              tweets.map((tweet) => {
                return (
                  // Wrapped the entire card in an anchor tag so clicking anywhere opens the Google Match Stats
                  <a 
                    key={tweet.id} 
                    href={tweet.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800/80 shadow-sm hover:shadow-md hover:border-purple-300 dark:hover:border-purple-700 transition-all duration-200 cursor-pointer group"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-green-600 dark:text-green-400">{tweet.author}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-[11px] text-gray-400 dark:text-gray-500 font-bold">{tweet.time}</span>
                          {/* Added a subtle arrow to indicate it's clickable */}
                          <svg className="w-3 h-3 text-gray-300 dark:text-gray-600 group-hover:text-purple-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                      <p className="text-sm text-gray-800 dark:text-gray-100 font-bold leading-relaxed break-words whitespace-pre-wrap">
                        {tweet.text}
                      </p>
                      
                      {tweet.image_url && (
                        <div className="relative mt-3 overflow-hidden rounded-lg border border-gray-50 dark:border-gray-800/50 bg-gray-50 dark:bg-gray-950/50 max-h-64 flex items-center justify-center p-4 transition-colors group-hover:bg-gray-100 dark:group-hover:bg-gray-900">
                          <img 
                            src={tweet.image_url} 
                            alt="Live Match Context" 
                            className="w-auto h-20 object-contain group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        </div>
                      )}
                    </div>
                  </a>
                );
              })
            )}
          </div>
        </div>
      </div>
    </main>
  );
}