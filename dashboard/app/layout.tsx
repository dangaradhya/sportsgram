import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
// Integrated Google OAuth Provider for Authentication
import { GoogleOAuthProvider } from '@react-oauth/google'; 
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Upgraded the metadata for Browser Tabs, SEO, and Social Sharing
export const metadata: Metadata = {
  title: "Glide", 
  description: "AI-Powered Sports Aggregator & Highlight Reels",
};

// RootLayout now wraps the entire app with GoogleOAuthProvider for seamless authentication across all pages.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Securely load the Google Client ID from environment variables for authentication
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

  // The layout includes the GoogleOAuthProvider at the top level, ensuring that all child components can access authentication features without additional setup.
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <GoogleOAuthProvider clientId={clientId}>
          {children}
        </GoogleOAuthProvider>
      </body>
    </html>
  );
}