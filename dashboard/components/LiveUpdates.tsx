// components/LiveUpdates.tsx
"use html";
"use client";

import React, { useEffect, useState, useCallback } from 'react';

interface TweetCard {
  id: string;
  text: string;
  time: string;
  author: string;
  url: string;
}

export default function LiveUpdates() {
  const [tweets, setTweets] = useState<TweetCard[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTimelineData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    
    try {
      const fetchUrl = `http://localhost:3000/api/live-updates`;
      const res = await fetch(fetchUrl);
      
      if (!res.ok) throw new Error("Backend connection issue");
      
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      // FRONTEND DATA GUARD: Only update if we received actual data, 
      // OR if we truly have 0 tweets and the screen is already empty.
      if (Array.isArray(data) && data.length > 0) {
        setTweets(data);
      } else if (tweets.length === 0) {
        setTweets([]); // Safe to clear if we had nothing to begin with
      } else {
        console.warn("Backend returned empty payload, shielding UI by keeping existing tweets.");
      }

    } catch (err) {
      console.warn("Backend proxy offline or rate wall hit.");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [tweets.length]);

  useEffect(() => {
    // Initial load
    loadTimelineData(true);

    // Silent background poll every 3 minutes
    const intervalId = setInterval(() => loadTimelineData(false), 3 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, [loadTimelineData]);

  return (
    <div className="w-full flex flex-col bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-md dark:shadow-lg transition-all duration-300">
      
      {/* CARD HEADER */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-900">
        <div className="flex items-center space-x-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
          </span>
          <h2 className="text-md font-bold tracking-tight text-gray-900 dark:text-white">
            Live Updates
          </h2>
        </div>
        
        <div className="flex items-center space-x-3">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-md">
            X Feed
          </span>
          <button 
            onClick={() => loadTimelineData(true)}
            className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors group p-1"
            title="Refresh Timeline"
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
      <div className="w-full max-h-[600px] overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-950/40 scrollbar-hide">
        {loading && tweets.length === 0 ? (
          <div className="py-20 flex items-center justify-center">
            <p className="text-xs text-gray-400 animate-pulse font-medium">Syncing timeline feeds...</p>
          </div>
        ) : tweets.length === 0 ? (
          <div className="py-20 flex items-center justify-center text-center">
             <p className="text-sm text-gray-500">No breaking news in the last 48 hours.</p>
          </div>
        ) : (
          tweets.map((tweet) => (
            <div 
              key={tweet.id} 
              className="p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800/80 shadow-sm flex flex-col justify-between hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-200"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-purple-600 dark:text-purple-400">{tweet.author}</span>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">{tweet.time}</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed break-words whitespace-pre-wrap">
                  {tweet.text}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-50 dark:border-gray-800/50 flex justify-between items-center">
                <a 
                  href={tweet.url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-xs text-blue-500 hover:text-blue-400 font-bold flex items-center space-x-1"
                >
                  <span>View on X</span>
                  <span>&rarr;</span>
                </a>
                
                <svg className="h-3.5 w-3.5 text-gray-400 dark:text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}