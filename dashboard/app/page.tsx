// app/page.tsx

// 1. DIRECTIVE
// Next.js defaults to Server Components. We use "use client" to tell Next.js 
// that this is a dynamic component that needs to run in the user's browser,
// allowing us to use React hooks like useState and useEffect.
"use client";

import { useEffect, useState, SyntheticEvent } from 'react';
import Link from 'next/link';

export default function Home() {
  // 2. STATE MANAGEMENT
  // Think of state as variables that, when updated, automatically redraw the screen.
  // 'posts' holds the array of data from SQLite. 'loading' gives us a cool UI state.
  // Explicitly defining type as any[] to prevent TypeScript errors.
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('All'); // New state for category filter

  // Pagination State
  const [page, setPage] = useState(1); // Tracks current page
  const [hasMore, setHasMore] = useState(true); // Turns off the button when we hit the end of the DB
  const [loadingMore, setLoadingMore] = useState(false); // Spinner for the Load More button

  // Phase 3 - Share State
  // We track the ID of the post that was copied to show a temporary "Copied!" tooltip
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Authentication Phase - User & Modal State
  // We store the logged-in user's info (username and token) in 'user'. If 'user' is null, no one is logged in.
  // 'showAuthModal' controls whether the Login/Register modal is visible. 'authMode' toggles between the two forms.
  // 'authForm' holds the input values for username and password. 'authError' and 'authLoading' manage the form's feedback states.
  const [user, setUser] = useState<{ username: string, token: string } | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ username: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Authentication Phase - Check for existing session on load
  useEffect(() => {
    const storedSession = localStorage.getItem('glide_session');
    if (storedSession) {
      setUser(JSON.parse(storedSession));
    }
  }, []);

  // 3. THE NETWORK REQUEST 
  // Refactored Fetch Logic to accept a page number
  const fetchPosts = async (pageNum: number) => {
    try {
      // Artificial half-second delay for infinite scroll feel
      if (pageNum > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // We now pass the page parameter to our Express API
      const res = await fetch(`http://localhost:3000/api/posts?page=${pageNum}&limit=5`);
      const data = await res.json();

      if (data.length === 0) {
        // If the database returns an empty array, we reached the end!
        setHasMore(false);
      } else {
        // Append the new data to the EXISTING array, rather than replacing it.
        // We use a quick filter to ensure React's StrictMode doesn't accidentally render duplicate IDs.
        setPosts(prevPosts => {
          const newPosts = [...prevPosts];
          data.forEach((newPost: any) => {
            if (!newPosts.find(p => p.id === newPost.id)) {
              newPosts.push(newPost);
            }
          });
          return newPosts;
        });
      }
      setLoading(false);
      setLoadingMore(false);
    } catch (err) {
      console.error("Error fetching posts:", err);
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Replaced the interval with a page dependency
  // This runs automatically on initial load (page=1), and whenever the 'page' state changes.
  useEffect(() => {
    fetchPosts(page);
  }, [page]);

  // The Infinite Scroll Observer for the Posts Feed
  useEffect(() => {
    if (!hasMore || loadingMore) return;

    // We create a new IntersectionObserver that watches the "sentinel" div at the bottom 
    // of the feed. When that div comes into view (meaning the user has scrolled to the bottom), 
    // we set 'loadingMore' to true and increment the 'page' state, which triggers a new fetch.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setLoadingMore(true);
          setPage((prev) => prev + 1);
        }
      },
      { threshold: 0.1 }
    );

    // We start observing the sentinel element. If it exists, we attach the observer to it.
    // The observer will automatically trigger the callback when the sentinel comes into view.
    const sentinel = document.getElementById('posts-scroll-sentinel');
    if (sentinel) observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasMore, loadingMore, posts]);

  // Authentication Phase - Handle form submission for Login/Register
  const handleAuthSubmit = async (e: SyntheticEvent) => {
    // Setup the form for submission: clear errors, show loading state
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    // Determine the API endpoint based on whether we're logging in or registering
    try {
      const res = await fetch(`http://localhost:3000/api/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm)
      });
      
      // We expect the response to include a 'username' and 'token' on successful login, or a success message on registration.
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      // If we're registering, we want to switch to the login form and prompt the user to log in. 
      // If we're logging in, we save the session and close the modal.
      if (authMode === 'register') {
        // Switch to login mode and show success message
        setAuthMode('login');
        setAuthError('Account created! Please log in.');
        setAuthForm(prev => ({ ...prev, password: '' })); // Clear password for security
      } else {
        // Save session and close modal
        // We create a session object with the username and token returned from the server, save it to state and localStorage, and then close the modal.
        // If we only save it in state, the user would be logged out as soon as they refresh the page. By saving it in localStorage, we can check for 
        // an existing session when the app loads and keep the user logged in until they choose to log out. Also, we clear the auth form for security and UX reasons
        // and close the modal to show the main app interface.
        const sessionData = { username: data.username, token: data.token };
        setUser(sessionData);
        localStorage.setItem('glide_session', JSON.stringify(sessionData));
        setShowAuthModal(false);
        setAuthForm({ username: '', password: '' });
      }
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Authentication Phase - Handle Logout
  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('glide_session');
  };

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

  // 5. THE SHARE FUNCTION
  const handleShare = async (id: number, url: string, headline: string) => {
    if (navigator.share) {
      // Native Mobile Share
      try {
        await navigator.share({
          title: 'Glide',
          text: `Check out this news: ${headline}`,
          url: url,
        });
      } catch (err) {
        console.error("Error sharing natively:", err);
      }
    } else {
      // Desktop Fallback: Copy to Clipboard
      try {
        await navigator.clipboard.writeText(url);
        setCopiedId(id); // Trigger the "Copied!" tooltip
        setTimeout(() => setCopiedId(null), 2000); // Hide tooltip after 2 seconds
      } catch (err) {
        console.error("Failed to copy to clipboard:", err);
      }
    }
  };

  // 6. DYNAMIC CATEGORY EXTRACTION
  // - We extract all categories from the posts array.
  // - We use 'new Set()' to remove duplicates (so if there are 5 Football posts, 'Football' only appears once).
  // - We prepend 'All' to the front of the array. 
  const uniqueCategories = ['All', ...Array.from(new Set(posts.map(post => post.sport_category)))];

  // Filter Logic - before we render, we filter the master 'posts' array. 
  // If 'All' is selected, show everything. Otherwise, only show posts that match the active category.
  const filteredPosts = activeCategory === 'All' 
    ? posts 
    : posts.filter(post => post.sport_category === activeCategory);

  return (
    <main className="min-h-screen bg-gray-950 text-white p-4 md:p-8 relative">
      
      {/* Authentication Phase - The Auth Modal Overlay */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-md shadow-2xl relative">
            <button 
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            
            <h2 className="text-2xl font-bold mb-6 text-center">
              {authMode === 'login' ? 'Welcome Back' : 'Join Glide'}
            </h2>

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Username</label>
                <input 
                  type="text" 
                  required
                  value={authForm.username}
                  onChange={(e) => setAuthForm({...authForm, username: e.target.value})}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                  placeholder="Enter your username"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
                <input 
                  type="password" 
                  required
                  minLength={6}
                  value={authForm.password}
                  onChange={(e) => setAuthForm({...authForm, password: e.target.value})}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                  placeholder="Minimum 6 characters"
                />
              </div>
              
              {authError && (
                <p className={`text-sm ${authError.includes('created') ? 'text-green-400' : 'text-red-400'} text-center`}>
                  {authError}
                </p>
              )}

              <button 
                type="submit" 
                disabled={authLoading}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold py-3 rounded-lg transition-all disabled:opacity-50 mt-4"
              >
                {authLoading ? 'Processing...' : (authMode === 'login' ? 'Sign In' : 'Create Account')}
              </button>
            </form>

            <div className="mt-6 text-center text-sm text-gray-400">
              {authMode === 'login' ? "Don't have an account? " : "Already have an account? "}
              <button 
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'register' : 'login');
                  setAuthError('');
                }}
                className="text-purple-400 hover:text-purple-300 font-semibold transition-colors"
              >
                {authMode === 'login' ? 'Register here' : 'Login here'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto">
        
        {/* Header Section */}
        {/* Authentication Phase - Updated Header Layout with User Profile */}
        <div className="flex items-center justify-between mb-4"> 
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
            Glide
          </h1>
          
          <div>
            {user ? (
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2 bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-full">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-orange-500 to-purple-600"></div>
                  <span className="text-sm font-semibold text-gray-200">{user.username}</span>
                </div>
                <button 
                  onClick={handleLogout}
                  className="text-sm text-gray-500 hover:text-red-400 transition-colors font-medium"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setShowAuthModal(true)}
                className="bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold px-5 py-2 rounded-full border border-gray-700 transition-colors"
              >
                Sign In
              </button>
            )}
          </div>
        </div>

        {/* Navigation Section */}
        <div className="flex justify-center space-x-8 mb-8">
          <span className="text-white font-bold text-lg border-b-2 border-purple-500 pb-1">
            Posts
          </span>
          <Link href="/reels" className="text-gray-400 font-bold text-lg hover:text-white transition-colors">
            Reels
          </Link>
        </div>

        {/* 7. CONDITIONAL RENDERING */}
        {loading && page === 1 ? (
          // Show this while waiting for the Express server to reply
          <p className="text-center text-gray-400 animate-pulse mt-20">Loading the latest news...</p>
        ) : posts.length === 0 ? (
          // Show this if the database is empty
          <p className="text-center text-gray-400 mt-20">No news in the database yet. Run the scraper!</p>
        ) : (
          <>
            {/* The Category Filter Bar UI */}
            <div className="flex space-x-3 overflow-x-auto pb-4 mb-6 scrollbar-hide">
              {uniqueCategories.map(category => (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-200 ${
                    activeCategory === category
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-500/30 border border-purple-500'
                      : 'bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-gray-200 border border-gray-800'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>

            {/* 8. MAPPING THE DATA */}
            {/* We now loop through 'filteredPosts' instead of 'posts' */}
            <div className="space-y-6">
              {filteredPosts.map((post: any) => (
                <div key={post.id} className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg hover:border-gray-700 transition-colors group overflow-hidden">
                  
                  {/* Top Row: Category Badge and Timestamp */}
                  <div className="flex justify-between items-center mb-4">
                    <span className="bg-blue-500/10 text-blue-400 text-xs font-semibold px-2.5 py-0.5 rounded uppercase tracking-wider">
                      {post.sport_category}
                    </span>
                    <span className="text-gray-500 text-xs">
                      {new Date(post.timestamp).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Image Rendering Phase - The actual image container! */}
                  {/* We use standard img tag, set a fixed height for consistency, and add a hover scale effect */}
                  {post.image_url && (
                    <div className="w-full h-48 md:h-64 rounded-xl overflow-hidden mb-5 bg-gray-800 relative">
                      <img 
                        src={post.image_url} 
                        alt={post.headline}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-in-out"
                        loading="lazy"
                      />
                    </div>
                  )}

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

                    {/* Right Side: Like Button, Share Button, and Read Source Link */}
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

                      {/* Phase 3 - The Share Button */}
                      <button 
                        onClick={() => handleShare(post.id, post.url, post.headline)}
                        className="flex items-center space-x-1 text-gray-400 hover:text-blue-400 transition-colors group relative"
                        title="Share this post"
                      >
                        {/* SVG Share Icon */}
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 group-active:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                        
                        {/* Dynamic Tooltip: Only shows if this specific post was copied */}
                        {copiedId === post.id && (
                          <span className="absolute -top-10 -left-4 bg-gray-700 text-white text-xs font-semibold px-2.5 py-1 rounded-md shadow-lg whitespace-nowrap animate-pulse">
                            Copied!
                          </span>
                        )}
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

            {/* Infinite Scroll Sentinel replacing the Load More button */}
            {hasMore && (
              <div id="posts-scroll-sentinel" className="mt-10 flex justify-center h-16 items-center">
                {loadingMore && (
                  <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                )}
              </div>
            )}
            
            {!hasMore && posts.length > 0 && (
              <p className="text-center text-gray-500 mt-10 mb-10 text-sm font-medium">You have reached the end of the feed.</p>
            )}
          </>
        )}
      </div>
    </main>
  );
}