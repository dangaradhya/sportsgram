"use client";

// IMPORTS
import { useState, useEffect } from 'react';
import { GoogleLogin, googleLogout } from '@react-oauth/google';

// AuthButton component handles Google OAuth login/logout and displays user info
export default function AuthButton() {
  // State to hold user information after successful login 
  const [user, setUser] = useState<{ name: string; picture: string } | null>(null);

  // Check if a user is already logged in when the component mounts
  useEffect(() => {
    const storedUser = localStorage.getItem('glide_user');

    // If user data exists in localStorage, parse it and set it to state for display
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  // Handles successful Google login by sending the token to the backend and storing the Glide JWT and user data
  const handleSuccess = async (credentialResponse: any) => {
    try {
      // Send the Google token to our Express backend
      const res = await fetch('http://localhost:3000/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: credentialResponse.credential }),
      });

      // Parse the response from the backend, which should include the Glide JWT and user data
      const data = await res.json();

      // If the login is successful, store the Glide JWT and user data securely in localStorage and update the state to display user info
      if (res.ok) {
        // Save the Glide JWT and User data securely in localStorage
        localStorage.setItem('glide_token', data.token);
        localStorage.setItem('glide_user', JSON.stringify(data.user));
        setUser(data.user);
      } else {
        console.error("Login failed:", data.error);
      }
    } catch (error) {
      console.error("Network error during login:", error);
    }
  };

  // Handles user logout by clearing the Google session and removing stored tokens and user data from localStorage, then resetting the user state
  const handleLogout = () => {
    googleLogout();
    localStorage.removeItem('glide_token');
    localStorage.removeItem('glide_user');
    setUser(null);
  };
  
  // If a user is logged in, display their profile picture, name, and a logout button. Otherwise, show the Google Login button.
  if (user) {
    return (
      <div className="flex items-center space-x-3 bg-white/10 rounded-full pr-4 p-1 backdrop-blur-md border border-white/20 shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img 
          src={user.picture} 
          alt="Profile" 
          className="w-8 h-8 rounded-full border border-white/50" 
          referrerPolicy="no-referrer" 
        />
        <span className="text-sm font-medium text-white">{user.name.split(' ')[0]}</span>
        <button 
          onClick={handleLogout}
          className="text-xs text-gray-300 hover:text-white transition-colors ml-2"
        >
          Logout
        </button>
      </div>
    );
  }

  // If no user is logged in, render the Google Login button with custom styling and handle the login success and error cases.
  return (
    <div className="shadow-xl rounded-md overflow-hidden">
        <GoogleLogin
            onSuccess={handleSuccess}
            onError={() => console.error('Google Login Failed')}
            theme="filled_black"
            shape="pill"
            text="continue_with"
        />
    </div>
  );
}