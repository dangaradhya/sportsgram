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

// Added the League interface for the selection grid
interface League {
  id: string;
  name: string;
  category: string;
}

// The curated list of premium leagues the user can choose from
const AVAILABLE_LEAGUES: League[] = [
  { id: 'nba', name: 'NBA', category: 'Basketball' },
  { id: 'mlb', name: 'MLB', category: 'Baseball' },
  { id: 'nfl', name: 'NFL', category: 'American Football' },
  { id: 'nhl', name: 'NHL', category: 'Hockey' },
  { id: 'atp', name: "Men's Tennis", category: 'Tennis' },
  { id: 'wta', name: "Women's Tennis", category: 'Tennis' },
  { id: 'ufc', name: 'UFC', category: 'MMA' },
  { id: 'f1', name: 'Formula 1', category: 'Motorsport' },
  { id: 'premier_league', name: 'Premier League', category: 'Football' },
  { id: 'serie_a', name: 'Serie A', category: 'Football' },
  { id: 'la_liga', name: 'La Liga', category: 'Football' },
  { id: 'bundesliga', name: 'Bundesliga', category: 'Football' },
  { id: 'ligue_1', name: 'Ligue 1', category: 'Football' },
  { id: 'champions_league', name: 'UEFA Champions League', category: 'Football' },
  { id: 'europa_league', name: 'UEFA Europa League', category: 'Football' },
  { id: 'conference_league', name: 'UEFA Conference League', category: 'Football' },
  { id: 'world_cup', name: 'FIFA World Cup', category: 'International Football' },
  { id: 'euros', name: 'Euros', category: 'International Football' },
  { id: 'copa_america', name: 'Copa America', category: 'International Football' },
  { id: 'nations_league', name: 'UEFA Nations League', category: 'International Football' },
];

