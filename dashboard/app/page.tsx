// app/page.tsx

// 1. DIRECTIVE
// Next.js defaults to Server Components. We use "use client" to tell Next.js 
// that this is a dynamic component that needs to run in the user's browser,
// allowing us to use React hooks like useState and useEffect.
"use client";

import { useEffect, useState } from 'react';

export default function Home() {
  // 2. STATE MANAGEMENT
  // Think of state as variables that, when updated, automatically redraw the screen.
  // 'posts' holds the array of data from SQLite. 'loading' gives us a cool UI state.
  // CHANGE ADDED: explicitly defining type as any[] to prevent TypeScript errors.
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 3. THE NETWORK REQUEST (Upgraded with Polling)
  useEffect(() => {
    // We wrap our fetch logic in a function so we can call it repeatedly
    const fetchPosts = () => {
      fetch('http://localhost:3000/api/posts')
        .then((res) => res.json())
        .then((data) => {
          setPosts(data);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Error fetching posts:", err);
          setLoading(false);
        });
    };

    // Fetch immediately when the page first loads
    fetchPosts();

    // Set up a background timer to fetch again every 30 seconds (30000 milliseconds)
    const intervalId = setInterval(fetchPosts, 30000);

    // Cleanup function: If the user closes the tab, we stop the timer to save memory
    return () => clearInterval(intervalId);
  }, []);

  // 4. THE LIKE FUNCTION
  // This function handles the user clicking the heart button.
  const handleLike = async (id: number) => {
    // A. Optimistic UI Update: Instantly update the state so the user feels no lag.
    // We map over the posts, find the one that was clicked, and increment its 'likes' count by 1.
    setPosts(posts.map(post => 
      post.id === id ? { ...post, likes: (post.likes || 0) + 1 } : post
    ));

    // B. Background Network Request: Send the actual update to the Express database
    try {
      await fetch(`http://localhost:3000/api/posts/${id}/like`, {
        method: 'PUT',
      });
    } catch (error) {
      console.error("Failed to update like in database:", error);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        
        {/* Header Section */}
        <h1 className="text-4xl font-bold mb-8 text-center bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
          Sportsgram
        </h1>

        {/* 5. CONDITIONAL RENDERING */}
        {loading ? (
          // Show this while waiting for the Express server to reply
          <p className="text-center text-gray-400 animate-pulse">Loading the latest news...</p>
        ) : posts.length === 0 ? (
          // Show this if the database is empty
          <p className="text-center text-gray-400">No news in the database yet. Run the scraper!</p>
        ) : (
          // 6. MAPPING THE DATA
          // If we have data, we loop through the array and render a "Card" for each post
          <div className="space-y-6">
            {posts.map((post: any) => (
              <div key={post.id} className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg hover:border-gray-700 transition-colors">
                
                {/* Top Row: Category Badge and Timestamp */}
                <div className="flex justify-between items-center mb-4">
                  <span className="bg-blue-500/10 text-blue-400 text-xs font-semibold px-2.5 py-0.5 rounded uppercase tracking-wider">
                    {post.sport_category}
                  </span>
                  <span className="text-gray-500 text-xs">
                    {new Date(post.timestamp).toLocaleDateString()}
                  </span>
                </div>

                {/* Main Content: AI Generated Headline & Summary */}
                <h2 className="text-xl font-bold mb-3">{post.headline}</h2>
                <p className="text-gray-300 text-sm mb-4 leading-relaxed">{post.content}</p>

                {/* Bottom Row now includes the interactive Like button */}
                <div className="flex justify-between items-center border-t border-gray-800 pt-4 mt-4">
                  
                  {/* Left Side: Excitement Meter */}
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-400">Excitement:</span>
                    <div className="flex">
                      {/* We dynamically generate a visual meter based on the 1-10 excitement_level */}
                      {[...Array(10)].map((_, i) => (
                        <div 
                          key={i} 
                          className={`h-1.5 w-3 mx-px rounded-full ${i < post.excitement_level ? 'bg-gradient-to-r from-orange-500 to-red-500' : 'bg-gray-800'}`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Right Side: Like Button and Read Source Link */}
                  <div className="flex items-center space-x-6">
                    
                    {/* The Like Button */}
                    <button 
                      onClick={() => handleLike(post.id)}
                      className="flex items-center space-x-1.5 text-gray-400 hover:text-red-500 transition-colors group"
                    >
                      {/* SVG Heart Icon */}
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 group-active:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                      {/* Fallback to 0 if post.likes is undefined/null */}
                      <span className="text-sm font-semibold">{post.likes || 0}</span>
                    </button>

                    <a 
                      href={post.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-purple-400 hover:text-purple-300 font-medium"
                    >
                      Read Source &rarr;
                    </a>
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}