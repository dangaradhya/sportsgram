// app/providers.tsx
"use client";

// IMPORTS
import { ThemeProvider } from "next-themes";

// The Providers component wraps the entire application with necessary context providers, such as ThemeProvider for theming support. 
export function Providers({ children }: { children: React.ReactNode }) {
  
  // We wrap the children in the ThemeProvider, which provides theming capabilities (like dark mode) to the entire application.
  // The ThemeProvider is configured to use the 'class' strategy for dark mode, with a default theme of 'system' that follows the user's OS preference.
  // The enableSystem prop allows the theme to automatically switch based on the user's system settings.
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </ThemeProvider>
  );
}