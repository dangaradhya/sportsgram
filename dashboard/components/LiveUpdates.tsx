// components/LiveUpdates.tsx
"use html";
"use client";

// IMPORTS
import React, { useEffect, useState } from 'react';

// TweetCard interface to define the structure of each tweet object
interface TweetCard {
  id: string;
  text: string;
  time: string;
  author: string;
  url: string;
}

// LiveUpdates component optimized strictly for server-side multiplex cache consumption
export default function LiveUpdates() {
  // STATE MANAGEMENT
  const [tweets, setTweets] = useState<TweetCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTimelineData = async () => {
      try {
        // Points natively to our unified backend multiplexer proxy gateway
        const fetchUrl = `http://localhost:3000/api/live-updates`;

        // FETCHING DATA
        const res = await fetch(fetchUrl);
        if (!res.ok) throw new Error("Backend connection issue");
        
        // PARSE RESPONSE
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        // UPDATE STATE
        setTweets(data);
      } catch (err) {
        console.warn("Backend proxy offline or rate wall hit. Loading defensive dashboard UI placeholders.");
      } finally {
        setLoading(false);
      }
    };

    // INITIAL DATA LOAD
    loadTimelineData();
  }, []);

  return (
    // DASHBOARD CARD CONTAINER
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
        <span className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-md">
          X Feed
        </span>
      </div>

      {/* CARD CONTENT AREA */}
      {/* Set a clean, consistent height window with an active scroll bar layer */}
      <div className="w-full max-h-[600px] overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-950/40 scrollbar-hide">
        {loading ? (
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

              {/* LINK TO ORIGINAL TWEET */}
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