// MAIN COMPONENT
export default function LiveUpdatesPage() {
  // STATE MANAGEMENT
  const [tweets, setTweets] = useState<TweetCard[]>([]);
  const [loading, setLoading] = useState(true);

  // New State for Authentication and Preferences
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [isEditingPreferences, setIsEditingPreferences] = useState<boolean>(false);
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [preferencesLoading, setPreferencesLoading] = useState<boolean>(true);

  // New useEffect to check for auth and fetch user preferences on mount
  useEffect(() => {
    const token = localStorage.getItem('glide_token');
    
    if (!token) {
      setIsAuthenticated(false);
      setPreferencesLoading(false);
      return;
    }
    
    setIsAuthenticated(true);

    // Fetch the user's saved preferences from our new backend route
    // This endpoint will check the token, retrieve the user's preferences from the SQLite database, and return them as an array of league IDs.
    fetch('http://localhost:3000/api/users/me/preferences', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        // If the user has preferences saved, we load them into state and pre-fill the editor. If not, we immediately open the onboarding 
        // grid to prompt them to select their leagues.
        if (data.preferences && data.preferences.length > 0) {
          setPreferences(data.preferences);
          setSelectedLeagues(data.preferences); // Pre-fill the editor with their current choices
        } else {
          // If they have no preferences, force the onboarding grid open!
          setIsEditingPreferences(true);
        }
        setPreferencesLoading(false);
      })
      .catch(err => {
        console.error("Error fetching preferences:", err);
        setPreferencesLoading(false);
      });
  }, []);

  // Function to toggle a league selection in the UI
  // This function checks if the league is already in the selectedLeagues array. If it is, it removes it (deselecting). 
  // If it's not, it adds it to the array (selecting).
  const toggleLeagueSelection = (leagueId: string) => {
    setSelectedLeagues(prev => 
      prev.includes(leagueId) 
        ? prev.filter(id => id !== leagueId) // Remove if already selected
        : [...prev, leagueId]                // Add if not selected
    );
  };

  // Function to save the selections back to the SQLite Database
  const savePreferences = async () => {
    const token = localStorage.getItem('glide_token');
    if (!token) return;

    // This function sends a POST request to our backend with the selected leagues. The backend will verify the token,
    // and then update the user's preferences in the SQLite database. If successful, we update the local state and refresh the timeline.
    try {
      const res = await fetch('http://localhost:3000/api/users/me/preferences', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ leagues: selectedLeagues })
      });

      // We check if the response is OK. If it is, we update the preferences in state, close the onboarding screen, and refresh the timeline 
      // to reflect the new preferences. If there's an error, we log it to the console.
      if (res.ok) {
        setPreferences(selectedLeagues);
        setIsEditingPreferences(false); // Close the onboarding screen
        loadTimelineData(true); // Refresh the timeline with the new preferences
      }
    } catch (err) {
      console.error("Failed to save preferences:", err);
    }
  };
  
  // Refactored the data fetching logic into a reusable function that can be called on page load and on demand via the refresh button
  const loadTimelineData = useCallback(async (showSpinner = false) => {
    // Only fetch if they are authenticated and actually have preferences set
    if (!isAuthenticated || preferences.length === 0) return;

    if (showSpinner) setLoading(true);
    
    // Added error handling to catch issues with the backend connection or if the API returns an error message. 
    // This prevents the UI from breaking and provides feedback in the console.
    try {
      // Updated the fetch URL to point to the local backend proxy instead of directly hitting Twitter's API. 
      // This allows us to bypass CORS issues and also handle any necessary authentication or rate limiting on the server side.
      const fetchUrl = `http://localhost:3000/api/live-updates`;
      const token = localStorage.getItem('glide_token');

      const res = await fetch(fetchUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }

      });

      if (!res.ok) throw new Error(`Backend connection issue: ${res.status}`);
      
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
  }, [tweets.length, isAuthenticated, preferences.length]); // Added new dependencies

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

        {/* INITIAL LOADING STATE */}
        {(isAuthenticated === null || preferencesLoading) ? (
          <div className="flex justify-center items-center h-64">
             <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : 

        /* THE HARD AUTHENTICATION GATE */
        isAuthenticated === false ? (
          <div className="flex flex-col items-center justify-center bg-white dark:bg-gray-900 rounded-xl p-10 border border-gray-200 dark:border-gray-800 shadow-md text-center space-y-6 mt-10">
            <div className="p-4 bg-purple-100 dark:bg-purple-900/20 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h2 className="text-3xl font-bold mb-2">Personalized Scoreboard</h2>
              <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                Sign in to build your custom sports dashboard. Track the NBA, Premier League, F1, and more in real-time.
              </p>
            </div>
          </div>
        ) : 

        /* THE ONBOARDING & EDITING GRID */
        isEditingPreferences ? (
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 md:p-8 border border-gray-200 dark:border-gray-800 shadow-md animate-in fade-in zoom-in duration-300">
            <div className="mb-6 border-b border-gray-100 dark:border-gray-800 pb-4">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Follow Your Leagues</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Select the competitions you want to track on your live dashboard.</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
              {AVAILABLE_LEAGUES.map((league) => {
                const isSelected = selectedLeagues.includes(league.id);
                return (
                  <div 
                    key={league.id}
                    onClick={() => toggleLeagueSelection(league.id)}
                    className={`cursor-pointer border rounded-lg p-4 flex flex-col items-center justify-center text-center space-y-2 transition-all duration-200 ${
                      isSelected 
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/10 shadow-sm ring-1 ring-purple-500' 
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    {/* Tiny visual checkmark if selected */}
                    <div className="absolute top-2 right-2">
                      {isSelected && (
                        <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">{league.category}</span>
                    <span className={`font-semibold ${isSelected ? 'text-purple-700 dark:text-purple-300' : 'text-gray-700 dark:text-gray-200'}`}>
                      {league.name}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="flex justify-end space-x-4 border-t border-gray-100 dark:border-gray-800 pt-4">
              {/* Only show cancel if they already had preferences saved */}
              {preferences.length > 0 && (
                <button 
                  onClick={() => {
                    setSelectedLeagues(preferences); // reset
                    setIsEditingPreferences(false);
                  }}
                  className="px-6 py-2 rounded-lg font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
              )}
              <button 
                onClick={savePreferences}
                disabled={selectedLeagues.length === 0}
                className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold rounded-lg hover:shadow-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Save Dashboard
              </button>
            </div>
          </div>
        ) : 

        /* DASHBOARD CARD CONTAINER (Shows if Authenticated AND Has Preferences) */
        (
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
            
            <div className="flex items-center space-x-3">
              {/* Added the new Edit Leagues button right beside the refresh button! */}
              <button 
                onClick={() => setIsEditingPreferences(true)}
                className="text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-md transition-colors"
              >
                ⚙️ Edit Leagues
              </button>

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
              <div className="py-20 flex items-center justify-center text-center flex-col space-y-2">
                <p className="text-sm text-gray-500">No live matches currently taking place.</p>
                <p className="text-xs text-gray-400">Check back later or track more leagues.</p>
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
        )}
      </div>
    </main>
  );
}