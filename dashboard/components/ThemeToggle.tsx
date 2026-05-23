// components/ThemeToggle.tsx
"use client";

// IMPORTS
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

// ThemeToggle component allows users to switch between light and dark themes, with icons that reflect the current theme state
export default function ThemeToggle() {
  // Use resolvedTheme instead of theme to avoid "system" preference bugs
  const {resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  // We need to wait until the component is mounted to avoid hydration mismatch issues with the theme, since the theme is determined on the client side
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  
  // The button toggles the theme between "light" and "dark" when clicked. It also displays a sun icon when in dark mode (
  // indicating you can switch to light) and a moon icon when in light mode (indicating you can switch to dark). 
  // The button is styled with Tailwind CSS for a clean and modern look.
  return (
    <button
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="p-2 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors shadow-sm"
      title="Toggle Theme"
    >
      {resolvedTheme === "dark" ? (
        // Clean Sun Icon
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>
        </svg>
      ) : (
        // Clean Moon Icon
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
        </svg>
      )}
    </button>
  );
}